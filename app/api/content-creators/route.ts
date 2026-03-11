import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { generateToken, hashPassword } from "@/lib/password";
import { FieldValue } from "firebase-admin/firestore";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getPayloadFromToken(token);
}

// GET — list content creators (manager sees theirs, admin sees all)
export async function GET(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { db } = getFirebaseAdmin();
  let query = db.collection("ContentCreators").where("is_active", "==", true);

  if (payload.role === "manager" && payload.userId) {
    query = query.where("manager_id", "==", payload.userId);
  } else if (payload.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const snap = await query.get();

  const today = new Date().toISOString().split("T")[0];

  const creators = snap.docs.map((doc) => {
    const data = doc.data();
    const trialStart = data.trial_start_date || today;
    const trialDay = Math.floor((Date.now() - new Date(trialStart).getTime()) / 86400000) + 1;

    return {
      id: doc.id,
      ...data,
      trial_day: trialDay,
      created_at: data.created_at?.toDate?.()?.toISOString() || null,
      status_changed_at: data.status_changed_at?.toDate?.()?.toISOString() || null,
    };
  });

  creators.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  return NextResponse.json(creators);
}

// POST — add a content creator
export async function POST(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "manager" && payload.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { name, email, password, manager_id } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
  }

  const { db } = getFirebaseAdmin();

  // Check if email already exists
  const existing = await db.collection("ContentCreators")
    .where("email", "==", email.toLowerCase().trim())
    .limit(1)
    .get();

  if (!existing.empty) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const assignedManagerId = payload.role === "admin" ? (manager_id || null) : payload.userId;
  const accessToken = generateToken();
  const today = new Date().toISOString().split("T")[0];
  const { hash, salt } = hashPassword(password);

  const creatorData = {
    name,
    email: email.toLowerCase().trim(),
    password_hash: hash,
    password_salt: salt,
    manager_id: assignedManagerId,
    access_token: accessToken,
    videos_per_day: 1, // starts at 1, auto-escalates to 2 in week 2
    status: "trial",
    trial_start_date: today,
    pay_tier: 0,
    streak: 0,
    total_missed_days: 0,
    consecutive_missed_days: 0,
    auto_cut_flagged: false,
    is_active: true,
    created_at: FieldValue.serverTimestamp(),
    status_changed_at: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("ContentCreators").add(creatorData);

  return NextResponse.json({
    id: ref.id,
    ...creatorData,
    access_link: `/c/${accessToken}`,
  });
}

// PUT — update a content creator
export async function PUT(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "manager" && payload.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "Creator ID required" }, { status: 400 });

  const { db } = getFirebaseAdmin();

  if (payload.role === "manager") {
    const doc = await db.collection("ContentCreators").doc(id).get();
    if (!doc.exists || doc.data()?.manager_id !== payload.userId) {
      return NextResponse.json({ error: "Not your creator" }, { status: 403 });
    }
  }

  const safeUpdates: Record<string, unknown> = {};
  if (updates.videos_per_day !== undefined) safeUpdates.videos_per_day = updates.videos_per_day;
  if (updates.status !== undefined) {
    safeUpdates.status = updates.status;
    safeUpdates.status_changed_at = FieldValue.serverTimestamp();
  }
  if (updates.name !== undefined) safeUpdates.name = updates.name;
  if (updates.email !== undefined) safeUpdates.email = updates.email.toLowerCase().trim();
  if (updates.pay_tier !== undefined) safeUpdates.pay_tier = updates.pay_tier;

  await db.collection("ContentCreators").doc(id).update(safeUpdates);

  return NextResponse.json({ ok: true });
}

// DELETE — deactivate a content creator
export async function DELETE(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "manager" && payload.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Creator ID required" }, { status: 400 });

  const { db } = getFirebaseAdmin();

  if (payload.role === "manager") {
    const doc = await db.collection("ContentCreators").doc(id).get();
    if (!doc.exists || doc.data()?.manager_id !== payload.userId) {
      return NextResponse.json({ error: "Not your creator" }, { status: 403 });
    }
  }

  await db.collection("ContentCreators").doc(id).update({
    is_active: false,
    status: "cut",
    status_changed_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
