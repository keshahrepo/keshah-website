// Diagnostic: for every careers_applications record, show
//   id · status · calendly_event_start_time · booked_at
// so we can tell whether the Calendly webhook is firing (fields filled)
// but status not transitioning, vs. not firing at all (fields null).

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db
    .collection("careers_applications")
    .orderBy("last_updated_at", "desc")
    .limit(100)
    .get();
  console.log(`Total records (last 100):  ${snap.size}\n`);

  const statusCounts = new Map<string, number>();
  const rows: Array<{
    id: string;
    status: string;
    name: string;
    email: string;
    hasCalendlyStart: boolean;
    hasBookedAt: boolean;
  }> = [];
  for (const d of snap.docs) {
    const x = d.data() as Record<string, unknown>;
    const status = (x.status as string) ?? "pending";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    rows.push({
      id: d.id,
      status,
      name: (x.full_name as string) ?? "(no name)",
      email: (x.email as string) ?? "",
      hasCalendlyStart: !!x.calendly_event_start_time,
      hasBookedAt: !!x.booked_at,
    });
  }

  console.log("Status distribution:");
  for (const [s, n] of [...statusCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${s}`);
  }

  // The telling case: status === "awaiting_booking" but Calendly data IS populated.
  // That would mean the webhook fired on this record but somehow didn't flip status.
  const stuck = rows.filter(r => r.status === "awaiting_booking" && (r.hasCalendlyStart || r.hasBookedAt));
  console.log(`\n[A] awaiting_booking BUT has Calendly data (webhook fired, status stuck): ${stuck.length}`);
  for (const r of stuck.slice(0, 10)) {
    console.log(`      ${r.id}  ${r.name}  ${r.email}  cal=${r.hasCalendlyStart} booked=${r.hasBookedAt}`);
  }

  // The other telling case: ANY record anywhere with calendly data? If
  // zero across the whole collection, the webhook isn't firing at all.
  const anyCalendly = rows.filter(r => r.hasCalendlyStart || r.hasBookedAt);
  console.log(`\n[B] Any record with Calendly data populated:  ${anyCalendly.length}`);
  for (const r of anyCalendly.slice(0, 5)) {
    console.log(`      ${r.id}  status=${r.status}  ${r.name}  cal=${r.hasCalendlyStart} booked=${r.hasBookedAt}`);
  }

  // And the "booked" bucket for comparison.
  const booked = rows.filter(r => r.status === "booked");
  console.log(`\n[C] Records with status === "booked":  ${booked.length}`);
  for (const r of booked.slice(0, 5)) {
    console.log(`      ${r.id}  ${r.name}  ${r.email}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
