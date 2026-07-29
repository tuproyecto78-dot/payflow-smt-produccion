import type {
  BusinessPaymentMethod,
  CreateExternalPaymentCommand,
  ExternalPaymentPublicView,
  ExternalPaymentRequest,
  ManualPaymentConfirmationCommand,
  NormalizedExternalPaymentCommand,
  NormalizedManualPaymentConfirmationCommand,
  NormalizedRegisterPaymentMethodCommand,
  PaymentMethodPublicView,
  RegisterPaymentMethodCommand,
} from "./types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,120}$/;
const PROVIDER_ACCOUNT_REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const SENSITIVE_FIELD_PATTERN =
  /(token|secret|api[_-]?key|authorization|credential|password)/i;

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

export function requiredText(
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

export function optionalText(
  value: unknown,
  maxLength: number
): string | null {
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

export function requiredUuid(value: unknown, field: string): string {
  const code =
    field === "client_id" ? "PAYMENT_CLIENT_REQUIRED" : "INVALID_IDENTIFIER";
  if (typeof value !== "string") {
    throw new ExternalPaymentError(
      code,
      `${field} es obligatorio.`,
      400
    );
  }
  const id = value.trim();
  if (!id || id.length > 60 || !UUID_PATTERN.test(id)) {
    throw new ExternalPaymentError(
      code,
      `${field} no es válido.`,
      400
    );
  }
  return id.toLowerCase();
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
      "El monto debe ser mayor a 0.",
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
  const key = requiredText(value, "idempotency_key", 120);
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    throw new ExternalPaymentError(
      "INVALID_IDEMPOTENCY_KEY",
      "idempotency_key debe tener entre 8 y 120 caracteres seguros.",
      400
    );
  }
  return key;
}

function normalizeHttpsUrl(value: unknown): string {
  const raw = requiredText(value, "external_url", 2048);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new ExternalPaymentError(
      "INVALID_PAYMENT_LINK",
      "El enlace del método debe usar HTTPS y no incluir credenciales.",
      400
    );
  }
}

function normalizeBaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.origin;
  } catch {
    throw new ExternalPaymentError(
      "INVALID_PUBLIC_BASE_URL",
      "La URL pública de pagos no es válida.",
      500
    );
  }
}

export function assertNoSensitivePaymentFields(
  value: unknown,
  depth = 0
): void {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => assertNoSensitivePaymentFields(entry, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELD_PATTERN.test(key)) {
      throw new ExternalPaymentError(
        "SENSITIVE_PAYMENT_FIELD",
        "Las credenciales de pago no se aceptan por esta API.",
        400
      );
    }
    assertNoSensitivePaymentFields(entry, depth + 1);
  }
}

export function normalizeRegisterPaymentMethod(
  command: RegisterPaymentMethodCommand
): NormalizedRegisterPaymentMethodCommand {
  const clientId = requiredUuid(command.clientId, "client_id");
  const createdBy = requiredUuid(command.createdBy, "created_by");
  const displayName = requiredText(command.displayName, "display_name", 120);

  if (command.kind === "manual_link") {
    if (command.mode !== undefined && command.mode !== "manual") {
      throw new ExternalPaymentError(
        "INVALID_PAYMENT_METHOD_MODE",
        "El enlace manual debe usar modo manual.",
        400
      );
    }
    return {
      clientId,
      createdBy,
      kind: "manual_link",
      providerCode: "manual_link",
      mode: "manual",
      displayName,
      externalUrl: normalizeHttpsUrl(command.externalUrl),
      providerAccountReference: null,
    };
  }

  if (command.kind === "payphone") {
    if (command.mode !== "sandbox" && command.mode !== "presentation") {
      throw new ExternalPaymentError(
        "INVALID_PAYMENT_METHOD_MODE",
        "PayPhone solo admite sandbox o presentación.",
        400
      );
    }
    if (command.externalUrl) {
      throw new ExternalPaymentError(
        "INVALID_PAYMENT_METHOD",
        "PayPhone no acepta un enlace manual.",
        400
      );
    }
    const providerAccountReference = optionalText(
      command.providerAccountReference,
      160
    );
    if (
      providerAccountReference &&
      !PROVIDER_ACCOUNT_REFERENCE_PATTERN.test(providerAccountReference)
    ) {
      throw new ExternalPaymentError(
        "INVALID_PROVIDER_ACCOUNT_REFERENCE",
        "La referencia de cuenta PayPhone no es válida.",
        400
      );
    }
    return {
      clientId,
      createdBy,
      kind: "payphone",
      providerCode: "payphone",
      mode: command.mode,
      displayName,
      externalUrl: null,
      providerAccountReference,
    };
  }

  throw new ExternalPaymentError(
    "UNSUPPORTED_PAYMENT_METHOD",
    "El tipo de método de pago no está permitido.",
    400
  );
}

