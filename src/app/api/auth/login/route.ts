import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { ensureAccessProfile, isInternalAccessRole, loadAccessProfile } from "@/lib/auth/access-profile";
import { getClientIP, isValidEmail, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    const ip = getClientIP(req);

    if (!isValidEmail(email) || !password) {
      return NextResponse.json({ error: "Ingresa un correo y una contraseña válidos." }, { status: 400 });
    }
    if (!rateLimit(`auth-login:${ip}:${email}`, 10, 15 * 60_000)) {
      return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
      }
      if (!data.user.email_confirmed_at) {
        return NextResponse.json(
          { error: "Confirma tu correo antes de iniciar sesión.", code: "EMAIL_NOT_VERIFIED" },
          { status: 403 }
        );
      }

      const configuredAdminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
      const bootstrapRole = configuredAdminEmail && configuredAdminEmail === email
        ? ROLES.SUPER_ADMIN
        : ROLES.APPLICANT;
      const userName = data.user.user_metadata?.full_name || data.user.user_metadata?.name || null;
      let profile = await loadAccessProfile(data.user.id, bootstrapRole);
      if (!profile) {
        profile = await ensureAccessProfile({
          userId: data.user.id,
          email: data.user.email || email,
          fullName: userName,
          role: bootstrapRole,
        });
      }

      // Preserve an explicitly configured administrator without providing an
      // alternate password path. Supabase still authenticates the account.
      if (bootstrapRole === ROLES.SUPER_ADMIN && profile.role !== ROLES.SUPER_ADMIN) {
        profile = await ensureAccessProfile({
          userId: data.user.id,
          email: data.user.email || email,
          fullName: profile.fullName || userName,
          role: ROLES.SUPER_ADMIN,
        });
      }

      const active = isInternalAccessRole(profile.role) || profile.status === "active";
      const token = await createSessionToken({
        userId: data.user.id,
        email: data.user.email || email,
        name: profile.fullName || userName,
        role: profile.role,
        status: profile.status,
        clientId: profile.clientId,
        emailVerified: true,
      });
      await setSessionCookie(token);

      return NextResponse.json({
        next: active ? "/dashboard" : "/cuenta/estado",
        user: {
          id: data.user.id,
          email: data.user.email || email,
          name: profile.fullName || userName,
          role: profile.role,
          clientId: profile.clientId,
          clientStatus: profile.status,
          modules: [],
          active,
        },
      });
    }

    if (process.env.NODE_ENV === "production" || process.env.ALLOW_LOCAL_AUTH_FALLBACK !== "true") {
      return NextResponse.json({ error: "El servicio de autenticación no está configurado." }, { status: 503 });
    }

    const [{ db }, bcrypt] = await Promise.all([import("@/lib/db"), import("bcryptjs")]);
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
    }
    const role = user.role || ROLES.APPLICANT;
    const active = isInternalAccessRole(role);
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role,
      status: active ? "active" : "pending",
      emailVerified: true,
    });
    await setSessionCookie(token);
    return NextResponse.json({
      next: active ? "/dashboard" : "/cuenta/estado",
      user: { id: user.id, email: user.email, name: user.name, role, active },
    });
  } catch (error) {
    console.error("[login] unexpected error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Error al iniciar sesión." }, { status: 500 });
  }
}
