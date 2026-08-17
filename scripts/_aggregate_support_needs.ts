// Aggregates support_needs answers across all funnel users.
// Source: SupportNeeds step ("What else can we help you with?")
// Persisted to: Users.support_needs (array) via /api/funnel/identify
// Population: anyone who reached the paywall, paid or not.

import { getFirebaseAdmin } from "@/lib/firebase-admin";

const LABELS: Record<string, string> = {
  get_off_medication: "Get off medication",
  fix_dandruff: "Fix dandruff / oily scalp",
  dht_hormones: "DHT / hormones",
  stress: "Stress",
  bloodwork_vitamins: "Blood work / vitamins",
  diet: "Diet",
};

(async () => {
  const { db } = getFirebaseAdmin();

  const snap = await db.collection("Users").get();

  let totalUsers = 0;
  let usersWithAnyNeed = 0;
  let usersWithEmpty = 0;
  const counts: Record<string, number> = {};
  const coOccurrence: Record<string, Record<string, number>> = {};

  // Also track by paid vs unpaid for signal strength
  let paidWithNeeds = 0;
  let unpaidWithNeeds = 0;
  const countsPaid: Record<string, number> = {};
  const countsUnpaid: Record<string, number> = {};

  for (const doc of snap.docs) {
    const x = doc.data();
    const needs = x.support_needs as string[] | undefined;
    if (!Array.isArray(needs)) continue;

    totalUsers++;
    if (needs.length === 0) {
      usersWithEmpty++;
      continue;
    }
    usersWithAnyNeed++;

    const isPaid = !!x.paid_at || !!x.razorpay_subscription_id || (Array.isArray(x.extra_user_tags) && x.extra_user_tags.includes("paidStoppage"));
    if (isPaid) paidWithNeeds++;
    else unpaidWithNeeds++;

    for (const n of needs) {
      counts[n] = (counts[n] || 0) + 1;
      if (isPaid) countsPaid[n] = (countsPaid[n] || 0) + 1;
      else countsUnpaid[n] = (countsUnpaid[n] || 0) + 1;
    }

    // Co-occurrence: which needs cluster together
    for (const a of needs) {
      coOccurrence[a] = coOccurrence[a] || {};
      for (const b of needs) {
        if (a === b) continue;
        coOccurrence[a][b] = (coOccurrence[a][b] || 0) + 1;
      }
    }
  }

  console.log("\n=== SUPPORT NEEDS AGGREGATION ===\n");
  console.log(`Users w/ support_needs field: ${totalUsers}`);
  console.log(`  → with at least 1 selection: ${usersWithAnyNeed} (${((usersWithAnyNeed / totalUsers) * 100).toFixed(1)}%)`);
  console.log(`  → empty array (skipped):     ${usersWithEmpty} (${((usersWithEmpty / totalUsers) * 100).toFixed(1)}%)`);
  console.log(`\nOf users who selected ≥1:`);
  console.log(`  Paid:   ${paidWithNeeds} (${((paidWithNeeds / usersWithAnyNeed) * 100).toFixed(1)}%)`);
  console.log(`  Unpaid: ${unpaidWithNeeds} (${((unpaidWithNeeds / usersWithAnyNeed) * 100).toFixed(1)}%)`);

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  console.log("\n=== ALL USERS (paid + unpaid) ===");
  console.log("Rank  Need                            Count    % of selectors");
  console.log("─".repeat(70));
  sorted.forEach(([k, v], i) => {
    const label = LABELS[k] || k;
    const pct = ((v / usersWithAnyNeed) * 100).toFixed(1);
    console.log(`${String(i + 1).padEnd(5)} ${label.padEnd(32)} ${String(v).padEnd(7)}  ${pct}%`);
  });

  console.log("\n=== PAID USERS ONLY ===");
  console.log("Rank  Need                            Count    % of paid selectors");
  console.log("─".repeat(70));
  const sortedPaid = Object.entries(countsPaid).sort((a, b) => b[1] - a[1]);
  sortedPaid.forEach(([k, v], i) => {
    const label = LABELS[k] || k;
    const pct = paidWithNeeds > 0 ? ((v / paidWithNeeds) * 100).toFixed(1) : "0";
    console.log(`${String(i + 1).padEnd(5)} ${label.padEnd(32)} ${String(v).padEnd(7)}  ${pct}%`);
  });

  console.log("\n=== UNPAID USERS ONLY ===");
  console.log("Rank  Need                            Count    % of unpaid selectors");
  console.log("─".repeat(70));
  const sortedUnpaid = Object.entries(countsUnpaid).sort((a, b) => b[1] - a[1]);
  sortedUnpaid.forEach(([k, v], i) => {
    const label = LABELS[k] || k;
    const pct = unpaidWithNeeds > 0 ? ((v / unpaidWithNeeds) * 100).toFixed(1) : "0";
    console.log(`${String(i + 1).padEnd(5)} ${label.padEnd(32)} ${String(v).padEnd(7)}  ${pct}%`);
  });

  console.log("\n=== TOP CO-OCCURRENCES ===");
  console.log("(Of users who picked X, what % also picked Y)\n");
  for (const [a, _v] of sorted) {
    const others = Object.entries(coOccurrence[a] || {}).sort((p, q) => q[1] - p[1]).slice(0, 3);
    if (others.length === 0) continue;
    const aLabel = LABELS[a] || a;
    const aTotal = counts[a];
    console.log(`${aLabel} (${aTotal}):`);
    for (const [b, n] of others) {
      const bLabel = LABELS[b] || b;
      const pct = ((n / aTotal) * 100).toFixed(0);
      console.log(`  → also picked ${bLabel}: ${n} (${pct}%)`);
    }
  }

  console.log("\n=== SELECTION COUNT DISTRIBUTION ===");
  // How many needs do users typically select?
  const sizes: Record<number, number> = {};
  for (const doc of snap.docs) {
    const needs = doc.data().support_needs as string[] | undefined;
    if (!Array.isArray(needs) || needs.length === 0) continue;
    sizes[needs.length] = (sizes[needs.length] || 0) + 1;
  }
  Object.entries(sizes).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([k, v]) => {
    const pct = ((v / usersWithAnyNeed) * 100).toFixed(1);
    console.log(`  ${k} selection${k === "1" ? " " : "s"}:  ${String(v).padEnd(5)} (${pct}%)`);
  });

  process.exit(0);
})().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
