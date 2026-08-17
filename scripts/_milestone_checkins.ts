import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  // === Screen #7: Hair Fall Stopped Milestone (Day 60 / Day 90) ===
  // Raw Yes/No answers only go to Amplitude — Firestore only stores:
  //  - check_in_day_N_completed (did the check-in)
  //  - stabilization_confirmed (only set if both answers were Yes AND they chose Maintain)
  const day60Done = await db.collection("Users").where("check_in_day_60_completed", "==", true).count().get();
  const day90Done = await db.collection("Users").where("check_in_day_90_completed", "==", true).count().get();
  const stabConfirmed = await db.collection("Users").where("stabilization_confirmed", "==", true).count().get();

  // Users who did the check-in AND confirmed stabilization (implies answered Yes to BOTH)
  // Can't do an AND query without composite index, so scan
  const day60Snap = await db.collection("Users").where("check_in_day_60_completed", "==", true).get();
  let day60BothYes = 0; // stabilization_confirmed = true
  let day60AtLeastOneNo = 0; // check-in completed but not stabilized (they extended)
  for (const d of day60Snap.docs) {
    if (d.data().stabilization_confirmed === true) day60BothYes++;
    else day60AtLeastOneNo++;
  }

  const day90Snap = await db.collection("Users").where("check_in_day_90_completed", "==", true).get();
  let day90BothYes = 0;
  let day90AtLeastOneNo = 0;
  for (const d of day90Snap.docs) {
    if (d.data().stabilization_confirmed === true) day90BothYes++;
    else day90AtLeastOneNo++;
  }

  console.log(`=== Screen #7: Hair Fall Stopped Milestone ===`);
  console.log(`\nDay 60 check-in:`);
  console.log(`  Total completed:          ${day60Done.data().count}`);
  console.log(`  Both answers YES:         ${day60BothYes}  (${Math.round(day60BothYes/day60Done.data().count*100)}% "Yes, yes")`);
  console.log(`  At least one NO:          ${day60AtLeastOneNo}  (${Math.round(day60AtLeastOneNo/day60Done.data().count*100)}% "No to something")`);

  console.log(`\nDay 90 check-in:`);
  console.log(`  Total completed:          ${day90Done.data().count}`);
  console.log(`  Both answers YES:         ${day90BothYes}  (${Math.round(day90BothYes/day90Done.data().count*100)}%)`);
  console.log(`  At least one NO:          ${day90AtLeastOneNo}  (${Math.round(day90AtLeastOneNo/day90Done.data().count*100)}%)`);

  console.log(`\nOverall stabilization confirmed: ${stabConfirmed.data().count}`);

  // === Screen #8: Regrowth Readiness Check ===
  // Firestore writes raw answers: scalp_less_tight, hair_fall_reduced ("yes" / "no")
  console.log(`\n\n=== Screen #8: Regrowth Readiness Check ===`);
  const scalpSnap = await db.collection("Users").where("scalp_less_tight", "!=", null).get();
  const users = scalpSnap.docs.filter(d => !d.data().is_deleted);

  let scalpYes = 0, scalpNo = 0;
  let hairYes = 0, hairNo = 0;
  let bothYes = 0, bothNo = 0;
  let choiceRegrow = 0, choiceMaintain = 0, choiceNotNow = 0;
  let readinessPassed = 0;

  for (const d of users) {
    const data = d.data();
    const scalp = data.scalp_less_tight;
    const hair = data.hair_fall_reduced;
    if (scalp === "yes") scalpYes++; else if (scalp === "no") scalpNo++;
    if (hair === "yes") hairYes++; else if (hair === "no") hairNo++;
    if (scalp === "yes" && hair === "yes") bothYes++;
    if (scalp === "no" && hair === "no") bothNo++;
    if (data.regrowth_choice === "regrow") choiceRegrow++;
    if (data.regrowth_choice === "maintain") choiceMaintain++;
    if (data.regrowth_readiness_passed === true) readinessPassed++;
  }

  console.log(`Total who completed readiness check: ${users.length}`);
  console.log(`\nQ1: "Has your scalp tension reduced?"`);
  console.log(`  Yes: ${scalpYes}  (${Math.round(scalpYes/users.length*100)}%)`);
  console.log(`  No:  ${scalpNo}  (${Math.round(scalpNo/users.length*100)}%)`);
  console.log(`\nQ2: "Has your hair fall reduced?"`);
  console.log(`  Yes: ${hairYes}  (${Math.round(hairYes/users.length*100)}%)`);
  console.log(`  No:  ${hairNo}  (${Math.round(hairNo/users.length*100)}%)`);
  console.log(`\nBoth Yes (passed):  ${bothYes}  (${Math.round(bothYes/users.length*100)}%)`);
  console.log(`Both No (failed):   ${bothNo}`);
  console.log(`\nRegrowth choice (after passing):`);
  console.log(`  Chose to regrow:     ${choiceRegrow}`);
  console.log(`  Chose to maintain:   ${choiceMaintain}`);
  console.log(`  Passed (not-now):    ${readinessPassed}`);

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
