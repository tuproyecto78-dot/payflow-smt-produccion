import type {
  CreateExternalPaymentCommand,
  ExternalPaymentPublicView,
  ExternalPaymentRequest,
  ExternalPaymentStatus,
  ExternalPaymentWebhookEvent,
  NormalizedExternalPaymentCommand,
} from "./types";
import { EXTERNAL_PAYMENT_STATUSES } from "./types";

export class ExternalPaymentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = "ExternalPaymentError";
  }
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== "string") {
    throw new ExternalPaymentError(
      "INVALID_INPUT",
      `${field} es obligatorio.`,
      400
    );
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ExternalPaymentError(
      "INVALID_INPUT",
      `${field} no es válido.`,
      400
    );
  }
  return normalized;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ExternalPaymentError(
      "INVALID_INPUT",
      "El texto enviado no es válido.",
      400
    );
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ExternalPaymentError(
      "INVALID_INPUT",
      "El texto enviado no es válido.",
      400
    );
  }
  return normalized;
}

function normalizeAmount(value: unknown): number {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999.99) {
    throw new ExternalPaymentError(
      "INVALID_AMOUNT",
      "El monto de prueba debe ser mayor a 0.",
      400
    );
  }
  const rounded = Math.round(amount * 100) / 100;
  if (Math.abs(amount - rounded) > Number.EPSILON) {
    throw new ExternalPaymentError(
      "INVALID_AMOUNT",
      "El monto admite máximo dos decimales.",
      400
    );
  }
  return rounded;
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value || "USD")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ExternalPaymentError(
      "INVALID_CURRENCY",
      "La moneda debe usar un código ISO de tres letras.",
      400
    );
  }
  return currency;
}

function normalizeIdempotencyKey(value: unknown): string {
  const key = requiredText(value, "idempotencyKey", 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) {
    throw new ExternalPaymentError(
      "INVALID_IDEMPOTENCY_KEY",
      "idempotencyKey debe tener entre 8 y 120 caracteres seguros.",
      400
    );
  }
  return key;
}

function requiredUuid(value: unknown, field: string): string {
  const id = requiredText(value, field, 60);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    throw new ExternalPaymentError(
      "INVALID_PAYMENT_ID",
      "La identificación de la solicitud no es válida.",
      400
    );
  }
  return id;
}

function normalizeBaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.origin;
  } catch {
    throw new ExternalPaymentError(
      "INVALID_PUBLIC_BASE_URL",
      "La URL pública del sandbox no es válida.",
      500
    );
  }
}

export function normalizeCreateExternalPayment(
  command: CreateExternalPaymentCommand
): NormalizedExternalPaymentCommand {
  return {
    clientId: requiredText(command.clientId, "clientId", 120),
    createdBy: requiredText(command.createdBy, "createdBy", 120),
    amount: normalizeAmount(command.amount),
    currency: normalizeCurrency(command.currency),
    description:
      optionalText(command.description, 240) || "Solicitud de pago de prueba",
    customerName: optionalText(command.customerName, 120),
    orderReference: requiredText(
      command.orderReference,
      "orderReference",
      120
    ),
    idempotencyKey: normalizeIdempotencyKey(command.idempotencyKey),
    publicBaseUrl: normalizeBaseUrl(command.publicBaseUrl),
  };
}

export function normalizeExternalPaymentStatus(
  value: unknown
): ExternalPaymentStatus {
  if (
    typeof value === "string" &&
    EXTERNAL_PAYMENT_STATUSES.includes(value as ExternalPaymentStatus)
  ) {
    return value as ExternalPaymentStatus;
  }
  throw new ExternalPaymentError(
    "INVALID_STATUS",
    "El estado de pago de prueba no es válido.",
    400
  );
}

export function normalizeWebhookEvent(
  value: unknown
): ExternalPaymentWebhookEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExternalPaymentError(
      "INVALID_WEBHOOK",
      "El evento recibido no es válido.",
      400
    );
  }
  const payload = value as Record<string, unknown>;
  if (payload.provider !== "sandbox") {
    throw new ExternalPaymentError(
      "INVALID_PROVIDER",
      "El proveedor del evento no es válido para este endpoint.",
      400
    );
  }
  const occurredAt = requiredText(payload.occurred_at, "occurred_at", 60);
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new ExternalPaymentError(
      "INVALID_WEBHOOK_DATE",
      "La fecha del evento no es válida.",
      400
    );
  }
  return {
    provider: "sandbox",
    eventId: requiredText(payload.event_id, "event_id", 120),
    paymentRequestId: requiredUuid(
      payload.payment_request_id,
      "payment_request_id"
    ),
    providerReference: requiredText(
      payload.provider_reference,
      "provider_reference",
      160
    ),
    status: normalizeExternalPaymentStatus(payload.status),
    occurredAt: new Date(occurredAt).toISOString(),
    payload,
  };
}

export function isExternalPaymentTransitionAllowed(
  current: ExternalPaymentStatus,
  next: ExternalPaymentStatus
): boolean {
  if (current === next) return true;
  return current === "pending" && next !== "pending";
}

export function assertSameIdempotentRequest(
  existing: ExternalPaymentRequest,
  command: NormalizedExternalPaymentCommand
): void {
  if (
    existing.amount !== command.amount ||
    existing.currency !== command.currency ||
    existing.orderReference !== command.orderReference ||
    existing.description !== command.description ||
    existing.customerName !== command.customerName
  ) {
    throw new ExternalPaymentError(
      "IDEMPOTENCY_CONFLICT",
      "La clave de idempotencia ya pertenece a otra solicitud.",
      409
    );
  }
}

export function externalPaymentCustomerConfirmation(
  request: ExternalPaymentRequest
): string {
  if (request.status === "approved") {
    return `${request.businessName}: pago de prueba aprobado.`;
  }
  if (request.status === "rejected") {
    return `${request.businessName}: el pago de prueba fue rechazado.`;
  }
  return `${request.businessName}: tu pago de prueba está pendiente de confirmación.`;
}

export function toExternalPaymentPublicView(
  request: ExternalPaymentRequest
): ExternalPaymentPublicView {
  return {
    id: request.id,
    orderReference: request.orderReference,
    amount: request.amount,
    currency: request.currency,
    status: request.status,
    provider: "sandbox",
    sandbox: true,
    customerConfirmation: externalPaymentCustomerConfirmation(request),
    paymentLink: request.paymentLink,
    button:
      request.status === "pending"
        ? {
            label: "Abrir pago de prueba",
            url: request.paymentLink,
          }
        : null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}
