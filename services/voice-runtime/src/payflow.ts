import type { RuntimeConfig } from "./config.js";
import { sha256Signature } from "./security.js";

export type VoiceProvider = "twilio" | "telnyx";

export interface VoiceContext {
  clientId: string;
  business: { name: string; timezone: string; businessPhone: string };
  agent: {
    name: string;
    language: string;
    voiceId: string;
    greeting: string;
    instructions: string;
    actions: {
      catalog: boolean;
      orders: boolean;
      reservations: boolean;
      payments: boolean;
      faq: boolean;
      humanTransfer: boolean;
    };
  };
  catalog: null | {
    currency: string;
    categories: Array<Record<string, unknown>>;
    products: Array<{
      id: string;
      category_id?: string | null;
      name: string;
      description?: string | null;
      price: number | string;
      currency: string;
      available: boolean;
    }>;
  };
  operation: {
    defaultPaymentProvider: "none" | "payphone" | "stripe";
    whatsappConfirmationsEnabled: boolean;
    humanTransferPhone: string;
    recordingEnabled: boolean;
  };
}

export interface RoutingIdentity {
  providerPhoneId: string;
  businessPhone: string;
  callerPhone: string;
}

export type VoiceEventType =
  | "call.started"
  | "call.updated"
  | "call.completed"
  | "order.created"
  | "reservation.created"
  | "payment.linked";

export class PayFlowClient {
  constructor(private readonly config: RuntimeConfig) {}

  private async signedPost<T>(path: string, value: unknown): Promise<T> {
    const body = JSON.stringify(value);
    const response = await fetch(`${this.config.PAYFLOW_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payflow-signature": sha256Signature(body, this.config.VOICE_RUNTIME_WEBHOOK_SECRET),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const json = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`PAYFLOW_${response.status}: ${String(json.error || "Solicitud rechazada")}`);
    return json as T;
  }

  getContext(route: Pick<RoutingIdentity, "providerPhoneId" | "businessPhone">, provider: VoiceProvider = "twilio") {
    return this.signedPost<VoiceContext>("/api/voice/runtime/context", {
      provider,
      providerPhoneId: route.providerPhoneId,
      businessPhone: route.businessPhone,
    });
  }

  event(input: {
    idempotencyKey: string;
    eventType: VoiceEventType;
    providerCallId: string;
    route: RoutingIdentity;
    provider?: VoiceProvider;
    occurredAt?: string;
    data?: Record<string, unknown>;
  }) {
    return this.signedPost<Record<string, unknown>>("/api/voice/runtime/webhook", {
      idempotencyKey: input.idempotencyKey,
      eventType: input.eventType,
      provider: input.provider || "twilio",
      providerCallId: input.providerCallId,
      providerPhoneId: input.route.providerPhoneId,
      businessPhone: input.route.businessPhone,
      callerPhone: input.route.callerPhone,
      occurredAt: input.occurredAt || new Date().toISOString(),
      data: input.data || {},
    });
  }
}
