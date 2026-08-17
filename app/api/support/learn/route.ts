import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { recentLearningPairs } from "@/lib/support/learning";
import { getActivePrompts } from "@/lib/support/prompts";
import { writeProposals } from "@/lib/support/proposals";
import { requireCronSecret } from "@/lib/support/auth";

// Long-ish: we run a single Claude call over yesterday's edit pairs.
export const maxDuration = 120;

const ANALYZER_MODEL = "claude-sonnet-4-6";

// Daily learning cron. Called by Vercel cron once a day.
// 1. Pulls (draft, sent) pairs from the last 24h where the edit was non-trivial
// 2. Sends them to Claude with the current prompts as context
// 3. Asks Claude to propose targeted updates to VOICE_RULES / CANONICAL_ANSWERS / CATEGORY_RULES
// 4. Writes proposals to support_learning_proposals for Aadi's review in the dashboard
export async function POST(req: Request) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const hoursParam = url.searchParams.get("hours");
  const hours = hoursParam ? Math.max(1, Math.min(168, parseInt(hoursParam, 10))) : 24;

  // Only learn from cases where Aadi actually edited the draft (or rewrote it).
  // Verbatim sends carry no signal; no-draft sends (Aadi typed cold) carry weak signal.
  // Bucket: 0.0 - 0.85 similarity = worth analyzing.
  const pairs = await recentLearningPairs({ hours, maxSimilarity: 0.85 });

  if (pairs.length === 0) {
    return NextResponse.json({ analyzed: 0, proposals: 0, note: "no significantly-edited pairs in window" });
  }

  const prompts = await getActivePrompts();

  // Cap to a reasonable batch — Claude can handle more, but we want each
  // pair to actually get read carefully. If volume ever spikes we can shard.
  const sample = pairs.slice(0, 30);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  const client = new Anthropic({ apiKey });

  const pairsBlock = sample
    .map((p, i) => {
      const draft = (p.draft ?? "(no draft — Aadi typed cold)").replace(/\n/g, " ");
      const sent = p.sent.replace(/\n/g, " ");
      return `[#${i + 1} | edit=${p.editType} | sim=${p.similarity.toFixed(2)} | category=${p.category ?? "?"} | pair_id=${p.id}]\nDraft: ${draft}\nSent:  ${sent}`;
    })
    .join("\n\n");

  const systemPrompt = `You are the prompt-engineering analyst for the KESHAH support draft system.

Aadi writes ~50 support replies a day. The drafting model generates a draft for each, then Aadi edits before sending. The gap between draft and sent is your signal.

Your job: read the (draft, sent) pairs below, find systematic patterns where the model is off, and propose targeted updates to the active system prompt.

Output a JSON array of proposals. Each proposal must be a concrete, narrowly-scoped change — not vague advice. Empty array is fine if nothing systematic shows up.

Each proposal has:
{
  "target": "voiceRules" | "canonicalAnswers" | "categoryRules",
  "summary": "1-line headline (under 100 chars)",
  "rationale": "2-4 sentences explaining the pattern, citing pair numbers like [#3, #7]",
  "patchType": "append" | "replace",
  "proposedText": "for append: the new bullet/section to add. for replace: the FULL new text of the target field",
  "supportingPairIds": ["pair_id values from the pairs you reference"]
}

Rules:
- Only propose changes supported by ≥2 pairs. Single-case fixes are noise.
- Prefer "append" (additive) over "replace" (rewrite the whole field).
- For canonicalAnswers append, add a numbered Q-pattern with the same structure as existing ones (Q in quotes, dash-bullet talking points).
- For voiceRules append, add a single dash-bullet rule.
- Don't propose changes that contradict an existing rule unless you call it out explicitly in the rationale.
- Output strictly the JSON array. No prose, no code fence.`;

  const userPrompt = `=== CURRENT VOICE RULES ===
${prompts.voiceRules}

=== CURRENT CANONICAL ANSWERS ===
${prompts.canonicalAnswers}

=== CURRENT CATEGORY RULES ===
${prompts.categoryRules}

=== EDIT PAIRS FROM THE LAST ${hours}h (${sample.length} pairs, ${pairs.length} total in window) ===
${pairsBlock}

Analyze. Output the JSON array of proposals.`;

  const resp = await client.messages.create({
    model: ANALYZER_MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = resp.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "[]";
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  type RawProposal = {
    target?: string;
    summary?: string;
    rationale?: string;
    patchType?: string;
    proposedText?: string;
    supportingPairIds?: string[];
  };

  let proposals: RawProposal[] = [];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) proposals = parsed;
  } catch (e) {
    console.error("[support/learn] failed to parse analyzer output", e instanceof Error ? e.message : e, "raw:", raw.slice(0, 500));
    return NextResponse.json({ error: "analyzer output was not valid JSON", raw: raw.slice(0, 1000) }, { status: 500 });
  }

  const validTargets = new Set(["voiceRules", "canonicalAnswers", "categoryRules"]);
  const validPatchTypes = new Set(["append", "replace"]);

  const toWrite = proposals
    .filter((p) => p.target && validTargets.has(p.target) && p.patchType && validPatchTypes.has(p.patchType) && p.proposedText && p.summary)
    .map((p) => ({
      target: p.target as "voiceRules" | "canonicalAnswers" | "categoryRules",
      summary: (p.summary as string).slice(0, 200),
      rationale: (p.rationale ?? "") as string,
      patchType: p.patchType as "append" | "replace",
      proposedText: (p.proposedText as string),
      supportingPairIds: Array.isArray(p.supportingPairIds) ? p.supportingPairIds.slice(0, 20) : [],
      numPairsAnalyzed: sample.length,
    }));

  await writeProposals(toWrite);

  return NextResponse.json({
    analyzed: sample.length,
    total_window: pairs.length,
    proposals_written: toWrite.length,
    proposals_raw: proposals.length,
  });
}
