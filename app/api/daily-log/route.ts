import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getPayloadFromToken(token);
}

// GET — fetch daily log for a manager (or all managers for admin)
export async function GET(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { db } = getFirebaseAdmin();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const managerId = searchParams.get("manager_id");

  // Admin fetching all manager logs (for the last N days)
  if (payload.role === "admin") {
    const days = parseInt(searchParams.get("days") || "14");
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toLocaleDateString("en-CA"));
    }

    let query = db.collection("DailyLogs")
      .where("date", "in", dates.slice(0, 10)); // Firestore "in" supports max 10

    if (managerId) {
      query = query.where("manager_id", "==", managerId);
    }

    const snap = await query.get();

    // If more than 10 days, do a second query
    let allDocs = snap.docs;
    if (dates.length > 10) {
      const snap2 = await db.collection("DailyLogs")
        .where("date", "in", dates.slice(10))
        .get();
      allDocs = [...allDocs, ...snap2.docs];
    }

    const logs = allDocs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(logs);
  }

  // Manager fetching their own log for a specific date
  if (payload.role === "manager" && payload.userId) {
    const targetDate = date || new Date().toLocaleDateString("en-CA");
    const snap = await db.collection("DailyLogs")
      .where("manager_id", "==", payload.userId)
      .where("date", "==", targetDate)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ completed_tasks: [] });
    }

    return NextResponse.json({
      id: snap.docs[0].id,
      ...snap.docs[0].data(),
    });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

// PUT — update daily task completion
export async function PUT(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "manager" && payload.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { date, completed_tasks, total_required } = await req.json();
  if (!date || !Array.isArray(completed_tasks)) {
    return NextResponse.json({ error: "date and completed_tasks required" }, { status: 400 });
  }

  const managerId = payload.userId;
  if (!managerId) return NextResponse.json({ error: "No user ID" }, { status: 400 });

  const { db } = getFirebaseAdmin();

  // Upsert: find existing log or create new
  const existing = await db.collection("DailyLogs")
    .where("manager_id", "==", managerId)
    .where("date", "==", date)
    .limit(1)
    .get();

  const logData: Record<string, unknown> = {
    manager_id: managerId,
    date,
    completed_tasks,
    tasks_completed: completed_tasks.length,
    total_required: total_required || completed_tasks.length,
    updated_at: new Date().toISOString(),
  };

  if (existing.empty) {
    await db.collection("DailyLogs").add(logData);
  } else {
    await db.collection("DailyLogs").doc(existing.docs[0].id).update(logData);
  }

  return NextResponse.json({ ok: true });
}
