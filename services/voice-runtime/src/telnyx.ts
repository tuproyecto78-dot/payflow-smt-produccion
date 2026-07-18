import { createPublicKey, verify } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { RuntimeConfig } from "./config.js";
import { PayFlowClient, type RoutingIdentity, type VoiceContext } from "./payflow.js";

type TelnyxEvent = {
  data?: {
    id?: string;
    event_type?: string;
    occurred_at?: string;
    payload?: Record<string, unknown>;
  };
};

type TelnyxSession = {
  route: RoutingIdentity;
  context: VoiceContext;
  providerCallId: string;
  conversationId: string;
};

type TelnyxActionResponse = {
  data?: {
    result?: string;
    conversation_id?: string;
  };
};

const sessions = new Map<string, TelnyxSession>();

function header(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

export function verifyTelnyxWebhook(rawBody: string, headers: IncomingHttpHeaders, config: RuntimeConfig) {
  if (!config.TELNYX_VALIDATE_SIGNATURES) return true;
  const signature = header(headers, "telnyx-signature-ed25519");
  const timestamp = header(headers, "telnyx-timestamp");
  if (!signature || !timestamp || !config.TELNYX_PUBLIC_KEY) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  try {
    const publicKeyBytes = Buffer.from(config.TELNYX_PUBLIC_KEY, "base64");
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicKeyBytes]);
    const publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
    return verify(
      null,
      Buffer.from(`${timestamp}|${rawBody}`),
      publicKey,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

async function telnyxAction(
  config: RuntimeConfig,
  callControlId: string,
  action: string,
  body: Record<string, unknown> = {},
): Promise<TelnyxActionResponse> {
  if (!config.TELNYX_API_KEY) throw new Error("TELNYX_API_KEY_MISSING");
  const response = await fetch(`https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/${action}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.TELNYX_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => ({})) as TelnyxActionResponse & Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`TELNYX_${action}_${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

function stringValue(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberValue(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function availableCatalog(context: VoiceContext) {
  if (!context.agent.actions.catalog) return [];
  return (context.catalog?.products || [])
    .filter((product) => product.available)
    .slice(0, 100)
    .map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description || "",
      price: product.price,
      currency: product.currency,
    }));
}

function systemPrompt(context: VoiceContext) {
  const products = availableCatalog(context);
  return [
    `Eres ${context.agent.name}, asistente virtual de voz de ${context.business.name}.`,
    "Atiendes exclusivamente llamadas entrantes. Nunca inicies llamadas, no transfieras la llamada y no prometas devolverla.",
    "Conversa de forma cálida, natural y humana, con frases breves. Haz una sola pregunta a la vez y permite que la persona te interrumpa.",
    "Detecta el idioma del cliente y responde en ese mismo idioma. El idioma predeterminado es español de Ecuador; también puedes continuar en inglés, portugués u otro idioma compatible.",
    "No finjas ser una persona. Si te preguntan, responde con naturalidad que eres el asistente virtual del negocio.",
    "Escucha primero. Responde preguntas, explica promociones pertinentes y ayuda a construir un pedido o reserva sin recitar todo el catálogo.",
    "Nunca inventes productos, precios, disponibilidad, horarios, promociones ni políticas. Usa únicamente el contexto autorizado del negocio.",
    "Confirma cantidades, variantes, dirección o retiro y el total antes de cerrar un pedido.",
    "No solicites números completos de tarjeta, CVV, claves ni códigos. El cobro se realiza mediante un enlace seguro enviado por PayFlow.",
    "No afirmes que un pedido, reserva o pago fue registrado si una herramienta autorizada no lo confirmó.",
    context.agent.instructions,
    products.length > 0
      ? `Catálogo publicado y disponible en JSON: ${JSON.stringify(products)}`
      : "No hay un catálogo publicado disponible. No inventes productos ni precios.",
  ].filter(Boolean).join("\n");
}

function transcriptFromPayload(payload: Record<string, unknown>) {
  const raw = payload.message_history || payload.messages;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((message) => {
    if (!message || typeof message !== "object") return [];
    const row = message as Record<string, unknown>;
    const text = typeof row.content === "string" ? row.content.trim() : "";
    if (!text) return [];
    const role = String(row.role || "system");
    const speaker = role === "user" ? "customer" : role === "assistant" ? "agent" : "system";
    return [{ speaker, text }];
  }).slice(-1000);
}

function summaryFromPayload(payload: Record<string, unknown>) {
  const direct = stringValue(payload, "summary", "conversation_summary", "call_summary");
  if (direct) return direct.slice(0, 2000);
  const insights = payload.insights || payload.result;
  if (typeof insights === "string") return insights.slice(0, 2000);
  if (insights && typeof insights === "object") return JSON.stringify(insights).slice(0, 2000);
  return "";
}

function scheduleSessionCleanup(callControlId: string) {
  const timer = setTimeout(() => sessions.delete(callControlId), 10 * 60_000);
  timer.unref();
}

async function startAssistant(
  config: RuntimeConfig,
  callControlId: string,
  eventId: string,
  context: VoiceContext,
) {
  if (!config.TELNYX_ASSISTANT_ID) throw new Error("TELNYX_ASSISTANT_ID_MISSING");
  const assistant: Record<string, unknown> = {
    id: config.TELNYX_ASSISTANT_ID,
    instructions: systemPrompt(context),
    greeting: context.agent.greeting,
    // An empty tool list prevents a template from dialing or transferring.
    // PayFlow tools for orders/payments are attached separately after validation.
    tools: [],
  };
  if (config.TELNYX_VOICE) assistant.voice = config.TELNYX_VOICE;

  return telnyxAction(config, callControlId, "ai_assistant_start", {
    assistant,
    send_message_history_updates: true,
    command_id: `payflow-${eventId}`.slice(0, 120),
  });
}

export async function handleTelnyxWebhook(input: {
  rawBody: string;
  headers: IncomingHttpHeaders;
  config: RuntimeConfig;
  payflow: PayFlowClient;
}) {
  if (!verifyTelnyxWebhook(input.rawBody, input.headers, input.config)) {
    return { status: 401, body: { error: "Firma Telnyx inválida" } };
  }

  let event: TelnyxEvent;
  try {
    event = JSON.parse(input.rawBody || "{}") as TelnyxEvent;
  } catch {
    return { status: 400, body: { error: "Webhook Telnyx inválido" } };
  }

  const data = event.data;
  const payload = data?.payload || {};
  const eventType = String(data?.event_type || "");
  const eventId = String(data?.id || `${eventType}:${Date.now()}`);
  const callControlId = stringValue(payload, "call_control_id");
  const callLegId = stringValue(payload, "call_leg_id", "call_session_id") || callControlId;

  if (!eventType || !callControlId) return { status: 400, body: { error: "Webhook Telnyx incompleto" } };

  if (eventType === "call.initiated") {
    const direction = stringValue(payload, "direction").toLowerCase();
    if (direction && !["incoming", "inbound"].includes(direction)) {
      return { status: 200, body: { status: "ignored_outbound" } };
    }
    if (!input.config.TELNYX_API_KEY || !input.config.TELNYX_ASSISTANT_ID) {
      return { status: 503, body: { error: "Telnyx no está completamente configurado" } };
    }
    if (sessions.has(callControlId)) return { status: 200, body: { status: "duplicate_initiated" } };

    const route: RoutingIdentity = {
      providerPhoneId: stringValue(payload, "connection_id"),
      businessPhone: stringValue(payload, "to"),
      callerPhone: stringValue(payload, "from"),
    };
    const context = await input.payflow.getContext(route, "telnyx");
    sessions.set(callControlId, { route, context, providerCallId: callLegId, conversationId: "" });
    await telnyxAction(input.config, callControlId, "answer", {
      command_id: `payflow-answer-${eventId}`.slice(0, 120),
    });
    await input.payflow.event({
      idempotencyKey: `telnyx:${eventId}`,
      eventType: "call.started",
      providerCallId: callLegId,
      route,
      provider: "telnyx",
      occurredAt: data?.occurred_at,
      data: { status: "ringing" },
    }).catch((error) => console.error("[telnyx] no se pudo registrar inicio", error));
    return { status: 200, body: { status: "answering" } };
  }

  const session = sessions.get(callControlId);
  if (!session) return { status: 200, body: { status: "session_not_found", event_type: eventType } };

  if (eventType === "call.answered") {
    const response = await startAssistant(input.config, callControlId, eventId, session.context);
    session.conversationId = String(response.data?.conversation_id || "");
    await input.payflow.event({
      idempotencyKey: `telnyx:${eventId}`,
      eventType: "call.updated",
      providerCallId: session.providerCallId,
      route: session.route,
      provider: "telnyx",
      occurredAt: data?.occurred_at,
      data: { status: "in_progress", answeredAt: data?.occurred_at },
    }).catch((error) => console.error("[telnyx] no se pudo registrar respuesta", error));
    return { status: 200, body: { status: "assistant_started", conversation_id: session.conversationId } };
  }

  if (eventType.includes("message_history_updated")) {
    const transcript = transcriptFromPayload(payload);
    if (transcript.length > 0) {
      await input.payflow.event({
        idempotencyKey: `telnyx:${eventId}`,
        eventType: "call.updated",
        providerCallId: session.providerCallId,
        route: session.route,
        provider: "telnyx",
        occurredAt: data?.occurred_at,
        data: { transcript },
      }).catch((error) => console.error("[telnyx] no se pudo guardar transcripción", error));
    }
    return { status: 200, body: { status: "conversation_updated" } };
  }

  if (eventType === "call.conversation_insights.generated") {
    const summary = summaryFromPayload(payload);
    const transcript = transcriptFromPayload(payload);
    await input.payflow.event({
      idempotencyKey: `telnyx:${eventId}`,
      eventType: "call.updated",
      providerCallId: session.providerCallId,
      route: session.route,
      provider: "telnyx",
      occurredAt: data?.occurred_at,
      data: {
        ...(summary ? { summary } : {}),
        ...(transcript.length > 0 ? { transcript } : {}),
      },
    }).catch((error) => console.error("[telnyx] no se pudieron guardar insights", error));
    return { status: 200, body: { status: "insights_saved" } };
  }

  if (eventType === "call.conversation.ended") {
    const durationSeconds = Math.max(0, Math.round(numberValue(payload, "duration_sec", "duration_seconds")));
    await input.payflow.event({
      idempotencyKey: `telnyx:${eventId}`,
      eventType: "call.updated",
      providerCallId: session.providerCallId,
      route: session.route,
      provider: "telnyx",
      occurredAt: data?.occurred_at,
      data: {
        ...(durationSeconds > 0 ? { durationSeconds } : {}),
        outcome: "information",
      },
    }).catch((error) => console.error("[telnyx] no se pudo registrar fin de conversación", error));
    return { status: 200, body: { status: "conversation_ended" } };
  }

  if (eventType === "call.hangup") {
    const durationSeconds = Math.max(0, Math.round(
      numberValue(payload, "duration_sec", "duration_seconds") || numberValue(payload, "duration_millis") / 1000,
    ));
    await input.payflow.event({
      idempotencyKey: `telnyx:${eventId}`,
      eventType: "call.completed",
      providerCallId: session.providerCallId,
      route: session.route,
      provider: "telnyx",
      occurredAt: data?.occurred_at,
      data: {
        status: "completed",
        ...(durationSeconds > 0 ? { durationSeconds } : {}),
        notes: stringValue(payload, "hangup_cause", "hangup_source"),
      },
    }).catch((error) => console.error("[telnyx] no se pudo registrar cierre", error));
    scheduleSessionCleanup(callControlId);
    return { status: 200, body: { status: "call_ended" } };
  }

  return { status: 200, body: { status: "event_received", event_type: eventType } };
}

export function telnyxActiveSessions() {
  return sessions.size;
}
