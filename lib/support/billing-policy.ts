// Refund / cancellation policy for support drafts. Kept as marker-delimited
// blocks so the same text can live in the hardcoded defaults (prompts.ts)
// AND be spliced into the live Firestore prompts doc by
// scripts/support-billing-policy-migration.ts without touching anything else
// the founder has edited there. Pure: no Firestore imports.

export const BILLING_CANONICAL_START = "=== BILLING: REFUNDS AND CANCELLATIONS ===";
export const BILLING_CANONICAL_END = "=== END BILLING ===";
export const BILLING_CATEGORY_START = "=== BILLING CATEGORY OVERRIDE ===";
export const BILLING_CATEGORY_END = "=== END BILLING CATEGORY OVERRIDE ===";

export const BILLING_CANONICAL_BLOCK = `
${BILLING_CANONICAL_START}
These apply to the KESHAH app subscription (paid through Apple or Google). Hit the points in Aadi's voice. Never promise a refund. Never guess whether Apple or Google will approve one. NEVER give step-by-step refund instructions or refund links (cancel steps are fine).

7. "I want a refund" / "refund me" / "give me my money back"
   - Say: "I'm sorry to hear that. Payments for KESHAH are handled by Apple (or Google on Android), so we don't have a way to issue refunds on our end. Any refund would need to go through them."
   - Then: "Can I ask what's not working for you? If it's the routine or results, I'd really like to help you get more out of it."

8. "I got charged after the free trial" / "I forgot to cancel" / "why was I charged"
   - First: "The free trial turns into a subscription automatically unless it's cancelled before it ends, so I'm sorry that caught you out."
   - Then the refund points from #7 (Apple or Google handle payments, refunds can only go through them, then the question about what's not working).
   - If they also want to stop future charges, add the cancel steps from #9.

9. "How do I cancel" / "cancel my subscription" / "stop charging me"
   - Give the steps first: "You can cancel any time from your phone. On iPhone: Settings, tap your name, Subscriptions, KESHAH, Cancel. On Android: Play Store, your profile, Payments & subscriptions, Subscriptions, KESHAH, Cancel. You'll keep access until the end of the period you've already paid for."
   - Then: "If you don't mind me asking, what made you want to stop? If it's results or the routine feeling like a lot, I'm happy to help."

10. Angry tone ("scam", "refund me now", "rip off", threats, all caps)
   - Drop the retention question. Stay calm and factual, no exclamation marks.
   - Say: "I'm sorry you're frustrated. Payments for KESHAH are handled by Apple (or Google on Android), so refunds can only be issued by them, not by us."
   - If they want to cancel, add the cancel steps from #9.

11. Replies to the "what's not working" question
   - Answer with the matching common question above (not seeing results = #2, shedding = #1, timelines = #5). If the routine feels like a lot, keep it encouraging: even a shorter KESHAH session every day helps, consistency matters more than doing everything perfectly, and don't stress about it too much.

12. ESCALATED: chargeback or bank dispute, legal rights or regulations (e.g. Consumer Contracts Regulations, the 14-day right), a refund Apple or Google already declined, threats to escalate, or "final notice" language
   - No retention question. Calm and factual, no exclamation marks.
   - Explain: App Store purchases are sold and charged by Apple (Google Play on Android). Apple holds the payment and handles all refunds, so KESHAH has no way to issue one, even if we wanted to.
   - Suggest contacting Apple Support directly by phone or chat, not just the online form. If they said the renewal was unintended, suggest they explain to Apple that it was an unintended renewal.
   - Include the cancel steps from #9, and that once it's cancelled they won't be charged again.
   - Never admit liability, never promise a refund, never give legal advice or comment on their legal claims.

The physical regrowth kit is different: it's paid through Razorpay or Stripe, not Apple or Google. A refund or return for the kit is "account_change" (personal holding reply), not these answers.
${BILLING_CANONICAL_END}
`.trim();

export const ACCOUNT_CHANGE_RULE = `- "account_change": physical regrowth kit refund or return (paid via Razorpay or Stripe), plan switch, change email, delete account. Empathetic holding reply: you'll handle it personally and reply within 24h. App subscription refunds and cancellations are NOT account_change, see the override below.`;

export const BILLING_CATEGORY_BLOCK = `
${BILLING_CATEGORY_START}
- App subscription refunds, "charged after the free trial", "forgot to cancel", and cancel requests are "answerable". Use the billing answers (#7 to #11) above, never the 24h holding reply.
- Only a refund or return for the physical regrowth kit (paid via Razorpay or Stripe) is "account_change".
- If it's unclear whether they mean the app or the kit, treat it as the app subscription unless they mention the kit, a delivery, or an order.
- "escalated": chargeback or bank dispute, legal rights or regulations (Consumer Contracts Regulations, 14-day right), a refund Apple or Google already declined, threats to escalate, or "final notice" language. Draft the reply with billing answer #12. This overrides "answerable" and "account_change"; Aadi reads every escalated draft himself before it goes out.
${BILLING_CATEGORY_END}
`.trim();

function spliceBlock(text: string, start: string, end: string, block: string): string {
  const s = text.indexOf(start);
  const e = text.indexOf(end);
  if (s !== -1 && e !== -1 && e > s) {
    return (text.slice(0, s) + block + text.slice(e + end.length)).trim();
  }
  return `${text.trim()}\n\n${block}`.trim();
}

/** Replaces the `- "account_change": ...` line (if any) with the new rule. */
function replaceAccountChangeLine(text: string): string {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => /^\s*-\s*"account_change"\s*:/.test(l));
  if (idx === -1) return text;
  lines[idx] = ACCOUNT_CHANGE_RULE;
  return lines.join("\n");
}

/**
 * Applies the billing policy to a prompts pair: replaces (or appends) the
 * marked billing blocks and swaps the account_change category line. Leaves
 * everything else untouched. Idempotent.
 */
export function applyBillingPolicy(p: { canonicalAnswers: string; categoryRules: string }): {
  canonicalAnswers: string;
  categoryRules: string;
  changed: boolean;
} {
  const canonicalAnswers = spliceBlock(p.canonicalAnswers, BILLING_CANONICAL_START, BILLING_CANONICAL_END, BILLING_CANONICAL_BLOCK);
  const categoryRules = spliceBlock(
    replaceAccountChangeLine(p.categoryRules),
    BILLING_CATEGORY_START,
    BILLING_CATEGORY_END,
    BILLING_CATEGORY_BLOCK,
  );
  return {
    canonicalAnswers,
    categoryRules,
    changed: canonicalAnswers !== p.canonicalAnswers.trim() || categoryRules !== p.categoryRules.trim(),
  };
}
