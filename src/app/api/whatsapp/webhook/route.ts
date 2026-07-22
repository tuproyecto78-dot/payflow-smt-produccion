import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { processInboundMessage } from "@/lib/whatsapp/process-inbound";
import { recordMessageStatus, resolveWhatsAppClientId } from "@/lib/whatsapp/repository";

function inboundPreview(message: any): string {
  const type = String(message?.type || "text");
  if (type === "text") return String(message?.text?.body || "");
  if (type === "button") return String(message?.button?.text || message?.button?.payload || "");
  if (type === "interactive") {
    const reply = message?.interactive?.button_reply || message?.interactive?.list_reply;
    return String(reply?.title || reply?.id || "");
  }
  if (type === "image" || type === "video") return String(message?.[type]?.caption || `[${type}]`);
  if (type === "document") return String(message?.document?.caption || message?.document?.filename || "[document]");
  if (type === "location") {
    const location = message?.location;
    return String(location?.name || location?.address || `${location?.latitude || ""},${location?.longitude || ""}`);
  }
  if (type === "contacts") {
    const names = (message?.contacts || []).map((contact: any) => contact?.name?.formatted_name).filter(Boolean);
    return names.length ? `[contactos] ${names.join(", ")}` : "[contactos]";
  }
  if (type === "reaction") return `[reacción] ${String(message?.reaction?.emoji || "retirada")}`;
  if (["audio", "sticker"].includes(type)) return `[${type}]`;
  return `[${type}]`;
}

function validMetaSignature(rawBody: string, signature: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const allowUnsignedDevelopment =
    process.env.NODE_ENV !== "production" && process.env.WHATSAPP_ALLOW_UNSIGNED_WEBHOOKS === "true";
  if (!validMetaSignature(rawBody, signature) && !allowUnsignedDevelopment) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  after(async () => {
    try {
      for (const entry of body?.entry || []) {
        for (const change of entry?.changes || []) {
          const value = change?.value;
          if (!value) continue;
          const clientId = await resolveWhatsAppClientId(value?.metadata?.phone_number_id);
          if (!clientId) {
            console.error("[whatsapp/webhook] No client mapping for phone_number_id");
            continue;
          }

          const contacts = value?.contacts || [];
          for (const message of value?.messages || []) {
            const phone = String(message?.from || "");
            const text = inboundPreview(message).slice(0, 1000);
            if (!message?.id || !phone || !text) continue;
            const contact = contacts.find((item: any) => String(item?.wa_id || "") === phone) || contacts[0];
            await processInboundMessage({
              clientId,
              phoneNumber: phone,
              messageText: text,
              messageId: String(message.id),
              timestamp: message?.timestamp ? String(message.timestamp) : null,
              messageType: String(message?.type || "text"),
              customerName: contact?.profile?.name || null,
            });
          }

          for (const status of value?.statuses || []) {
            if (!status?.id || !status?.status) continue;
            await recordMessageStatus({
              providerMessageId: String(status.id),
              status: String(status.status),
              timestamp: status?.timestamp ? String(status.timestamp) : null,
              rawEvent: status,
            });
          }
        }
      }
    } catch (error) {
      console.error("[whatsapp/webhook] async processing failed", error instanceof Error ? error.message : "unknown");
    }
  });

  return NextResponse.json({ ok: true, accepted: true }, { status: 200 });
}

export const dynamic = "force-dynamic";
