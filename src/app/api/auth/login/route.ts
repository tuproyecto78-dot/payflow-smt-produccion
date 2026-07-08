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

    // Admin email check (used in all modes)
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@payflow.smt")
      .toLowerCase()
      .trim();
    const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "admin123";
    const isAdminEmail = normalizedEmail === adminEmail;

    // ─── Mode 1: Supabase Auth (production) ──────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: passwordStr,
        });

        if (!error && data.user) {
          // Supabase auth succeeded
          const userId = data.user.id;
          const userEmail = data.user.email || normalizedEmail;
          const userName =
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            null;

          // Determine role
          let role = isAdminEmail ? ROLES.SUPER_ADMIN : ROLES.APPLICANT;
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
              active: true,
            },
          });
        }
        // Supabase auth failed (wrong password or user not found)
        // Don't return 401 yet — try fallbacks below
        console.error("[login] Supabase auth failed, trying fallbacks");
      } catch (supabaseErr) {
        console.error("[login] Supabase error:", supabaseErr instanceof Error ? supabaseErr.message : "unknown");
        // Don't return — try fallbacks
      }
    }

    // ─── Mode 2: Env admin fallback ──────────────────────────────────
    // This runs if Supabase failed OR Supabase is not configured
    if (isAdminEmail && passwordStr === adminPassword) {
      // Try to resolve the real Prisma admin user ID so that DB queries
      // (projects, workflows, etc.) filter by the correct userId.
      // Falls back to "env-admin" if Prisma is unavailable.
      let realUserId = "env-admin";
      try {
        const { db } = await import("@/lib/db");
        const adminUser = await db.user.findUnique({ where: { email: adminEmail } });
        if (adminUser) {
          realUserId = adminUser.id;
        }
      } catch {
        // Prisma not available — keep "env-admin"
      }

      const token = await createSessionToken({
        userId: realUserId,
        email: adminEmail,
        name: "Administrator",
        role: ROLES.SUPER_ADMIN,
      });
      await setSessionCookie(token);

      return NextResponse.json({
        user: {
          id: realUserId,
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

    // ─── Mode 3: Prisma/SQLite (local development) ───────────────────
    try {
      const { db } = await import("@/lib/db");
      const bcrypt = await import("bcryptjs");

      const user = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (user) {
        const valid = await bcrypt.compare(passwordStr, user.passwordHash);
        if (valid) {
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
        }
      }
    } catch {
      // Prisma not available — continue
    }

    // All methods failed — wrong credentials
    return NextResponse.json(
      { error: "Correo o contraseña incorrectos." },
      { status: 401 }
    );
  } catch (err) {
    console.error("[login] unexpected error");
    return NextResponse.json(
      { error: "Error al iniciar sesión." },
      { status: 500 }
    );
  }
}
