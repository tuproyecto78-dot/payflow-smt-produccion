import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/auth/me
 *
 * Returns the current user from the session token.
 * Does NOT depend on Prisma — the session token contains all needed data.
 * If enrichment is needed, tries Supabase first, then Prisma as fallback.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  // Start with session data (always available)
  let user: Record<string, unknown> = {
    id: session.userId,
    email: session.email,
    name: session.name ?? null,
    role: session.role || "applicant",
    clientId: null,
    clientStatus: null,
    modules: [],
    memberRole: null,
    memberPermissions: null,
    active: session.role === "super_admin" || session.role === "admin",
  };

  // Try to enrich via Supabase (production)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey && session.userId !== "env-admin") {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role, client_id, status, full_name")
        .eq("user_id", session.userId)
        .single();

      if (profileData) {
        user.role = profileData.role || session.role;
        user.clientId = profileData.client_id || null;
        user.clientStatus = profileData.status || null;
        user.active = profileData.status === "active" || profileData.role === "super_admin" || profileData.role === "admin";
        if (profileData.full_name) user.name = profileData.full_name;
      }
    } catch {
      // Profile table might not exist — continue with session data
    }
  }

  // Try Prisma enrichment (local dev) — only if Supabase didn't work
  if (!user.active && session.userId !== "env-admin") {
    try {
      const { db } = await import("@/lib/db");
      const dbUser = await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, name: true, role: true },
      });
      if (dbUser) {
        user = {
          ...user,
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role || session.role,
          active: true,
        };
      }
    } catch {
      // Prisma not available — continue with session data
    }
  }

  return NextResponse.json({ user });
}
