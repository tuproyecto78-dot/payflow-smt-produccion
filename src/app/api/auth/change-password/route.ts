import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  isSupabaseConfigured,
  getSupabaseUser,
  createServerClientHelper,
} from "@/lib/supabase";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";

/**
 * POST /api/auth/change-password
 * Cambia la contraseña del usuario autenticado.
 *
 * Body:
 *   { "current_password": "...", "new_password": "..." }
 *
 * Validaciones:
 * - Requiere sesión activa.
 * - new_password mínimo 8 caracteres.
 * - Verifica contraseña actual antes de cambiar.
 * - Hashea la nueva contraseña con bcrypt.
 * - Rate limiting: 5 intentos por minuto.
 */
export async function POST(req: Request) {
  try {
    // ─── Rate limiting ───────────────────────────────────────────────
    const ip = getClientIP(req);
    if (!rateLimit(`change_pwd:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
    }

    const body = await req.json();
    const { current_password, new_password } = body;

    // Validaciones
    if (!current_password || !new_password) {
      return NextResponse.json(
        { error: "Contraseña actual y nueva son obligatorias." },
        { status: 400 }
      );
    }
    if (new_password.length < 8) {
      return NextResponse.json(
        { error: "La nueva contraseña debe tener mínimo 8 caracteres." },
        { status: 400 }
      );
    }

    // ─── Modo Supabase ───────────────────────────────────────────────
    if (isSupabaseConfigured) {
      const user = await getSupabaseUser();
      if (!user) {
        return NextResponse.json({ error: "No autorizado." }, { status: 401 });
      }
      const supabase = await createServerClientHelper();
      // SupabaseAuth maneja el cambio de contraseña directamente.
      const { error: updateError } = await supabase.auth.updateUser({
        password: new_password,
      });
      if (updateError) {
        return NextResponse.json(
          { error: "No se pudo actualizar la contraseña." },
          { status: 400 }
        );
      }
      void logAudit({
        userId: user.id,
        action: "password_changed",
        ipAddress: ip,
      });
      return NextResponse.json({ ok: true });
    }

    // ─── Modo Prisma/SQLite ──────────────────────────────────────────
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    // Verificar contraseña actual
    const valid = await bcrypt.compare(current_password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "La contraseña actual es incorrecta." },
        { status: 401 }
      );
    }

    // Hashear y guardar la nueva contraseña
    const newHash = await bcrypt.hash(new_password, 10);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    void logAudit({
      userId: user.id,
      action: "password_changed",
      ipAddress: ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[change-password] error", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
