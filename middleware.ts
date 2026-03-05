import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "keshah_dash";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /dashboard routes (not /dashboard/login)
  if (pathname.startsWith("/dashboard") && pathname !== "/dashboard/login") {
    const token = req.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/dashboard/login", req.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      const role = payload.role as string;

      // Marketing role can only access /dashboard/marketing
      if (role === "marketing" && !pathname.startsWith("/dashboard/marketing")) {
        return NextResponse.redirect(new URL("/dashboard/marketing", req.url));
      }

      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/dashboard/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
