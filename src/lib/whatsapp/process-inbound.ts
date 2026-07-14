import "server-only";

import { runSubscriptionAgent, type SubscriptionAgentStep } from "@/lib/subscription-agent";
import { createServiceRoleClient } from "@/lib/supabase";
import {
  ensureConversation,
  recordInboundMessage,
  updateConversationState,
} from "@/lib/whatsapp/repository";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-message";

export async function processInboundMessage(input: {
  clientId: string;
  phoneNumber: string;
  messageText: string;
  messageId: string;
  timestamp?: string | null;
  messageType?: string;
  customerName?: string | null;
}) {
  const conversation = await ensureConversation({
    clientId: input.clientId,
    externalContactId: input.phoneNumber,
    displayName: input.customerName,
  });
  const persisted = await recordInboundMessage({
    clientId: input.clientId,
    conversation,
    providerMessageId: input.messageId,
    messageType: input.messageType || "text",
    messageText: input.messageText,
    timestamp: input.timestamp,
  });
  if (persisted.duplicate) return { ok: true, duplicate: true, conversationId: conversation.conversationId };

  const result = runSubscriptionAgent({
    message: input.messageText,
    data: conversation.context,
    step: conversation.currentStep as SubscriptionAgentStep,
  });
  await updateConversationState({
    conversationId: conversation.conversationId,
    currentStep: result.step,
    context: result.data as Record<string, string>,
  });

  let subscriptionRequestId: string | null = null;
  if (result.ready_to_create && result.confirmed) {
    const d = result.data;
    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from("subscription_requests")
      .select("id")
      .eq("email", d.email || "")
      .in("subscription_status", ["pending_review", "activated"])
      .limit(1)
      .maybeSingle();

    if (existing) {
      subscriptionRequestId = String(existing.id);
    } else {
      const { data: created, error } = await supabase
        .from("subscription_requests")
        .insert({
          selected_plan: d.selected_plan || "trimestral",
          full_name: d.full_name || "Cliente WhatsApp",
          country_code: d.country_code || "593",
          phone_number: d.phone_number || input.phoneNumber,
          email: d.email || "",
          document_id: d.document_id || "pendiente",
          business_name: d.business_name || "Negocio",
          business_type: d.business_type || null,
          country: d.country || null,
          city: d.city || null,
          payment_provider: (d.payment_provider || "payphone").toLowerCase(),
          payphone_business_status: d.has_payphone_business === "Sí" ? "configured" : "not_configured",
          has_payphone_business: d.has_payphone_business || "no",
          consent_accepted: true,
          consent_accepted_at: new Date().toISOString(),
          subscription_status: "pending_review",
        })
        .select("id")
        .single();
      if (error) throw error;
      subscriptionRequestId = String(created.id);
    }
  }

  const outbound = await sendWhatsAppMessage({
    clientId: input.clientId,
    phoneNumber: input.phoneNumber,
    messageText: result.reply,
    conversationId: conversation.conversationId,
    contactId: conversation.contactId,
  });

  return {
    ok: outbound.status === "sent",
    duplicate: false,
    conversationId: conversation.conversationId,
    step: result.step,
    subscriptionRequestId,
    outboundStatus: outbound.status,
  };
}
