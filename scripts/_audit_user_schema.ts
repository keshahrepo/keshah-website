// Audits Firestore Users schema for retention analysis.
// Pulls a sample of paid users and dumps the full field structure
// + value types so we know what to query for behavior signals.

import { getFirebaseAdmin } from "@/lib/firebase-admin";

(async () => {
  const { db } = getFirebaseAdmin();

  // Sample paid users (those with paid_at set)
  const snap = await db
    .collection("Users")
    .where("paid_at", "!=", null)
    .limit(20)
    .get();

  console.log(`\n=== Sampled ${snap.docs.length} paid users ===\n`);

  // Build a frequency table of every field across the sample
  const fieldCounts: Record<string, number> = {};
  const fieldTypes: Record<string, Set<string>> = {};
  const fieldSampleValues: Record<string, unknown> = {};

  function describe(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return `array[${value.length}]`;
    if (value instanceof Date) return "date";
    if (typeof value === "object" && value !== null) {
      const v = value as { _seconds?: number; toDate?: () => Date };
      if (typeof v._seconds === "number") return "Timestamp";
      const keys = Object.keys(value as object);
      if (keys.length <= 5) return `object{${keys.join(",")}}`;
      return `object[${keys.length} keys]`;
    }
    return typeof value;
  }

  function walk(obj: Record<string, unknown>, prefix = "") {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      fieldCounts[path] = (fieldCounts[path] || 0) + 1;
      if (!fieldTypes[path]) fieldTypes[path] = new Set();
      fieldTypes[path].add(describe(v));
      if (fieldSampleValues[path] === undefined) {
        fieldSampleValues[path] = v;
      }
      // Recurse into nested objects (1 level deep) for fields like wp_user, progress
      if (
        typeof v === "object" &&
        v !== null &&
        !Array.isArray(v) &&
        !(v instanceof Date) &&
        !((v as { _seconds?: number })._seconds !== undefined)
      ) {
        const nested = v as Record<string, unknown>;
        if (Object.keys(nested).length > 0 && Object.keys(nested).length <= 30) {
          walk(nested, path);
        }
      }
    }
  }

  for (const doc of snap.docs) {
    walk(doc.data());
  }

  // Sort by frequency (descending) to highlight common fields
  const sorted = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);

  console.log("Field".padEnd(50), "Count".padEnd(8), "Types".padEnd(30), "Sample");
  console.log("─".repeat(140));
  for (const [field, count] of sorted) {
    const types = [...fieldTypes[field]].join("|");
    let sample = JSON.stringify(fieldSampleValues[field]);
    if (sample && sample.length > 50) sample = sample.slice(0, 50) + "…";
    console.log(field.padEnd(50), String(count).padEnd(8), types.padEnd(30), sample);
  }

  // Highlight retention-relevant fields
  console.log("\n=== Retention-relevant signals (top-level) ===");
  const interesting = [
    "paid_at", "created_at", "modified_at", "trial_status", "trial_started_at",
    "trial_ends_at", "razorpay_subscription_id", "razorpay_plan", "plan",
    "starter_photos_submit_submitted_once", "starter_photos_submit_showed_once",
    "treatment_stage", "free_stoppage_switched_at_date", "extra_user_tags",
    "is_deleted", "lead_status", "user_type", "selected_gender",
    "hair_loss_location", "support_needs", "referral_source",
    "phone_number", "country_dial_code",
  ];
  for (const field of interesting) {
    if (fieldCounts[field]) {
      const types = [...fieldTypes[field]].join("|");
      console.log(`  ✓ ${field.padEnd(45)} (${fieldCounts[field]}/${snap.docs.length}) ${types}`);
    } else {
      console.log(`  ✗ ${field}`);
    }
  }

  // Highlight any progress/behavior fields
  console.log("\n=== Progress / behavior fields ===");
  for (const [field, count] of sorted) {
    if (
      field.startsWith("progress") ||
      field.includes("daily_learning") ||
      field.includes("starter_photos") ||
      field.includes("checkin") ||
      field.includes("check_in") ||
      field.includes("session") ||
      field.includes("login") ||
      field.includes("last_active") ||
      field.includes("days_") ||
      field.includes("habit_") ||
      field.includes("technique") ||
      field.includes("exercise")
    ) {
      const types = [...fieldTypes[field]].join("|");
      let sample = JSON.stringify(fieldSampleValues[field]);
      if (sample && sample.length > 60) sample = sample.slice(0, 60) + "…";
      console.log(`  ${field.padEnd(50)} (${count}/${snap.docs.length}) ${types.padEnd(20)} ${sample}`);
    }
  }

  process.exit(0);
})().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
