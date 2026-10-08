import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export async function POST() {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { db } = getFirebaseAdmin();
    const today = new Date().toISOString().split("T")[0];
    await db.collection("DashboardMetrics").doc(`daily_${today}`).delete();
    return NextResponse.json({ ok: true, deleted: `daily_${today}` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
