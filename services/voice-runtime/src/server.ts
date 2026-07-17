import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import twilio from "twilio";
import { WebSocketServer } from "ws";
import { CallSession } from "./call-session.js";
import { loadConfig } from "./config.js";
import { PayFlowClient } from "./payflow.js";
import { createRoutingToken, verifyRoutingToken } from "./security.js";

const config = loadConfig();
const payflow = new PayFlowClient(config);
const webSocketServer = new WebSocketServer({ noServer: true });

function xml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;",
  }[character] || character));
}

async function bodyText(request: IncomingMessage, maxBytes = 128_000) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, contentType: string, body: string) {
  response.writeHead(status, { "content-type": contentType, "content-length": Buffer.byteLength(body) });
  response.end(body);
}

function requestPublicUrl(request: IncomingMessage, websocket = false) {
  const base = websocket ? config.PUBLIC_BASE_URL.replace(/^http/, "ws") : config.PUBLIC_BASE_URL;
  return new URL(request.url || "/", `${base}/`).toString();
}

function validateTwilio(request: IncomingMessage, params: Record<string, string>, websocket = false) {
  if (!config.TWILIO_VALIDATE_SIGNATURES) return true;
  const signature = String(request.headers["x-twilio-signature"] || "");
  return Boolean(signature) && twilio.validateRequest(
    config.TWILIO_AUTH_TOKEN,
    signature,
    requestPublicUrl(request, websocket),
    params,
  );
}

function relayAttributes(input: { url: string; greeting: string; language: string }) {
  const attributes: Record<string, string> = {
    url: input.url,
    welcomeGreeting: input.greeting,
    language: input.language || config.TWILIO_RELAY_LANGUAGE,
    interruptible: "any",
    preemptible: "true",
    reportInputDuringAgentSpeech: "speech",
    dtmfDetection: "true",
  };
  if (config.TWILIO_RELAY_VOICE) attributes.voice = config.TWILIO_RELAY_VOICE;
  if (config.TWILIO_RELAY_TTS_PROVIDER) attributes.ttsProvider = config.TWILIO_RELAY_TTS_PROVIDER;
  return Object.entries(attributes).map(([key, value]) => `${key}="${xml(value)}"`).join(" ");
}

async function voiceWebhook(request: IncomingMessage, response: ServerResponse) {
  const rawBody = await bodyText(request);
  const form = new URLSearchParams(rawBody);
  const params = Object.fromEntries(form.entries());
  if (!validateTwilio(request, params)) return send(response, 403, "text/plain; charset=utf-8", "Firma Twilio inválida");

  const businessPhone = String(params.To || params.Called || "").trim();
  const callerPhone = String(params.From || params.Caller || "").trim();
  const providerPhoneId = String(params.PhoneNumberSid || "").trim();
  try {
    const context = await payflow.getContext({ providerPhoneId, businessPhone });
    const now = Date.now();
    const token = createRoutingToken({
      providerPhoneId,
      businessPhone,
      callerPhone,
      issuedAt: now,
      expiresAt: now + 10 * 60_000,
      nonce: randomUUID(),
    }, config.VOICE_SESSION_SECRET);
    const socketUrl = new URL("/twilio/conversation-relay", config.PUBLIC_BASE_URL.replace(/^http/, "ws"));
    socketUrl.searchParams.set("token", token);
    const actionUrl = `${config.PUBLIC_BASE_URL}/twilio/connect-action`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Connect action="${xml(actionUrl)}"><ConversationRelay ${relayAttributes({
      url: socketUrl.toString(),
      greeting: context.agent.greeting,
      language: config.TWILIO_RELAY_LANGUAGE,
    })}/></Connect></Response>`;
    return send(response, 200, "text/xml; charset=utf-8", twiml);
  } catch (error) {
    console.error("[voice] no se pudo iniciar", error);
    const twiml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say language=\"es-MX\">Este servicio no está disponible en este momento. Por favor intenta más tarde.</Say><Hangup/></Response>";
    return send(response, 200, "text/xml; charset=utf-8", twiml);
  }
}

async function connectAction(request: IncomingMessage, response: ServerResponse) {
  const rawBody = await bodyText(request);
  const form = new URLSearchParams(rawBody);
  const params = Object.fromEntries(form.entries());
  if (!validateTwilio(request, params)) return send(response, 403, "text/plain; charset=utf-8", "Firma Twilio inválida");
  let transferPhone = "";
  try {
    const handoff = JSON.parse(String(params.HandoffData || "{}")) as Record<string, unknown>;
    if (handoff.reasonCode === "live-agent-handoff") transferPhone = String(handoff.transferPhone || "");
  } catch { /* finalización normal */ }
  const safePhone = /^\+[1-9][0-9]{7,14}$/.test(transferPhone) ? transferPhone : "";
  const twiml = safePhone
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${xml(safePhone)}</Dial></Response>`
    : "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>";
  return send(response, 200, "text/xml; charset=utf-8", twiml);
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url || "/", "http://runtime.local").pathname;
    if (request.method === "GET" && pathname === "/health") {
      return send(response, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, service: "payflow-voice-runtime" }));
    }
    if (request.method === "POST" && pathname === "/twilio/voice") return await voiceWebhook(request, response);
    if (request.method === "POST" && pathname === "/twilio/connect-action") return await connectAction(request, response);
    return send(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "Ruta no encontrada" }));
  } catch (error) {
    console.error("[http]", error);
    return send(response, 500, "application/json; charset=utf-8", JSON.stringify({ error: "Error interno" }));
  }
});

server.on("upgrade", (request, socket, head) => {
  void (async () => {
    try {
      const url = new URL(request.url || "/", "http://runtime.local");
      if (url.pathname !== "/twilio/conversation-relay") throw new Error("UNKNOWN_WS_ROUTE");
      if (!validateTwilio(request, {}, true)) throw new Error("INVALID_TWILIO_WS_SIGNATURE");
      const claims = verifyRoutingToken(String(url.searchParams.get("token") || ""), config.VOICE_SESSION_SECRET);
      const route = {
        providerPhoneId: claims.providerPhoneId,
        businessPhone: claims.businessPhone,
        callerPhone: claims.callerPhone,
      };
      const context = await payflow.getContext(route);
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        const session = new CallSession(webSocket, config, payflow, context, route);
        webSocket.on("message", (message) => session.onMessage(message));
        webSocket.on("close", () => void session.onClose());
        webSocket.on("error", (error) => console.error("[websocket]", error));
      });
    } catch (error) {
      console.error("[upgrade] conexión rechazada", error);
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  })();
});

server.listen(config.PORT, "0.0.0.0", () => {
  console.log(`[voice] PayFlow runtime escuchando en :${config.PORT}`);
});
