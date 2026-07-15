import "server-only";

import { randomUUID } from "node:crypto";
import {
  ensureConversation,
  recordOutboundMessage,
  resolveWhatsAppPhoneNumberId,
  validateConversationOwnership,
} from "@/lib/whatsapp/repository";

export async function sendWhatsAppMessage(input: {
  clientId: string;
  phoneNumber: string;
  messageText: string;
  conversationId?: string | null;
  contactId?: string | null;
  template?: {
    name: string;
    languageCode: string;
    bodyParameters: string[];
  } | null;
}) {
  if (input.conversationId && input.contactId) {
    await validateConversationOwnership({
      clientId: input.clientId,
      conversationId: input.conversationId,
      contactId: input.contactId,
    });
  }
  const conversation = input.conversationId && input.contactId
    ? { conversationId: input.conversationId, contactId: input.contactId }
    : await ensureConversation({
        clientId: input.clientId,
        externalContactId: input.phoneNumber,
      });

  const provider = process.env.WHATSAPP_PROVIDER || "mock";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    (await resolveWhatsAppPhoneNumberId(input.clientId).catch(() => null)) ||
    process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v20.0";
  let providerMessageId = `failed_${randomUUID()}`;
  let status: "sent" | "failed" = "failed";
  let providerError: string | null = null;

  if (provider === "meta" && accessToken && phoneNumberId) {
    try {
      const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.phoneNumber.replace(/\D/g, ""),
          ...(input.template
            ? {
                type: "template",
                template: {
                  name: input.template.name,
                  language: { code: input.template.languageCode },
                  components: [{
                    type: "body",
                    parameters: input.template.bodyParameters.map((text) => ({ type: "text", text })),
                  }],
                },
              }
            : { type: "text", text: { body: input.messageText } }),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.messages?.[0]?.id) {
        providerMessageId = String(data.messages[0].id);
        status = "sent";
      } else {
        providerError = `Meta HTTP ${response.status}`;
      }
    } catch (error) {
      providerError = error instanceof Error ? error.message : "Meta request failed";
    }
  } else if (process.env.NODE_ENV !== "production" && process.env.WHATSAPP_ALLOW_MOCK === "true") {
    providerMessageId = `mock_${randomUUID()}`;
    status = "sent";
  } else {
    providerError = "WhatsApp Business no está configurado.";
  }

  const id = await recordOutboundMessage({
    clientId: input.clientId,
    conversationId: conversation.conversationId,
    contactId: conversation.contactId,
    providerMessageId,
    messageText: input.messageText,
    status,
  });
  return { id, providerMessageId, status, providerError };
}
