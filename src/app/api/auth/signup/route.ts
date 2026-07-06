import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { ROLES } from "@/lib/roles";

/**
 * POST /api/auth/signup
 *
 * Dual-mode: Supabase Auth (production) or Prisma/SQLite (development).
 */
export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    // ─── Try Supabase Auth first (production) ────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: String(password),
          options: {
            data: { full_name: name?.trim() || null },
          },
        });

        if (error) {
          return NextResponse.json(
            { error: "No se pudo crear la cuenta." },
            { status: 400 }
          );
        }

        const userId = data.user?.id || "supabase-user";
        const userEmail = data.user?.email || normalizedEmail;

        // Create profile in Supabase
        try {
          await supabase.from("profiles").upsert({
            user_id: userId,
            email: userEmail,
            full_name: name?.trim() || null,
            role: ROLES.APPLICANT,
            status: "pending",
          });
        } catch {
          // Profile table might not exist — continue
        }

        const token = await createSessionToken({
          userId,
          email: userEmail,
          name: name?.trim() || null,
          role: ROLES.APPLICANT,
        });
        await setSessionCookie(token);

        return NextResponse.json({
          user: {
            id: userId,
            email: userEmail,
            name: name?.trim() || null,
            role: ROLES.APPLICANT,
          },
        });
      } catch {
        // Supabase failed — fall through to Prisma
      }
    }

    // ─── Fallback: Prisma/SQLite (local development) ─────────────────
    try {
      const { db } = await import("@/lib/db");
      const bcrypt = await import("bcryptjs");

      const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return NextResponse.json(
          { error: "An account with this email already exists." },
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

      const token = await createSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: ROLES.APPLICANT,
      });
      await setSessionCookie(token);

      return NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, role: ROLES.APPLICANT },
      });
    } catch (prismaErr) {
      console.error("[signup] Prisma not available");
      return NextResponse.json(
        { error: "No se pudo crear la cuenta." },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[signup] error");
    return NextResponse.json(
      { error: "Failed to create account." },
      { status: 500 }
    );
  }
}
