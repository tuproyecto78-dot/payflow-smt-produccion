import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import { isAdmin } from "@/lib/roles";
import { createServiceRoleClient } from "@/lib/supabase";
import type {
  VoiceAgent,
  VoiceBusiness,
  VoiceCall,
  VoiceDashboardData,
  VoiceModuleSettings,
  VoiceReservation,
} from "@/lib/voice/types";
import type { z } from "zod";
import type { voiceSettingsSchema } from "@/lib/voice/validation";
import type { voiceRuntimeEventSchema } from "@/lib/voice/validation";
import type { voiceProvisioningSchema } from "@/lib/voice/validation";

type VoiceSettingsInput = z.infer<typeof voiceSettingsSchema>;
type VoiceRuntimeEvent = z.infer<typeof voiceRuntimeEventSchema>;
type VoiceProvisioningInput = z.infer<typeof voiceProvisioningSchema>;

function requestedClientId(request: Request) {
  return new URL(request.url).searchParams.get("clientId")?.trim() || null;
}

export function resolveVoiceClientId(session: AuthenticatedUser, request: Request) {
  if (session.clientId) return session.clientId;
  return isInternalAccessRole(session.role) ? requestedClientId(request) : null;
}

export async function listVoiceBusinesses(session: AuthenticatedUser): Promise<VoiceBusiness[]> {
  if (!isInternalAccessRole(session.role)) return [];
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("client_accounts")
    .select("id, business_name, status")
    .order("business_name", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: String(row.id),
    businessName: String(row.business_name || "Negocio"),
    status: String(row.status || "active"),
  }));
}

function defaultAgent(): VoiceAgent {
  return {
    id: null,
    name: "Asistente de voz",
    language: "es-EC",
    voiceId: "neutral-female-1",
    greeting: "Hola, gracias por llamar. ¿En qué puedo ayudarte?",
    instructions: "Atiende con claridad, confirma los datos antes de crear pedidos, reservas o cobros y transfiere a una persona cuando no estés seguro.",
    useCatalog: true,
    canCreateOrders: true,
    canCreateReservations: true,
    canCreatePaymentLinks: true,
    canAnswerFaq: true,
    active: false,
  };
}

function mapSettings(row: Record<string, unknown>): VoiceModuleSettings {
  return {
    clientId: String(row.client_id),
    activationStatus: row.activation_status as VoiceModuleSettings["activationStatus"],
    provider: row.provider as VoiceModuleSettings["provider"],
    businessPhone: String(row.business_phone || ""),
    routingPhone: String(row.routing_phone || ""),
    providerPhoneId: String(row.provider_phone_id || ""),
    sipDomain: String(row.sip_domain || ""),
    timezone: String(row.timezone || "America/Guayaquil"),
    defaultPaymentProvider: row.default_payment_provider as VoiceModuleSettings["defaultPaymentProvider"],
    whatsappConfirmationsEnabled: row.whatsapp_confirmations_enabled !== false,
    humanTransferEnabled: row.human_transfer_enabled === true,
    humanTransferPhone: String(row.human_transfer_phone || ""),
    recordingEnabled: row.recording_enabled === true,
    retentionDays: Number(row.retention_days || 30),
  };
}

function mapAgent(row: Record<string, unknown> | null): VoiceAgent {
  if (!row) return defaultAgent();
  return {
    id: String(row.id),
    name: String(row.name || "Asistente de voz"),
    language: String(row.language || "es-EC"),
    voiceId: String(row.voice_id || "neutral-female-1"),
    greeting: String(row.greeting || ""),
    instructions: String(row.instructions || ""),
    useCatalog: row.use_catalog !== false,
    canCreateOrders: row.can_create_orders !== false,
    canCreateReservations: row.can_create_reservations !== false,
    canCreatePaymentLinks: row.can_create_payment_links !== false,
    canAnswerFaq: row.can_answer_faq !== false,
    active: row.active === true,
  };
}

