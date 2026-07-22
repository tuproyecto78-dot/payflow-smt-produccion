import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { ensureAccessProfile } from "@/lib/auth/access-profile";
import { getClientIP, isValidEmail, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase";

export async function POST(req: Request) {
  const ip = getClientIP(req);
  if (!rateLimit(`auth-signup:${ip}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const normalizedEmail = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : null;

    if (!isValidEmail(normalizedEmail) || !password) {
      return NextResponse.json({ error: "Ingresa un correo y una contraseña válidos." }, { status: 400 });
    }
    if (password.length < 10) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 10 caracteres." }, { status: 400 });
    }

    if (isSupabaseConfigured) {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const origin = new URL(req.url).origin;
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${origin}/auth/callback?next=/cuenta/estado`,
        },
      });

      if (error || !data.user) {
        return NextResponse.json({ error: "No se pudo crear la cuenta. Verifica el correo e inténtalo nuevamente." }, { status: 400 });
      }

      const email = data.user.email || normalizedEmail;
      const profile = await ensureAccessProfile({
        userId: data.user.id,
        email,
        fullName: name,
        role: ROLES.APPLICANT,
      });

      // With Confirm Email enabled Supabase returns a user but no session.
      // Never issue the PayFlow session until ownership of the email is proven.
      if (!data.session || !data.user.email_confirmed_at) {
        return NextResponse.json({
          ok: true,
          requiresEmailConfirmation: true,
          next: `/verificar-correo?email=${encodeURIComponent(email)}`,
        });
      }

      const token = await createSessionToken({
        userId: data.user.id,
        email,
        name: profile.fullName || name,
        role: profile.role,
        status: profile.status,
        clientId: profile.clientId,
        emailVerified: true,
      });
      await setSessionCookie(token);

      return NextResponse.json({
        ok: true,
        next: "/cuenta/estado",
        user: {
          id: data.user.id,
          email,
          name: profile.fullName || name,
          role: profile.role,
          clientId: profile.clientId,
          clientStatus: profile.status,
          active: false,
        },
      });
    }

    if (process.env.NODE_ENV === "production" || process.env.ALLOW_LOCAL_AUTH_FALLBACK !== "true") {
      return NextResponse.json({ error: "El servicio de autenticación no está configurado." }, { status: 503 });
    }

    const [{ db }, bcrypt] = await Promise.all([import("@/lib/db"), import("bcryptjs")]);
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "Ya existe una cuenta con este correo." }, { status: 409 });
    }
    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: await bcrypt.hash(password, 12),
        name,
        role: ROLES.APPLICANT,
      },
    });
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: ROLES.APPLICANT,
      status: "pending",
      emailVerified: true,
    });
    await setSessionCookie(token);
    return NextResponse.json({
      ok: true,
      next: "/cuenta/estado",
      user: { id: user.id, email: user.email, name: user.name, role: ROLES.APPLICANT, active: false },
    });
  } catch (error) {
    console.error("[signup] unexpected error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }
}
