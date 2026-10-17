// App Review sign-in: one demo email whose code never changes, so Apple's
// reviewer can get in without an inbox. Stored in Settings/mobile_demo
// { email, code } (6 digits), not in the code base. Missing doc = no demo.
import type { Firestore } from "firebase-admin/firestore";

export async function demoLogin(db: Firestore): Promise<{ email: string; code: string } | null> {
  const snap = await db.collection("Settings").doc("mobile_demo").get();
  const d = snap.data();
  const email = String(d?.email ?? "").trim().toLowerCase();
  const code = String(d?.code ?? "").replace(/\D/g, "");
  return email && code.length === 6 ? { email, code } : null;
}

/** Settings/mobile: the lowest app version allowed (forced updates), the build waiting to become it, and where to get it. */
export async function mobileSettings(db: Firestore): Promise<{ min_version?: string; app_store_url?: string; pending_min_version?: string }> {
  const d = (await db.collection("Settings").doc("mobile").get()).data() ?? {};
  return {
    ...(typeof d.min_version === "string" && d.min_version.trim() ? { min_version: d.min_version.trim() } : {}),
    ...(typeof d.pending_min_version === "string" && d.pending_min_version.trim() ? { pending_min_version: d.pending_min_version.trim() } : {}),
    ...(typeof d.app_store_url === "string" && d.app_store_url.trim() ? { app_store_url: d.app_store_url.trim() } : {}),
  };
}
