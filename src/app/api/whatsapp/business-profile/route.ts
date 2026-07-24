import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import {
  recordWhatsAppAudit,
  resolveWhatsAppApiContext,
  whatsappApiError,
} from "@/lib/whatsapp/access";
import { getWhatsAppBusinessProfile, updateWhatsAppBusinessProfile } from "@/lib/whatsapp/management-api";

const updateSchema = z.object({
  client_id: z.string().trim().min(1).max(100).optional(),
  about: z.string().max(139).optional(),
  address: z.string().max(256).optional(),
  description: z.string().max(512).optional(),
  email: z.union([z.string().email().max(320), z.literal("")]).optional(),
  profile_picture_handle: z.string().max(512).optional(),
  websites: z.array(z.string().url().max(2048)).max(2).optional(),
  vertical: z.string().max(64).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "client_id"), "No hay cambios para guardar.");

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    const requestedClientId = new URL(req.url).searchParams.get("clientId");
    const context = await resolveWhatsAppApiContext({ session, requestedClientId });
    return NextResponse.json({ profile: await getWhatsAppBusinessProfile(context.config) });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo consultar el perfil comercial.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export async function PATCH(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-profile:${session.userId}:${getClientIP(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Perfil inválido." }, { status: 400 });
  }
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
      permission: "manage",
    });
    const { client_id: _clientId, ...profile } = parsed.data;
    const result = await updateWhatsAppBusinessProfile(context.config, profile);
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: "whatsapp_business_profile_updated",
      entityType: "whatsapp_phone_number",
      entityId: context.connection.phoneNumberId,
      metadata: { fields: Object.keys(profile) },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo actualizar el perfil comercial.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export const dynamic = "force-dynamic";
