import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ creator: string }> }
) {
  const { creator } = await params;

  // Don't intercept known static routes or non-creator slugs
  const reserved = ["deleteaccount", "privacy-policy", "terms", "support", "dashboard", "api", "_next", "favicon.ico", "fonts", "images", "videos"];
  if (reserved.includes(creator) || creator.includes(".")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const { db } = getFirebaseAdmin();

    // First try exact slug match
    let snap = await db.collection("Creators").where("slug", "==", creator).limit(1).get();
    let platform: string | null = null;

    // If no direct match, search in all_slugs (platform-specific links)
    if (snap.empty) {
      snap = await db.collection("Creators").where("all_slugs", "array-contains", creator).limit(1).get();
    }

    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data();

      // Determine which platform this slug belongs to
      if (data.platform_slugs) {
        for (const [p, s] of Object.entries(data.platform_slugs)) {
          if (s === creator) {
            platform = p;
            break;
          }
        }
      }

      // Increment total clicks
      const updates: Record<string, unknown> = { total_clicks: FieldValue.increment(1) };

      // Increment platform-specific clicks
      if (platform) {
        updates[`platform_clicks.${platform}`] = FieldValue.increment(1);
      }

      doc.ref.update(updates);
      doc.ref.collection("clicks").add({
        timestamp: FieldValue.serverTimestamp(),
        platform: platform || "direct",
        user_agent: req.headers.get("user-agent") || "",
        referer: req.headers.get("referer") || "",
        ip: req.headers.get("x-forwarded-for") || "",
      });
    }
  } catch (e) {
    console.error("Creator click log error:", e);
  }

  // Always redirect to landing page (has App Store buttons)
  return NextResponse.redirect(new URL("/", req.url), 302);
}
