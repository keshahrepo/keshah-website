import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// GET /nurture?nurture_uid=X&nurture_day=Y&nurture_channel=email|sms|whatsapp&dest=trial|chat|youtube
//
// Nurture click handler:
//  - Mobile → immediate 302 redirect to App Store / Play Store
//  - Desktop → server-rendered page with store links + QR-style instructions
//    (previously redirected to keshah.com quiz, which was confusing UX
//    for existing users who already installed the app)
//
// Writes an attribution stamp to Users/{nurture_uid} on the way through.

const APP_STORE_URL = "https://apps.apple.com/app/keshah/id6449567228";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

function detectPlatform(ua: string): "ios" | "android" | "desktop" {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

async function writeClickStamp(
  uid: string,
  day: number | null,
  channel: string,
  dest: string,
  platform: string
) {
  try {
    const { db } = getFirebaseAdmin();
    const ref = db.collection("Users").doc(uid);
    const snap = await ref.get();
    const existing = snap.data() ?? {};
    const patch: Record<string, unknown> = {
      nurture_last_click: {
        day,
        channel,
        dest,
        platform,
        at: Timestamp.now(),
      },
      nurture_click_count: FieldValue.increment(1),
    };
    if (!existing.nurture_first_click_at) {
      patch.nurture_first_click_at = Timestamp.now();
    }
    await ref.set(patch, { merge: true });
  } catch (e) {
    console.error("[nurture-click] Firestore write failed", e);
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const uid = url.searchParams.get("nurture_uid");
  const dayStr = url.searchParams.get("nurture_day");
  const channel = url.searchParams.get("nurture_channel") || "unknown";
  const dest = url.searchParams.get("dest") || "trial";
  const day = dayStr ? parseInt(dayStr, 10) || null : null;

  const platform = detectPlatform(req.headers.get("user-agent") || "");

  // Fire-and-forget attribution write. Never block the response on it.
  if (uid) {
    writeClickStamp(uid, day, channel, dest, platform);
  }

  // Mobile → immediate store redirect
  if (platform === "ios") {
    return NextResponse.redirect(APP_STORE_URL, { status: 302 });
  }
  if (platform === "android") {
    return NextResponse.redirect(PLAY_STORE_URL, { status: 302 });
  }

  // Desktop → server-render a proper landing page
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Open KESHAH on your phone</title>
<style>
  body{margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:440px;width:100%;text-align:center;}
  h1{font-size:26px;letter-spacing:-0.5px;margin:0 0 12px;font-weight:700;}
  p{color:rgba(255,255,255,0.7);font-size:15px;line-height:1.5;margin:0 0 28px;}
  .stores{display:flex;flex-direction:column;gap:12px;}
  .store{display:flex;align-items:center;justify-content:center;padding:14px 22px;background:#fff;color:#000;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;transition:transform 0.1s;}
  .store:hover{transform:translateY(-1px);}
  .store .platform{opacity:0.5;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin-right:auto;}
  .store .label{margin:0 auto;}
  .signature{margin-top:32px;font-size:13px;color:rgba(255,255,255,0.4);}
</style>
</head>
<body>
  <div class="card">
    <h1>Open KESHAH on your phone</h1>
    <p>Your free session is inside the app. Tap one of these to install and get started.</p>
    <div class="stores">
      <a class="store" href="${APP_STORE_URL}">
        <span class="platform">iPhone</span>
        <span class="label">Download on the App Store</span>
      </a>
      <a class="store" href="${PLAY_STORE_URL}">
        <span class="platform">Android</span>
        <span class="label">Get it on Google Play</span>
      </a>
    </div>
    <div class="signature">— Aadi, KESHAH founder</div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
