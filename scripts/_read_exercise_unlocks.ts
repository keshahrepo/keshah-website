import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Read the exercises_unlocks_free_stoppage doc from Settings collection
// so we can see the current unlock schedule for FreeV2 users. Prints
// the men + women arrays with title, days-to-unlock, and advanced flag.
(async () => {
  const snap = await db.collection("Settings").doc("exercises_unlocks_free_stoppage").get();
  if (!snap.exists) {
    console.log("Doc exists: false");
    process.exit(0);
  }
  const data = snap.data()!;
  const printList = (label: string, arr: any[]) => {
    console.log(`\n=== ${label} (${arr.length} exercises) ===`);
    // Sort by unlock day so timeline reads top-to-bottom.
    const sorted = [...arr].sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    for (const ex of sorted) {
      const day = ex.days == null ? "?" : `Day ${(ex.days as number) + 1}`;
      const flag = ex.advanced ? " [ADVANCED]" : "";
      console.log(`  ${day.padEnd(8)} · ${ex.title}${flag}`);
      if (ex.description) {
        console.log(`           ${ex.description}`);
      }
    }
  };
  printList("MEN", (data.men as any[]) || []);
  printList("WOMEN", (data.women as any[]) || []);
  process.exit(0);
})();
