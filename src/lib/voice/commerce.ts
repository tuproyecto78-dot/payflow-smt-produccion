import type { AuthenticatedUser } from "@/lib/auth/require-session";
import { createServiceRoleClient } from "@/lib/supabase";
import { getVoiceDashboard } from "@/lib/voice/repository";
import type {
  VoiceCommerceDashboard,
  VoicePaymentMethod,
  VoicePaymentProfile,
  VoicePaymentReference,
  VoicePaymentStatus,
} from "@/lib/voice/commerce-types";

type ProfileInput = {
  id?: string;
  label: string;
  method: VoicePaymentMethod;
  providerLabel?: string | null;
  paymentUrl?: string | null;
  bankName?: string | null;
  accountHolder?: string | null;
  accountType?: string | null;
  accountReferenceMasked?: string | null;
  instructions?: string | null;
  isDefault: boolean;
  active: boolean;
};

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullable = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const maskAccountReference = (value?: string | null) => {
  const normalized = value?.replace(/\s+/g, "").trim();
  if (!normalized) return null;
  const lastFour = normalized.slice(-4);
  return lastFour ? `••••${lastFour}` : null;
};

const mapProfile = (row: Record<string, unknown>): VoicePaymentProfile => ({
  id: String(row.id),
  clientId: String(row.client_id),
  label: String(row.label),
  method: row.method as VoicePaymentMethod,
  providerLabel: row.provider_label ? String(row.provider_label) : null,
  paymentUrl: row.payment_url ? String(row.payment_url) : null,
  bankName: row.bank_name ? String(row.bank_name) : null,
  accountHolder: row.account_holder ? String(row.account_holder) : null,
  accountType: row.account_type ? String(row.account_type) : null,
  accountReferenceMasked: row.account_reference_masked
    ? String(row.account_reference_masked)
    : null,
  instructions: row.instructions ? String(row.instructions) : null,
  isDefault: Boolean(row.is_default),
  active: Boolean(row.active),
});

const mapReference = (row: Record<string, unknown>): VoicePaymentReference => ({
  id: String(row.id),
  clientId: String(row.client_id),
  callId: row.call_id ? String(row.call_id) : null,
  orderId: row.order_id ? String(row.order_id) : null,
  reservationId: row.reservation_id ? String(row.reservation_id) : null,
  profileId: row.profile_id ? String(row.profile_id) : null,
  method: row.method as VoicePaymentMethod,
  providerLabel: row.provider_label ? String(row.provider_label) : null,
  externalReference: row.external_reference ? String(row.external_reference) : null,
  checkoutUrl: row.checkout_url ? String(row.checkout_url) : null,
  amount: numberValue(row.amount),
  currency: String(row.currency ?? "USD"),
  status: row.status as VoicePaymentStatus,
  statusSource: String(row.status_source ?? "manual"),
  proofUrl: row.proof_url ? String(row.proof_url) : null,
  confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
  createdAt: String(row.created_at),
});

async function authorize(session: AuthenticatedUser, clientId: string) {
  await getVoiceDashboard({ session, clientId });
}

