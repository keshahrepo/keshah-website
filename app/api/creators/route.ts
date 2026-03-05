import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// GET — list all creators with weekly click counts
export async function GET() {
  try {
    const { db } = getFirebaseAdmin();
    const snap = await db.collection("Creators").orderBy("created_at", "desc").get();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    const creators = await Promise.all(snap.docs.map(async (doc) => {
      const data = doc.data();
      let clicks_this_week = 0;
      let clicks_this_month = 0;
      try {
        const clicksSnap = await doc.ref.collection("clicks")
          .where("timestamp", ">=", monthAgo)
          .get();
        clicksSnap.forEach((c) => {
          clicks_this_month++;
          const ts = c.data().timestamp?.toDate?.();
          if (ts && ts >= weekAgo) clicks_this_week++;
        });
      } catch {
        // clicks subcollection may not exist yet
      }
      return { id: doc.id, ...data, clicks_this_week, clicks_this_month };
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
    const { name, slug: providedSlug, platforms, notes } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const baseSlug = (providedSlug || name.split(/\s+/)[0].toLowerCase()).replace(/[^a-z0-9]/g, "");

    const { db } = getFirebaseAdmin();

    const PLATFORM_SUFFIX: Record<string, string> = {
      instagram: "ig",
      tiktok: "tt",
      youtube: "yt",
      other: "",
    };

    // Find unique base slug
    let slug = baseSlug;
    let suffix = 2;
    while (true) {
      const existing = await db.collection("Creators").where("slug", "==", slug).limit(1).get();
      if (existing.empty) break;
      slug = `${baseSlug}${suffix}`;
      suffix++;
      if (suffix > 20) {
        return NextResponse.json({ error: "Too many creators with similar names" }, { status: 409 });
      }
    }

    // Generate per-platform slugs (sarahig, sarahtt, etc.)
    const platformList = platforms || [];
    const platformSlugs: Record<string, string> = {};
    const platformClicks: Record<string, number> = {};
    for (const p of platformList) {
      const ps = PLATFORM_SUFFIX[p.platform] || p.platform.slice(0, 2);
      const pSlug = platformList.length === 1 ? slug : `${slug}${ps}`;
      platformSlugs[p.platform] = pSlug;
      platformClicks[p.platform] = 0;
    }

    // Collect all slugs to store for lookup
    const allSlugs = [slug, ...Object.values(platformSlugs)];

    const creatorData = {
      name,
      slug,
      platforms: platformList,
      platform_slugs: platformSlugs,
      platform_clicks: platformClicks,
      all_slugs: [...new Set(allSlugs)],
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
