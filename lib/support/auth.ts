import { cookies, headers } from "next/headers";
import { jwtVerify } from "jose";
import { founderFromHeaders } from "@/lib/staff";

const COOKIE_NAME = "keshah_dash";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

// Returns the JWT payload if the request carries a valid dashboard cookie,
// otherwise null. Mirrors the middleware check so /api/support/* routes
// can only be called by someone already logged into the dashboard.
export async function requireDashboardSession(): Promise<{ role: string } | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  // The founder in the KESHAH Creators app (mobile bearer token, staff email).
  if (!token) return (await founderFromHeaders(await headers())) ? { role: "admin" } : null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const role = (payload.role as string) ?? "admin";
    // Marketing and manager roles don't get to send support replies.
    if (role === "marketing" || role === "manager" || role === "creator") return null;
    return { role };
  } catch {
    return null;
  }
}

/**
 * Any logged-in dashboard user, marketing included (the Marketing page's
 * creator links). Founder app tokens count too.
 */
export async function requireAnyDashboardSession(): Promise<{ role: string } | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return (await founderFromHeaders(await headers())) ? { role: "admin" } : null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return { role: (payload.role as string) ?? "admin" };
  } catch {
    return null;
  }
}

// Vercel cron sends Authorization: Bearer ${CRON_SECRET}. Reject anything else.
export function requireCronSecret(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${cronSecret}`;
}
