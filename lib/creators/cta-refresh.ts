/**
 * Rewrites the saved pinned-video ending ("cta_line") of existing proven
 * videos in the current style: the ask names the viewer's doubts (is it
 * actually tight, does this work, how to fix it), worded fresh each time,
 * then one useful line and a short closer. Runs from the proven-beats cron,
 * CTA_REFRESH_CAP a run, until every active proven video has cta_version 2.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { BEATS_MODEL, cleanCta } from "./proven-beats";
import { PROVEN_COLLECTION } from "./proven";

export const CTA_VERSION = 2;
export const CTA_REFRESH_CAP = 40;

export const CTA_SYSTEM = `You write the spoken ending of a short hair loss video. A creator says it at the end, then viewers go to the pinned video on their profile. Write 3 short parts, as plain sentences separated by blank lines:
1. The ask. It speaks to the doubts the viewer has right now: is my scalp (or the area this video is about: hairline, temples, neck) actually tight, does this actually work, and if so how do I fix it. Name at least two of them, in your own fresh wording, never a stock phrase. Then say the answers are in "my pinned video, the one that says watch this first", that it's the first video on my profile, plus an honest line like "please don't DM me saying you can't find it" or "it's right at the top of my profile".
2. One useful line, not an ask, about what the pinned video shows (e.g. "Watch the whole thing, there are small things most people miss.").
3. A short natural closer, not an ask.
Rules: spoken, simple words a 5-year-old knows, 35 to 70 words in all, no em dashes or en dashes, never promise a result, never "I'm not selling anything" or anything about being paid, no "link in bio", "comment", "follow", "like" or "save this", no first-person hair loss ("my hair", "what do I have to lose"). Answer only by calling save_cta.`;

const TOOL = { name: "save_cta", description: "Save the ending.", input_schema: { type: "object" as const, properties: { cta: { type: "string" } }, required: ["cta"] } };

export type CtaGenerate = (hook: string, points: string[], others: string[]) => Promise<string>;

export function anthropicCta(apiKey = process.env.ANTHROPIC_API_KEY ?? ""): CtaGenerate {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  return async (hook, points, others) => {
    const user = [
      `Hook: ${hook}`,
      points.length ? `Points:\n- ${points.join("\n- ")}` : "",
      others.length ? `Endings already written for other videos (word yours differently):\n- ${others.slice(-6).join("\n- ")}` : "",
    ].filter(Boolean).join("\n\n");
    const r = await client.messages.create({ model: BEATS_MODEL, max_tokens: 1500, system: CTA_SYSTEM, tools: [TOOL], tool_choice: { type: "auto" }, messages: [{ role: "user", content: `${user}\n\nAnswer by calling save_cta.` }] });
    const call = r.content.find((b) => b.type === "tool_use");
    return call && call.type === "tool_use" ? String((call.input as { cta?: string }).cta ?? "") : "";
  };
}

export async function refreshCtas(opts: { limit?: number; deadlineMs?: number; generate?: CtaGenerate } = {}): Promise<{ refreshed: number; failed: number; left: number }> {
  const db = getFirebaseAdmin().db;
  const snap = await db.collection(PROVEN_COLLECTION).where("status", "==", "active").get();
  const todo = snap.docs.filter((d) => {
    const x = d.data();
    return x.added_by !== "founder_idea" && x.cta_version !== CTA_VERSION && (x.hook_full || x.hook_line);
  });
  const generate = opts.generate ?? anthropicCta();
  const limit = opts.limit ?? CTA_REFRESH_CAP;
  const others: string[] = [];
  let refreshed = 0;
  let failed = 0;
  for (const d of todo.slice(0, limit)) {
    if (opts.deadlineMs && Date.now() > opts.deadlineMs) break;
    const x = d.data();
    try {
      const cta = cleanCta(await generate(String(x.hook_full || x.hook_line), Array.isArray(x.talking_points) ? x.talking_points.map(String) : [], others));
      if (!cta) throw new Error("ending broke the rules");
      await d.ref.update({ cta_line: cta, cta_version: CTA_VERSION });
      others.push(cta.split("\n")[0]);
      refreshed++;
    } catch (e) {
      failed++;
      console.error(`cta refresh ${d.id}:`, e instanceof Error ? e.message : e);
    }
  }
  return { refreshed, failed, left: Math.max(0, todo.length - refreshed) };
}
