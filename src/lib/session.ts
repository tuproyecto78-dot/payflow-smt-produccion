import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSessionSecret, SESSION_COOKIE_NAME } from "@/lib/session-config";

const encoder = new TextEncoder();

export interface SessionPayload {
  userId: string;
  email: string;
  name?: string | null;
  role: string; // "user" | "admin"
  status?: "active" | "pending" | "suspended" | "cancelled" | "unknown";
  clientId?: string | null;
  emailVerified?: boolean;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encoder.encode(getSessionSecret()));
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(getSessionSecret()));
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: (payload.name as string) ?? null,
      role: (payload.role as string) || "user",
      status: (payload.status as SessionPayload["status"]) || "unknown",
      clientId: (payload.clientId as string | null) ?? null,
      emailVerified: payload.emailVerified === true,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export { SESSION_COOKIE_NAME } from "@/lib/session-config";
