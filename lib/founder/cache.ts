/**
 * Small Firestore cache for founder-app results (DashboardMetrics/founder_*).
 * Fresh for 15 minutes while the period is still open (this month or all
 * time), 6 hours for a finished month. `fresh: true` (pull to refresh, or
 * right after an action) recomputes.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export async function cached<T>(key: string, period: string, compute: () => Promise<T>, opts: { fresh?: boolean } = {}): Promise<T & { computed_at: string }> {
  const ref = getFirebaseAdmin().db.collection("DashboardMetrics").doc(`founder_${key}`.slice(0, 1400));
  const n = new Date();
  const thisMonth = `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`;
  const closed = period !== "all" && period < thisMonth;
  if (!opts.fresh) {
    const snap = await ref.get().catch(() => null);
    const at = snap?.exists ? Date.parse(String(snap.get("computed_at") ?? "")) : NaN;
    if (snap?.exists && Number.isFinite(at) && Date.now() - at < (closed ? 6 * 3600_000 : 15 * 60_000)) {
      return { ...(JSON.parse(String(snap.get("json"))) as T), computed_at: String(snap.get("computed_at")) };
    }
  }
  const out = await compute();
  const computed_at = new Date().toISOString();
  await ref.set({ json: JSON.stringify(out), computed_at }).catch((e) => console.error("founder cache write failed:", key, e));
  return { ...out, computed_at };
}
