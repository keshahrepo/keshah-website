import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";
import { CONTRACT_TEMPLATES } from "@/lib/contracts";
import { generateToken } from "@/lib/password";
import { FieldValue } from "firebase-admin/firestore";

async function getAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getPayloadFromToken(token);
}

// GET — list contracts (admin sees all, manager sees theirs)
export async function GET(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { db } = getFirebaseAdmin();
  let query = db.collection("Contracts").orderBy("created_at", "desc");

  if (payload.role === "manager" && payload.userId) {
    query = query.where("sent_by", "==", payload.userId);
  } else if (payload.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const snap = await query.get();
  const contracts = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    created_at: doc.data().created_at?.toDate?.()?.toISOString() || null,
    signed_at: doc.data().signed_at?.toDate?.()?.toISOString() || null,
  }));

  return NextResponse.json(contracts);
}

// POST — send a contract (creates a signing link)
export async function POST(req: NextRequest) {
  const payload = await getAuth(req);
  if (!payload || (payload.role !== "admin" && payload.role !== "manager")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { template_id, recipient_name, recipient_email, pay_tier, pipeline_id } = await req.json();

  if (!template_id || !recipient_name || !recipient_email) {
    return NextResponse.json({ error: "template_id, recipient_name, and recipient_email are required" }, { status: 400 });
  }

  const template = CONTRACT_TEMPLATES.find((t) => t.id === template_id);
  if (!template) {
    return NextResponse.json({ error: "Invalid template" }, { status: 400 });
  }

  // Fill in placeholders
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  let filledContent = template.content
    .replace(/\{\{date\}\}/g, today)
    .replace(/\{\{signer_name\}\}/g, recipient_name);

  if (pay_tier) {
    filledContent = filledContent.replace(/\{\{pay_tier\}\}/g, `$${pay_tier}`);
  }

  const signingToken = generateToken();

  const { db } = getFirebaseAdmin();
  const contractData = {
    template_id,
    template_title: template.title,
    contract_type: template.type,
    recipient_name,
    recipient_email: recipient_email.toLowerCase().trim(),
    content: filledContent,
    signing_token: signingToken,
    status: "sent", // sent | signed
    sent_by: payload.userId || "admin",
    sent_by_name: payload.name || "Admin",
    pipeline_id: pipeline_id || null,
    pay_tier: pay_tier || null,
    signed_name: null,
    signed_at: null,
    signed_ip: null,
    created_at: FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("Contracts").add(contractData);

  return NextResponse.json({
    id: ref.id,
    signing_url: `/sign/${signingToken}`,
    ...contractData,
  });
}
