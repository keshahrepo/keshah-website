// One-time push announcing the bonus timing change (lib/creators/bonus-timing.ts).
// NOT scheduled in vercel.json. Disabled unless BONUS_TIMING_ANNOUNCE_ENABLED=1.
//
// Auth: Authorization: Bearer ${CRON_SECRET}.
// GET ?dry=1 lists who would get it (works with the flag off).
// GET (flag on) sends it once to each creator with old-rule bonuses still due;
// reruns skip anyone already sent (ContentCreators.bonus_timing_announced_at).

import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { CREATORS_COLLECTION, getHistory, getMonthOverview, listCreators } from "@/lib/creators/db";
import { LAST_OLD_RULE_INVOICE_MONTH, announceEnabled, oldRuleBonusCents, runBonusTimingAnnouncement } from "@/lib/creators/bonus-timing";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { notify } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  if (!dry && !announceEnabled()) {
    return NextResponse.json({ error: "Disabled. Set BONUS_TIMING_ANNOUNCE_ENABLED=1 to send, or pass ?dry=1." }, { status: 409 });
  }
  const { db } = getFirebaseAdmin();
  const doc = (id: string) => db.collection(CREATORS_COLLECTION).doc(id);
  try {
    const creators = (await listCreators()).filter((c) => !c.legacy_start);
    const byId = new Map(creators.map((c) => [c.id, c]));
    const report = await runBonusTimingAnnouncement(
      {
        listCreators: async () => creators.map((c) => ({ id: c.id, name: c.name || c.legal_name || "", email: c.email })),
        oldRuleDue: async (id) => {
          const c = byId.get(id);
          if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(c.start_date ?? "")) return 0;
          const history = await getHistory(id);
          const inv = history.invoices.find((i) => i.month === LAST_OLD_RULE_INVOICE_MONTH);
          if (inv?.status === "paid") return 0;
          if (inv && inv.status !== "draft") return oldRuleBonusCents(inv.lines);
          const o = await getMonthOverview(c, LAST_OLD_RULE_INVOICE_MONTH, { history });
          return oldRuleBonusCents(o.summary.bonusLines);
        },
        alreadySent: async (id) => !!(await doc(id).get()).get("bonus_timing_announced_at"),
        markSent: async (id, at) => void (await doc(id).set({ bonus_timing_announced_at: at }, { merge: true })),
        push: (target, msg) => notify(target, msg),
      },
      { dry },
    );
    return NextResponse.json({ ok: true, dry, report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
