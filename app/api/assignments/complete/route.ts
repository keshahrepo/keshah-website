import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

// PUT — mark assignment complete (used by creator via token or auth)
// Body: { assignment_id, tiktok_link, access_token? }
export async function PUT(req: NextRequest) {
  const { assignment_id, tiktok_link, access_token } = await req.json();

  if (!assignment_id) {
    return NextResponse.json({ error: "assignment_id required" }, { status: 400 });
  }

  const { db } = getFirebaseAdmin();

  // Verify the assignment belongs to this creator
  const assignmentDoc = await db.collection("Assignments").doc(assignment_id).get();
  if (!assignmentDoc.exists) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const assignment = assignmentDoc.data()!;
  const creatorDoc = await db.collection("ContentCreators").doc(assignment.creator_id).get();

  // Auth check: either via JWT cookie (creator role) or via access_token
  let authorized = false;
  const jwtToken = req.cookies.get(COOKIE_NAME)?.value;
  if (jwtToken) {
    const payload = await getPayloadFromToken(jwtToken);
    if (payload?.role === "creator" && payload.userId === assignment.creator_id) {
      authorized = true;
    }
  }
  if (!authorized && access_token) {
    if (creatorDoc.exists && creatorDoc.data()?.access_token === access_token) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await db.collection("Assignments").doc(assignment_id).update({
    status: "completed",
    tiktok_link: tiktok_link || "",
    completed_at: FieldValue.serverTimestamp(),
  });

  // Update creator streak
  const creator = creatorDoc.data()!;
  const today = new Date().toISOString().split("T")[0];

  // Check if all today's assignments are now complete
  const todayAssignments = await db.collection("Assignments")
    .where("creator_id", "==", assignment.creator_id)
    .where("date", "==", today)
    .get();

  const allComplete = todayAssignments.docs.every((d) => {
    const data = d.data();
    return data.status === "completed" || d.id === assignment_id;
  });

  if (allComplete) {
    await db.collection("ContentCreators").doc(assignment.creator_id).update({
      streak: (creator.streak || 0) + 1,
      last_completed_date: today,
    });
  }

  return NextResponse.json({ ok: true });
}
