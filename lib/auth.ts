import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "keshah_dash";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

export type Role = "admin" | "marketing" | "manager" | "creator";

export interface TokenPayload {
  role: Role;
  userId?: string;
  name?: string;
}

export async function createToken(payload: TokenPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
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

export async function getPayloadFromToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      role: (payload.role as Role) || "admin",
      userId: payload.userId as string | undefined,
      name: payload.name as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function getRoleFromToken(token: string): Promise<Role | null> {
  const payload = await getPayloadFromToken(token);
  return payload?.role || null;
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
