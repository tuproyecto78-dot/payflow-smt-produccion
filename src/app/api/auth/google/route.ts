import { NextResponse } from "next/server";

/**
 * POST /api/auth/google
 *
 * Initiates Google OAuth via the official Supabase Auth client.
 * Returns `{ url }` — the client should redirect to this URL.
 *
 * The URL returned by Supabase will be:
 *   https://<project-ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=...
 *
 * No Client ID / Client Secret in code — Supabase handles that
 * server-side with the provider configured in the Supabase dashboard.
 */

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
  let url = raw.trim();
  // Strip trailing slashes
  url = url.replace(/\/+$/, "");
  // Remove known Supabase path suffixes (REST / Auth)
  url = url.replace(/\/rest\/v\d+$/i, "");
  url = url.replace(/\/auth\/v\d+$/i, "");
  url = url.replace(/\/rest$/i, "");
  url = url.replace(/\/auth$/i, "");
  return url;
}

export async function POST(req: Request) {
  const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawSupabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase no está configurado. Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY." },
      { status: 500 }
    );
  }

  // CRITICAL: sanitize the URL so it never contains /rest/v1 or /auth/v1
  const supabaseUrl = sanitizeSupabaseUrl(rawSupabaseUrl);

  try {
    const { searchParams, origin } = new URL(req.url);
    const nextParam = searchParams.get("next") || "/cuenta/estado";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
      nextParam
    )}`;

    // Use the OFFICIAL Supabase client — never build the OAuth URL manually.
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      return NextResponse.json(
        { error: error?.message || "No se pudo iniciar sesión con Google." },
        { status: 400 }
      );
    }

    // data.url is now: https://<project-ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=...
    return NextResponse.json({ url: data.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al conectar con Google.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
