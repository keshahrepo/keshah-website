import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getPayloadFromToken(token);
}

function getWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
    monday,
    sunday,
  };
}

// GET — generate weekly report for the current manager (or all for admin)
export async function GET(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { db } = getFirebaseAdmin();
  const { start, end, monday } = getWeekBounds();

  const managerId = payload.userId;

  // Pipeline stats this week
  let pipelineQuery = db.collection("Pipeline").where("is_active", "==", true);
  if (payload.role === "manager" && managerId) {
    pipelineQuery = pipelineQuery.where("manager_id", "==", managerId);
  }
  const pipelineSnap = await pipelineQuery.get();

  const pipeline = pipelineSnap.docs.map((d) => d.data());
  const dmsThisWeek = pipeline.filter((p) => p.dm_date >= start && p.dm_date <= end).length;
  const replied = pipeline.filter((p) => p.status !== "dm_sent").length;
  const videoAppsSent = pipeline.filter((p) =>
    ["video_app_sent", "video_received", "contract_sent", "trial_started"].includes(p.status)
  ).length;
  const videoReceived = pipeline.filter((p) =>
    ["video_received", "contract_sent", "trial_started"].includes(p.status)
  ).length;
  const contractsSent = pipeline.filter((p) =>
    ["contract_sent", "trial_started"].includes(p.status)
  ).length;
  const trialsStarted = pipeline.filter((p) => p.status === "trial_started").length;

  // Creator stats
  let creatorsQuery = db.collection("ContentCreators").where("is_active", "==", true);
  if (payload.role === "manager" && managerId) {
    creatorsQuery = creatorsQuery.where("manager_id", "==", managerId);
  }
  const creatorsSnap = await creatorsQuery.get();

  const creators = creatorsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const inTrial = creators.filter((c) => (c as Record<string, unknown>).status === "trial");
  const pendingReview = creators.filter((c) => (c as Record<string, unknown>).status === "pending_review");
  const active = creators.filter((c) => (c as Record<string, unknown>).status === "active");
  const cutThisWeek = creatorsSnap.docs.filter((d) => {
    const data = d.data();
    if (data.status !== "cut") return false;
    const changedAt = data.status_changed_at?.toDate?.();
    return changedAt && changedAt >= monday;
  });

  // Assignments this week
  const assignmentsSnap = await db.collection("Assignments")
    .where("date", ">=", start)
    .where("date", "<=", end)
    .get();

  let weekAssignments = assignmentsSnap.docs.map((d) => d.data());

  // Filter by manager's creators if manager role
  if (payload.role === "manager" && managerId) {
    const creatorIds = new Set(creators.map((c) => c.id));
    weekAssignments = weekAssignments.filter((a) => creatorIds.has(a.creator_id as string));
  }

  const totalAssignments = weekAssignments.length;
  const completedAssignments = weekAssignments.filter((a) => a.status === "completed").length;
  const missedAssignments = weekAssignments.filter((a) => a.status === "missed").length;

  // Check for existing report with blockers
  const reportSnap = await db.collection("WeeklyReports")
    .where("week_start", "==", start)
    .where("manager_id", "==", managerId || "admin")
    .limit(1)
    .get();

  const existingBlockers = reportSnap.empty ? "" : reportSnap.docs[0].data().blockers || "";

  return NextResponse.json({
    week_start: start,
    week_end: end,
    pipeline: {
      dms_sent: dmsThisWeek,
      total_prospects: pipeline.length,
      replied,
      video_apps_sent: videoAppsSent,
      video_received: videoReceived,
      contracts_sent: contractsSent,
      trials_started: trialsStarted,
    },
    creators: {
      in_trial: inTrial.length,
      in_trial_names: inTrial.map((c) => (c as Record<string, unknown>).name),
      pending_review: pendingReview.length,
      active_paid: active.length,
      cut_this_week: cutThisWeek.length,
    },
    assignments: {
      total: totalAssignments,
      completed: completedAssignments,
      missed: missedAssignments,
      completion_rate: totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0,
    },
    blockers: existingBlockers,
    report_id: reportSnap.empty ? null : reportSnap.docs[0].id,
  });
}

// POST — save weekly report (add blockers text)
export async function POST(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { blockers } = await req.json();
  const { start, end } = getWeekBounds();
  const managerId = payload.userId || "admin";

  const { db } = getFirebaseAdmin();

  // Upsert the report
  const existing = await db.collection("WeeklyReports")
    .where("week_start", "==", start)
    .where("manager_id", "==", managerId)
    .limit(1)
    .get();

  if (existing.empty) {
    await db.collection("WeeklyReports").add({
      manager_id: managerId,
      manager_name: payload.name || "Admin",
      week_start: start,
      week_end: end,
      blockers: blockers || "",
      submitted_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    });
  } else {
    await db.collection("WeeklyReports").doc(existing.docs[0].id).update({
      blockers: blockers || "",
      submitted_at: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({ ok: true });
}
