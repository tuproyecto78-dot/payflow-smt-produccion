import { createBrowserClient } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Sanitize the Supabase URL so it is ALWAYS a bare project URL.
 *
 * Accepts any of these and returns "https://<project-ref>.supabase.co":
 *   - https://lkhvemqklwdknztadhzs.supabase.co
 *   - https://lkhvemqklwdknztadhzs.supabase.co/
 *   - https://lkhvemqklwdknztadhzs.supabase.co/rest/v1
 *   - https://lkhvemqklwdknztadhzs.supabase.co/auth/v1
 *   - https://lkhvemqklwdknztadhzs.supabase.co/rest/v1/
 *
 * This prevents the "/rest/v1/auth/v1/authorize" bug where the REST
 * endpoint path leaks into the OAuth authorize URL.
 */
function sanitizeSupabaseUrl(raw: string): string {
  let url = (raw || "").trim();
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/rest\/v\d+$/i, "");
  url = url.replace(/\/auth\/v\d+$/i, "");
  url = url.replace(/\/rest$/i, "");
  url = url.replace(/\/auth$/i, "");
  return url;
}

export const SUPABASE_URL = sanitizeSupabaseUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL || ""
);
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function createClient() {
  if (!isSupabaseConfigured) throw new Error("Supabase no configurado.");
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function createServerClientHelper() {
  if (!isSupabaseConfigured) throw new Error("Supabase no configurado.");
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
      },
    },
  });
}

/**
 * Privileged server client for profile, entitlement and webhook operations.
 * Never import this helper from a client component and never expose the key in
 * a NEXT_PUBLIC variable.
 */
export function createServiceRoleClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service role is not configured.");
  }

  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getSupabaseUser() {
  if (!isSupabaseConfigured) return null;
  try {
    const supabase = await createServerClientHelper();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch { return null; }
}
