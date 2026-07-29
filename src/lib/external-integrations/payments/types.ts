export const EXTERNAL_PAYMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export const PAYMENT_METHOD_KINDS = ["manual_link", "payphone"] as const;
export const PAYMENT_METHOD_MODES = [
  "manual",
  "sandbox",
  "presentation",
] as const;
export const PAYMENT_METHOD_STATUSES = ["active", "inactive"] as const;

export type ExternalPaymentStatus =
  (typeof EXTERNAL_PAYMENT_STATUSES)[number];
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];
export type PaymentMethodMode = (typeof PAYMENT_METHOD_MODES)[number];
export type PaymentMethodStatus = (typeof PAYMENT_METHOD_STATUSES)[number];
export type PaymentPathType = "manual_link" | "provider_adapter";
export type PaymentConfirmationMode =
  | "manual"
  | "presentation"
  | "legacy_webhook";

export interface ActivePaymentBusiness {
  id: string;
  businessName: string;
  status: "active";
}

export interface BusinessPaymentMethod {
  id: string;
  clientId: string;
  kind: PaymentMethodKind;
  providerCode: string;
  mode: PaymentMethodMode;
  displayName: string;
  externalUrl: string | null;
  providerAccountReference: string | null;
  status: PaymentMethodStatus;
  createdBy: string;
  deactivatedBy: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodPublicView {
  id: string;
  clientId: string;
  kind: PaymentMethodKind;
  providerCode: string;
  mode: PaymentMethodMode;
  displayName: string;
  externalUrl: string | null;
  status: PaymentMethodStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPaymentMethodCommand {
  clientId: unknown;
  createdBy: unknown;
  kind: unknown;
  mode?: unknown;
  displayName: unknown;
  externalUrl?: unknown;
  providerAccountReference?: unknown;
}

export interface NormalizedRegisterPaymentMethodCommand {
  clientId: string;
  createdBy: string;
  kind: PaymentMethodKind;
  providerCode: "manual_link" | "payphone";
  mode: PaymentMethodMode;
  displayName: string;
  externalUrl: string | null;
  providerAccountReference: string | null;
}

export interface ExternalPaymentRequest {
  id: string;
  clientId: string;
  paymentMethodId: string;
  createdBy: string;
  businessName: string;
  pathType: PaymentPathType;
  provider: string;
  providerMode: PaymentMethodMode;
  providerReference: string;
  orderReference: string;
  idempotencyKey: string;
  amount: number;
  currency: string;
  description: string;
  customerName: string | null;
  status: ExternalPaymentStatus;
  confirmationMode: PaymentConfirmationMode;
  realCharge: false;
  paymentLink: string;
  metadata: Record<string, unknown>;
  lastEventAt: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  confirmationNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExternalPaymentCommand {
  clientId: unknown;
  paymentMethodId: unknown;
  createdBy: unknown;
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
  paymentMethodId: string;
  createdBy: string;
  amount: number;
  currency: string;
  description: string;
  customerName: string | null;
  orderReference: string;
  idempotencyKey: string;
  publicBaseUrl: string;
}

export interface ManualPaymentConfirmationCommand {
  clientId: unknown;
  paymentRequestId: unknown;
  actorUserId: unknown;
  actorRole: unknown;
  status: unknown;
  idempotencyKey: unknown;
  note?: unknown;
}

export interface NormalizedManualPaymentConfirmationCommand {
  clientId: string;
  paymentRequestId: string;
  actorUserId: string;
  actorRole: "super_admin" | "admin" | "client_owner";
  status: "approved" | "rejected";
  idempotencyKey: string;
  note: string | null;
}

export interface ManualPaymentConfirmationResult {
  request: ExternalPaymentRequest;
  duplicate: boolean;
  transitionApplied: boolean;
}

export interface PreparedExternalPayment {
  pathType: PaymentPathType;
  providerCode: string;
  providerMode: PaymentMethodMode;
  providerReference: string;
  confirmationMode: "manual" | "presentation";
  paymentLink: string;
  realCharge: false;
}

export interface ExternalPaymentPublicView {
  id: string;
  clientId: string;
  paymentMethodId: string;
  orderReference: string;
  amount: number;
  currency: string;
  status: ExternalPaymentStatus;
  provider: string;
  providerMode: PaymentMethodMode;
  confirmationMode: PaymentConfirmationMode;
  realCharge: false;
  customerConfirmation: string;
  paymentLink: string;
  button: {
    label: string;
    url: string;
  } | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentConfirmationAuditEntry {
  id: string;
  paymentRequestId: string;
  clientId: string;
  idempotencyKey: string;
  actorUserId: string;
  actorRole: string;
  previousStatus: ExternalPaymentStatus;
  newStatus: "approved" | "rejected";
  note: string | null;
  createdAt: string;
}
