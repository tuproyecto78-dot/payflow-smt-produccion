import { randomUUID } from "node:crypto";

import { ExternalPaymentError } from "./domain";
import type {
  BusinessPaymentMethod,
  PreparedExternalPayment,
} from "./types";

export interface PaymentAdapterInput {
  method: BusinessPaymentMethod;
  requestId: string;
  publicBaseUrl: string;
}

export interface PaymentMethodAdapter {
  readonly kind: BusinessPaymentMethod["kind"];
  prepare(input: PaymentAdapterInput): PreparedExternalPayment;
}

export class ManualLinkPaymentAdapter implements PaymentMethodAdapter {
  readonly kind = "manual_link" as const;

  prepare(input: PaymentAdapterInput): PreparedExternalPayment {
    if (
      input.method.kind !== "manual_link" ||
      input.method.mode !== "manual" ||
      !input.method.externalUrl
    ) {
      throw new ExternalPaymentError(
        "INVALID_PAYMENT_METHOD",
        "El método manual no está configurado correctamente.",
        409
      );
    }
    return {
      pathType: "manual_link",
      providerCode: input.method.providerCode,
      providerMode: "manual",
      providerReference: `manual_${randomUUID()}`,
      confirmationMode: "manual",
      paymentLink: input.method.externalUrl,
      realCharge: false,
    };
  }
}

export interface PayPhonePresentationConfig {
  enabled: boolean;
  mode: "sandbox" | "presentation";
  realChargesEnabled: boolean;
}

export class PayPhonePresentationAdapter implements PaymentMethodAdapter {
  readonly kind = "payphone" as const;

  constructor(private readonly config: PayPhonePresentationConfig) {}

  prepare(input: PaymentAdapterInput): PreparedExternalPayment {
    if (!this.config.enabled) {
      throw new ExternalPaymentError(
        "PAYPHONE_ADAPTER_DISABLED",
        "El adaptador PayPhone de prueba no está habilitado.",
        503
      );
    }
    if (this.config.realChargesEnabled) {
      throw new ExternalPaymentError(
        "REAL_CHARGES_DISABLED",
        "Los cobros reales están prohibidos en esta fase.",
        503
      );
    }
    if (
      input.method.kind !== "payphone" ||
      (input.method.mode !== "sandbox" &&
        input.method.mode !== "presentation") ||
      input.method.mode !== this.config.mode
    ) {
      throw new ExternalPaymentError(
        "PAYPHONE_MODE_MISMATCH",
        "El método PayPhone no coincide con el modo seguro configurado.",
        409
      );
    }

    const paymentLink = new URL(
      `/api/integrations/payments/presentation/payphone/${encodeURIComponent(
        input.requestId
      )}`,
      input.publicBaseUrl
    );
    paymentLink.searchParams.set("client_id", input.method.clientId);
    return {
      pathType: "provider_adapter",
      providerCode: "payphone",
      providerMode: input.method.mode,
      providerReference: `payphone_demo_${randomUUID()}`,
      confirmationMode: "presentation",
      paymentLink: paymentLink.toString(),
      realCharge: false,
    };
  }
}

export class PaymentAdapterRegistry {
  private readonly adapters = new Map<
    BusinessPaymentMethod["kind"],
    PaymentMethodAdapter
  >();

  constructor(adapters: PaymentMethodAdapter[]) {
    adapters.forEach((adapter) => this.adapters.set(adapter.kind, adapter));
  }

  resolve(method: BusinessPaymentMethod): PaymentMethodAdapter {
    const adapter = this.adapters.get(method.kind);
    if (!adapter) {
      throw new ExternalPaymentError(
        "PAYMENT_ADAPTER_NOT_FOUND",
        "No existe un adaptador seguro para este método.",
        503
      );
    }
    return adapter;
  }
}
