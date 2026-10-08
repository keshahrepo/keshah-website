import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sendReply } from "@/lib/support/repo";
import { bucket } from "@/lib/creators/admin";
import { requireDashboardSession } from "@/lib/support/auth";

export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await requireDashboardSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { userId?: string; content?: string; photos?: string[] } | null;
  const userId = body?.userId?.trim();
  const content = body?.content?.trim() ?? "";
  const photos = Array.isArray(body?.photos) ? body!.photos!.filter((p) => typeof p === "string" && p.startsWith(`Chat/support/${userId}/`)).slice(0, 6) : [];
  if (!userId || (!content && !photos.length)) {
    return NextResponse.json({ error: "userId and a message or photo are required" }, { status: 400 });
  }

  // Uploaded photos get a Firebase download token so the KESHAH app can show them.
  const attachments = await Promise.all(
    photos.map(async (path) => {
      const file = bucket().file(path);
      const token = randomUUID();
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
      const name = path.split("/").pop() ?? "photo";
      return {
        type: "photos",
        remoteUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
        fileName: name,
        extension: `.${name.split(".").pop() ?? "jpg"}`,
      };
    }),
  );

  await sendReply(userId, content, attachments);
  return NextResponse.json({ ok: true, attachments });
}
