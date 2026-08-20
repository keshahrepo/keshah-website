// Read-only endpoint for a single day's scalp check-in yes/no/not_sure
// tally. Used by the Retention page for Day 13. Same math as the old
// /dashboard/scalp-check-ins server page — just per-day + JSON so a
// client component can consume it.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

const TEST_EMAIL_REGEX = /^test\d+@test\.com$/i;
const isTestEmail = (email: unknown): boolean =>
  typeof email === "string" && TEST_EMAIL_REGEX.test(email);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dayRaw = searchParams.get("day");
  const day = dayRaw ? parseInt(dayRaw, 10) : NaN;
  if (!Number.isFinite(day) || day < 1) {
    return NextResponse.json({ ok: false, error: "invalid_day" }, { status: 400 });
  }

  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("Users")
    .where("scalp_check_answers", "!=", null)
    .select("scalp_check_answers", "email")
    .get();

  let yes = 0, no = 0, not_sure = 0, total = 0;
  const key = String(day);
  for (const doc of snap.docs) {
    const data = doc.data();
    if (isTestEmail(data.email)) continue;
    const answers = data.scalp_check_answers as Record<string, string> | undefined;
    const raw = answers?.[key];
    if (raw === "yes") { yes++; total++; }
    else if (raw === "no") { no++; total++; }
    else if (raw === "not_sure") { not_sure++; total++; }
  }

  return NextResponse.json({ ok: true, day, yes, no, not_sure, total });
}
