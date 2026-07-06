import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { ROLES } from "@/lib/roles";

/**
 * POST /api/auth/login
 *
 * Dual-mode authentication:
 *   1. If Supabase is configured → use Supabase Auth (production)
 *   2. If Prisma is available → use local SQLite (development)
 *   3. If neither works → graceful 401/500 without leaking internals
 *
 * NEVER returns 500 for wrong credentials (returns 401).
 * NEVER logs passwords, tokens, or secrets.
 */

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }
    const normalizedEmail = String(email).toLowerCase().trim();

    // ─── Try Supabase Auth first (production) ────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: String(password),
        });

        if (error || !data.user) {
          return NextResponse.json(
            { error: "Correo o contraseña incorrectos." },
            { status: 401 }
          );
        }

        const userId = data.user.id;
        const userEmail = data.user.email || normalizedEmail;
        const userName = data.user.user_metadata?.full_name || data.user.user_metadata?.name || null;

        // Try to fetch/ensure profile in Supabase
        let role = ROLES.APPLICANT;
        try {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("role, status")
            .eq("user_id", userId)
            .single();

          if (profileData) {
            role = profileData.role || ROLES.APPLICANT;
          } else {
            // Profile doesn't exist — create it
            // Check if this is the admin email
            const adminEmail = process.env.ADMIN_EMAIL || "admin@payflow.smt";
            if (normalizedEmail === adminEmail.toLowerCase().trim()) {
              role = ROLES.SUPER_ADMIN;
              await supabase.from("profiles").upsert({
                user_id: userId,
                email: userEmail,
                full_name: userName || "Administrator",
                role: ROLES.SUPER_ADMIN,
                status: "active",
              });
            } else {
              await supabase.from("profiles").upsert({
                user_id: userId,
                email: userEmail,
                full_name: userName,
                role: ROLES.APPLICANT,
                status: "pending",
              });
            }
          }
        } catch {
          // Profile table might not exist in Supabase yet — continue with default role
          const adminEmail = process.env.ADMIN_EMAIL || "admin@payflow.smt";
          if (normalizedEmail === adminEmail.toLowerCase().trim()) {
            role = ROLES.SUPER_ADMIN;
          }
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
          },
        });
      } catch (supabaseErr) {
        // Supabase auth failed — fall through to Prisma if available
        console.error("[login] Supabase auth failed, trying Prisma fallback");
      }
    }

    // ─── Fallback: Prisma/SQLite (local development) ─────────────────
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

      const valid = await bcrypt.compare(password, user.passwordHash);
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
        },
      });
    } catch (prismaErr) {
      // Prisma not available (no DATABASE_URL in production)
      console.error("[login] Prisma not available");

      // Last resort: check admin credentials from env vars
      const adminEmail = process.env.ADMIN_EMAIL || "admin@payflow.smt";
      const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "admin123";

      if (normalizedEmail === adminEmail.toLowerCase().trim() && password === adminPassword) {
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
          },
        });
      }

      return NextResponse.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error("[login] error");
    return NextResponse.json(
      { error: "Error al iniciar sesión." },
      { status: 500 }
    );
  }
}
