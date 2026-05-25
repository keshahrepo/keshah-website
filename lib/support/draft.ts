import Anthropic from "@anthropic-ai/sdk";
import type { DraftCategory, SupportMessage, UserProfile } from "./repo";

const MODEL = "claude-sonnet-4-6";

// Hard voice/safety rules that go into every draft request. These reflect
// patterns Aadi has corrected for in past TikTok/funnel copy: no em dashes,
// conversational not bullet-y, simple words, never give medical advice as
// fact. The safety guardrails are non-negotiable — for anything risky
// the model produces an empathetic holding reply only.
const VOICE_RULES = `
KESHAH SUPPORT — Aadi voice rules:
- Sound like Aadi talking, not writing. Full sentences, no bullet labels.
- No em dashes. Use periods or commas.
- Simple words. Avoid "follicle starves" / "your hair is leaving" / poetic phrasing.
- Keep replies short. 1-4 sentences is usually right.
- Never auto-give medical advice. No dosing, no drug interactions, no side-effect predictions.
- For anything you don't know for certain about this user's account or data, say "let me look into this, I'll reply within 24 hours" rather than guessing.
- Don't make claims about specific timelines for results ("you'll see hair in X weeks") — hedge with "generally" or "for most people".
- Sign off naturally. No "Best, Aadi" — Aadi signs by tone, not signature.
`.trim();

const CATEGORY_RULES = `
CATEGORY — set this in the output:
- "answerable": routine question about routine, app navigation, where to find pinned video, motivational reply, simple FAQ. Safe to draft a real answer.
- "investigation": user reports a bug or data issue (streak broken, blank screen, missing day, payment not reflected, calendar wrong). Draft = empathetic holding reply. Tell them you're looking into it personally and will reply within 24h. Do not guess at causes.
- "account_change": refund, plan switch, cancel subscription, change email, delete account. Draft = empathetic holding reply only. Tell them you'll handle it personally and reply within 24h.
- "medical": dosing, drug interactions, "is this shedding normal", side effects, hair products to use, medication questions. Draft = empathetic ack + redirect to pinned video for the routine. Do NOT give medical claims.
- "thanks": user said thanks / closed-out / sent positive update. Draft = short warm close-out (1-2 sentences).
`.trim();

const OUTPUT_FORMAT = `
Output a single JSON object, no prose, no code fence:
{
  "category": "answerable" | "investigation" | "account_change" | "medical" | "thanks",
  "content": "the draft reply text"
}
`.trim();

export type DraftResult = {
  category: DraftCategory;
  content: string;
  model: string;
};

function formatProfile(p: UserProfile): string {
  const lines: string[] = [];
  if (p.firstName) lines.push(`Name: ${p.firstName}`);
  if (p.gender) lines.push(`Gender: ${p.gender}`);
  if (p.treatmentStage) lines.push(`Treatment stage: ${p.treatmentStage}`);
  if (typeof p.daysIntoProgram === "number") lines.push(`Days into program: ${p.daysIntoProgram}`);
  if (p.region) lines.push(`Region: ${p.region}`);
  if (p.plan) lines.push(`Plan: ${p.plan}`);
  if (lines.length === 0) return "(no profile data on file)";
  return lines.join("\n");
}

function formatConversation(messages: SupportMessage[]): string {
  if (messages.length === 0) return "(no prior messages)";
  return messages
    .map((m) => {
      const who = m.fromId === "0" ? "Aadi" : "User";
      return `${who}: ${m.content.trim()}`;
    })
    .join("\n\n");
}

function formatExamples(examples: string[]): string {
  if (examples.length === 0) return "(no past examples available)";
  return examples.map((ex, i) => `Example ${i + 1}:\n${ex}`).join("\n\n---\n\n");
}

function parseModelOutput(raw: string): { category: DraftCategory; content: string } {
  // Strip code fences if the model adds them despite the instruction.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Last resort: pull category + content via regex.
    const cat = cleaned.match(/"category"\s*:\s*"([^"]+)"/);
    const ct = cleaned.match(/"content"\s*:\s*"([\s\S]+?)"\s*[},]/);
    if (cat && ct) {
      return {
        category: (cat[1] as DraftCategory) ?? "investigation",
        content: ct[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      };
    }
    // If parsing fails entirely we surface a safe holding reply.
    return {
      category: "investigation",
      content: "Thanks for the message. Let me look into this and I'll reply within 24 hours.",
    };
  }
  const obj = parsed as { category?: string; content?: string };
  const validCategories: DraftCategory[] = ["answerable", "investigation", "account_change", "medical", "thanks"];
  const category = (validCategories.includes(obj.category as DraftCategory) ? obj.category : "investigation") as DraftCategory;
  const content = (obj.content ?? "").trim();
  if (!content) {
    return {
      category: "investigation",
      content: "Thanks for the message. Let me look into this and I'll reply within 24 hours.",
    };
  }
  return { category, content };
}

export async function generateDraft(opts: {
  profile: UserProfile;
  conversation: SupportMessage[];
  voiceExamples: string[];
}): Promise<DraftResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const systemPrompt = [
    "You are drafting a support reply from Aadi (founder of KESHAH, a hair-loss app) to a paying user.",
    "Your output will be reviewed by Aadi on his phone before it's sent — so the goal is a draft he can hit Send on with minimal editing.",
    "",
    VOICE_RULES,
    "",
    CATEGORY_RULES,
    "",
    "Below are real past replies from Aadi. Match this tone, length, and rhythm:",
    "",
    formatExamples(opts.voiceExamples),
    "",
    OUTPUT_FORMAT,
  ].join("\n");

  const userPrompt = [
    "USER PROFILE:",
    formatProfile(opts.profile),
    "",
    "CONVERSATION SO FAR (oldest first):",
    formatConversation(opts.conversation),
    "",
    "Draft Aadi's next reply.",
  ].join("\n");

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Take the first text block from the response.
  const textBlock = resp.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const { category, content } = parseModelOutput(raw);
  return { category, content, model: MODEL };
}
