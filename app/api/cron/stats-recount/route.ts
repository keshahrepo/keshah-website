// Cron, weekly (vercel.json): recount the public proof-page numbers in
// Stats/public from Users. The app (5.19+) adds +1s live, but older app
// versions don't, so the live counters drift low until everyone updates.
// This resets them to the true totals using the same rules as the original
// seed (5 Oct 2026). Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROGRESS_FIELDS = ["progress", "regrowth_progress", "maintenance_progress", "aftercare_progress"];
const dayDone = (v: unknown) =>
  Array.isArray(v) && v.some((e) => !!e && (e as { is_completed?: unknown }).is_completed === true);

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { db } = getFirebaseAdmin();
  const out = {
    sessions_total: 0,
    started_total: 0,
    started_men: 0,
    started_women: 0,
    checkin_d0_sum: 0,
    checkin_d0_n: 0,
    checkin_d3_sum: 0,
    checkin_d3_n: 0,
    checkin_d6_sum: 0,
    checkin_d6_n: 0,
  };
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let scanned = 0;
  try {
    for (;;) {
      let q = db
        .collection("Users")
        .select("is_deleted", "selected_gender", "scalp_tension_baseline", "scalp_check_readings", ...PROGRESS_FIELDS)
        .orderBy(FieldPath.documentId())
        .limit(1000);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        scanned++;
        const d = doc.data();
        if (d.is_deleted) continue;
        let days = 0;
        for (const f of PROGRESS_FIELDS) {
          const m = d[f];
          if (m && typeof m === "object") for (const v of Object.values(m)) if (dayDone(v)) days++;
        }
        if (days) {
          out.sessions_total += days;
          out.started_total++;
          if (d.selected_gender === "female") out.started_women++;
          else out.started_men++;
        }
        const base = Number(d.scalp_tension_baseline);
        if (base >= 1 && base <= 5) {
          out.checkin_d0_sum += base;
          out.checkin_d0_n++;
          for (const r of Array.isArray(d.scalp_check_readings) ? d.scalp_check_readings : []) {
            const day = Number(r?.day);
            const rating = Number(r?.rating);
            if ((day === 3 || day === 6) && rating >= 1 && rating <= 5) {
              out[`checkin_d${day}_sum` as "checkin_d3_sum"] += rating;
              out[`checkin_d${day}_n` as "checkin_d3_n"]++;
            }
          }
        }
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < 1000) break;
    }
    // Never move a public number backwards on a bad scan (e.g. a partial read).
    const cur = (await db.collection("Stats").doc("public").get()).data() ?? {};
    if (typeof cur.sessions_total === "number" && out.sessions_total < cur.sessions_total * 0.9) {
      return NextResponse.json({ ok: false, skipped: "recount came out >10% lower than live; not written", out, scanned }, { status: 500 });
    }
    await db.collection("Stats").doc("public").set({ ...out, recounted_at: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true, scanned, out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), scanned }, { status: 500 });
  }
}
