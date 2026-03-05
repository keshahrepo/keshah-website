import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "keshah_dash";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

export type Role = "admin" | "marketing";

export async function createToken(role: Role = "admin"): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function getRoleFromToken(token: string): Promise<Role | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload.role as Role) || "admin";
  } catch {
    return null;
  }
}

export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthCookie();
  if (!token) return false;
  return verifyToken(token);
}

export { COOKIE_NAME };
