import "server-only";

import { randomUUID } from "node:crypto";
import {
  ensureConversation,
  recordOutboundMessage,
  resolveWhatsAppConnection,
  validateConversationOwnership,
} from "@/lib/whatsapp/repository";
import {
  getWhatsAppApiVersion,
  sendWhatsAppCloudAction,
  type WhatsAppOutboundAction,
  WhatsAppCloudError,
  whatsappActionPreview,
} from "@/lib/whatsapp/cloud-api";
import { listWhatsAppFlows } from "@/lib/whatsapp/management-api";

export async function sendWhatsAppMessage(input: {
  clientId: string;
  phoneNumber: string;
  messageText?: string;
  conversationId?: string | null;
  contactId?: string | null;
  action?: WhatsAppOutboundAction;
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
  const connection = await resolveWhatsAppConnection(input.clientId).catch(() => null);
  const action: WhatsAppOutboundAction = input.action || (input.template
    ? {
        type: "template",
        name: input.template.name,
        languageCode: input.template.languageCode,
        bodyParameters: input.template.bodyParameters,
      }
    : { type: "text", text: input.messageText || "" });
  const messagePreview = (input.messageText || whatsappActionPreview(action)).slice(0, 4000);
  let providerMessageId = `failed_${randomUUID()}`;
  let status: "sent" | "failed" = "failed";
  let providerError: string | null = null;

  if (provider === "meta" && accessToken && connection?.phoneNumberId) {
    try {
      if (action.type === "flow") {
        if (!connection.businessAccountId) {
          throw new WhatsAppCloudError("El negocio no tiene WABA ID para validar el Flow.", 409);
        }
        const flows = await listWhatsAppFlows({
          accessToken,
          phoneNumberId: connection.phoneNumberId,
          businessAccountId: connection.businessAccountId,
          apiVersion: getWhatsAppApiVersion(),
        });
        if (!flows.some((flow) => String(flow.id || "") === action.flowId)) {
          throw new WhatsAppCloudError("El Flow no pertenece al negocio emisor.", 403);
        }
      }
      const result = await sendWhatsAppCloudAction(
        {
          accessToken,
          phoneNumberId: connection.phoneNumberId,
          apiVersion: getWhatsAppApiVersion(),
        },
        input.phoneNumber,
        action
      );
      providerMessageId = result.providerMessageId;
      status = "sent";
    } catch (error) {
      providerError = error instanceof WhatsAppCloudError
        ? `${error.message}${error.providerCode ? ` Código ${error.providerCode}.` : ""}`
        : "No se pudo enviar el mensaje por WhatsApp.";
    }
  } else if (process.env.NODE_ENV !== "production" && process.env.WHATSAPP_ALLOW_MOCK === "true") {
    providerMessageId = `mock_${randomUUID()}`;
    status = "sent";
  } else {
    providerError = !connection
      ? "Este negocio no tiene una conexión activa de WhatsApp."
      : "WhatsApp Business no está configurado.";
  }

  const id = await recordOutboundMessage({
    clientId: input.clientId,
    conversationId: conversation.conversationId,
    contactId: conversation.contactId,
    providerMessageId,
    messageText: messagePreview,
    messageType: action.type === "media" ? action.mediaType : action.type,
    status,
  });
  return { id, providerMessageId, status, providerError };
}
