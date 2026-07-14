import { NextResponse } from "next/server";
import { createServerClientHelper } from "@/lib/supabase";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { ROLES } from "@/lib/roles";

/**
 * GET /auth/callback
 *
 * Supabase OAuth callback. Exchanges the `code` param for a session,
 * creates / updates the user profile in Supabase (role=applicant,
 * status=pending if new), mints a PayFlow JWT session token, sets the
 * session cookie, and redirects:
 *   - to `next` if the user already has status=active
 *   - otherwise to /cuenta/estado
 */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/cuenta/estado";
  const errorCode = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (errorCode) {
    const msg = encodeURIComponent(errorDescription || errorCode);
    return NextResponse.redirect(`${origin}/login?error=${msg}`);
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Falta el código de OAuth.")}`
    );
  }

  try {
    const supabase = await createServerClientHelper();

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          "No se pudo obtener el usuario de Supabase."
        )}`
      );
    }

    const userId = user.id;
    const userEmail = user.email || "";
    const userName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      null;

    // Create / update profile in Supabase (role=applicant, status=pending if new)
    let status = "pending";
    try {
      const { data: existing } = await supabase
        .from("profiles")
        .select("status, role")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing && existing.status) {
        status = String(existing.status);
      } else {
        await supabase.from("profiles").upsert(
          {
            user_id: userId,
            email: userEmail,
            full_name: userName,
            role: ROLES.APPLICANT,
            status: "pending",
          },
          { onConflict: "user_id" }
        );
      }
    } catch {
      // profiles table might not exist — keep status=pending
    }

    // Mint PayFlow JWT session token
    const token = await createSessionToken({
      userId,
      email: userEmail,
      name: userName,
      role: ROLES.APPLICANT,
    });
    await setSessionCookie(token);

    const safeNext = next.startsWith("/") ? next : "/cuenta/estado";
    const redirectUrl = status === "active" ? safeNext : "/cuenta/estado";
    return NextResponse.redirect(`${origin}${redirectUrl}`);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Error inesperado al procesar el inicio de sesión.";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`
    );
  }
}
