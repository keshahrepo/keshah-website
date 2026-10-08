/**
 * Firestore side of the KESHAH Creators app backend: the sign-in code store
 * and who an email belongs to. Kept apart from the pure helpers so those
 * stay importable in unit tests without credentials.
 */
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import {
  findApplicationByEmail,
  isAcceptingNow,
  resolveSession,
  sessionClosesAtMs as sessionClosesAtMs_,
  VIDEO_SLUG,
} from "@/lib/interview";
import { CODES_COLLECTION, IP_COLLECTION, type CodeState, type CodeStore, type IpState } from "./codes";
import { pickRole, type IdentityLookup, type PersonRef } from "./identity";
import { LINKS_COLLECTION, type LinkStore } from "./firebase-signin";

export function firestoreCodeStore(db: Firestore): CodeStore {
  return {
    async issue(emailKey, ipKey, decide) {
      const cref = db.collection(CODES_COLLECTION).doc(emailKey);
      const iref = db.collection(IP_COLLECTION).doc(ipKey);
      return db.runTransaction(async (tx) => {
        const [c, i] = await Promise.all([tx.get(cref), tx.get(iref)]);
        const d = decide(c.exists ? (c.data() as CodeState) : null, i.exists ? (i.data() as IpState) : null);
        if (d.ok) {
          tx.set(cref, d.state);
          tx.set(iref, d.ip);
        }
        return d;
      });
    },
    async check(emailKey, decide) {
      const cref = db.collection(CODES_COLLECTION).doc(emailKey);
      return db.runTransaction(async (tx) => {
        const c = await tx.get(cref);
        const r = decide(c.exists ? (c.data() as CodeState) : null);
        if (r.state && c.exists) tx.set(cref, r.state);
        return r;
      });
    },
  };
}

/** Active creator whose portal login email is this (same query as /api/auth/login). */
export async function findCreatorByEmail(db: Firestore, email: string): Promise<PersonRef | null> {
  const e = email.toLowerCase().trim();
  const active = (field: "email" | "keshah_email") =>
    db.collection(CREATORS_COLLECTION).where(field, "==", e).where("is_active", "==", true).limit(1).get();
  // Their personal email first; their KESHAH (Workspace) email signs in to the same account.
  let snap = await active("email");
  if (snap.empty) snap = await active("keshah_email");
  const d = snap.docs[0];
  if (!d) return null;
  const x = d.data();
  return { id: d.id, name: String(x.name || x.legal_name || "").trim() };
}

/** Active (else most recent) careers application for this email. */
export async function findApplication(db: Firestore, email: string): Promise<DocumentSnapshot | null> {
  return findApplicationByEmail(db, email);
}

export function firestoreIdentity(db: Firestore): IdentityLookup {
  return {
    creator: (email) => findCreatorByEmail(db, email),
    application: async (email) => {
      const d = await findApplication(db, email);
      return d ? { id: d.id, name: String(d.get("full_name") ?? "").trim() } : null;
    },
  };
}

export async function resolveIdentity(db: Firestore, email: string) {
  return pickRole(firestoreIdentity(db), email);
}

export interface ApplicantContext {
  doc: DocumentSnapshot;
  app: Record<string, unknown>;
  /** Close time of the real group-interview session they're tagged to, if any. */
  sessionClosesAtMs: number | null;
  /** Whether that session still takes videos (null = not in a real session). */
  sessionOpen: boolean | null;
  /** Their session slug, else "video" (the always-open link). */
  sessionSlug: string;
}

/** The signed-in person's application plus its session, or null when this email never applied. */
export async function loadApplicant(db: Firestore, email: string): Promise<ApplicantContext | null> {
  const doc = await findApplication(db, email);
  if (!doc) return null;
  const app = (doc.data() ?? {}) as Record<string, unknown>;
  const tagged = typeof app.interview_session === "string" ? app.interview_session.trim() : "";
  let sessionClosesAtMs: number | null = null;
  let sessionOpen: boolean | null = null;
  let sessionSlug = VIDEO_SLUG;
  if (tagged && tagged !== VIDEO_SLUG) {
    const s = await resolveSession(db, tagged);
    if (s) {
      sessionSlug = s.slug;
      sessionClosesAtMs = sessionClosesAtMs_(s);
      sessionOpen = isAcceptingNow(s);
    } else {
      sessionSlug = tagged;
    }
  }
  return { doc, app, sessionClosesAtMs, sessionOpen, sessionSlug };
}

export function firestoreLinkStore(db: Firestore): LinkStore {
  const col = db.collection(LINKS_COLLECTION);
  return {
    async get(uid) {
      const d = await col.doc(uid).get();
      const email = d.exists ? d.get("email") : null;
      return typeof email === "string" && email ? { email } : null;
    },
    async set(uid, rec) {
      await col.doc(uid).set(rec);
    },
  };
}
