import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "keshah_dash";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /creator routes (not /creator/login)
  if (pathname.startsWith("/creator") && pathname !== "/creator/login") {
    const token = req.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/creator/login", req.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      const role = payload.role as string;

      if (role !== "creator") {
        return NextResponse.redirect(new URL("/creator/login", req.url));
      }

      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/creator/login", req.url));
    }
  }

  // Protect /dashboard routes (not /dashboard/login)
  if (pathname.startsWith("/dashboard") && pathname !== "/dashboard/login") {
    const token = req.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/dashboard/login", req.url));
    }

    try {
      const { payload } = await jwtVerify(token, secret);
      const role = payload.role as string;

      // Creator role should not access dashboard
      if (role === "creator") {
        return NextResponse.redirect(new URL("/creator", req.url));
      }

      // Marketing role can only access /dashboard/marketing
      if (role === "marketing" && !pathname.startsWith("/dashboard/marketing")) {
        return NextResponse.redirect(new URL("/dashboard/marketing", req.url));
      }

      // Manager role can only access /dashboard/today, /dashboard/recruit, /dashboard/manage, and /dashboard/resources
      if (role === "manager" && !pathname.startsWith("/dashboard/today") && !pathname.startsWith("/dashboard/manage") && !pathname.startsWith("/dashboard/recruit") && !pathname.startsWith("/dashboard/resources")) {
        return NextResponse.redirect(new URL("/dashboard/today", req.url));
      }

      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/dashboard/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/creator/:path*"],
};
