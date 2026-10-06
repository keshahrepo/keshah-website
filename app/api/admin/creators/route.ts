import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  CREATORS_COLLECTION,
  ESTIMATED_PLAN_PRICE_USD,
  ESTIMATED_PROCEEDS_PER_PURCHASE_USD,
  ESTIMATED_STORE_CUT,
  ROI_AMBER,
  ROI_GREEN,
  buildRow,
  db,
  isMonth,
  listCreators,
  requireAdmin,
  sanitizeProfile,
} from "@/lib/creators/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/creators?month=yyyy-mm — one row per creator.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const qMonth = req.nextUrl.searchParams.get("month");
  const month = isMonth(qMonth) ? qMonth : new Date().toISOString().slice(0, 7);
  const creators = await listCreators();
  const payCreators = creators.filter((c) => c.pay_ready || c.legal_name);
  const rows = await Promise.all(payCreators.map((c) => buildRow(c, month)));
  return NextResponse.json({
    month,
    rows,
    legacyCount: creators.length - payCreators.length,
    estimate: {
      plan_price_usd: ESTIMATED_PLAN_PRICE_USD,
      store_cut: ESTIMATED_STORE_CUT,
      proceeds_per_purchase_usd: ESTIMATED_PROCEEDS_PER_PURCHASE_USD,
      green_at: ROI_GREEN,
      amber_at: ROI_AMBER,
    },
  });
}

// POST /api/admin/creators — add a creator (profile fields only; no login yet).
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = sanitizeProfile(body);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  const u = res.updates;
  if (!u.legal_name || !u.email || !u.timezone) {
    return NextResponse.json({ error: "Legal name, email and timezone are required" }, { status: 400 });
  }

  const col = db().collection(CREATORS_COLLECTION);
  const existing = await col.where("email", "==", u.email).limit(1).get();
  if (!existing.empty) return NextResponse.json({ error: "A creator with that email already exists" }, { status: 409 });

  const doc = {
    name: (u.name as string) || (u.legal_name as string),
    legal_name: u.legal_name,
    email: u.email,
    keshah_email: u.keshah_email ?? "",
    timezone: u.timezone,
    // Pay starts on the first posting day unless admin sets a date here.
    start_date: u.start_date ?? null,
    start_mode: "first_post",
    starting_completed_months: u.starting_completed_months ?? 0,
    campaign_tags: u.campaign_tags ?? [],
    tiktok_handle: u.tiktok_handle ?? "",
    instagram_handle: u.instagram_handle ?? "",
    creator_link_id: u.creator_link_id ?? null,
    tracking_url: u.tracking_url ?? "",
    status: (u.status as string) || "onboarding",
    contract: { status: "none" },
    w9_on_file: false,
    payout_method: "amex_ach",
    is_active: true,
    created_at: FieldValue.serverTimestamp(),
    status_changed_at: FieldValue.serverTimestamp(),
  };
  const ref = await col.add(doc);
  return NextResponse.json({ id: ref.id });
}
