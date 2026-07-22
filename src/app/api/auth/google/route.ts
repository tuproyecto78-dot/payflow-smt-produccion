import { NextResponse } from "next/server";
import { createServerClientHelper, isSupabaseConfigured } from "@/lib/supabase";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";

export async function GET(req: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Google no está configurado." }, { status: 503 });
  }
  if (!rateLimit(`auth-google:${getClientIP(req)}`, 10, 15 * 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  const url = new URL(req.url);
  const next = safeInternalRedirect(url.searchParams.get("next"), "/dashboard");
  const supabase = await createServerClientHelper();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${url.origin}/login?error=google_auth`);
  }
  return NextResponse.redirect(data.url);
}

export const dynamic = "force-dynamic";
