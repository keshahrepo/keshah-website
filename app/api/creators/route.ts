import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// GET — list all creators
export async function GET() {
  try {
    const { db } = getFirebaseAdmin();
    const snap = await db.collection("Creators").orderBy("created_at", "desc").get();

    const creators = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(creators);
  } catch (error) {
    console.error("Creators GET error:", error);
    return NextResponse.json({ error: "Failed to fetch creators" }, { status: 500 });
  }
}

// POST — add a new creator
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, slug: customSlug, platforms, notes } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Use custom slug if provided, otherwise generate from name
    const slug = (customSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, "");

    const { db } = getFirebaseAdmin();

    // Check slug uniqueness
    const existing = await db.collection("Creators").where("slug", "==", slug).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: "A creator with this URL already exists" }, { status: 409 });
    }

    const creatorData = {
      name,
      slug,
      platforms: platforms || [],
      short_link: `https://keshah.com/${slug}`,
      total_clicks: 0,
      notes: notes || "",
      is_active: true,
      created_at: FieldValue.serverTimestamp(),
    };

    const ref = await db.collection("Creators").add(creatorData);

    return NextResponse.json({ id: ref.id, ...creatorData });
  } catch (error) {
    console.error("Creators POST error:", error);
    return NextResponse.json({ error: "Failed to create creator" }, { status: 500 });
  }
}

// PUT — update a creator
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Creator ID required" }, { status: 400 });
    }

    const { db } = getFirebaseAdmin();
    await db.collection("Creators").doc(id).update(updates);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Creators PUT error:", error);
    return NextResponse.json({ error: "Failed to update creator" }, { status: 500 });
  }
}

// DELETE — deactivate a creator
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Creator ID required" }, { status: 400 });
    }

    const { db } = getFirebaseAdmin();
    await db.collection("Creators").doc(id).update({ is_active: false });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Creators DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete creator" }, { status: 500 });
  }
}
