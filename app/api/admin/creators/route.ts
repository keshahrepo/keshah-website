import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  CREATORS_COLLECTION,
  FALLBACK_PROCEEDS_PER_PURCHASE_USD,
  ROI_AMBER,
  ROI_GREEN,
  buildRow,
  db,
  isMonth,
  listCreators,
  requireAdmin,
  sanitizeProfile,
  createCreatorRecord,
  CreatorExistsError,
  type NewCreatorFields,
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
      fallback_proceeds_per_purchase_usd: FALLBACK_PROCEEDS_PER_PURCHASE_USD,
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

  try {
    const id = await createCreatorRecord(u as unknown as NewCreatorFields);
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof CreatorExistsError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
