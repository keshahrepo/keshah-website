import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

// Generate catchy on-screen text for TikTok/Instagram videos
function generateOnScreenText(hook: Record<string, unknown>): string {
  const title = (hook.title as string) || "";
  const coreMessage = (hook.core_message as string) || "";
  const talkingPoints = (hook.talking_points as string[]) || [];
  const source = coreMessage || title;

  const templates = [
    () => `${extractPunch(source)} 👀`,
    () => `wait for it... ${extractPunch(source)}`,
    () => `POV: ${extractPunch(source)}`,
    () => `nobody talks about this ${extractEmoji(title)}`,
    () => `${extractPunch(source)} (watch till the end)`,
    () => `this changed everything ${extractEmoji(title)}`,
    () => talkingPoints.length > 0 ? `${shortenPoint(talkingPoints[0])} 🤯` : `${extractPunch(source)} 💯`,
    () => `you NEED to know this ${extractEmoji(title)}`,
    () => `the truth about ${extractTopic(title)} ${extractEmoji(title)}`,
    () => `${extractPunch(source)} — hear me out`,
    () => `stop scrolling if ${extractCondition(title)}`,
    () => `I wish I knew this sooner ${extractEmoji(title)}`,
    () => `${extractTopic(title)}? watch this.`,
    () => `game changer for ${extractTopic(title)} ${extractEmoji(title)}`,
    () => `your dermatologist won't tell you this`,
  ];

  const template = templates[Math.floor(Math.random() * templates.length)];
  let text = template();
  if (text.length > 65) text = text.substring(0, 62) + "...";
  return text;
}

function extractPunch(text: string): string {
  const short = text.split(/[.!?\n]/)[0].trim();
  if (short.length > 40) return short.substring(0, 37) + "...";
  return short.toLowerCase();
}

function extractTopic(title: string): string {
  const lower = title.toLowerCase();
  for (const topic of ["hair loss", "hair growth", "scalp", "minoxidil", "balding", "thinning", "regrowth", "hairline", "DHT", "follicles"]) {
    if (lower.includes(topic)) return topic;
  }
  return lower.split(" ").slice(0, 3).join(" ");
}

function extractCondition(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("hair loss") || lower.includes("losing hair")) return "you're losing hair";
  if (lower.includes("scalp")) return "your scalp is tight";
  if (lower.includes("thin")) return "your hair is thinning";
  if (lower.includes("bald")) return "you're worried about balding";
  return "you care about your hair";
}

function extractEmoji(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("scalp") || lower.includes("pinch")) return "🤏";
  if (lower.includes("drug") || lower.includes("minoxidil") || lower.includes("pill")) return "💊";
  if (lower.includes("science") || lower.includes("study") || lower.includes("research")) return "🔬";
  if (lower.includes("story") || lower.includes("personal")) return "💬";
  if (lower.includes("draw") || lower.includes("visual")) return "✏️";
  return "⚡";
}

function shortenPoint(point: string): string {
  if (point.length > 35) return point.substring(0, 32) + "...";
  return point.toLowerCase();
}

// GET — get current creator's data + today's assignments (authenticated)
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await getPayloadFromToken(token);
    if (!payload || payload.role !== "creator" || !payload.userId) {
      return NextResponse.json({ error: "Creator access only" }, { status: 403 });
    }

    const { db } = getFirebaseAdmin();
    const creatorDoc = await db.collection("ContentCreators").doc(payload.userId).get();

    if (!creatorDoc.exists) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    const creatorData = creatorDoc.data()!;
    const today = new Date().toISOString().split("T")[0];

    // Calculate trial day
    const trialStart = creatorData.trial_start_date || today;
    const trialDay = Math.floor((Date.now() - new Date(trialStart).getTime()) / 86400000) + 1;

    // Fetch today's assignments
    let assignSnap = await db.collection("Assignments")
      .where("creator_id", "==", payload.userId)
      .where("date", "==", today)
      .get();

    // Auto-generate assignments if none exist for today
    if (assignSnap.empty) {
      const hooksSnap = await db.collection("Hooks").where("is_active", "==", true).get();

      if (!hooksSnap.empty) {
        const allHooks = hooksSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const videosPerDay = creatorData.videos_per_day || 1;

        // Get all past assignments to avoid repeats
        const recentSnap = await db.collection("Assignments")
          .where("creator_id", "==", payload.userId)
          .get();

        const recentHookIds = new Set(recentSnap.docs.map((d) => d.data().hook_id));
        let available = allHooks.filter((h) => !recentHookIds.has(h.id));
        if (available.length < videosPerDay) available = allHooks;

        const shuffled = available.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, videosPerDay);

        for (const hook of selected) {
          const hookData = hook as Record<string, unknown>;
          await db.collection("Assignments").add({
            creator_id: payload.userId,
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

        // Re-fetch after generating
        assignSnap = await db.collection("Assignments")
          .where("creator_id", "==", payload.userId)
          .where("date", "==", today)
          .get();
      }
    }

    const assignments = [];
    for (const doc of assignSnap.docs) {
      const a = doc.data();
      let hook = null;
      if (a.hook_id) {
        const hookDoc = await db.collection("Hooks").doc(a.hook_id).get();
        if (hookDoc.exists) hook = { id: hookDoc.id, ...hookDoc.data() };
      }
      assignments.push({
        id: doc.id,
        ...a,
        hook,
      });
    }

    // Fetch recent history — use "in" query with last 7 day strings to avoid range + equality composite index
    const last7Days: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split("T")[0]);
    }

    const historySnap = await db.collection("Assignments")
      .where("creator_id", "==", payload.userId)
      .where("date", "in", last7Days)
      .get();

    const history = historySnap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .sort((a, b) => ((b as Record<string, unknown>).date as string).localeCompare((a as Record<string, unknown>).date as string));

    return NextResponse.json({
      creator: {
        id: payload.userId,
        name: creatorData.name,
        email: creatorData.email,
        videos_per_day: creatorData.videos_per_day,
        streak: creatorData.streak || 0,
        status: creatorData.status,
        trial_day: trialDay,
      },
      assignments,
      history,
      today,
    });
  } catch (err) {
    console.error("Creator /me error:", err);
    return NextResponse.json({ error: "Internal error", details: String(err) }, { status: 500 });
  }
}
