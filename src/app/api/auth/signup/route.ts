import { NextResponse } from "next/server";
import { ROLES } from "@/lib/roles";

/**
 * POST /api/auth/signup
 *
 * Dual-mode: Supabase Auth (production) or Prisma/SQLite (development).
 *
 * After signup, NO session token is created — the user must verify their
 * email first. Returns `{ ok: true, needsVerification: true }`.
 */
export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "El correo y la contraseña son obligatorios." },
        { status: 400 }
      );
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    if (password.length < 10) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 10 caracteres." },
        { status: 400 }
      );
    }

    // ─── Try Supabase Auth first (production) ────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: String(password),
          options: {
            data: { full_name: name?.trim() || null },
          },
        });

        if (error) {
          // Map common Supabase errors to Spanish.
          let msg = "No se pudo crear la cuenta.";
          if (error.message.toLowerCase().includes("already registered")) {
            msg = "Ya existe una cuenta con este correo.";
          } else if (error.message.toLowerCase().includes("password")) {
            msg = "La contraseña no cumple los requisitos de seguridad.";
          } else if (error.message.toLowerCase().includes("email")) {
            msg = "El correo electrónico no es válido.";
          }
          return NextResponse.json({ error: msg }, { status: 400 });
        }

        const userId = data.user?.id || "supabase-user";
        const userEmail = data.user?.email || normalizedEmail;

        // Create profile in Supabase (role=applicant, status=pending)
        try {
          await supabase.from("profiles").upsert(
            {
              user_id: userId,
              email: userEmail,
              full_name: name?.trim() || null,
              role: ROLES.APPLICANT,
              status: "pending",
            },
            { onConflict: "user_id" }
          );
        } catch {
          // Profile table might not exist — continue
        }

        // Do NOT create a session token — user must verify email first.
        return NextResponse.json({ ok: true, needsVerification: true });
      } catch {
        // Supabase failed — fall through to Prisma
      }
    }

    // ─── Fallback: Prisma/SQLite (local development) ─────────────────
    try {
      const { db } = await import("@/lib/db");
      const bcrypt = await import("bcryptjs");

      const existing = await db.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Ya existe una cuenta con este correo." },
          { status: 409 }
        );
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await db.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name?.trim() || null,
          role: ROLES.APPLICANT,
        },
      });

      // Create Profile
      try {
        await db.profile.create({
          data: {
            userId: user.id,
            email: normalizedEmail,
            fullName: name?.trim() || null,
            role: ROLES.APPLICANT,
            status: "pending",
          },
        });
      } catch {
        // Profile might already exist
      }

      // Create a starter project
      await db.project.create({
        data: {
          name: "My First Workflow",
          description: "A starter project to explore PayFlow SMT.",
          userId: user.id,
          workflows: {
            create: [
              {
                name: "Welcome Flow",
                nodesJson: JSON.stringify([]),
                edgesJson: JSON.stringify([]),
              },
            ],
          },
        },
      });

      // Do NOT create a session token — user must verify email first.
      return NextResponse.json({ ok: true, needsVerification: true });
    } catch {
      return NextResponse.json(
        { error: "No se pudo crear la cuenta." },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Error al crear la cuenta." },
      { status: 500 }
    );
  }
}
