import type WebSocket from "ws";
import type { RuntimeConfig } from "./config.js";
import { VoiceAgent } from "./agent.js";
import type { PayFlowClient, RoutingIdentity, VoiceContext } from "./payflow.js";

interface SetupMessage {
  type: "setup";
  callSid: string;
  from?: string;
  to?: string;
  forwardedFrom?: string;
}

interface PromptMessage { type: "prompt"; voicePrompt: string; last?: boolean }
interface DtmfMessage { type: "dtmf"; digit: string }
type RelayMessage = SetupMessage | PromptMessage | DtmfMessage | { type: string; [key: string]: unknown };

type TranscriptItem = { speaker: "customer" | "agent" | "system"; text: string; at: string };

export class CallSession {
  private callSid = "";
  private startedAt = new Date();
  private transcript: TranscriptItem[] = [];
  private eventSequence = 0;
  private processing = Promise.resolve();
  private completed = false;
  private outcome: "unknown" | "information" | "order" | "reservation" | "payment" | "transferred" | "abandoned" = "unknown";
  private readonly agent: VoiceAgent;

  constructor(
    private readonly socket: WebSocket,
    private readonly config: RuntimeConfig,
    private readonly payflow: PayFlowClient,
    private readonly context: VoiceContext,
    private readonly route: RoutingIdentity,
  ) {
    this.agent = new VoiceAgent(config, context, (name, args, toolCallId) => this.executeTool(name, args, toolCallId));
  }

  onMessage(raw: WebSocket.RawData) {
    let message: RelayMessage;
    try { message = JSON.parse(raw.toString()) as RelayMessage; }
    catch { return; }
    if (message.type === "setup") {
      this.processing = this.processing
        .then(() => this.onSetup(message as SetupMessage))
        .catch((error) => this.handleTurnError(error));
      return;
    }
    if (message.type === "prompt") {
      const prompt = message as PromptMessage;
      if (prompt.last === false || !prompt.voicePrompt.trim()) return;
      this.processing = this.processing.then(() => this.onPrompt(prompt.voicePrompt.trim())).catch((error) => this.handleTurnError(error));
    }
    if (message.type === "dtmf") {
      const digit = String((message as DtmfMessage).digit || "");
      if (digit) this.processing = this.processing.then(() => this.onPrompt(`El cliente marcó ${digit} en el teclado.`));
    }
  }

  async onClose() {
    await this.processing.catch(() => undefined);
    await this.completeCall().catch((error) => console.error("[voice] no se pudo completar llamada", error));
  }

  private async onSetup(message: SetupMessage) {
    this.callSid = message.callSid;
    this.startedAt = new Date();
    this.route.callerPhone ||= message.from || "";
    this.route.businessPhone ||= message.to || "";
    await this.payflow.event({
      idempotencyKey: this.idempotency("started"),
      eventType: "call.started",
      providerCallId: this.callSid,
      route: this.route,
      data: { status: "in_progress", startedAt: this.startedAt.toISOString(), answeredAt: new Date().toISOString() },
    });
  }

  private async onPrompt(text: string) {
    if (!this.callSid) throw new Error("RELAY_SETUP_MISSING");
    this.transcript.push({ speaker: "customer", text, at: new Date().toISOString() });
    const response = await this.agent.reply(text);
    this.transcript.push({ speaker: "agent", text: response.text, at: new Date().toISOString() });
    this.send({ type: "text", token: response.text, last: true, interruptible: true });
    await this.payflow.event({
      idempotencyKey: this.idempotency("updated"),
      eventType: "call.updated",
      providerCallId: this.callSid,
      route: this.route,
      data: { status: "in_progress", outcome: this.outcome, transcript: this.transcript },
    });
    if (response.transferPhone) {
      this.outcome = "transferred";
      this.send({
        type: "end",
        handoffData: JSON.stringify({
          reasonCode: "live-agent-handoff",
          reason: "Transferencia solicitada por el agente de PayFlow",
          transferPhone: response.transferPhone,
        }),
      });
    }
  }

  private async executeTool(name: string, args: Record<string, unknown>, toolCallId: string) {
    if (name === "create_order") {
      const result = await this.payflow.event({
        idempotencyKey: this.idempotency(`order-${toolCallId}`),
        eventType: "order.created",
        providerCallId: this.callSid,
        route: this.route,
        data: args,
      });
      this.outcome = "order";
      return { value: { ok: true, ...result, instruction: "Confirma el número de pedido y el total devuelto por PayFlow." } };
    }
    if (name === "create_reservation") {
      const result = await this.payflow.event({
        idempotencyKey: this.idempotency(`reservation-${toolCallId}`),
        eventType: "reservation.created",
        providerCallId: this.callSid,
        route: this.route,
        data: args,
      });
      this.outcome = "reservation";
      return { value: { ok: true, ...result, instruction: "Confirma la reserva devuelta por PayFlow." } };
    }
    if (name === "transfer_to_human" && this.context.operation.humanTransferPhone) {
      this.outcome = "transferred";
      return {
        value: { ok: true, instruction: "Informa que vas a transferir la llamada ahora." },
        transferPhone: this.context.operation.humanTransferPhone,
      };
    }
    return { value: { ok: false, error: "Acción no permitida." } };
  }

  private async handleTurnError(error: unknown) {
    console.error("[voice] error de turno", error);
    const text = "Disculpa, tuve un problema al procesar esa solicitud. Intentémoslo nuevamente.";
    this.transcript.push({ speaker: "system", text, at: new Date().toISOString() });
    this.send({ type: "text", token: text, last: true, interruptible: true });
  }

  private async completeCall() {
    if (this.completed || !this.callSid) return;
    this.completed = true;
    const endedAt = new Date();
    const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - this.startedAt.getTime()) / 1000));
    if (this.outcome === "unknown") this.outcome = this.transcript.length ? "information" : "abandoned";
    await this.payflow.event({
      idempotencyKey: this.idempotency("completed"),
      eventType: "call.completed",
      providerCallId: this.callSid,
      route: this.route,
      data: {
        status: "completed",
        outcome: this.outcome,
        endedAt: endedAt.toISOString(),
        durationSeconds,
        transcript: this.transcript,
        summary: `Llamada ${this.outcome}; ${this.transcript.length} intervenciones registradas.`,
      },
    });
  }

  private idempotency(label: string) {
    this.eventSequence += 1;
    return `twilio:${this.callSid || "pending"}:${label}:${this.eventSequence}`.slice(0, 160);
  }

  private send(value: Record<string, unknown>) {
    if (this.socket.readyState === 1) this.socket.send(JSON.stringify(value));
  }
}
