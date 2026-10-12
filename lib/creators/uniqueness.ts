// Things only one creator may have: a TikTok / Instagram handle, a campaign
// tag, and the username we hand out at setup. Two creators can share a first
// name ("Anya"), so all of these are checked against every other creator.
import { suggestedHandle } from "./onboarding-content";

export interface CreatorDoc {
  id: string;
  data: Record<string, unknown>;
}

/** "@Anya.Keshah " -> "anya.keshah". */
export function handleKey(h: unknown): string {
  return String(h ?? "").trim().replace(/^@+/, "").replace(/\s+/g, "").toLowerCase();
}

function nameOf(d: Record<string, unknown>): string {
  return String(d.legal_name || d.name || "another creator");
}

/** Every handle another creator has, including the username we gave them. */
export function takenHandles(docs: CreatorDoc[], exceptId: string): Set<string> {
  const out = new Set<string>();
  for (const { id, data } of docs) {
    if (id === exceptId) continue;
    for (const k of ["tiktok_handle", "instagram_handle", "assigned_handle"]) {
      const h = handleKey(data[k]);
      if (h) out.add(h);
    }
  }
  return out;
}

/** anya.keshah, or anya.keshah2, anya.keshah3... when another creator has it. */
export function pickHandle(name: string, taken: Set<string>): string {
  const base = suggestedHandle(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const h = `${base}${n}`;
    if (!taken.has(h)) return h;
  }
}

/** The other creator who already has this handle, if any. */
export function handleOwner(docs: CreatorDoc[], exceptId: string, handle: string): string | null {
  const key = handleKey(handle);
  if (!key) return null;
  for (const { id, data } of docs) {
    if (id === exceptId) continue;
    if (["tiktok_handle", "instagram_handle", "assigned_handle"].some((k) => handleKey(data[k]) === key)) return nameOf(data);
  }
  return null;
}

/** The first of `tags` another creator already has: { tag, owner }. Case-insensitive. */
export function campaignTagClash(docs: CreatorDoc[], exceptId: string, tags: string[]): { tag: string; owner: string } | null {
  const wanted = new Map(tags.map((t) => [t.trim().toLowerCase(), t.trim()]));
  for (const { id, data } of docs) {
    if (id === exceptId || !Array.isArray(data.campaign_tags)) continue;
    for (const t of data.campaign_tags) {
      const hit = wanted.get(String(t).trim().toLowerCase());
      if (hit) return { tag: hit, owner: nameOf(data) };
    }
  }
  return null;
}
