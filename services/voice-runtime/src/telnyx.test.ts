import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeConfig } from "./config.js";
import type { PayFlowClient, VoiceContext } from "./payflow.js";
import { handleTelnyxWebhook } from "./telnyx.js";

const config = {
  TELNYX_API_KEY: "KEY_TEST",
  TELNYX_PUBLIC_KEY: "",
  TELNYX_ASSISTANT_ID: "assistant-payflow-test",
  TELNYX_VALIDATE_SIGNATURES: false,
  TELNYX_VOICE: "",
} as RuntimeConfig;

const voiceContext: VoiceContext = {
  clientId: "business-1",
  business: {
    name: "Restaurante Cuenca",
    timezone: "America/Guayaquil",
    businessPhone: "+593700000000",
  },
  agent: {
    name: "Sofía",
    language: "es-EC",
    voiceId: "natural",
    greeting: "Hola, gracias por llamar a Restaurante Cuenca. ¿En qué puedo ayudarte?",
    instructions: "Menciona las promociones solo cuando sean pertinentes.",
    actions: {
      catalog: true,
      orders: true,
      reservations: false,
      payments: true,
      faq: true,
      humanTransfer: false,
    },
  },
  catalog: {
    currency: "USD",
    categories: [],
    products: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "Almuerzo ejecutivo",
      description: "Incluye sopa y plato fuerte",
      price: 5.5,
      currency: "USD",
      available: true,
    }],
  },
  operation: {
    defaultPaymentProvider: "payphone",
    whatsappConfirmationsEnabled: true,
    humanTransferPhone: "",
    recordingEnabled: false,
  },
};

function webhook(eventType: string, payload: Record<string, unknown>, id: string) {
  return JSON.stringify({
    data: {
      id,
      event_type: eventType,
      occurred_at: "2026-07-17T20:00:00.000Z",
      payload,
    },
  });
}

test("ignora cualquier llamada Telnyx saliente", { concurrency: false }, async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ data: { result: "ok" } }), { status: 200 });
  }) as typeof fetch;

  let contextCount = 0;
  const payflow = {
    getContext: async () => { contextCount += 1; return voiceContext; },
    event: async () => ({}),
  } as unknown as PayFlowClient;

  const result = await handleTelnyxWebhook({
    rawBody: webhook("call.initiated", {
      direction: "outgoing",
      call_control_id: "outbound-call",
      call_leg_id: "outbound-leg",
      connection_id: "connection-1",
      to: "+593999999999",
      from: "+593700000000",
    }, "event-outbound"),
    headers: {},
    config,
    payflow,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { status: "ignored_outbound" });
  assert.equal(contextCount, 0);
  assert.equal(fetchCount, 0);
});

test("resuelve el negocio y adjunta el asistente a una llamada entrante", { concurrency: false }, async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input, init) => {
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    requests.push({ url: String(input), body });
    const responseBody = String(input).endsWith("/ai_assistant_start")
      ? { data: { result: "ok", conversation_id: "conversation-1" } }
      : { data: { result: "ok" } };
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const contexts: Array<{ provider: string; route: Record<string, unknown> }> = [];
  const events: Array<Record<string, unknown>> = [];
  const payflow = {
    getContext: async (route: Record<string, unknown>, provider: string) => {
      contexts.push({ provider, route });
      return voiceContext;
    },
    event: async (event: Record<string, unknown>) => {
      events.push(event);
      return {};
    },
  } as unknown as PayFlowClient;

  const initiated = await handleTelnyxWebhook({
    rawBody: webhook("call.initiated", {
      direction: "incoming",
      call_control_id: "incoming-call",
      call_leg_id: "incoming-leg",
      connection_id: "connection-ecuador",
      to: "+593700000000",
      from: "+593999999999",
    }, "event-initiated"),
    headers: {},
    config,
    payflow,
  });
  assert.equal(initiated.status, 200);
  assert.equal(contexts[0]?.provider, "telnyx");
  assert.deepEqual(contexts[0]?.route, {
    providerPhoneId: "connection-ecuador",
    businessPhone: "+593700000000",
    callerPhone: "+593999999999",
  });
  assert.equal(requests[0]?.url.endsWith("/actions/answer"), true);

  const answered = await handleTelnyxWebhook({
    rawBody: webhook("call.answered", {
      call_control_id: "incoming-call",
      call_leg_id: "incoming-leg",
    }, "event-answered"),
    headers: {},
    config,
    payflow,
  });
  assert.equal(answered.status, 200);
  assert.equal(requests[1]?.url.endsWith("/actions/ai_assistant_start"), true);

  const startBody = requests[1]?.body;
  const assistant = startBody?.assistant as Record<string, unknown>;
  assert.equal(assistant.id, "assistant-payflow-test");
  assert.equal(assistant.greeting, voiceContext.agent.greeting);
  assert.deepEqual(assistant.tools, []);
  assert.match(String(assistant.instructions), /Restaurante Cuenca/);
  assert.match(String(assistant.instructions), /exclusivamente llamadas entrantes/);
  assert.match(String(assistant.instructions), /Detecta el idioma/);
  assert.equal(events.some((event) => event.eventType === "call.started"), true);
  assert.equal(events.some((event) => event.eventType === "call.updated"), true);
});
