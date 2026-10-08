// KESHAH Creators app: "Delete account" (App Store requirement).
// POST (Bearer) -> { ok: true }
// Records the request on the creator / application, emails the founder to finish
// it, and signs the person out in the app. Pay, invoice and contract records are
// kept as long as the law requires; everything else is removed by hand.
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { resolveIdentity } from "@/lib/mobile/firestore";
import { requireMobile, serverError } from "@/lib/mobile/http";
import { CREATORS_COLLECTION } from "@/lib/creators/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  try {
    const { db } = getFirebaseAdmin();
    const id = (await resolveIdentity(db, claims.sub)) as { role?: string; email?: string; name?: string; creator_id?: string; application_id?: string };
    const now = new Date().toISOString();
    if (id.creator_id) await db.collection(CREATORS_COLLECTION).doc(id.creator_id).set({ deletion_requested_at: now }, { merge: true });
    if (id.application_id) await db.collection("careers_applications").doc(id.application_id).set({ deletion_requested_at: now }, { merge: true });
    await db.collection("account_deletion_requests").add({
      email: id.email ?? claims.sub,
      name: id.name ?? null,
      role: id.role ?? null,
      creator_id: id.creator_id ?? null,
      application_id: id.application_id ?? null,
      requested_at: FieldValue.serverTimestamp(),
    });
    if (emailConfigured()) {
      await sendEmail({
        to: process.env.CREATOR_ALERT_EMAIL || "contact@keshah.com",
        fromName: "KESHAH Creators app",
        subject: `Account deletion request: ${id.name || id.email || claims.sub}`,
        text: `${id.name || "Someone"} (${id.email || claims.sub}, ${id.role || "unknown role"}) asked to delete their KESHAH Creators account.\n\nCreator id: ${id.creator_id || "-"}\nApplication id: ${id.application_id || "-"}\n\nFinish it within 30 days. Keep pay, invoice and contract records as the law requires.`,
      }).catch(() => undefined);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e, "me/delete");
  }
}
