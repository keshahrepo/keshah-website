import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";

// Daily cron: sync attribution attributes from Firestore Users → RevenueCat
// subscribers. Runs the same logic as scripts/_backfill_rc_attributes.ts but
// scoped to the last 2 days (and capped at 5,000 users per run) so each
// execution stays under the 300s Vercel maxDuration.
//
// Why this exists: until the mobile-app update with setAttributionAttributes
// is live on TestFlight + the App Store, new FreeV2 signups won't auto-tag
// themselves on RC. This cron closes that gap by re-pushing attribution
// from Firestore daily. After the app update ships, this becomes redundant
// but harmless (idempotent — RC merges by key).
//
// Schedule (vercel.json): every day at 04:00 UTC.
//
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}. Returns 401
// for any other caller.

export const maxDuration = 300;

const ATTRIBUTE_KEYS = [
  "referral_source",
  "selected_gender",
  "conversion_source",
  "first_name",
  "signup_timezone",
  "user_type",
  "treatment_stage",
] as const;

const RC_SECRET = process.env.RC_SECRET_KEY || "";

type Attr = { value: string };

function buildAttributes(d: Record<string, unknown>): Record<string, Attr> {
  const out: Record<string, Attr> = {};
  const tz = d.userLocalTimeZone as string | undefined;
  const firstName = (d.first_name as string | undefined) ?? (d.name as string | undefined);
  const pairs: [string, string | undefined][] = [
    ["referral_source", d.referral_source as string | undefined],
    ["selected_gender", d.selected_gender as string | undefined],
    ["conversion_source", d.conversion_source as string | undefined],
    ["first_name", firstName],
    ["signup_timezone", tz],
    ["user_type", d.user_type as string | undefined],
    ["treatment_stage", d.treatment_stage as string | undefined],
  ];
  for (const [k, v] of pairs) {
    if (!ATTRIBUTE_KEYS.includes(k as typeof ATTRIBUTE_KEYS[number])) continue;
    if (v && typeof v === "string" && v.length > 0) out[k] = { value: v };
  }
  return out;
}

async function pushToRc(userId: string, attrs: Record<string, Attr>): Promise<{ ok: boolean; status: number; body?: string }> {
  // Do NOT send X-Platform — that triggers RC's "secret keys can't be used
  // in your app" guard (code 7243). Server-side keys must omit it.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/attributes`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RC_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attributes: attrs }),
      });
      if (res.ok) return { ok: true, status: res.status };
      const body = await res.text().catch(() => "");
      if (res.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 + attempt * 500));
        continue;
      }
      return { ok: false, status: res.status, body };
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 250 + attempt * 250));
        continue;
      }
      return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: false, status: 0, body: "exhausted retries" };
}

export async function POST(req: Request) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!RC_SECRET) {
    return NextResponse.json({ error: "RC_SECRET_KEY not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(7, parseInt(url.searchParams.get("days") ?? "2", 10)));
  const concurrency = Math.min(8, Math.max(1, parseInt(url.searchParams.get("concurrency") ?? "6", 10)));
  const hardCap = 5000; // protects the 300s maxDuration on big runs

  const { db } = getFirebaseAdmin();
  const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);

  // user_type + created_at would need a composite index. Filter by created_at
  // only and check user_type in memory.
  const snap = await db.collection("Users").where("created_at", ">=", since).get();

  type Update = { userId: string; attrs: Record<string, Attr> };
  const updates: Update[] = [];
  const skipped = { deleted: 0, notFreeV2: 0, noAttrs: 0 };

  for (const doc of snap.docs) {
    if (updates.length >= hardCap) break;
    const d = doc.data();
    if (d.is_deleted) { skipped.deleted++; continue; }
    if (d.user_type !== "freev2") { skipped.notFreeV2++; continue; }
    const attrs = buildAttributes(d);
    if (Object.keys(attrs).length === 0) { skipped.noAttrs++; continue; }
    updates.push({ userId: doc.id, attrs });
  }

  let ok = 0, fail = 0;
  const failures: { userId: string; status: number; body?: string }[] = [];
  for (let i = 0; i < updates.length; i += concurrency) {
    const slice = updates.slice(i, i + concurrency);
    const results = await Promise.all(slice.map((u) => pushToRc(u.userId, u.attrs)));
    results.forEach((r, idx) => {
      if (r.ok) ok++;
      else {
        fail++;
        if (failures.length < 25) failures.push({ userId: slice[idx].userId, status: r.status, body: r.body?.slice(0, 200) });
      }
    });
  }

  return NextResponse.json({
    days,
    scanned: snap.size,
    eligible: updates.length,
    skipped,
    ok,
    fail,
    failures_sample: failures,
    capped_at_hard_limit: updates.length >= hardCap,
    finished_at: new Date().toISOString(),
  });
}
