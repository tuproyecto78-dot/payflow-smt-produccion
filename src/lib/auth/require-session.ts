/**
 * PayFlow SMT — Unified session helper for protected API routes.
 *
 * This module reads the JWT session cookie set by /api/auth/login and
 * optionally enriches it with profile data from Supabase (profiles table).
 *
 * It does NOT use Prisma or SQLite — safe for Vercel ephemeral deployments.
 *
 * Usage:
 *   import { requireSession, requireAdmin } from "@/lib/auth/require-session";
 *
 *   const session = await requireSession();
 *   if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *
 *   const admin = await requireAdmin();
 *   if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 */

import "server-only";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isInternalAccessRole, loadAccessProfile } from "@/lib/auth/access-profile";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  status: "active" | "pending" | "suspended" | "cancelled" | "unknown";
  clientId: string | null;
}

/**
 * Read the JWT session cookie and return the authenticated user.
 *
 * If Supabase is configured, also queries the profiles table to enrich
 * the role/status. If Supabase is not available, falls back to the JWT
 * claims only.
 *
 * Returns null if there is no session.
 */
export async function requireSession(): Promise<AuthenticatedUser | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.emailVerified !== true && process.env.NODE_ENV === "production") return null;

  // If Supabase is configured, try to enrich with profile data.
  if (isSupabaseConfigured) {
    try {
      const profile = await loadAccessProfile(session.userId, session.role);
      if (profile) {
        return {
          userId: session.userId,
          email: session.email,
          name: session.name ?? null,
          role: profile.role || session.role,
          status: profile.status,
          clientId: profile.clientId,
        };
      }
    } catch (error) {
      console.error("[auth] Unable to load access profile", error instanceof Error ? error.message : "unknown");
      if (process.env.NODE_ENV === "production") return null;
    }
  }

  // JWT-only fallback.
  return {
    userId: session.userId,
    email: session.email,
    name: session.name ?? null,
    role: session.role,
    status: session.status || (isInternalAccessRole(session.role) ? "active" : "pending"),
    clientId: session.clientId || null,
  };
}

/**
 * Require an admin or super_admin session.
 * Returns the user if they have an admin role, null otherwise.
 */
export async function requireAdmin(): Promise<AuthenticatedUser | null> {
  const user = await requireSession();
  if (!user) return null;
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
    return null;
  }
  return user;
}

/**
 * Require an active session (status = active).
 * Returns the user if active, null otherwise.
 */
export async function requireActiveSession(): Promise<AuthenticatedUser | null> {
  const user = await requireSession();
  if (!user) return null;
  if (!isInternalAccessRole(user.role) && user.status !== "active") return null;
  return user;
}

/**
 * Helper: create a standard 401 response.
 */
export function unauthorizedResponse(message = "Tu sesión expiró. Inicia sesión nuevamente.") {
  return Response.json({ error: message, code: "UNAUTHORIZED" }, { status: 401 });
}

/**
 * Helper: create a standard 403 response.
 */
export function forbiddenResponse(message = "No tienes permisos para esta acción.") {
  return Response.json({ error: message, code: "FORBIDDEN" }, { status: 403 });
}
