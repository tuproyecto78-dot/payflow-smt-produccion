import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import {
  recordWhatsAppAudit,
  resolveWhatsAppApiContext,
  whatsappApiError,
} from "@/lib/whatsapp/access";
import { listWhatsAppPhoneNumbers, manageWhatsAppPhoneNumber } from "@/lib/whatsapp/management-api";

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: new URL(req.url).searchParams.get("clientId"),
      requireWaba: true,
    });
    return NextResponse.json({ phone_numbers: await listWhatsAppPhoneNumbers(context.config) });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudieron consultar los números de WhatsApp.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

const base = {
  client_id: z.string().trim().min(1).max(100).optional(),
  phone_number_id: z.string().trim().min(1).max(100).optional(),
  confirm: z.literal(true),
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("register"), pin: z.string().regex(/^\d{6}$/) }),
  z.object({ ...base, action: z.literal("deregister") }),
  z.object({
    ...base,
    action: z.literal("request_code"),
    code_method: z.enum(["SMS", "VOICE"]),
    locale: z.string().trim().min(2).max(10),
  }),
  z.object({ ...base, action: z.literal("verify_code"), code: z.string().regex(/^\d{4,8}$/) }),
  z.object({ ...base, action: z.literal("set_pin"), pin: z.string().regex(/^\d{6}$/) }),
]);

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-phone-write:${session.userId}:${getClientIP(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Operación de número inválida." }, { status: 400 });
  }
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
      permission: "super_admin",
      requireWaba: true,
    });
    const phoneNumberId = parsed.data.phone_number_id || context.connection.phoneNumberId;
    const phones = await listWhatsAppPhoneNumbers(context.config);
    if (!phones.some((phone) => String(phone.id || "") === phoneNumberId)) {
      return NextResponse.json({ error: "El número no pertenece al WABA de este negocio." }, { status: 403 });
    }
    const result = await manageWhatsAppPhoneNumber({
      config: context.config,
      phoneNumberId,
      action: parsed.data.action,
      ...(parsed.data.action === "register" || parsed.data.action === "set_pin" ? { pin: parsed.data.pin } : {}),
      ...(parsed.data.action === "verify_code" ? { code: parsed.data.code } : {}),
      ...(parsed.data.action === "request_code" ? {
        codeMethod: parsed.data.code_method,
        language: parsed.data.locale,
      } : {}),
    });
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: `whatsapp_phone_${parsed.data.action}`,
      entityType: "whatsapp_phone_number",
      entityId: phoneNumberId,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo completar la operación sobre el número.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export const dynamic = "force-dynamic";
