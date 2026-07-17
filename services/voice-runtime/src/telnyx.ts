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

type ConversationMessage = { role: "system" | "user" | "assistant"; content: string };

type TelnyxSession = {
  route: RoutingIdentity;
  context: VoiceContext;
  messages: ConversationMessage[];
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

async function telnyxAction(config: RuntimeConfig, callControlId: string, action: string, body: Record<string, unknown> = {}) {
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
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`TELNYX_${action}_${response.status}: ${text.slice(0, 300)}`);
  }
}

function availableCatalog(context: VoiceContext) {
  return (context.catalog?.products || [])
    .filter((product) => product.available)
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
    `Eres ${context.agent.name}, la persona encargada de atender llamadas de ${context.business.name}.`,
    "Habla en español natural, cálido y profesional. No digas que eres una IA salvo que te lo pregunten directamente.",
    "Tu prioridad es escuchar, responder preguntas, tomar pedidos y recomendar promociones o complementos de forma pertinente, nunca recitar todo el menú.",
    "Responde en frases breves porque estás en una llamada. Confirma cantidades, variantes, dirección o retiro y el total antes de cerrar.",
    "No solicites ni proceses números de tarjeta por voz. Cuando el pedido esté confirmado, indica que enviarás un enlace seguro de pago.",
    context.agent.instructions,
    `Catálogo disponible en JSON: ${JSON.stringify(products)}`,
  ].filter(Boolean).join("\n");
}

async function llmReply(config: RuntimeConfig, messages: ConversationMessage[]) {
  const response = await fetch(`${config.LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.LLM_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.LLM_MODEL,
      messages,
      temperature: 0.55,
      max_tokens: 180,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(`LLM_${response.status}: ${String(json.error?.message || "Error")}`);
  return String(json.choices?.[0]?.message?.content || "Lo siento, ¿puede repetirlo?").trim();
}

async function speak(config: RuntimeConfig, callControlId: string, text: string) {
  await telnyxAction(config, callControlId, "speak", {
    payload: text,
    voice: config.TELNYX_VOICE,
    language_code: config.TELNYX_LANGUAGE,
  });
}

async function listen(config: RuntimeConfig, callControlId: string) {
  await telnyxAction(config, callControlId, "gather", {
    input_type: "speech",
    language_code: config.TELNYX_LANGUAGE,
    end_silence_timeout_secs: 1.5,
    timeout_secs: 20,
  });
}

function stringValue(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
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

  const event = JSON.parse(input.rawBody || "{}") as TelnyxEvent;
  const data = event.data;
  const payload = data?.payload || {};
  const eventType = String(data?.event_type || "");
  const eventId = String(data?.id || `${eventType}:${Date.now()}`);
  const callControlId = stringValue(payload, "call_control_id");
  const callLegId = stringValue(payload, "call_leg_id", "call_session_id") || callControlId;

  if (!eventType || !callControlId) return { status: 400, body: { error: "Webhook Telnyx incompleto" } };

  if (eventType === "call.initiated") {
    const direction = stringValue(payload, "direction");
    if (direction && direction !== "incoming") return { status: 200, body: { status: "ignored_outbound" } };

    const route: RoutingIdentity = {
      providerPhoneId: stringValue(payload, "connection_id"),
      businessPhone: stringValue(payload, "to"),
      callerPhone: stringValue(payload, "from"),
    };
    const context = await input.payflow.getContext(route, "telnyx");
    sessions.set(callControlId, {
      route,
      context,
      messages: [{ role: "system", content: systemPrompt(context) }],
    });
    await telnyxAction(input.config, callControlId, "answer");
    await input.payflow.event({
      idempotencyKey: `telnyx:${eventId}`,
      eventType: "call.started",
      providerCallId: callLegId,
      route,
      provider: "telnyx",
      occurredAt: data?.occurred_at,
    }).catch((error) => console.error("[telnyx] no se pudo registrar inicio", error));
    return { status: 200, body: { status: "answering" } };
  }

  const session = sessions.get(callControlId);
  if (!session) return { status: 200, body: { status: "session_not_found", event_type: eventType } };

  if (eventType === "call.answered") {
    await speak(input.config, callControlId, session.context.agent.greeting);
    return { status: 200, body: { status: "greeting" } };
  }

  if (eventType === "call.speak.ended") {
    await listen(input.config, callControlId);
    return { status: 200, body: { status: "listening" } };
  }

  if (eventType === "call.gather.ended") {
    const speechPayload = payload.speech;
    const speech = typeof speechPayload === "object" && speechPayload
      ? stringValue(speechPayload as Record<string, unknown>, "result", "transcript")
      : stringValue(payload, "speech", "transcript");

    if (!speech) {
      await speak(input.config, callControlId, "Disculpe, no alcancé a escucharle. ¿Puede repetirlo?");
      return { status: 200, body: { status: "reprompting" } };
    }

    session.messages.push({ role: "user", content: speech });
    const answer = await llmReply(input.config, session.messages);
    session.messages.push({ role: "assistant", content: answer });
    if (session.messages.length > 25) session.messages = [session.messages[0], ...session.messages.slice(-24)];
    await speak(input.config, callControlId, answer);
    return { status: 200, body: { status: "responding", response: answer } };
  }

  if (eventType === "call.hangup") {
    sessions.delete(callControlId);
    await input.payflow.event({
      idempotencyKey: `telnyx:${eventId}`,
      eventType: "call.completed",
      providerCallId: callLegId,
      route: session.route,
      provider: "telnyx",
      occurredAt: data?.occurred_at,
      data: { hangupCause: stringValue(payload, "hangup_cause", "hangup_source") },
    }).catch((error) => console.error("[telnyx] no se pudo registrar cierre", error));
    return { status: 200, body: { status: "call_ended" } };
  }

  return { status: 200, body: { status: "event_received", event_type: eventType } };
}

export function telnyxActiveSessions() {
  return sessions.size;
}
