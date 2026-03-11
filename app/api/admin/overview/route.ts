import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getPayloadFromToken(token);
}

export async function GET(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || payload.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { db } = getFirebaseAdmin();

  // Build last 14 days date list
  const last14Days: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last14Days.push(d.toLocaleDateString("en-CA"));
  }

  // Fetch all data in parallel
  const [managersSnap, creatorsSnap, pipelineSnap, logsSnap1, logsSnap2] = await Promise.all([
    db.collection("Managers").where("is_active", "==", true).get(),
    db.collection("ContentCreators").where("is_active", "==", true).get(),
    db.collection("Pipeline").where("is_active", "==", true).get(),
    db.collection("DailyLogs").where("date", "in", last14Days.slice(0, 10)).get(),
    db.collection("DailyLogs").where("date", "in", last14Days.slice(10)).get(),
  ]);

  const managers = managersSnap.docs.map((d) => ({
    id: d.id,
    name: d.data().name,
    email: d.data().email,
    created_at: d.data().created_at?.toDate?.()?.toISOString() || null,
  }));

  const creators = creatorsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  const prospects = pipelineSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  // Build daily logs map: manager_id -> { date -> { tasks, total_required } }
  const allLogDocs = [...logsSnap1.docs, ...logsSnap2.docs];
  const dailyLogsByManager = new Map<string, Map<string, { tasks: string[]; total_required: number }>>();
  for (const doc of allLogDocs) {
    const data = doc.data();
    const mid = data.manager_id as string;
    if (!dailyLogsByManager.has(mid)) dailyLogsByManager.set(mid, new Map());
    dailyLogsByManager.get(mid)!.set(data.date, {
      tasks: data.completed_tasks || [],
      total_required: data.total_required || 0,
    });
  }

  // Build DM activity by manager by date (from pipeline dm_date)
  const dmsByManagerByDate = new Map<string, Map<string, number>>();
  for (const p of prospects) {
    const pd = p as Record<string, unknown>;
    const mid = pd.manager_id as string;
    const dmDate = pd.dm_date as string;
    if (!mid || !dmDate) continue;
    if (!dmsByManagerByDate.has(mid)) dmsByManagerByDate.set(mid, new Map());
    const dateMap = dmsByManagerByDate.get(mid)!;
    dateMap.set(dmDate, (dateMap.get(dmDate) || 0) + 1);
  }

  // 30-day target tracking per manager
  const now = new Date();

  // Build per-manager breakdown
  const managerBreakdowns = managers.map((m) => {
    const myCreators = creators.filter((c) => (c as Record<string, unknown>).manager_id === m.id);
    const myProspects = prospects.filter((p) => (p as Record<string, unknown>).manager_id === m.id);

    const inTrial = myCreators.filter((c) => (c as Record<string, unknown>).status === "trial");
    const active = myCreators.filter((c) => (c as Record<string, unknown>).status === "active");
    const pendingReview = myCreators.filter((c) => (c as Record<string, unknown>).status === "pending_review");
    const flagged = myCreators.filter((c) => (c as Record<string, unknown>).auto_cut_flagged === true);

    const trialsStarted = inTrial.length + active.length + pendingReview.length;

    // Days since manager was created
    const createdAt = m.created_at ? new Date(m.created_at) : now;
    const daysSinceStart = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, 30 - daysSinceStart);

    // Build last 14 days activity for this manager
    const managerLogs = dailyLogsByManager.get(m.id) || new Map();
    const managerDMs = dmsByManagerByDate.get(m.id) || new Map();
    const hasCreatorsNow = myCreators.length > 0;
    const defaultRequired = hasCreatorsNow ? 5 : 4;
    const daily_activity = last14Days.map((date) => {
      const log = managerLogs.get(date) || { tasks: [], total_required: 0 };
      const dms = managerDMs.get(date) || 0;
      return {
        date,
        tasks_completed: log.tasks.length,
        total_required: log.total_required || defaultRequired,
        completed_tasks: log.tasks,
        dms_sent: dms,
      };
    });

    return {
      id: m.id,
      name: m.name,
      email: m.email,
      days_active: daysSinceStart,
      target_30day: {
        trials_started: trialsStarted,
        target: 10,
        days_remaining: daysRemaining,
      },
      daily_activity,
      creators: {
        in_trial: inTrial.length,
        in_trial_names: inTrial.map((c) => (c as Record<string, unknown>).name),
        active_paid: active.length,
        active_paid_names: active.map((c) => (c as Record<string, unknown>).name),
        pending_review: pendingReview.length,
        pending_review_names: pendingReview.map((c) => (c as Record<string, unknown>).name),
        flagged: flagged.length,
        flagged_names: flagged.map((c) => (c as Record<string, unknown>).name),
        total: myCreators.length,
      },
      pipeline: {
        total_prospects: myProspects.length,
        dm_sent: myProspects.filter((p) => (p as Record<string, unknown>).status === "dm_sent").length,
        replied: myProspects.filter((p) => (p as Record<string, unknown>).status === "replied").length,
        video_app_sent: myProspects.filter((p) => (p as Record<string, unknown>).status === "video_app_sent").length,
        video_received: myProspects.filter((p) => (p as Record<string, unknown>).status === "video_received").length,
        contract_sent: myProspects.filter((p) => (p as Record<string, unknown>).status === "contract_sent").length,
        trial_started: trialsStarted,
      },
    };
  });

  // Totals
  const totalInTrial = creators.filter((c) => (c as Record<string, unknown>).status === "trial").length;
  const totalActive = creators.filter((c) => (c as Record<string, unknown>).status === "active").length;
  const totalPendingReview = creators.filter((c) => (c as Record<string, unknown>).status === "pending_review").length;
  const totalFlagged = creators.filter((c) => (c as Record<string, unknown>).auto_cut_flagged === true).length;

  return NextResponse.json({
    totals: {
      managers: managers.length,
      creators_in_trial: totalInTrial,
      creators_active_paid: totalActive,
      creators_pending_review: totalPendingReview,
      creators_flagged: totalFlagged,
      total_creators: creators.length,
      total_prospects: prospects.length,
    },
    managers: managerBreakdowns,
  });
}
