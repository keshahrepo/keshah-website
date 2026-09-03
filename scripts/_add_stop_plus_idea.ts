import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const ref = db.collection("Ideas").doc("p15");
  await ref.set({
    title: "STOP+ mode — longer routine for long-tenured paid users",
    eli5:
      "New treatment stage above regular Stoppage with a longer daily routine (more exercises, more time). Admin-toggle only for now — later may auto-graduate users past Day 60 or introduce as a user-facing tier.",
    description: "Research phase — see workflow output for the recommended design. Content sourcing to decide (reuse VIP, extend Stoppage, create new).",
    status: "building",
    target_metric: "outcome_converted",
    assigned_version: "5_18_next",
    shipped_at: null,
    actual_delta_pp: null,
    original_proposal_number: 15,
    parked_reason: null,
    parked_unpark_trigger: null,
    ship_cluster: "Retention",
    dependencies: [],
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log("✔ Added STOP+ (p15) to pipeline as building.");
}
main().catch(e => { console.error(e); process.exit(1); });
