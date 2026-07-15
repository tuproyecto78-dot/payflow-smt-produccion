import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import { resolveWhatsAppApiContext, whatsappApiError } from "@/lib/whatsapp/access";
import { markWhatsAppMessageRead } from "@/lib/whatsapp/management-api";

const schema = z.object({
  client_id: z.string().trim().min(1).max(100).optional(),
  message_id: z.string().trim().min(1).max(512),
});

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-read:${session.userId}:${getClientIP(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "message_id es obligatorio." }, { status: 400 });
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
    });
    await markWhatsAppMessageRead(context.config, parsed.data.message_id);
    return NextResponse.json({ ok: true, message_id: parsed.data.message_id, status: "read" });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo marcar el mensaje como leído.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export const dynamic = "force-dynamic";

