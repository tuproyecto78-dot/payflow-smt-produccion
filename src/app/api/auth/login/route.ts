import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { ROLES } from "@/lib/roles";

/**
 * POST /api/auth/login
 *
 * Production auth using Supabase Auth.
 * Fallback to Prisma (local dev) or env admin credentials.
 *
 * NEVER returns 500 for wrong credentials (returns 401).
 * NEVER logs passwords, tokens, or secrets.
 */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const passwordStr = String(password);

    // ─── Mode 1: Supabase Auth (production) ──────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        // Use createClient from @supabase/supabase-js (not @supabase/ssr)
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: passwordStr,
        });

        if (error) {
          // Wrong credentials — return 401, not 500
          return NextResponse.json(
            { error: "Correo o contraseña incorrectos." },
            { status: 401 }
          );
        }

        if (!data.user) {
          return NextResponse.json(
            { error: "Correo o contraseña incorrectos." },
            { status: 401 }
          );
        }

        const userId = data.user.id;
        const userEmail = data.user.email || normalizedEmail;
        const userName =
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          null;

        // Determine role — check profiles table, fallback to admin check
        let role = ROLES.APPLICANT;
        const adminEmail = (process.env.ADMIN_EMAIL || "admin@payflow.smt")
          .toLowerCase()
          .trim();
        const isAdminEmail = normalizedEmail === adminEmail;

        try {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("role, status, client_id")
            .eq("user_id", userId)
            .single();

          if (profileData) {
            role = profileData.role || (isAdminEmail ? ROLES.SUPER_ADMIN : ROLES.APPLICANT);
          } else {
            // Create profile if missing
            role = isAdminEmail ? ROLES.SUPER_ADMIN : ROLES.APPLICANT;
            await supabase.from("profiles").upsert({
              user_id: userId,
              email: userEmail,
              full_name: userName || (isAdminEmail ? "Administrator" : null),
              role,
              status: isAdminEmail ? "active" : "pending",
            });
          }
        } catch {
          // profiles table might not exist — use admin check
          if (isAdminEmail) role = ROLES.SUPER_ADMIN;
        }

        const token = await createSessionToken({
          userId,
          email: userEmail,
          name: userName,
          role,
        });
        await setSessionCookie(token);

        return NextResponse.json({
          user: {
            id: userId,
            email: userEmail,
            name: userName,
            role,
            clientId: null,
            clientStatus: null,
            modules: [],
            memberRole: null,
            memberPermissions: null,
            active: role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN || role === "active",
          },
        });
      } catch (supabaseErr) {
        // Supabase call itself failed (network, config, etc.)
        // Log safely — no secrets
        console.error("[login] Supabase auth error:", supabaseErr instanceof Error ? supabaseErr.message : "unknown");
        // Fall through to next method
      }
    }

    // ─── Mode 2: Prisma/SQLite (local development) ───────────────────
    try {
      const { db } = await import("@/lib/db");
      const bcrypt = await import("bcryptjs");

      const user = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        return NextResponse.json(
          { error: "Correo o contraseña incorrectos." },
          { status: 401 }
        );
      }

      const valid = await bcrypt.compare(passwordStr, user.passwordHash);
      if (!valid) {
        return NextResponse.json(
          { error: "Correo o contraseña incorrectos." },
          { status: 401 }
        );
      }

      const role = user.role || ROLES.APPLICANT;
      const token = await createSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role,
      });
      await setSessionCookie(token);

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role,
          clientId: null,
          clientStatus: null,
          modules: [],
          memberRole: null,
          memberPermissions: null,
          active: true,
        },
      });
    } catch {
      // Prisma not available — no DATABASE_URL in production
      console.error("[login] Prisma not available, trying env admin fallback");
    }

    // ─── Mode 3: Env admin fallback (last resort) ────────────────────
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@payflow.smt")
      .toLowerCase()
      .trim();
    const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "admin123";

    if (normalizedEmail === adminEmail && passwordStr === adminPassword) {
      const token = await createSessionToken({
        userId: "env-admin",
        email: adminEmail,
        name: "Administrator",
        role: ROLES.SUPER_ADMIN,
      });
      await setSessionCookie(token);

      return NextResponse.json({
        user: {
          id: "env-admin",
          email: adminEmail,
          name: "Administrator",
          role: ROLES.SUPER_ADMIN,
          clientId: null,
          clientStatus: null,
          modules: [],
          memberRole: null,
          memberPermissions: null,
          active: true,
        },
      });
    }

    // All methods failed
    return NextResponse.json(
      { error: "Correo o contraseña incorrectos." },
      { status: 401 }
    );
  } catch (err) {
    // Catch-all: never expose internals
    console.error("[login] unexpected error");
    return NextResponse.json(
      { error: "Error al iniciar sesión." },
      { status: 500 }
    );
  }
}
