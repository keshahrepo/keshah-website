import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { waitUntil } from "@vercel/functions";

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

  // Track click in background — don't block the redirect
  const userAgent = req.headers.get("user-agent") || "";
  const referer = req.headers.get("referer") || "";
  const ip = req.headers.get("x-forwarded-for") || "";

  waitUntil(trackClick(creator, userAgent, referer, ip));

  // Redirect immediately
  return NextResponse.redirect(new URL("/", req.url), 302);
}

async function trackClick(creator: string, userAgent: string, referer: string, ip: string) {
  try {
    const { db } = getFirebaseAdmin();

    let snap = await db.collection("Creators").where("slug", "==", creator).limit(1).get();
    let platform: string | null = null;

    if (snap.empty) {
      snap = await db.collection("Creators").where("all_slugs", "array-contains", creator).limit(1).get();
    }

    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data();

      if (data.platform_slugs) {
        for (const [p, s] of Object.entries(data.platform_slugs)) {
          if (s === creator) {
            platform = p;
            break;
          }
        }
      }

      const updates: Record<string, unknown> = { total_clicks: FieldValue.increment(1) };
      if (platform) {
        updates[`platform_clicks.${platform}`] = FieldValue.increment(1);
      }

      doc.ref.update(updates);
      doc.ref.collection("clicks").add({
        timestamp: FieldValue.serverTimestamp(),
        platform: platform || "direct",
        user_agent: userAgent,
        referer: referer,
        ip: ip,
      });
    }
  } catch (e) {
    console.error("Creator click log error:", e);
  }
}
