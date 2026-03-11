import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// Generate catchy on-screen text for TikTok/Instagram videos based on hook data
function generateOnScreenText(hook: Record<string, unknown>): string {
  const title = (hook.title as string) || "";
  const coreMessage = (hook.core_message as string) || "";
  const talkingPoints = (hook.talking_points as string[]) || [];

  // Extract a short, punchy phrase from the hook
  const source = coreMessage || title;

  // Templates for on-screen text - short, hooky, attention-grabbing
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

  // Pick a random template
  const template = templates[Math.floor(Math.random() * templates.length)];
  let text = template();

  // Ensure max ~60 chars for readability on screen
  if (text.length > 65) {
    text = text.substring(0, 62) + "...";
  }

  return text;
}

function extractPunch(text: string): string {
  // Get first sentence or clause, keep it short
  const short = text.split(/[.!?\n]/)[0].trim();
  if (short.length > 40) return short.substring(0, 37) + "...";
  return short.toLowerCase();
}

function extractTopic(title: string): string {
  // Extract the main topic from title
  const lower = title.toLowerCase();
  const topics = ["hair loss", "hair growth", "scalp", "minoxidil", "balding", "thinning", "regrowth", "hairline", "DHT", "follicles"];
  for (const topic of topics) {
    if (lower.includes(topic)) return topic;
  }
  // Fallback: first few words
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

async function getAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getPayloadFromToken(token);
}

// GET — get assignments for a creator on a date
// Query params: creator_id (required), date (optional, defaults to today)
export async function GET(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const creatorId = searchParams.get("creator_id");
  const date = searchParams.get("date") || todayStr();

  if (!creatorId) {
    return NextResponse.json({ error: "creator_id is required" }, { status: 400 });
  }

  const { db } = getFirebaseAdmin();

  // Verify access
  if (payload.role === "manager") {
    const creator = await db.collection("ContentCreators").doc(creatorId).get();
    if (!creator.exists || creator.data()?.manager_id !== payload.userId) {
      return NextResponse.json({ error: "Not your creator" }, { status: 403 });
    }
  }

  const snap = await db.collection("Assignments")
    .where("creator_id", "==", creatorId)
    .where("date", "==", date)
    .get();

  const assignments = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    created_at: doc.data().created_at?.toDate?.()?.toISOString() || null,
    completed_at: doc.data().completed_at?.toDate?.()?.toISOString() || null,
  }));

  return NextResponse.json(assignments);
}

// POST — generate today's assignments for a creator
// Body: { creator_id }
export async function POST(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "manager" && payload.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { creator_id } = await req.json();
  if (!creator_id) return NextResponse.json({ error: "creator_id required" }, { status: 400 });

  const { db } = getFirebaseAdmin();
  const date = todayStr();

  // Check if assignments already exist for today
  const existing = await db.collection("Assignments")
    .where("creator_id", "==", creator_id)
    .where("date", "==", date)
    .limit(1)
    .get();

  if (!existing.empty) {
    return NextResponse.json({ error: "Assignments already generated for today" }, { status: 409 });
  }

  // Get creator info
  const creatorDoc = await db.collection("ContentCreators").doc(creator_id).get();
  if (!creatorDoc.exists) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }
  const creator = creatorDoc.data()!;

  // Verify manager owns this creator
  if (payload.role === "manager" && creator.manager_id !== payload.userId) {
    return NextResponse.json({ error: "Not your creator" }, { status: 403 });
  }

  const videosPerDay = creator.videos_per_day || 1;

  // Get all active hooks
  const hooksSnap = await db.collection("Hooks").where("is_active", "==", true).get();
  if (hooksSnap.empty) {
    return NextResponse.json({ error: "No hooks in database" }, { status: 400 });
  }

  const allHooks = hooksSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  // Get recent assignments to avoid repeats
  const recentSnap = await db.collection("Assignments")
    .where("creator_id", "==", creator_id)
    .get();

  const recentHookIds = new Set(recentSnap.docs.map((doc) => doc.data().hook_id));

  // Filter out recently used hooks
  let available = allHooks.filter((h) => !recentHookIds.has(h.id));

  // If all hooks have been used, reset the pool
  if (available.length < videosPerDay) {
    available = allHooks;
  }

  // Randomly pick hooks
  const shuffled = available.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, videosPerDay);

  // Create assignments
  const assignments = [];
  for (const hook of selected) {
    const hookData = hook as Record<string, unknown>;
    const onscreenText = generateOnScreenText(hookData);
    const assignmentData = {
      creator_id,
      hook_id: hook.id,
      hook_title: hookData.title || "",
      hook_category: hookData.category || "",
      onscreen_text: onscreenText,
      date,
      status: "pending",
      tiktok_link: "",
      manager_feedback: "",
      created_at: FieldValue.serverTimestamp(),
    };
    const ref = await db.collection("Assignments").add(assignmentData);
    assignments.push({ id: ref.id, ...assignmentData });
  }

  return NextResponse.json(assignments);
}

// PUT — add manager feedback to an assignment
export async function PUT(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "manager" && payload.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id, manager_feedback } = await req.json();
  if (!id) return NextResponse.json({ error: "Assignment ID required" }, { status: 400 });

  const { db } = getFirebaseAdmin();
  await db.collection("Assignments").doc(id).update({ manager_feedback });

  return NextResponse.json({ ok: true });
}
