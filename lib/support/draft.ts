import Anthropic from "@anthropic-ai/sdk";
import type { DraftCategory, SupportMessage, UserProfile } from "./repo";
import type { SupportPrompts } from "./prompts";

const MODEL = "claude-sonnet-4-6";

// Output schema instruction stays hardcoded — it's a structural constraint,
// not a voice/framing choice that anyone would want to tweak from the
// dashboard. Everything else (voice rules, canonical answers, category
// rules) is now Firestore-backed and passed in by the caller.
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
  promptVersion: number;
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
  prompts: SupportPrompts;
}): Promise<DraftResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const systemPrompt = [
    "You are drafting a support reply from Aadi (founder of KESHAH, a hair-loss app) to a paying user.",
    "Your output will be reviewed by Aadi on his phone before it's sent — so the goal is a draft he can hit Send on with minimal editing.",
    "",
    opts.prompts.voiceRules,
    "",
    opts.prompts.canonicalAnswers,
    "",
    opts.prompts.categoryRules,
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

  const textBlock = resp.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const { category, content } = parseModelOutput(raw);
  return { category, content, model: MODEL, promptVersion: opts.prompts.version };
}
