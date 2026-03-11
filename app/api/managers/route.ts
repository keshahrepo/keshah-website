import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { FieldValue } from "firebase-admin/firestore";

function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return token;
}

// GET — list all managers
export async function GET(req: NextRequest) {
  const token = requireAdmin(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await getPayloadFromToken(token);
  if (payload?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { db } = getFirebaseAdmin();
  const snap = await db.collection("Managers").get();

  const managers = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      email: data.email,
      is_active: data.is_active,
      created_at: data.created_at?.toDate?.()?.toISOString() || null,
    };
  });

  // Sort by created_at desc in-memory
  managers.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  return NextResponse.json(managers);
}

// POST — create a manager
export async function POST(req: NextRequest) {
  const token = requireAdmin(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await getPayloadFromToken(token);
  if (payload?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { name, email, password } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
  }

  const { db } = getFirebaseAdmin();

  // Check if email already exists
  const existing = await db.collection("Managers")
    .where("email", "==", email.toLowerCase().trim())
    .limit(1)
    .get();

  if (!existing.empty) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const { hash, salt } = hashPassword(password);

  const managerData = {
    name,
    email: email.toLowerCase().trim(),
    password_hash: hash,
    password_salt: salt,
    is_active: true,
    created_at: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("Managers").add(managerData);

  return NextResponse.json({ id: ref.id, name, email: managerData.email });
}

// DELETE — deactivate a manager
export async function DELETE(req: NextRequest) {
  const token = requireAdmin(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await getPayloadFromToken(token);
  if (payload?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Manager ID required" }, { status: 400 });

  const { db } = getFirebaseAdmin();
  await db.collection("Managers").doc(id).update({ is_active: false });

  return NextResponse.json({ ok: true });
}
