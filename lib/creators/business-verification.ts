// KESHAH's TikTok business verification: the address creators type and the
// image they upload in TikTok's "Become a Verified Business Account" flow.
// The founder sets both in the app. Kept under ContentCreators (the security
// rules keep clients out of everything there), never in Settings or Storage,
// which clients can read. The image is served only to signed-in creators who
// are still setting up, and each save is logged on their record.
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION, CreatorDataError } from "./db";

/** A parent doc that never exists, so creator listings never see it. */
const DOC_PATH = `${CREATORS_COLLECTION}/_keshah/private/business_verification`;

/** Firestore caps a doc at 1 MiB; base64 adds a third. */
export const MAX_IMAGE_B64 = 900_000;

export interface BusinessDetails {
  address_line: string;
  city: string;
  state: string;
  zip: string;
  county: string;
}

export interface BusinessVerification extends BusinessDetails {
  has_image: boolean;
  updated_at: string | null;
}

const FIELDS: (keyof BusinessDetails)[] = ["address_line", "city", "state", "zip", "county"];

function ref(db?: Firestore) {
  return (db ?? getFirebaseAdmin().db).doc(DOC_PATH);
}

/** Founder input -> fields to save, or an error. image_b64 is a base64 JPEG/PNG (no data: prefix). */
export function sanitizeBusinessInput(body: Record<string, unknown>): { updates: Record<string, unknown> } | { error: string } {
  const u: Record<string, unknown> = {};
  for (const k of FIELDS) {
    if (body[k] !== undefined) u[k] = String(body[k] ?? "").trim().slice(0, 200);
  }
  if (body.image_b64 !== undefined) {
    const b64 = String(body.image_b64 ?? "").replace(/^data:image\/\w+;base64,/, "").replace(/\s+/g, "");
    if (!b64) return { error: "Pick the image." };
    if (b64.length > MAX_IMAGE_B64) return { error: "That image is too big. Try a smaller photo or screenshot of it." };
    if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return { error: "That doesn't look like an image." };
    u.image_b64 = b64;
  }
  return { updates: u };
}

export async function getBusinessVerification(db?: Firestore): Promise<BusinessVerification> {
  const d = (await ref(db).get()).data() ?? {};
  return {
    address_line: String(d.address_line ?? ""),
    city: String(d.city ?? ""),
    state: String(d.state ?? ""),
    zip: String(d.zip ?? ""),
    county: String(d.county ?? ""),
    has_image: typeof d.image_b64 === "string" && d.image_b64.length > 0,
    updated_at: typeof d.updated_at === "string" ? d.updated_at : null,
  };
}

export async function saveBusinessVerification(updates: Record<string, unknown>, db?: Firestore): Promise<BusinessVerification> {
  await ref(db).set({ ...updates, updated_at: new Date().toISOString() }, { merge: true });
  return getBusinessVerification(db);
}

/** The image for one creator, logged on their record (first save time + count). */
export async function businessImageFor(creatorId: string, db?: Firestore): Promise<string> {
  const store = db ?? getFirebaseAdmin().db;
  const d = (await ref(store).get()).data() ?? {};
  const b64 = typeof d.image_b64 === "string" ? d.image_b64 : "";
  if (!b64) throw new CreatorDataError("This isn't ready yet. Message us and we'll sort it.", 404);
  const creator = store.collection(CREATORS_COLLECTION).doc(creatorId);
  const first = (await creator.get()).data()?.business_image_at;
  await creator.update({
    business_image_count: FieldValue.increment(1),
    ...(first ? {} : { business_image_at: new Date().toISOString() }),
  });
  return b64;
}