export function normalizeCreateExternalPayment(
  command: CreateExternalPaymentCommand
): NormalizedExternalPaymentCommand {
  return {
    clientId: requiredUuid(command.clientId, "client_id"),
    paymentMethodId: requiredUuid(
      command.paymentMethodId,
      "payment_method_id"
    ),
    createdBy: requiredUuid(command.createdBy, "created_by"),
    amount: normalizeAmount(command.amount),
    currency: normalizeCurrency(command.currency),
    description:
      optionalText(command.description, 240) || "Solicitud de pago",
    customerName: optionalText(command.customerName, 120),
    orderReference: requiredText(
      command.orderReference,
      "order_reference",
      120
    ),
    idempotencyKey: normalizeIdempotencyKey(command.idempotencyKey),
    publicBaseUrl: normalizeBaseUrl(command.publicBaseUrl),
  };
}

export function normalizeManualPaymentConfirmation(
  command: ManualPaymentConfirmationCommand
): NormalizedManualPaymentConfirmationCommand {
  const status = command.status;
  if (status !== "approved" && status !== "rejected") {
    throw new ExternalPaymentError(
      "INVALID_STATUS",
      "La confirmación manual debe ser approved o rejected.",
      400
    );
  }
  if (
    command.actorRole !== "super_admin" &&
    command.actorRole !== "admin" &&
    command.actorRole !== "client_owner"
  ) {
    throw new ExternalPaymentError(
      "PAYMENT_CONFIRMATION_FORBIDDEN",
      "No tienes permisos para confirmar este pago.",
      403
    );
  }
  return {
    clientId: requiredUuid(command.clientId, "client_id"),
    paymentRequestId: requiredUuid(
      command.paymentRequestId,
      "payment_request_id"
    ),
    actorUserId: requiredUuid(command.actorUserId, "actor_user_id"),
    actorRole: command.actorRole,
    status,
    idempotencyKey: normalizeIdempotencyKey(command.idempotencyKey),
    note: optionalText(command.note, 500),
  };
}

export function assertSameIdempotentRequest(
  existing: ExternalPaymentRequest,
  command: NormalizedExternalPaymentCommand
): void {
  if (
    existing.paymentMethodId !== command.paymentMethodId ||
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
    return `${request.businessName}: pago confirmado manualmente.`;
  }
  if (request.status === "rejected") {
    return `${request.businessName}: pago rechazado manualmente.`;
  }
  if (request.confirmationMode === "manual") {
    return `${request.businessName}: pago pendiente de confirmación manual.`;
  }
  return `${request.businessName}: demostración de pago pendiente, sin cobro real.`;
}

export function toPaymentMethodPublicView(
  method: BusinessPaymentMethod
): PaymentMethodPublicView {
  return {
    id: method.id,
    clientId: method.clientId,
    kind: method.kind,
    providerCode: method.providerCode,
    mode: method.mode,
    displayName: method.displayName,
    externalUrl: method.kind === "manual_link" ? method.externalUrl : null,
    status: method.status,
    createdAt: method.createdAt,
    updatedAt: method.updatedAt,
  };
}

export function toExternalPaymentPublicView(
  request: ExternalPaymentRequest
): ExternalPaymentPublicView {
  return {
    id: request.id,
    clientId: request.clientId,
    paymentMethodId: request.paymentMethodId,
    orderReference: request.orderReference,
    amount: request.amount,
    currency: request.currency,
    status: request.status,
    provider: request.provider,
    providerMode: request.providerMode,
    confirmationMode: request.confirmationMode,
    realCharge: false,
    customerConfirmation: externalPaymentCustomerConfirmation(request),
    paymentLink: request.paymentLink,
    button:
      request.status === "pending"
        ? {
            label:
              request.confirmationMode === "manual"
                ? "Abrir enlace externo"
                : "Abrir demostración PayPhone",
            url: request.paymentLink,
          }
        : null,
    confirmedAt: request.confirmedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}
