import "server-only";

import { ExternalPaymentError } from "./domain";
import { ExternalPaymentSandboxService } from "./service";
import { SupabaseExternalPaymentRepository } from "./supabase-repository";

export function assertExternalPaymentSandboxEnabled(): void {
  if (
    process.env.EXTERNAL_PAYMENTS_MODE !== "sandbox" ||
    process.env.EXTERNAL_PAYMENTS_SANDBOX_ENABLED !== "true"
  ) {
    throw new ExternalPaymentError(
      "PAYMENT_SANDBOX_DISABLED",
      "Los pagos de prueba no están habilitados.",
      503
    );
  }
}

export function externalPaymentWebhookSecret(): string {
  const secret = process.env.EXTERNAL_PAYMENTS_WEBHOOK_SECRET || "";
  if (secret.length < 32) {
    throw new ExternalPaymentError(
      "PAYMENT_WEBHOOK_SECRET_MISSING",
      "El webhook de pagos de prueba no está configurado.",
      503
    );
  }
  return secret;
}

export function externalPaymentPublicBaseUrl(request: Request): string {
  const configured = String(
    process.env.EXTERNAL_PAYMENTS_PUBLIC_BASE_URL || ""
  ).trim();
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function createExternalPaymentSandboxService() {
  assertExternalPaymentSandboxEnabled();
  return new ExternalPaymentSandboxService(
    new SupabaseExternalPaymentRepository()
  );
}

export function externalPaymentErrorResponse(error: unknown): Response {
  if (error instanceof ExternalPaymentError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.httpStatus }
    );
  }
  console.error(
    "[external-payments] unexpected error",
    error instanceof Error ? error.message : "unknown"
  );
  return Response.json(
    {
      error: "No se pudo procesar la solicitud de pago de prueba.",
      code: "EXTERNAL_PAYMENT_ERROR",
    },
    { status: 500 }
  );
}
