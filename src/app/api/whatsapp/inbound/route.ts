import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { processInboundMessage } from "@/lib/whatsapp/process-inbound";
import { sanitizeText } from "@/lib/security";

/** Admin/test entry point. Production Meta events use /api/whatsapp/webhook. */
export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = session.clientId || process.env.WHATSAPP_CLIENT_ID?.trim();
  if (!clientId) return NextResponse.json({ error: "No hay un cliente de WhatsApp configurado." }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const phoneNumber = sanitizeText(body.phone_number || "");
  const messageText = sanitizeText(body.message_text || "").slice(0, 1000);
  const messageId = sanitizeText(body.message_id || `manual_${Date.now()}`);
  if (!phoneNumber || !messageText) {
    return NextResponse.json({ error: "phone_number y message_text son obligatorios." }, { status: 400 });
  }

  const result = await processInboundMessage({
    clientId,
    phoneNumber,
    messageText,
    messageId,
    timestamp: body.timestamp ? String(body.timestamp) : null,
    messageType: sanitizeText(body.message_type || "text"),
    customerName: sanitizeText(body.customer_name || "") || null,
  });
  return NextResponse.json(result);
}
export const dynamic = "force-dynamic";
