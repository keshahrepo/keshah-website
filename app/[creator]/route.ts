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

    // Log click asynchronously — don't block the redirect
    const creatorRef = db.collection("Creators").where("slug", "==", creator).limit(1);
    const snap = await creatorRef.get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      // Increment click count and log individual click
      doc.ref.update({ total_clicks: FieldValue.increment(1) });
      doc.ref.collection("clicks").add({
        timestamp: FieldValue.serverTimestamp(),
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
