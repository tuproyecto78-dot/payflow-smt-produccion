import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function getSupabaseUser() {
  if (!isSupabaseConfigured) return null;
  try {
    const { createServerClientHelper } = await import("./supabase");
    const supabase = await createServerClientHelper();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch { return null; }
}

export interface AuthContext { userId: string; email: string; name: string | null; role: string; }
export async function getAuthContext(): Promise<AuthContext | null> {
  if (isSupabaseConfigured) {
    const user = await getSupabaseUser();
    if (!user) return null;
    return { userId: user.id, email: user.email || "", name: (user.user_metadata?.name as string) || null, role: "user" };
  }
  const { getSession } = await import("./session");
  const session = await getSession();
  if (!session) return null;
  return { userId: session.userId, email: session.email, name: session.name ?? null, role: session.role };
}
export { db } from "./db";