function mapCall(row: Record<string, unknown>): VoiceCall {
  return {
    id: String(row.id),
    providerCallId: String(row.provider_call_id || ""),
    callerPhone: String(row.caller_phone || "Número privado"),
    businessPhone: String(row.business_phone || ""),
    status: String(row.status || "queued"),
    outcome: String(row.outcome || "unknown"),
    startedAt: row.started_at ? String(row.started_at) : null,
    endedAt: row.ended_at ? String(row.ended_at) : null,
    durationSeconds: Number(row.duration_seconds || 0),
    summary: String(row.summary || ""),
    transcript: Array.isArray(row.transcript) ? row.transcript as VoiceCall["transcript"] : [],
    orderId: row.order_id ? String(row.order_id) : null,
    paymentTransactionId: row.payment_transaction_id ? String(row.payment_transaction_id) : null,
  };
}

function mapReservation(row: Record<string, unknown>): VoiceReservation {
  return {
    id: String(row.id),
    customerName: String(row.customer_name || ""),
    customerPhone: String(row.customer_phone || ""),
    serviceName: String(row.service_name || ""),
    partySize: row.party_size == null ? null : Number(row.party_size),
    scheduledAt: String(row.scheduled_at || ""),
    status: String(row.status || "pending"),
    notes: String(row.notes || ""),
  };
}

export async function getVoiceDashboard(input: {
  session: AuthenticatedUser;
  clientId: string | null;
}): Promise<VoiceDashboardData> {
  const businesses = await listVoiceBusinesses(input.session);
  if (!input.clientId) {
    return {
      settings: null,
      agent: defaultAgent(),
      calls: [],
      reservations: [],
      integrations: { catalog: false, whatsapp: false, payphone: false, stripe: false },
      metrics: { callsToday: 0, minutesThisMonth: 0, completedCalls: 0, convertedCalls: 0 },
      businesses,
      selectedClientId: null,
      requiresBusinessSelection: isInternalAccessRole(input.session.role),
      canProvision: isAdmin({ role: input.session.role }),
    };
  }
  if (isInternalAccessRole(input.session.role) && !businesses.some((business) => business.id === input.clientId)) {
    throw new Error("BUSINESS_NOT_FOUND");
  }

  const supabase = createServiceRoleClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [settingsResult, agentResult, callsResult, reservationsResult, productsResult, whatsappResult] = await Promise.all([
    supabase.from("voice_module_settings").select("*").eq("client_id", input.clientId).maybeSingle(),
    supabase.from("voice_agents").select("*").eq("client_id", input.clientId).maybeSingle(),
    supabase.from("voice_calls").select("*").eq("client_id", input.clientId).order("created_at", { ascending: false }).limit(100),
    supabase.from("voice_reservations").select("*").eq("client_id", input.clientId).order("scheduled_at", { ascending: false }).limit(100),
    supabase.from("catalog_products").select("id", { count: "exact", head: true }).eq("client_id", input.clientId).eq("active", true),
    supabase.from("whatsapp_connections").select("id").eq("client_id", input.clientId).eq("status", "active").limit(1).maybeSingle(),
  ]);
  const firstError = settingsResult.error || agentResult.error || callsResult.error || reservationsResult.error;
  if (firstError) throw firstError;

  const calls = (callsResult.data || []).map((row) => mapCall(row));
  const today = new Date().toISOString().slice(0, 10);
  const monthCalls = calls.filter((call) => call.startedAt && new Date(call.startedAt) >= monthStart);
  const convertedOutcomes = new Set(["order", "reservation", "payment"]);

  return {
    settings: settingsResult.data ? mapSettings(settingsResult.data) : null,
    agent: mapAgent(agentResult.data),
    calls,
    reservations: (reservationsResult.data || []).map((row) => mapReservation(row)),
    integrations: {
      catalog: (productsResult.count || 0) > 0,
      whatsapp: Boolean(whatsappResult.data),
      payphone: Boolean(process.env.PAYPHONE_PRODUCTION_TOKEN || process.env.PAYPHONE_SANDBOX_TOKEN),
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    },
    metrics: {
      callsToday: calls.filter((call) => call.startedAt?.slice(0, 10) === today).length,
      minutesThisMonth: Math.round(monthCalls.reduce((sum, call) => sum + call.durationSeconds, 0) / 60),
      completedCalls: calls.filter((call) => call.status === "completed").length,
      convertedCalls: calls.filter((call) => convertedOutcomes.has(call.outcome)).length,
    },
    businesses,
    selectedClientId: input.clientId,
    requiresBusinessSelection: false,
    canProvision: isAdmin({ role: input.session.role }),
  };
}

