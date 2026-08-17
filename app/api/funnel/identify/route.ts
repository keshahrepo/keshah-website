// Create (or find) a Firebase Auth user and write their quiz answers to
// Firestore. Called from PlanModal before initiating the RC purchase so that
// the Firebase UID can be used as the RC App User ID — one identity from
// web checkout through mobile app sign-in.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface IdentifyPayload {
  email: string;
  quizAnswers: {
    gender?: string;
    hairLossLocation?: string;
    treatmentsTried?: string[];
    hairGoal?: string;
    commitmentAnswer?: string;
    supportNeeds?: string[];
  };
}

export async function POST(req: Request) {
  const { db, auth } = getFirebaseAdmin();

  let payload: IdentifyPayload;
  try {
    payload = (await req.json()) as IdentifyPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = payload.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });
  }

  const qa = payload.quizAnswers ?? {};

  try {
    // Create Firebase Auth user — or retrieve existing one if the email is
    // already registered (e.g. user went through the funnel twice, or already
    // has a mobile app account with the same email).
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
    } catch {
      // User doesn't exist — create a new one (no password, they'll sign in
      // via custom token from the universal link).
      const newUser = await auth.createUser({ email });
      uid = newUser.uid;
    }

    // Build the Firestore user document with all the fields the Flutter app
    // expects. This lets the app skip PostAuthFlow2 entirely.
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
    const timeStr = today.toTimeString().split(" ")[0]; // HH:MM:SS

    // Read existing doc — first-time-only fields (created_at, start_date)
    // must NOT be overwritten on subsequent identify calls.
    const docRef = db.collection("Users").doc(uid);
    const existing = await docRef.get();
    const existingData = existing.exists ? existing.data() ?? {} : {};

    const userDoc: Record<string, unknown> = {
      email,
      user_type: "freev2",
      selected_gender: qa.gender ?? null,
      hair_loss_location: qa.hairLossLocation ?? null,
      treatments_tried: qa.treatmentsTried ?? [],
      hair_goal: qa.hairGoal ?? null,
      commitment_answer: qa.commitmentAnswer ?? null,
      support_needs: qa.supportNeeds ?? [],
      quiz_answers: qa,

      // Treatment stage — start the 60-day stoppage clock
      treatment_stage: "FREE_STOPPAGE",

      // Flags that tell the Flutter app to skip PostAuthFlow2
      starter_photos_submit_submitted_once: true,

      // Analytics
      onboarded_via_web: true,
      modified_at: FieldValue.serverTimestamp(),
    };

    // Immutable first-time fields — set only on first creation.
    if (!existingData.created_at) userDoc.created_at = FieldValue.serverTimestamp();
    if (!existingData.start_date) userDoc.start_date = { date: dateStr, time: timeStr };
    if (!existingData.free_stoppage_switched_at_date) {
      userDoc.free_stoppage_switched_at_date = dateStr;
    }

    // Use set with merge so we don't blow away any fields that might
    // already exist if the user has an existing mobile account.
    await docRef.set(userDoc, { merge: true });

    return NextResponse.json({ ok: true, firebaseUid: uid });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[funnel/identify] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown_error" },
      { status: 500 }
    );
  }
}
