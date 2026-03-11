import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

function getDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function generateOnScreenText(hook: Record<string, unknown>): string {
  const title = (hook.title as string) || "";
  const coreMessage = (hook.core_message as string) || "";
  const talkingPoints = (hook.talking_points as string[]) || [];
  const source = coreMessage || title;
  const punch = (text: string) => { const s = text.split(/[.!?\n]/)[0].trim(); return s.length > 40 ? s.substring(0, 37) + "..." : s.toLowerCase(); };
  const topic = (t: string) => { const l = t.toLowerCase(); for (const tp of ["hair loss","hair growth","scalp","minoxidil","balding","thinning","regrowth","hairline","DHT","follicles"]) { if (l.includes(tp)) return tp; } return l.split(" ").slice(0,3).join(" "); };
  const cond = (t: string) => { const l = t.toLowerCase(); if (l.includes("hair loss")||l.includes("losing hair")) return "you're losing hair"; if (l.includes("scalp")) return "your scalp is tight"; if (l.includes("thin")) return "your hair is thinning"; return "you care about your hair"; };
  const emoji = (t: string) => { const l = t.toLowerCase(); if (l.includes("scalp")||l.includes("pinch")) return "🤏"; if (l.includes("drug")||l.includes("minoxidil")) return "💊"; if (l.includes("science")||l.includes("study")) return "🔬"; return "⚡"; };
  const short = (p: string) => p.length > 35 ? p.substring(0,32)+"..." : p.toLowerCase();
  const templates = [
    () => `${punch(source)} 👀`, () => `wait for it... ${punch(source)}`, () => `POV: ${punch(source)}`,
    () => `nobody talks about this ${emoji(title)}`, () => `${punch(source)} (watch till the end)`,
    () => `this changed everything ${emoji(title)}`, () => talkingPoints.length > 0 ? `${short(talkingPoints[0])} 🤯` : `${punch(source)} 💯`,
    () => `you NEED to know this ${emoji(title)}`, () => `the truth about ${topic(title)} ${emoji(title)}`,
    () => `stop scrolling if ${cond(title)}`, () => `${topic(title)}? watch this.`,
    () => `game changer for ${topic(title)} ${emoji(title)}`, () => `your dermatologist won't tell you this`,
  ];
  let text = templates[Math.floor(Math.random() * templates.length)]();
  if (text.length > 65) text = text.substring(0, 62) + "...";
  return text;
}

function daysBetween(dateStr1: string, dateStr2: string): number {
  return Math.floor((new Date(dateStr2).getTime() - new Date(dateStr1).getTime()) / 86400000);
}