export async function requestVoiceActivation(input: {
  session: AuthenticatedUser;
  clientId: string;
}) {
  const supabase = createServiceRoleClient();
  const current = await supabase
    .from("voice_module_settings")
    .select("*")
    .eq("client_id", input.clientId)
    .maybeSingle();
  if (current.error) throw current.error;
  if (current.data && ["requested", "provisioning", "active"].includes(String(current.data.activation_status))) {
    return mapSettings(current.data);
  }
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase.from("voice_module_settings").upsert({
    client_id: input.clientId,
    activation_status: "requested",
    requested_at: timestamp,
  }, { onConflict: "client_id" }).select("*").single();
  if (error) throw error;
  const { error: agentError } = await supabase.from("voice_agents").upsert({
    client_id: input.clientId,
    active: false,
  }, { onConflict: "client_id", ignoreDuplicates: true });
  if (agentError) throw agentError;
  await supabase.from("audit_logs").insert({
    user_id: input.session.userId,
    action: "voice_module_activation_requested",
    entity_type: "voice_module",
    entity_id: input.clientId,
    metadata: { client_id: input.clientId },
  });
  return mapSettings(data);
}

export async function saveVoiceSettings(input: {
  session: AuthenticatedUser;
  clientId: string;
  values: VoiceSettingsInput;
}) {
  const supabase = createServiceRoleClient();
  const technicalFields = isAdmin({ role: input.session.role }) ? {
    provider: input.values.provider,
    routing_phone: input.values.routingPhone || null,
    provider_phone_id: input.values.providerPhoneId || null,
    sip_domain: input.values.sipDomain || null,
  } : {};
  const settingsResult = await supabase.from("voice_module_settings").upsert({
    client_id: input.clientId,
    business_phone: input.values.businessPhone || null,
    ...technicalFields,
    timezone: input.values.timezone,
    default_payment_provider: input.values.defaultPaymentProvider,
    whatsapp_confirmations_enabled: input.values.whatsappConfirmationsEnabled,
    human_transfer_enabled: input.values.humanTransferEnabled,
    human_transfer_phone: input.values.humanTransferPhone || null,
    recording_enabled: input.values.recordingEnabled,
    retention_days: input.values.retentionDays,
  }, { onConflict: "client_id" }).select("*").single();
  if (settingsResult.error) throw settingsResult.error;

  const agentResult = await supabase.from("voice_agents").upsert({
    client_id: input.clientId,
    name: input.values.agent.name,
    language: input.values.agent.language,
    voice_id: input.values.agent.voiceId,
    greeting: input.values.agent.greeting,
    instructions: input.values.agent.instructions,
    use_catalog: input.values.agent.useCatalog,
    can_create_orders: input.values.agent.canCreateOrders,
    can_create_reservations: input.values.agent.canCreateReservations,
    can_create_payment_links: input.values.agent.canCreatePaymentLinks,
    can_answer_faq: input.values.agent.canAnswerFaq,
  }, { onConflict: "client_id" }).select("*").single();
  if (agentResult.error) throw agentResult.error;

  await supabase.from("audit_logs").insert({
    user_id: input.session.userId,
    action: "voice_module_settings_updated",
    entity_type: "voice_module",
    entity_id: input.clientId,
    metadata: { client_id: input.clientId, provider: input.values.provider },
  });
  return { settings: mapSettings(settingsResult.data), agent: mapAgent(agentResult.data) };
}

