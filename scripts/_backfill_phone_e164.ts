// One-off: set careers_applications.phone_e164 from phone (for the HiBlue
// paywall outreach's creator-applicant skip). Dry run unless APPLY=1.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { normalizePhone } from "../lib/sms";
initializeApp({ credential: cert(JSON.parse(readFileSync("/Users/aadityaagrawal/keshah-analytics/serviceAccount.json", "utf8"))) });
const db = getFirestore();
(async () => {
  const snap = await db.collection("careers_applications").get();
  let set = 0, already = 0, unparseable = 0, none = 0;
  const batch = db.batch();
  for (const d of snap.docs) {
    const x = d.data();
    if (!x.phone) { none++; continue; }
    const e = normalizePhone(x.phone);
    if (!e) { unparseable++; continue; }
    if (x.phone_e164 === e) { already++; continue; }
    set++;
    batch.update(d.ref, { phone_e164: e });
  }
  console.log({ total: snap.size, to_set: set, already, unparseable, no_phone: none });
  if (process.env.APPLY === "1" && set) { await batch.commit(); console.log("applied"); }
})();
