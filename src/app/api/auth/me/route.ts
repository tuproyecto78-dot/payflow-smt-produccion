import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { createSessionToken, setSessionCookie } from "@/lib/session";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ user: null }, { status: 200 });

  const active = isInternalAccessRole(session.role) || session.status === "active";
  // Refresh signed authorization claims so a newly activated or suspended
  // subscription takes effect without waiting for the seven-day session TTL.
  const refreshed = await createSessionToken({
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    status: session.status,
    clientId: session.clientId,
    emailVerified: true,
  });
  await setSessionCookie(refreshed);
  return NextResponse.json({
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      clientId: session.clientId,
      clientStatus: session.status,
      modules: [],
      active,
    },
  });
}

export const dynamic = "force-dynamic";
