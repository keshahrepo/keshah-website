import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { signedUploadUrl } from "@/lib/creators/admin";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/webp": "webp" };

// POST /api/support/upload-url { userId, contentType } -> { uploadUrl, path }
// A photo for a support reply: the app PUTs the file to uploadUrl, then sends
// the reply with `photos: [path]`.
export async function POST(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { userId?: string; contentType?: string } | null;
  const userId = String(body?.userId ?? "").trim();
  const contentType = String(body?.contentType ?? "");
  const ext = TYPES[contentType];
  if (!userId || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!ext) return NextResponse.json({ error: "Only JPEG, PNG, HEIC or WebP photos" }, { status: 400 });
  const path = `Chat/support/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return NextResponse.json({ uploadUrl: await signedUploadUrl(path, contentType), path });
}
