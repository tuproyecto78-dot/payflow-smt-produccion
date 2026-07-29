export const EXTERNAL_PAYMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type ExternalPaymentStatus =
  (typeof EXTERNAL_PAYMENT_STATUSES)[number];

export interface ExternalPaymentRequest {
  id: string;
  clientId: string;
  createdBy: string;
  businessName: string;
  provider: "sandbox";
  providerReference: string;
  orderReference: string;
  idempotencyKey: string;
  amount: number;
  currency: string;
  description: string;
  customerName: string | null;
  status: ExternalPaymentStatus;
  paymentLink: string;
  checkoutTokenHash: string;
  metadata: Record<string, unknown>;
  lastEventAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExternalPaymentCommand {
  clientId: string;
  createdBy: string;
  amount: unknown;
  currency?: unknown;
  description?: unknown;
  customerName?: unknown;
  orderReference: unknown;
  idempotencyKey: unknown;
  publicBaseUrl: string;
}

export interface NormalizedExternalPaymentCommand {
  clientId: string;
  createdBy: string;
  amount: number;
  currency: string;
  description: string;
  customerName: string | null;
  orderReference: string;
  idempotencyKey: string;
  publicBaseUrl: string;
}

export interface ExternalPaymentWebhookEvent {
  provider: "sandbox";
  eventId: string;
  paymentRequestId: string;
  providerReference: string;
  status: ExternalPaymentStatus;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface AppliedExternalPaymentEvent {
  request: ExternalPaymentRequest;
  duplicate: boolean;
  transitionApplied: boolean;
}

export interface ExternalPaymentPublicView {
  id: string;
  orderReference: string;
  amount: number;
  currency: string;
  status: ExternalPaymentStatus;
  provider: "sandbox";
  sandbox: true;
  customerConfirmation: string;
  paymentLink: string;
  button: {
    label: string;
    url: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}
