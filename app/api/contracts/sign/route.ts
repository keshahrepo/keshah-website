import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// GET — fetch contract by signing token (public, no auth)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const { db } = getFirebaseAdmin();
  const snap = await db.collection("Contracts")
    .where("signing_token", "==", token)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const doc = snap.docs[0];
  const data = doc.data();

  return NextResponse.json({
    id: doc.id,
    template_title: data.template_title,
    recipient_name: data.recipient_name,
    content: data.content,
    status: data.status,
    signed_name: data.signed_name,
    signed_at: data.signed_at?.toDate?.()?.toISOString() || null,
  });
}

// POST — sign the contract (public, verified by token)
export async function POST(req: NextRequest) {
  const { token, signed_name } = await req.json();

  if (!token || !signed_name) {
    return NextResponse.json({ error: "Token and signed_name required" }, { status: 400 });
  }

  const { db } = getFirebaseAdmin();
  const snap = await db.collection("Contracts")
    .where("signing_token", "==", token)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const doc = snap.docs[0];
  const data = doc.data();

  if (data.status === "signed") {
    return NextResponse.json({ error: "Already signed" }, { status: 400 });
  }

  // Get IP from headers
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";

  // Sign the contract
  await db.collection("Contracts").doc(doc.id).update({
    status: "signed",
    signed_name: signed_name.trim(),
    signed_ip: ip,
    signed_at: FieldValue.serverTimestamp(),
  });

  // If linked to a pipeline prospect, advance to trial_started
  if (data.pipeline_id) {
    const pipelineDoc = await db.collection("Pipeline").doc(data.pipeline_id).get();
    if (pipelineDoc.exists && pipelineDoc.data()?.status === "contract_sent") {
      await db.collection("Pipeline").doc(data.pipeline_id).update({
        status: "trial_started",
        status_updated_at: FieldValue.serverTimestamp(),
      });
    }
  }

  return NextResponse.json({ ok: true, signed_at: new Date().toISOString() });
}
