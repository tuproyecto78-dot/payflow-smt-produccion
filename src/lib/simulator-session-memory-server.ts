import "server-only";

import { withAuditClientId } from "./audit-metadata";
import { createServiceRoleClient } from "./supabase";

export const SIMULATOR_STATE_KEY = "__payflow_simulator_state";

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactText(value: unknown, maxLength: number): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeSimulatorSessionId(value: unknown): string | null {
  const candidate = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(candidate)) return null;
  return candidate;
}

export async function loadSimulatorSessionState(input: {
  userId: string;
  clientId: string;
  workflowId: string;
  sessionId: string;
}): Promise<unknown | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("metadata")
    .eq("user_id", input.userId)
    .eq("action", "simulator_conversation_turn")
    .eq("entity_type", "workflow")
    .eq("entity_id", input.workflowId)
    .contains("metadata", {
      client_id: input.clientId,
      session_id: input.sessionId,
    })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[simulator memory] load failed", error.message);
    return null;
  }

  const metadata = safeRecord(data?.metadata);
  return metadata.state && typeof metadata.state === "object"
    ? metadata.state
    : null;
}

export async function recordSimulatorSessionTurn(input: {
  userId: string;
  clientId: string;
  workflowId: string;
  sessionId: string;
  customerMessage: string;
  businessAnswer: string;
  intent: string;
  state: unknown;
  ipAddress?: string;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const state = safeRecord(input.state);
  const sessionMemory = safeRecord(state.sessionMemory);
  const cart = Array.isArray(state.cart) ? state.cart.slice(0, 60) : [];

  const { error } = await supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: "simulator_conversation_turn",
    entity_type: "workflow",
    entity_id: input.workflowId,
    ip_address: input.ipAddress || null,
    metadata: withAuditClientId(input.clientId, {
      session_id: input.sessionId,
      customer_message: compactText(input.customerMessage, 1000),
      business_answer: compactText(input.businessAnswer, 1000),
      intent: compactText(input.intent, 100),
      cart_item_count: cart.length,
      pending_offering_key: compactText(sessionMemory.pendingOfferingKey, 160) || null,
      last_presented_count: Array.isArray(sessionMemory.lastPresentedOfferingKeys)
        ? sessionMemory.lastPresentedOfferingKeys.length
        : 0,
      intent_counts: safeRecord(sessionMemory.intentCounts),
      state,
      memory_version: 1,
      channel: "simulator",
      whatsapp_sent: false,
      payments_executed: false,
    }),
  });

  if (error) {
    console.error("[simulator memory] record failed", error.message);
  }
}
