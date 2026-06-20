import { createBrowserClient } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

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

export async function getSupabaseUser() {
  if (!isSupabaseConfigured) return null;
  try {
    const supabase = await createServerClientHelper();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch { return null; }
}
