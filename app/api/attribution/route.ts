import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 60;

// /api/attribution?window=24h|7d|30d|all
//
// Returns the core attribution table:
//   { window, total, rows: [{ source, signups, pctOfTotal, trialStarts, trialStartPct, paid, paidPct }] }
//
// Signals used (per the 2026-06-04 paid-signal audit):
//   - signups          = User docs with created_at in window
//   - trialStarts      = converted_at OR start_date set (entered paywall successfully)
//   - paid             = first_paid_at OR paid_at set (RevenueCat webhook confirmed money)
// The mobile-app's _handlePurchaseSuccess writes converted_at; the RC webhook
// writes first_paid_at + paid_at. Either one alone misses some real paid users,
// so we union both. As the RC-backfill + mobile-app fix propagate, the union
// converges on the truth.

const WINDOWS = {
  "24h": 24 * 3600_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "all": null as null | number,
} as const;

type WindowKey = keyof typeof WINDOWS;

export async function GET(req: Request) {
  const session = await requireDashboardSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const win = (url.searchParams.get("window") ?? "7d") as WindowKey;
  if (!(win in WINDOWS)) return NextResponse.json({ error: "invalid window" }, { status: 400 });

  const { db } = getFirebaseAdmin();
  const ms = WINDOWS[win];
  const since = ms != null ? Timestamp.fromMillis(Date.now() - ms) : null;

  // Fetch in chunks because a 30d window is ~10k users and all-time is ~62k.
  // Single equality + created_at range is doable on this collection but the
  // 'all' window has no range filter — we just scan everything.
  let snap;
  if (since) {
    snap = await db.collection("Users").where("created_at", ">=", since).get();
  } else {
    snap = await db.collection("Users").get();
  }

  type Row = { source: string; signups: number; trialStarts: number; paid: number };
  const bySource: Record<string, Row> = {};
  let total = 0;

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;
    total++;
    const source = (d.referral_source as string) || "(unset)";
    const row = bySource[source] ?? { source, signups: 0, trialStarts: 0, paid: 0 };
    row.signups++;
    const startedTrial = !!d.converted_at || !!d.start_date;
    const isPaid = !!d.first_paid_at || !!d.paid_at;
    if (startedTrial) row.trialStarts++;
    if (isPaid) row.paid++;
    bySource[source] = row;
  });

  const rows = Object.values(bySource)
    .sort((a, b) => b.signups - a.signups)
    .map((r) => ({
      source: r.source,
      signups: r.signups,
      pctOfTotal: total > 0 ? r.signups / total : 0,
      trialStarts: r.trialStarts,
      trialStartPct: r.signups > 0 ? r.trialStarts / r.signups : 0,
      paid: r.paid,
      paidPct: r.signups > 0 ? r.paid / r.signups : 0,
    }));

  return NextResponse.json({
    window: win,
    total,
    rows,
    generated_at: new Date().toISOString(),
  });
}
