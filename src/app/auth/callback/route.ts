import { NextResponse } from "next/server";
import { createServerClientHelper } from "@/lib/supabase";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { ensureAccessProfile, isInternalAccessRole, loadAccessProfile } from "@/lib/auth/access-profile";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { ROLES } from "@/lib/roles";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const requestedNext = safeInternalRedirect(url.searchParams.get("next"), "/dashboard");
  if (!code) return NextResponse.redirect(`${url.origin}/login?error=missing_oauth_code`);

  try {
    const supabase = await createServerClientHelper();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const user = data.user;
    if (error || !user || !user.email || !user.email_confirmed_at) {
      return NextResponse.redirect(`${url.origin}/login?error=oauth_not_verified`);
    }

    const configuredAdminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
    const bootstrapRole = configuredAdminEmail === user.email.toLowerCase()
      ? ROLES.SUPER_ADMIN
      : ROLES.APPLICANT;
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null;
    let profile = await loadAccessProfile(user.id, bootstrapRole);
    if (!profile || (bootstrapRole === ROLES.SUPER_ADMIN && profile.role !== ROLES.SUPER_ADMIN)) {
      profile = await ensureAccessProfile({
        userId: user.id,
        email: user.email,
        fullName: profile?.fullName || fullName,
        role: bootstrapRole,
      });
    }

    const active = isInternalAccessRole(profile.role) || profile.status === "active";
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: profile.fullName || fullName,
      role: profile.role,
      status: profile.status,
      clientId: profile.clientId,
      emailVerified: true,
    });
    await setSessionCookie(token);

    const destination = active ? requestedNext : "/cuenta/estado";
    return NextResponse.redirect(`${url.origin}${destination}`);
  } catch (error) {
    console.error("[auth/callback] error", error instanceof Error ? error.message : "unknown");
    return NextResponse.redirect(`${url.origin}/login?error=oauth_callback`);
  }
}

export const dynamic = "force-dynamic";
