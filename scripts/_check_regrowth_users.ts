import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const EMAILS = ["najinthant@gmail.com", "theodubreuil@hotmail.fr"];

const REGROWTH_FIELDS = [
  "user_type",
  "treatment_stage",
  "extra_user_tags",
  "regrowth_switched_at_date",
  "free_stoppage_switched_at_date",
  "free_maintenance_switched_at_date",
  "free_stoppage_ext_switched_at_date",
  "regrowth_treatment_purchased",
  "regrowth_treatment_purchased_at",
  "regrowth_consultation_completed",
  "scalp_health_support_purchased",
  "regrowth_progress",
  "is_deleted",
  "eligible_for_special_regrowth_features",
  "start_date",
  "created_at",
  "modified_at",
  "payment_provider",
  "user_local_time_zone",
];

async function rcSubscriber(uid: string) {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } },
    );
    if (!res.ok) return { status: res.status, error: await res.text() };
    return await res.json();
  } catch (e) {
    return { error: String(e) };
  }
}

async function main() {
  for (const email of EMAILS) {
    console.log(`\n════════════════════════════════════════`);
    console.log(`  ${email}`);
    console.log(`════════════════════════════════════════`);

    const byEmail = await db
      .collection("Users")
      .where("email", "==", email)
      .get();
    const byWpEmail = await db
      .collection("Users")
      .where("wp_user.user_email", "==", email)
      .get();
    const seen = new Set<string>();
    const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (const d of [...byEmail.docs, ...byWpEmail.docs]) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        docs.push(d);
      }
    }

    console.log(`\nFound ${docs.length} Users doc(s)`);

    for (const doc of docs) {
      const data = doc.data();
      console.log(`\n  uid: ${doc.id}`);
      for (const field of REGROWTH_FIELDS) {
        const v = data[field];
        if (v === undefined) continue;
        if (field === "regrowth_progress" && v && typeof v === "object") {
          const days = Object.keys(v as object);
          console.log(`    ${field}: {${days.length} days} → ${days.slice(0, 5).join(", ")}${days.length > 5 ? "…" : ""}`);
          continue;
        }
        if (v && typeof v === "object" && "_seconds" in v) {
          console.log(`    ${field}: ${new Date((v as { _seconds: number })._seconds * 1000).toISOString()}`);
          continue;
        }
        console.log(`    ${field}: ${JSON.stringify(v)}`);
      }

      // RC entitlements
      console.log(`\n  RC subscriber:`);
      const rc = await rcSubscriber(doc.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rcAny = rc as any;
      if (rcAny.subscriber?.entitlements) {
        const ents = rcAny.subscriber.entitlements;
        const active = Object.entries(ents).filter(([, e]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const exp = (e as any).expires_date;
          return !exp || new Date(exp) > new Date();
        });
        console.log(`    active entitlements: ${active.length}`);
        for (const [k, e] of active) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyE = e as any;
          console.log(`      - ${k} → expires ${anyE.expires_date ?? "never"}, product ${anyE.product_identifier ?? "?"}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subs = rcAny.subscriber.subscriptions ?? {};
        console.log(`    active subscriptions: ${Object.keys(subs).length}`);
        for (const [pid, s] of Object.entries(subs)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyS = s as any;
          console.log(`      - ${pid} → expires ${anyS.expires_date ?? "?"}, store ${anyS.store ?? "?"}, unsub ${anyS.unsubscribe_detected_at ?? "no"}`);
        }
      } else {
        console.log(`    ${JSON.stringify(rc).slice(0, 300)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
