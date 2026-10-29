/**
 * The founder's notes after a creator interview (typed or dictated in the
 * founder app), and "Tidy up": Claude turns them into short bullets. The
 * original notes always stay.
 *
 *   careers_applications/{id}.call_notes          the founder's own words
 *   careers_applications/{id}.call_notes_tidy     { text, at }: the bullets
 *   ContentCreators/{id}.hire_notes               both, copied on Accept
 */
import Anthropic from "@anthropic-ai/sdk";
import { BEATS_MODEL } from "./creators/proven-beats";

export const CALL_NOTES_MAX = 8000;

export function cleanCallNotes(v: unknown): string {
  return String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, CALL_NOTES_MAX);
}

/** Adds a dictated or typed note under what's there, separated by a blank line. */
export function appendCallNote(cur: unknown, add: unknown): string {
  const a = cleanCallNotes(cur);
  const b = cleanCallNotes(add);
  if (!b) return a;
  return cleanCallNotes(a ? `${a}\n\n${b}` : b);
}

export const TIDY_SYSTEM = `You tidy a startup founder's rough notes from a short call with a TikTok creator he might hire to film videos for his hair loss app. The notes are often dictated, so expect filler words and run-on sentences.
Rewrite them as short bullets under these headings, only the ones the notes actually cover:
Strengths
Concerns
Logistics (availability, timezone, phone, pay or plan talk)
Leaning (the founder's own lean, only if he said one)
Rules: keep every fact and opinion the founder gave, add nothing new, no judgments of your own, plain words, no em dashes. Each bullet starts with "- ". Answer only by calling save_tidy.`;

const TOOL = { name: "save_tidy", description: "Save the tidied notes.", input_schema: { type: "object" as const, properties: { text: { type: "string" } }, required: ["text"] } };

export async function tidyCallNotes(name: string, notes: string, apiKey = process.env.ANTHROPIC_API_KEY ?? ""): Promise<string> {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: BEATS_MODEL,
    max_tokens: 1200,
    system: TIDY_SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: `Creator: ${name || "unknown"}\n\nNotes:\n${notes}\n\nAnswer by calling save_tidy.` }],
  });
  const call = r.content.find((b) => b.type === "tool_use");
  const text = call && call.type === "tool_use" ? String((call.input as { text?: string }).text ?? "") : "";
  return text.replace(/[—–]/g, ",").trim().slice(0, CALL_NOTES_MAX);
}