export async function provisionVoiceModule(input: {
  session: AuthenticatedUser;
  clientId: string;
  values: VoiceProvisioningInput;
}) {
  const supabase = createServiceRoleClient();
  const activated = input.values.activationStatus === "active";
  const { data, error } = await supabase.from("voice_module_settings").upsert({
    client_id: input.clientId,
    activation_status: input.values.activationStatus,
    provider: input.values.provider,
    business_phone: input.values.businessPhone || null,
    routing_phone: input.values.routingPhone || null,
    provider_phone_id: input.values.providerPhoneId || null,
    sip_domain: input.values.sipDomain || null,
    activated_at: activated ? new Date().toISOString() : null,
  }, { onConflict: "client_id" }).select("*").single();
  if (error) throw error;
  const { error: agentError } = await supabase.from("voice_agents").upsert({
    client_id: input.clientId,
    active: activated,
  }, { onConflict: "client_id" });
  if (agentError) throw agentError;
  await supabase.from("audit_logs").insert({
    user_id: input.session.userId,
    action: `voice_module_${input.values.activationStatus}`,
    entity_type: "voice_module",
    entity_id: input.clientId,
    metadata: {
      client_id: input.clientId,
      provider: input.values.provider,
      activation_status: input.values.activationStatus,
    },
  });
  return mapSettings(data);
}

async function resolveRuntimeClient(event: VoiceRuntimeEvent) {
  const supabase = createServiceRoleClient();
  const keys: Array<["provider_phone_id" | "routing_phone" | "business_phone", string]> = [
    ["provider_phone_id", event.providerPhoneId],
    ["routing_phone", event.businessPhone],
    ["business_phone", event.businessPhone],
  ];
  for (const [column, value] of keys) {
    if (!value) continue;
    const { data, error } = await supabase
      .from("voice_module_settings")
      .select("client_id, activation_status")
      .eq("provider", event.provider)
      .eq(column, value)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      if (!["active", "provisioning"].includes(String(data.activation_status))) throw new Error("VOICE_MODULE_INACTIVE");
      return String(data.client_id);
    }
  }
  throw new Error("VOICE_CONNECTION_NOT_FOUND");
}

export async function getVoiceRuntimeContext(input: {
  provider: VoiceRuntimeEvent["provider"];
  providerPhoneId: string;
  businessPhone: string;
}) {
  const clientId = await resolveRuntimeClient({
    idempotencyKey: "context-request",
    eventType: "call.updated",
    providerCallId: "context-request",
    callerPhone: "",
    occurredAt: undefined,
    data: {},
    ...input,
  });
  const supabase = createServiceRoleClient();
  const [businessResult, settingsResult, agentResult, catalogResult] = await Promise.all([
    supabase.from("client_accounts").select("business_name").eq("id", clientId).single(),
    supabase.from("voice_module_settings").select("*").eq("client_id", clientId).single(),
    supabase.from("voice_agents").select("*").eq("client_id", clientId).eq("active", true).single(),
    supabase.from("catalogs").select("id, business_name, currency").eq("client_id", clientId).eq("status", "published").maybeSingle(),
  ]);
  const firstError = businessResult.error || settingsResult.error || agentResult.error;
  if (firstError) throw firstError;

  let categories: Array<Record<string, unknown>> = [];
  let products: Array<Record<string, unknown>> = [];
  if (catalogResult.data) {
    const [categoriesResult, productsResult] = await Promise.all([
      supabase.from("catalog_categories")
        .select("id, name, description, sort_order")
        .eq("catalog_id", catalogResult.data.id)
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase.from("catalog_products")
        .select("id, category_id, name, description, sku, price, currency, stock, track_inventory, metadata")
        .eq("catalog_id", catalogResult.data.id)
        .eq("active", true)
        .order("name", { ascending: true }),
    ]);
    if (categoriesResult.error) throw categoriesResult.error;
    if (productsResult.error) throw productsResult.error;
    categories = categoriesResult.data || [];
    products = (productsResult.data || []).map((product) => ({
      ...product,
      available: product.track_inventory === false || Number(product.stock || 0) > 0,
    }));
  }

  const settings = mapSettings(settingsResult.data);
  const agent = mapAgent(agentResult.data);
  return {
    clientId,
    business: {
      name: String(businessResult.data.business_name || catalogResult.data?.business_name || "Negocio"),
      timezone: settings.timezone,
      businessPhone: settings.businessPhone,
    },
    agent: {
      name: agent.name,
      language: agent.language,
      voiceId: agent.voiceId,
      greeting: agent.greeting,
      instructions: agent.instructions,
      actions: {
        catalog: agent.useCatalog,
        orders: agent.canCreateOrders,
        reservations: agent.canCreateReservations,
        payments: agent.canCreatePaymentLinks,
        faq: agent.canAnswerFaq,
        humanTransfer: settings.humanTransferEnabled,
      },
    },
    catalog: catalogResult.data ? {
      currency: String(catalogResult.data.currency || "USD"),
      categories,
      products,
    } : null,
    operation: {
      defaultPaymentProvider: settings.defaultPaymentProvider,
      whatsappConfirmationsEnabled: settings.whatsappConfirmationsEnabled,
      humanTransferPhone: settings.humanTransferEnabled ? settings.humanTransferPhone : "",
      recordingEnabled: settings.recordingEnabled,
    },
  };
}

