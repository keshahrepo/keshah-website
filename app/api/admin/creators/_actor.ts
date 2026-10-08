import type { NextRequest } from "next/server";
import { COOKIE_NAME, getPayloadFromToken } from "@/lib/auth";
import type { AdminActor } from "@/lib/creators/payments";
import { founderFromHeaders } from "@/lib/staff";

/** Who is doing an admin action, for the payment reveal log. Call after requireAdmin. */
export async function adminActor(req: NextRequest): Promise<AdminActor> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const p = token ? await getPayloadFromToken(token) : null;
  const app = p ? null : await founderFromHeaders(req.headers);
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return {
    who: app ? `app: ${app}` : [p?.name, p?.userId].filter(Boolean).join(" / ") || "admin",
    ip: xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown",
    user_agent: req.headers.get("user-agent") ?? "unknown",
  };
}
