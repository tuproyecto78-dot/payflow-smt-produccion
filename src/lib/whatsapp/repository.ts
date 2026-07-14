import "server-only";

import { createServiceRoleClient } from "@/lib/supabase";

export interface ConversationRef {
  contactId: string;
  conversationId: string;
  currentStep: string;
  context: Record<string, string>;
}

export async function validateConversationOwnership(input: {
  clientId: string;
  conversationId: string;
  contactId: string;
}) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("id", input.conversationId)
    .eq("client_id", input.clientId)
    .eq("contact_id", input.contactId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("La conversación no pertenece al cliente autenticado.");
}

export async function resolveWhatsAppClientId(phoneNumberId?: string | null): Promise<string | null> {
  if (phoneNumberId) {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("whatsapp_connections")
      .select("client_id")
      .eq("phone_number_id", phoneNumberId)
      .eq("status", "active")
      .maybeSingle();
    if (data?.client_id) return String(data.client_id);
  }
  return process.env.WHATSAPP_CLIENT_ID?.trim() || null;
}

export async function ensureConversation(input: {
  clientId: string;
  externalContactId: string;
  displayName?: string | null;
}): Promise<ConversationRef> {
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .upsert(
      {
        client_id: input.clientId,
        channel: "whatsapp",
        external_id: input.externalContactId,
        display_name: input.displayName || null,
        last_seen_at: now,
      },
      { onConflict: "client_id,channel,external_id" }
    )
    .select("id")
    .single();
  if (contactError || !contact) throw contactError || new Error("Unable to persist WhatsApp contact.");

  const { data: existing, error: findError } = await supabase
    .from("conversations")
    .select("id, current_step, context")
    .eq("client_id", input.clientId)
    .eq("contact_id", contact.id)
    .in("status", ["open", "waiting", "human_handoff"])
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    await supabase
      .from("conversations")
      .update({ last_message_at: now })
      .eq("id", existing.id);
    return {
      contactId: String(contact.id),
      conversationId: String(existing.id),
      currentStep: String(existing.current_step || "greeting"),
      context: (existing.context as Record<string, string>) || {},
    };
  }

  const { data: created, error: createError } = await supabase
    .from("conversations")
    .insert({
      client_id: input.clientId,
      contact_id: contact.id,
      channel: "whatsapp",
      status: "open",
      current_step: "greeting",
      context: input.displayName ? { customer_name: input.displayName } : {},
      last_message_at: now,
    })
    .select("id, current_step, context")
    .single();
  if (createError || !created) throw createError || new Error("Unable to create WhatsApp conversation.");
  return {
    contactId: String(contact.id),
    conversationId: String(created.id),
    currentStep: String(created.current_step || "greeting"),
    context: (created.context as Record<string, string>) || {},
  };
}

export async function recordInboundMessage(input: {
  clientId: string;
  conversation: ConversationRef;
  providerMessageId: string;
  messageType: string;
  messageText: string;
  timestamp?: string | null;
}): Promise<{ duplicate: boolean; id: string | null }> {
  const supabase = createServiceRoleClient();
  const occurredAt = input.timestamp && /^\d+$/.test(input.timestamp)
    ? new Date(Number(input.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const { data, error } = await supabase
    .from("messages")
    .upsert(
      {
        client_id: input.clientId,
        conversation_id: input.conversation.conversationId,
        contact_id: input.conversation.contactId,
        provider: "meta",
        provider_message_id: input.providerMessageId,
        direction: "inbound",
        message_type: input.messageType || "text",
        status: "received",
        content_preview: input.messageText.slice(0, 160),
        received_at: occurredAt,
      },
      { onConflict: "provider,provider_message_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return { duplicate: !data, id: data?.id ? String(data.id) : null };
}

export async function updateConversationState(input: {
  conversationId: string;
  currentStep: string;
  context: Record<string, string>;
}) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("conversations")
    .update({
      current_step: input.currentStep,
      context: input.context,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", input.conversationId);
  if (error) throw error;
}

export async function recordMessageStatus(input: {
  providerMessageId: string;
  status: string;
  timestamp?: string | null;
  rawEvent: unknown;
}) {
  const allowed = new Set(["sent", "delivered", "read", "failed"]);
  if (!allowed.has(input.status)) return;
  const supabase = createServiceRoleClient();
  const { data: message } = await supabase
    .from("messages")
    .select("id, client_id, status")
    .eq("provider", "meta")
    .eq("provider_message_id", input.providerMessageId)
    .maybeSingle();
  if (!message) return;

  const occurredAt = input.timestamp && /^\d+$/.test(input.timestamp)
    ? new Date(Number(input.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const timestampColumn = `${input.status}_at`;
  const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 3 };
  const currentRank = rank[String(message.status || "queued")] ?? 0;
  const incomingRank = rank[input.status] ?? 0;
  if (incomingRank >= currentRank) {
    await supabase
      .from("messages")
      .update({ status: input.status, [timestampColumn]: occurredAt })
      .eq("id", message.id);
  }
  await supabase.from("message_status_events").upsert(
    {
      client_id: message.client_id,
      message_id: message.id,
      provider_event_id: `${input.providerMessageId}:${input.status}:${input.timestamp || "now"}`,
      status: input.status,
      occurred_at: occurredAt,
      raw_event: input.rawEvent,
    },
    { onConflict: "provider_event_id,status", ignoreDuplicates: true }
  );
}

export async function recordOutboundMessage(input: {
  clientId: string;
  conversationId: string;
  contactId: string;
  providerMessageId: string;
  messageText: string;
  status: "sent" | "failed";
}) {
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("messages")
    .upsert(
      {
        client_id: input.clientId,
        conversation_id: input.conversationId,
        contact_id: input.contactId,
        provider: "meta",
        provider_message_id: input.providerMessageId,
        direction: "outbound",
        message_type: "text",
        status: input.status,
        content_preview: input.messageText.slice(0, 160),
        sent_at: input.status === "sent" ? now : null,
        failed_at: input.status === "failed" ? now : null,
      },
      { onConflict: "provider,provider_message_id" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}
