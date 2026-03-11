import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getPayloadFromToken(token);
}

const STAGES = ["dm_sent", "replied", "video_app_sent", "video_received", "accepted", "rejected", "contract_sent", "trial_started"];

// GET — list pipeline prospects (manager sees theirs, admin sees all)
export async function GET(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { db } = getFirebaseAdmin();
  let query = db.collection("Pipeline").where("is_active", "==", true);

  if (payload.role === "manager" && payload.userId) {
    query = query.where("manager_id", "==", payload.userId);
  } else if (payload.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const snap = await query.get();

  const prospects = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    created_at: doc.data().created_at?.toDate?.()?.toISOString() || null,
    status_updated_at: doc.data().status_updated_at?.toDate?.()?.toISOString() || null,
  }));

  // For contract_sent prospects missing contract_url, look up from Contracts collection
  const needsContractUrl = prospects.filter(
    (p) => (p as Record<string, unknown>).status === "contract_sent" && !(p as Record<string, unknown>).contract_url
  );
  if (needsContractUrl.length > 0) {
    const contractSnap = await db.collection("Contracts").where("status", "==", "sent").get();
    const contractsByPipelineId = new Map<string, string>();
    contractSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.pipeline_id && data.signing_token) {
        contractsByPipelineId.set(data.pipeline_id, `/sign/${data.signing_token}`);
      }
    });
    for (const p of needsContractUrl) {
      const signingPath = contractsByPipelineId.get(p.id);
      if (signingPath) {
        (p as Record<string, unknown>).contract_url = signingPath;
      }
    }
  }

  // Sort by created_at desc (in-memory to avoid composite index requirement)
  prospects.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  return NextResponse.json(prospects);
}

// POST — add a prospect to pipeline
export async function POST(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "manager" && payload.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { name, handle, platform, notes, outreach_type, client_date } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const managerId = payload.role === "admin" ? (payload.userId || null) : payload.userId;

  const { db } = getFirebaseAdmin();
  const prospectData = {
    name,
    handle: handle || "",
    platform: platform || "tiktok",
    status: "dm_sent",
    notes: notes || "",
    manager_id: managerId,
    outreach_type: outreach_type === "warm" ? "warm" : "cold",
    dm_date: client_date || new Date().toISOString().split("T")[0],
    is_active: true,
    created_at: FieldValue.serverTimestamp(),
    status_updated_at: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("Pipeline").add(prospectData);

  return NextResponse.json({ id: ref.id, ...prospectData });
}

// PUT — update prospect (advance stage, edit notes)
export async function PUT(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "manager" && payload.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id, status, notes, contract_url } = await req.json();
  if (!id) return NextResponse.json({ error: "Prospect ID required" }, { status: 400 });

  const { db } = getFirebaseAdmin();

  if (payload.role === "manager") {
    const doc = await db.collection("Pipeline").doc(id).get();
    if (!doc.exists || doc.data()?.manager_id !== payload.userId) {
      return NextResponse.json({ error: "Not your prospect" }, { status: 403 });
    }
  }

  const updates: Record<string, unknown> = {};
  if (status && STAGES.includes(status)) {
    updates.status = status;
    updates.status_updated_at = FieldValue.serverTimestamp();
  }
  if (notes !== undefined) updates.notes = notes;
  if (contract_url) updates.contract_url = contract_url;

  await db.collection("Pipeline").doc(id).update(updates);

  return NextResponse.json({ ok: true });
}

// DELETE — remove prospect from pipeline
export async function DELETE(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "manager" && payload.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Prospect ID required" }, { status: 400 });

  const { db } = getFirebaseAdmin();

  if (payload.role === "manager") {
    const doc = await db.collection("Pipeline").doc(id).get();
    if (!doc.exists || doc.data()?.manager_id !== payload.userId) {
      return NextResponse.json({ error: "Not your prospect" }, { status: 403 });
    }
  }

  await db.collection("Pipeline").doc(id).update({ is_active: false });

  return NextResponse.json({ ok: true });
}
