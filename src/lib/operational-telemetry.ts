import "server-only";

import { createServiceRoleClient, isSupabaseConfigured } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveClientId(userId: string, provided?: string | null): Promise<string | null> {
  if (provided?.trim()) return provided.trim();
  if (!isSupabaseConfigured || !UUID_PATTERN.test(userId)) return null;
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.client_id ? String(data.client_id) : process.env.WHATSAPP_CLIENT_ID?.trim() || null;
}

export async function recordDurablePayment(input: {
  userId: string;
  clientId?: string | null;
  sourceKey: string;
  clientTransactionId?: string | null;
  workflowId?: string | null;
  workflowRunId?: string | null;
  provider: string;
  providerPaymentId?: string | null;
  orderId?: string | null;
  amount: number;
  currency: string;
  status: string;
  paymentLink?: string | null;
  rawResponse?: unknown;
}) {
  if (!isSupabaseConfigured || !UUID_PATTERN.test(input.userId)) return;
  try {
    const clientId = await resolveClientId(input.userId, input.clientId);
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("payment_transactions").upsert(
      {
        user_id: input.userId,
        client_id: clientId,
        source_key: input.sourceKey,
        client_transaction_id: input.clientTransactionId || null,
        provider: input.provider,
        provider_payment_id: input.providerPaymentId || null,
        order_id: input.orderId || null,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        payment_link: input.paymentLink || null,
        raw_response: input.rawResponse || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_key" }
    );
    if (error) throw error;
  } catch (error) {
    console.error("[telemetry] durable payment write failed", error instanceof Error ? error.message : "unknown");
  }
}

export async function updateDurablePayphonePayment(input: {
  clientTransactionId: string;
  providerPaymentId?: string | null;
  status: string;
  verifiedPayload: unknown;
}) {
  if (!isSupabaseConfigured) return;
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("payment_transactions")
      .update({
        provider_payment_id: input.providerPaymentId || null,
        status: input.status,
        paid_at: input.status === "payment_success" ? new Date().toISOString() : null,
        raw_response: input.verifiedPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("client_transaction_id", input.clientTransactionId);
    if (error) throw error;
  } catch (error) {
    console.error("[telemetry] durable payment update failed", error instanceof Error ? error.message : "unknown");
  }
}

export async function recordWorkflowRunEvent(input: {
  userId: string;
  clientId?: string | null;
  workflowId: string;
  workflowName?: string | null;
  status: string;
  startedAt: Date;
  finishedAt: Date;
}) {
  if (!isSupabaseConfigured || !UUID_PATTERN.test(input.userId)) return;
  try {
    const clientId = await resolveClientId(input.userId, input.clientId);
    if (!clientId) return;
    const durationMs = Math.max(input.finishedAt.getTime() - input.startedAt.getTime(), 0);
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("workflow_run_events").insert({
      client_id: clientId,
      user_id: input.userId,
      workflow_id: input.workflowId,
      workflow_name: input.workflowName || null,
      status: input.status,
      started_at: input.startedAt.toISOString(),
      finished_at: input.finishedAt.toISOString(),
      duration_ms: durationMs,
    });
    if (error) throw error;
  } catch (error) {
    console.error("[telemetry] workflow run write failed", error instanceof Error ? error.message : "unknown");
  }
}
