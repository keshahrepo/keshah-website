/**
 * Who a signed-in email is: a creator (has an active ContentCreators doc with
 * that login email), else an applicant (has a careers_applications doc), else
 * nobody yet. Re-evaluated on every /api/mobile/me so an applicant who gets
 * accepted turns into a creator without signing in again.
 */
import type { MobileClaims, MobileRole } from "./token";

export interface PersonRef {
  id: string;
  name: string;
}

export interface IdentityLookup {
  creator(email: string): Promise<PersonRef | null>;
  application(email: string): Promise<PersonRef | null>;
}

export interface Identity {
  role: MobileRole;
  name: string;
  email: string;
  creator_id?: string;
  application_id?: string;
}

export async function pickRole(lookup: IdentityLookup, email: string): Promise<Identity> {
  const [creator, app] = await Promise.all([lookup.creator(email), lookup.application(email)]);
  if (creator) {
    return {
      role: "creator",
      name: creator.name || app?.name || "",
      email,
      creator_id: creator.id,
      ...(app ? { application_id: app.id } : {}),
    };
  }
  if (app) return { role: "applicant", name: app.name, email, application_id: app.id };
  return { role: "none", name: "", email };
}

export function claimsFor(id: Identity): MobileClaims {
  return {
    sub: id.email,
    role: id.role,
    ...(id.creator_id ? { cid: id.creator_id } : {}),
    ...(id.application_id ? { aid: id.application_id } : {}),
  };
}

/**
 * Creator id for a mobile token: the cid claim when there is one, else a
 * fresh lookup by email (an applicant token whose owner has since become a
 * creator). null when the email isn't a creator.
 */
export async function creatorIdForClaims(
  claims: MobileClaims,
  findCreator: (email: string) => Promise<PersonRef | null>,
): Promise<string | null> {
  if (claims.cid) return claims.cid;
  const c = await findCreator(claims.sub);
  return c?.id ?? null;
}