export async function processVoiceRuntimeEvent(event: VoiceRuntimeEvent) {
  const supabase = createServiceRoleClient();
  const clientId = await resolveRuntimeClient(event);
  const { data: duplicate, error: duplicateError } = await supabase
    .from("voice_call_events")
    .select("id")
    .eq("idempotency_key", event.idempotencyKey)
    .maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) return { ok: true, duplicate: true, clientId };

  if (["order.created", "reservation.created", "payment.linked"].includes(event.eventType)) {
    const { data: permissions, error: permissionsError } = await supabase
      .from("voice_agents")
      .select("active, can_create_orders, can_create_reservations, can_create_payment_links")
      .eq("client_id", clientId)
      .single();
    if (permissionsError) throw permissionsError;
    const permitted = permissions.active === true && (
      (event.eventType === "order.created" && permissions.can_create_orders === true) ||
      (event.eventType === "reservation.created" && permissions.can_create_reservations === true) ||
      (event.eventType === "payment.linked" && permissions.can_create_payment_links === true)
    );
    if (!permitted) throw new Error("VOICE_ACTION_NOT_ALLOWED");
  }

  const callPatch: Record<string, unknown> = {
    client_id: clientId,
    provider: event.provider,
    provider_call_id: event.providerCallId,
    caller_phone: event.callerPhone || null,
    business_phone: event.businessPhone || null,
  };
  const fieldMap: Record<string, string> = {
    status: "status",
    outcome: "outcome",
    startedAt: "started_at",
    answeredAt: "answered_at",
    endedAt: "ended_at",
    durationSeconds: "duration_seconds",
    summary: "summary",
    transcript: "transcript",
    paymentTransactionId: "payment_transaction_id",
  };
  for (const [inputKey, dbKey] of Object.entries(fieldMap)) {
    const value = event.data[inputKey as keyof typeof event.data];
    if (value !== undefined) callPatch[dbKey] = value;
  }
  if (event.eventType === "call.started") {
    callPatch.status = event.data.status || "in_progress";
    callPatch.started_at = event.data.startedAt || event.occurredAt || new Date().toISOString();
  }
  if (event.eventType === "call.completed") {
    callPatch.status = event.data.status || "completed";
    callPatch.ended_at = event.data.endedAt || event.occurredAt || new Date().toISOString();
  }

  const { data: call, error: callError } = await supabase
    .from("voice_calls")
    .upsert(callPatch, { onConflict: "provider,provider_call_id" })
    .select("id, order_id")
    .single();
  if (callError) throw callError;
  let actionResult: Record<string, unknown> = {};

  if (event.eventType === "order.created") {
    if (!event.data.customerName || !event.data.items?.length) throw new Error("INVALID_VOICE_ORDER");
    const { data: catalog, error: catalogError } = await supabase
      .from("catalogs")
      .select("slug")
      .eq("client_id", clientId)
      .eq("status", "published")
      .single();
    if (catalogError) throw catalogError;
    const { data: orderRows, error: orderError } = await supabase.rpc("create_voice_catalog_order", {
      p_catalog_slug: catalog.slug,
      p_customer_name: event.data.customerName,
      p_customer_phone: event.data.customerPhone || event.callerPhone || "",
      p_customer_email: event.data.customerEmail || "",
      p_notes: event.data.notes || "Pedido tomado por el agente de voz.",
      p_source_key: `voice:${event.provider}:${event.providerCallId}`,
      p_items: event.data.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
    });
    if (orderError) throw orderError;
    const order = Array.isArray(orderRows) ? orderRows[0] : orderRows;
    await supabase.from("voice_calls").update({ order_id: order?.order_id, outcome: "order" }).eq("id", call.id);
    actionResult = { order };
  }

  if (event.eventType === "reservation.created") {
    if (!event.data.customerName || !event.data.scheduledAt) throw new Error("INVALID_VOICE_RESERVATION");
    const { data: reservation, error: reservationError } = await supabase
      .from("voice_reservations")
      .upsert({
        client_id: clientId,
        call_id: call.id,
        customer_name: event.data.customerName,
        customer_phone: event.data.customerPhone || event.callerPhone || null,
        service_name: event.data.serviceName || null,
        party_size: event.data.partySize || null,
        scheduled_at: event.data.scheduledAt,
        notes: event.data.notes || null,
        source_key: `voice:${event.provider}:${event.providerCallId}:reservation`,
      }, { onConflict: "source_key" })
      .select("id, status, scheduled_at")
      .single();
    if (reservationError) throw reservationError;
    await supabase.from("voice_calls").update({ outcome: "reservation" }).eq("id", call.id);
    actionResult = { reservation };
  }

  if (event.eventType === "payment.linked") {
    if (!event.data.paymentTransactionId) throw new Error("INVALID_VOICE_PAYMENT");
    await supabase.from("voice_calls").update({
      payment_transaction_id: event.data.paymentTransactionId,
      outcome: "payment",
    }).eq("id", call.id);
    if (call.order_id) {
      await supabase.from("catalog_orders").update({
        payment_transaction_id: event.data.paymentTransactionId || null,
        // Never accept a terminal payment state from the AI/runtime. Official
        // Stripe or PayPhone webhooks own those transitions.
        payment_status: "pending",
      }).eq("id", call.order_id).eq("client_id", clientId);
    }
  }

  const { error: eventError } = await supabase.from("voice_call_events").insert({
    client_id: clientId,
    call_id: call.id,
    event_type: event.eventType,
    idempotency_key: event.idempotencyKey,
    payload: event,
    occurred_at: event.occurredAt || new Date().toISOString(),
  });
  if (eventError && eventError.code !== "23505") throw eventError;
  return { ok: true, duplicate: eventError?.code === "23505", clientId, callId: call.id, ...actionResult };
}