export async function getVoiceCommerceDashboard(input: {
  session: AuthenticatedUser;
  clientId: string;
}): Promise<VoiceCommerceDashboard> {
  await authorize(input.session, input.clientId);
  const supabase = createServiceRoleClient();

  const [profilesResult, referencesResult, callsResult, reservationsResult] =
    await Promise.all([
      supabase
        .from("voice_payment_profiles")
        .select("*")
        .eq("client_id", input.clientId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("voice_payment_references")
        .select("*")
        .eq("client_id", input.clientId)
        .order("created_at", { ascending: false })
        .limit(250),
      supabase
        .from("voice_calls")
        .select(
          "id, started_at, customer_phone, customer_name, status, outcome, duration_seconds, order_id, reservation_id, whatsapp_confirmation_status, transferred_to_human, summary, telephony_cost, ai_cost, currency",
        )
        .eq("client_id", input.clientId)
        .order("started_at", { ascending: false })
        .limit(250),
      supabase
        .from("voice_reservations")
        .select("id", { count: "exact", head: true })
        .eq("client_id", input.clientId),
    ]);

  for (const result of [profilesResult, referencesResult, callsResult, reservationsResult]) {
    if (result.error) throw result.error;
  }

  const profiles = (profilesResult.data ?? []).map((row) =>
    mapProfile(row as Record<string, unknown>),
  );
  const references = (referencesResult.data ?? []).map((row) =>
    mapReference(row as Record<string, unknown>),
  );
  const calls = (callsResult.data ?? []) as Array<Record<string, unknown>>;
  const referenceByCall = new Map(
    references.filter((reference) => reference.callId).map((reference) => [reference.callId!, reference]),
  );
  const referenceByOrder = new Map(
    references.filter((reference) => reference.orderId).map((reference) => [reference.orderId!, reference]),
  );

  const traces = calls.map((call) => {
    const callId = String(call.id);
    const orderId = call.order_id ? String(call.order_id) : null;
    const reference = referenceByCall.get(callId) ?? (orderId ? referenceByOrder.get(orderId) : undefined);
    return {
      callId,
      startedAt: String(call.started_at),
      customerPhone: call.customer_phone ? String(call.customer_phone) : null,
      customerName: call.customer_name ? String(call.customer_name) : null,
      callStatus: String(call.status),
      outcome: call.outcome ? String(call.outcome) : null,
      durationSeconds: numberValue(call.duration_seconds),
      orderId,
      reservationId: call.reservation_id ? String(call.reservation_id) : null,
      whatsappStatus: String(call.whatsapp_confirmation_status ?? "not_sent"),
      transferredToHuman: Boolean(call.transferred_to_human),
      summary: call.summary ? String(call.summary) : null,
      paymentReferenceId: reference?.id ?? null,
      paymentMethod: reference?.method ?? null,
      paymentStatus: reference?.status ?? null,
      paymentAmount: reference?.amount ?? null,
      currency: reference?.currency ?? String(call.currency ?? "USD"),
    };
  });

  const answeredStatuses = new Set(["answered", "in_progress", "completed"]);
  const missedStatuses = new Set(["missed", "failed", "no_answer", "busy"]);
  const answeredCalls = calls.filter((call) => answeredStatuses.has(String(call.status))).length;
  const missedCalls = calls.filter(
    (call) => missedStatuses.has(String(call.status)) || String(call.outcome ?? "") === "missed",
  ).length;
  const totalSeconds = calls.reduce((sum, call) => sum + numberValue(call.duration_seconds), 0);
  const orders = new Set(calls.map((call) => call.order_id).filter(Boolean)).size;
  const reservationIds = new Set(calls.map((call) => call.reservation_id).filter(Boolean));
  const reservations = Math.max(reservationIds.size, reservationsResult.count ?? 0);
  const converted = calls.filter(
    (call) =>
      call.order_id ||
      call.reservation_id ||
      ["order_created", "reservation_created"].includes(String(call.outcome ?? "")),
  ).length;
  const paid = references.filter((reference) => reference.status === "paid");
  const pending = references.filter((reference) =>
    ["pending", "proof_received"].includes(reference.status),
  );
  const attributableSales = paid.reduce((sum, reference) => sum + reference.amount, 0);
  const hourCounts = new Map<number, number>();
  for (const call of calls) {
    const hour = new Date(String(call.started_at)).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  const peakHourEntry = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    clientId: input.clientId,
    profiles,
    references,
    traces,
    kpis: {
      totalCalls: calls.length,
      answeredCalls,
      missedCalls,
      minutes: Math.round((totalSeconds / 60) * 10) / 10,
      orders,
      reservations,
      conversionRate: calls.length ? Math.round((converted / calls.length) * 1000) / 10 : 0,
      attributableSales,
      pendingAmount: pending.reduce((sum, reference) => sum + reference.amount, 0),
      paidPayments: paid.length,
      averageTicket: paid.length ? Math.round((attributableSales / paid.length) * 100) / 100 : 0,
      transfers: calls.filter((call) => Boolean(call.transferred_to_human)).length,
      averageDurationSeconds: calls.length ? Math.round(totalSeconds / calls.length) : 0,
      telephonyCost: calls.reduce((sum, call) => sum + numberValue(call.telephony_cost), 0),
      aiCost: calls.reduce((sum, call) => sum + numberValue(call.ai_cost), 0),
      peakHour: peakHourEntry ? `${String(peakHourEntry[0]).padStart(2, "0")}:00` : null,
      currency: references[0]?.currency ?? "USD",
    },
  };
}

export async function saveVoicePaymentProfile(input: {
  session: AuthenticatedUser;
  clientId: string;
  profile: ProfileInput;
}) {
  await authorize(input.session, input.clientId);
  const supabase = createServiceRoleClient();

  if (input.profile.isDefault) {
    const reset = await supabase
      .from("voice_payment_profiles")
      .update({ is_default: false })
      .eq("client_id", input.clientId);
    if (reset.error) throw reset.error;
  }

  const payload = {
    client_id: input.clientId,
    label: input.profile.label.trim(),
    method: input.profile.method,
    provider_label: nullable(input.profile.providerLabel),
    payment_url: nullable(input.profile.paymentUrl),
    bank_name: nullable(input.profile.bankName),
    account_holder: nullable(input.profile.accountHolder),
    account_type: nullable(input.profile.accountType),
    account_reference_masked: maskAccountReference(input.profile.accountReferenceMasked),
    instructions: nullable(input.profile.instructions),
    is_default: input.profile.isDefault,
    active: input.profile.active,
  };

  const query = input.profile.id
    ? supabase
        .from("voice_payment_profiles")
        .update(payload)
        .eq("id", input.profile.id)
        .eq("client_id", input.clientId)
    : supabase.from("voice_payment_profiles").insert({
        ...payload,
        created_by: input.session.userId,
      });

  const result = await query.select("*").single();
  if (result.error) throw result.error;
  return mapProfile(result.data as Record<string, unknown>);
}

export async function updateVoicePaymentReferenceStatus(input: {
  session: AuthenticatedUser;
  clientId: string;
  referenceId: string;
  status: VoicePaymentStatus;
}) {
  await authorize(input.session, input.clientId);
  const supabase = createServiceRoleClient();
  const result = await supabase
    .from("voice_payment_references")
    .update({
      status: input.status,
      status_source: "manual_review",
      confirmed_at: input.status === "paid" ? new Date().toISOString() : null,
      confirmed_by: input.status === "paid" ? input.session.userId : null,
    })
    .eq("id", input.referenceId)
    .eq("client_id", input.clientId)
    .select("*")
    .single();

  if (result.error) throw result.error;
  return mapReference(result.data as Record<string, unknown>);
}