// GET — get creator info + today's assignments by access token
// Auto-generates assignments, detects missed days, auto-escalates videos/day
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { db } = getFirebaseAdmin();

  // Find creator by access token
  const creatorSnap = await db.collection("ContentCreators")
    .where("access_token", "==", token)
    .where("is_active", "==", true)
    .limit(1)
    .get();

  if (creatorSnap.empty) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const creatorDoc = creatorSnap.docs[0];
  const creator = creatorDoc.data();
  const today = getDateStr(new Date());
  const trialStart = creator.trial_start_date || today;
  const trialDay = daysBetween(trialStart, today) + 1;

  // --- Auto-escalation: Week 2 (day 8+) = 2 videos/day ---
  const expectedVideosPerDay = trialDay >= 8 ? 2 : 1;
  if (creator.videos_per_day !== expectedVideosPerDay && creator.status === "trial") {
    await db.collection("ContentCreators").doc(creatorDoc.id).update({
      videos_per_day: expectedVideosPerDay,
    });
  }
  const videosPerDay = creator.status === "trial" ? expectedVideosPerDay : (creator.videos_per_day || 2);

  // --- Missed day detection: check yesterday ---
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getDateStr(yesterday);

  // Only check if trial has started (yesterday >= trial start)
  if (yesterdayStr >= trialStart) {
    const yesterdaySnap = await db.collection("Assignments")
      .where("creator_id", "==", creatorDoc.id)
      .where("date", "==", yesterdayStr)
      .get();

    const pendingYesterday = yesterdaySnap.docs.filter((d) => d.data().status === "pending");

    if (pendingYesterday.length > 0) {
      // Mark as missed
      for (const doc of pendingYesterday) {
        await db.collection("Assignments").doc(doc.id).update({ status: "missed" });
      }

      // Update creator miss counts
      const newConsecutive = (creator.consecutive_missed_days || 0) + 1;
      const newTotal = (creator.total_missed_days || 0) + 1;
      const shouldFlag = newConsecutive >= 2 || newTotal >= 3;

      await db.collection("ContentCreators").doc(creatorDoc.id).update({
        consecutive_missed_days: newConsecutive,
        total_missed_days: newTotal,
        auto_cut_flagged: shouldFlag,
        streak: 0, // reset streak on miss
      });
    } else if (yesterdaySnap.docs.length > 0) {
      // Yesterday had assignments and they were all completed — reset consecutive
      const allCompleted = yesterdaySnap.docs.every((d) => d.data().status === "completed");
      if (allCompleted && (creator.consecutive_missed_days || 0) > 0) {
        await db.collection("ContentCreators").doc(creatorDoc.id).update({
          consecutive_missed_days: 0,
        });
      }
    }
  }

  // --- Auto-generate today's assignments if none exist ---
  let assignmentsSnap = await db.collection("Assignments")
    .where("creator_id", "==", creatorDoc.id)
    .where("date", "==", today)
    .get();

  if (assignmentsSnap.empty) {
    const hooksSnap = await db.collection("Hooks").where("is_active", "==", true).get();

    if (!hooksSnap.empty) {
      const allHooks = hooksSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Get recent assignments to avoid repeats
      const recentSnap = await db.collection("Assignments")
        .where("creator_id", "==", creatorDoc.id)
        .get();

      const recentHookIds = new Set(recentSnap.docs.map((doc) => doc.data().hook_id));
      let available = allHooks.filter((h) => !recentHookIds.has(h.id));

      if (available.length < videosPerDay) {
        available = allHooks;
      }

      const shuffled = available.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, videosPerDay);

      for (const hook of selected) {
        const hookData = hook as Record<string, unknown>;
        await db.collection("Assignments").add({
          creator_id: creatorDoc.id,
          hook_id: hook.id,
          hook_title: hookData.title || "",
          hook_category: hookData.category || "",
          onscreen_text: generateOnScreenText(hookData),
          date: today,
          status: "pending",
          tiktok_link: "",
          manager_feedback: "",
          created_at: FieldValue.serverTimestamp(),
        });
      }

      assignmentsSnap = await db.collection("Assignments")
        .where("creator_id", "==", creatorDoc.id)
        .where("date", "==", today)
        .get();
    }
  }

  // --- Auto-transition: after day 14, mark as pending_review ---
  if (trialDay > 14 && creator.status === "trial") {
    await db.collection("ContentCreators").doc(creatorDoc.id).update({
      status: "pending_review",
      status_changed_at: FieldValue.serverTimestamp(),
    });
  }

  // For each assignment, get the full hook data
  const assignments = await Promise.all(
    assignmentsSnap.docs.map(async (doc) => {
      const data = doc.data();
      let hook = null;
      if (data.hook_id) {
        const hookDoc = await db.collection("Hooks").doc(data.hook_id).get();
        if (hookDoc.exists) {
          hook = { id: hookDoc.id, ...hookDoc.data() };
        }
      }
      return {
        id: doc.id,
        ...data,
        hook,
        created_at: data.created_at?.toDate?.()?.toISOString() || null,
        completed_at: data.completed_at?.toDate?.()?.toISOString() || null,
      };
    })
  );

  // Get recent history (last 7 days) — use "in" to avoid range + equality composite index
  const last7Days: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7Days.push(getDateStr(d));
  }

  const historySnap = await db.collection("Assignments")
    .where("creator_id", "==", creatorDoc.id)
    .where("date", "in", last7Days)
    .get();

  const history = historySnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      created_at: data.created_at?.toDate?.()?.toISOString() || null,
      completed_at: data.completed_at?.toDate?.()?.toISOString() || null,
    };
  }).sort((a, b) => ((b as Record<string, unknown>).date as string).localeCompare((a as Record<string, unknown>).date as string));

  // Refresh creator data after potential updates
  const updatedCreator = (await db.collection("ContentCreators").doc(creatorDoc.id).get()).data()!;

  return NextResponse.json({
    creator: {
      id: creatorDoc.id,
      name: updatedCreator.name,
      videos_per_day: videosPerDay,
      streak: updatedCreator.streak || 0,
      status: updatedCreator.status,
      trial_day: trialDay,
      total_missed_days: updatedCreator.total_missed_days || 0,
      auto_cut_flagged: updatedCreator.auto_cut_flagged || false,
    },
    assignments,
    history,
    today,
  });
}
