import "server-only";

import { createServiceRoleClient } from "@/lib/supabase";
import { ROLES } from "@/lib/roles";

export type AccessStatus =
  | "active"
  | "pending"
  | "suspended"
  | "cancelled"
  | "unknown";

export interface AccessProfile {
  role: string;
  status: AccessStatus;
  clientId: string | null;
  fullName: string | null;
}

export function isInternalAccessRole(role: string): boolean {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN || role === ROLES.OPERATOR;
}

function normalizeStatus(value: unknown, role: string): AccessStatus {
  if (isInternalAccessRole(role)) return "active";
  if (value === "active" || value === "pending" || value === "suspended" || value === "cancelled") {
    return value;
  }
  return "pending";
}

/**
 * Reads authorization state with the service role. This avoids coupling the
 * custom application session to a transient Supabase browser session while
 * keeping the service key exclusively on the server.
 */
export async function loadAccessProfile(
  userId: string,
  fallbackRole: string = ROLES.APPLICANT
): Promise<AccessProfile | null> {
  const supabase = createServiceRoleClient();

  const modern = await supabase
    .from("profiles")
    .select("role, status, client_id, full_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (!modern.error && modern.data) {
    const role = String(modern.data.role || fallbackRole);
    return {
      role,
      status: normalizeStatus(modern.data.status, role),
      clientId: modern.data.client_id ? String(modern.data.client_id) : null,
      fullName: modern.data.full_name ? String(modern.data.full_name) : null,
    };
  }

  // Compatibility during the schema migration: the original profiles table
  // used id/name and did not have subscription state columns.
  const legacy = await supabase
    .from("profiles")
    .select("role, name")
    .eq("id", userId)
    .maybeSingle();

  if (legacy.error || !legacy.data) return null;
  const role = String(legacy.data.role || fallbackRole);
  return {
    role,
    status: isInternalAccessRole(role) ? "active" : "pending",
    clientId: null,
    fullName: legacy.data.name ? String(legacy.data.name) : null,
  };
}

export async function ensureAccessProfile(input: {
  userId: string;
  email: string;
  fullName?: string | null;
  role?: string;
}): Promise<AccessProfile> {
  const supabase = createServiceRoleClient();
  const role = input.role || ROLES.APPLICANT;
  const fullName = input.fullName?.trim() || null;

  const modern = await supabase.from("profiles").upsert(
    {
      id: input.userId,
      user_id: input.userId,
      email: input.email,
      name: fullName,
      full_name: fullName,
      role,
      status: isInternalAccessRole(role) ? "active" : "pending",
    },
    { onConflict: "id" }
  );

  if (modern.error) {
    const legacy = await supabase.from("profiles").upsert(
      {
        id: input.userId,
        email: input.email,
        name: fullName,
        role,
      },
      { onConflict: "id" }
    );
    if (legacy.error) throw legacy.error;
  }

  return (
    (await loadAccessProfile(input.userId, role)) || {
      role,
      status: isInternalAccessRole(role) ? "active" : "pending",
      clientId: null,
      fullName,
    }
  );
}