export function voiceApiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("BUSINESS_NOT_FOUND")) return { status: 404, message: "Negocio no encontrado." };
  if (message.includes("VOICE_CONNECTION_NOT_FOUND")) return { status: 404, message: "No existe una conexión de voz para ese número." };
  if (message.includes("VOICE_MODULE_INACTIVE")) return { status: 403, message: "El módulo de voz no está activo para este negocio." };
  if (message.includes("VOICE_ACTION_NOT_ALLOWED")) return { status: 403, message: "La acción no está habilitada para este agente." };
  if (message.includes("VOICE_PROVISIONING_INCOMPLETE")) return { status: 400, message: "Completa el número y el enrutamiento antes de activar." };
  if (message.includes("INVALID_VOICE_ORDER") || message.includes("INVALID_VOICE_RESERVATION")) return { status: 400, message: "El evento de voz no contiene todos los datos requeridos." };
  if (message.includes("INVALID_VOICE_PAYMENT")) return { status: 400, message: "Falta la transacción de pago vinculada." };
  if (message.includes("voice_module_settings") || message.includes("voice_agents") || message.includes("voice_calls")) {
    return { status: 503, message: "El módulo de Llamadas IA aún no está instalado en la base de datos." };
  }
  return { status: 503, message: "No se pudo cargar el módulo de Llamadas IA." };
}
