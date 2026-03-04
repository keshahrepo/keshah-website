import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export async function POST() {
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
