import "server-only";

import {
  ManualLinkPaymentAdapter,
  PayPhonePresentationAdapter,
  PaymentAdapterRegistry,
} from "./adapters";
import { ExternalPaymentError } from "./domain";
import { ExternalPaymentOrchestrationService } from "./service";
import { SupabaseExternalPaymentRepository } from "./supabase-repository";

function realChargesEnabled(): boolean {
  return process.env.EXTERNAL_PAYMENTS_REAL_CHARGES_ENABLED === "true";
}

export function assertExternalPaymentOrchestratorEnabled(): void {
  if (process.env.EXTERNAL_PAYMENTS_ENABLED !== "true") {
    throw new ExternalPaymentError(
      "PAYMENT_ORCHESTRATOR_DISABLED",
      "El orquestador de pagos no está habilitado.",
      503
    );
  }
  if (realChargesEnabled()) {
    throw new ExternalPaymentError(
      "REAL_CHARGES_DISABLED",
      "Los cobros reales están prohibidos en esta fase.",
      503
    );
  }
}

function payPhoneMode(): "sandbox" | "presentation" {
  const mode = process.env.PAYPHONE_ADAPTER_MODE;
  if (mode === "sandbox" || mode === "presentation") return mode;
  return "presentation";
}

export function externalPaymentPublicBaseUrl(request: Request): string {
  const configured = String(
    process.env.EXTERNAL_PAYMENTS_PUBLIC_BASE_URL || ""
  ).trim();
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function createExternalPaymentService() {
  assertExternalPaymentOrchestratorEnabled();
  return new ExternalPaymentOrchestrationService(
    new SupabaseExternalPaymentRepository(),
    new PaymentAdapterRegistry([
      new ManualLinkPaymentAdapter(),
      new PayPhonePresentationAdapter({
        enabled: process.env.PAYPHONE_ADAPTER_ENABLED === "true",
        mode: payPhoneMode(),
        realChargesEnabled: realChargesEnabled(),
      }),
    ])
  );
}

export function externalPaymentErrorResponse(error: unknown): Response {
  if (error instanceof ExternalPaymentError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        real_charge: false,
      },
      { status: error.httpStatus }
    );
  }
  console.error("[external-payments] unexpected error");
  return Response.json(
    {
      error: "No se pudo procesar la operación de pagos.",
      code: "EXTERNAL_PAYMENT_ERROR",
      real_charge: false,
    },
    { status: 500 }
  );
}
