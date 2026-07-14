import { NextResponse } from "next/server";

/**
 * POST /api/auth/google
 *
 * Initiates Google OAuth via Supabase Auth.
 * Returns `{ url }` — the client should redirect to this URL.
 *
 * No Client ID / Client Secret in code — Supabase handles that
 * server-side with the provider configured in the Supabase dashboard.
 */
export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase no está configurado." },
      { status: 500 }
    );
  }

  try {
    const { searchParams, origin } = new URL(req.url);
    const nextParam = searchParams.get("next") || "/cuenta/estado";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
      nextParam
    )}`;

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
        { error: "No se pudo iniciar sesión con Google." },
        { status: 400 }
      );
    }

    return NextResponse.json({ url: data.url });
  } catch {
    return NextResponse.json(
      { error: "Error al conectar con Google." },
      { status: 500 }
    );
  }
}
