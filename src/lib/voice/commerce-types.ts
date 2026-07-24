export type VoicePaymentMethod =
  | "payment_link"
  | "bank_transfer"
  | "cash"
  | "cash_on_delivery";

export type VoicePaymentStatus =
  | "pending"
  | "proof_received"
  | "paid"
  | "cancelled"
  | "refunded";

export interface VoicePaymentProfile {
  id: string;
  clientId: string;
  label: string;
  method: VoicePaymentMethod;
  providerLabel: string | null;
  paymentUrl: string | null;
  bankName: string | null;
  accountHolder: string | null;
  accountType: string | null;
  accountReferenceMasked: string | null;
  instructions: string | null;
  isDefault: boolean;
  active: boolean;
}

export interface VoicePaymentReference {
  id: string;
  clientId: string;
  callId: string | null;
  orderId: string | null;
  reservationId: string | null;
  profileId: string | null;
  method: VoicePaymentMethod;
  providerLabel: string | null;
  externalReference: string | null;
  checkoutUrl: string | null;
  amount: number;
  currency: string;
  status: VoicePaymentStatus;
  statusSource: string;
  proofUrl: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface VoiceCommerceTrace {
  callId: string;
  startedAt: string;
  customerPhone: string | null;
  customerName: string | null;
  callStatus: string;
  outcome: string | null;
  durationSeconds: number;
  orderId: string | null;
  reservationId: string | null;
  whatsappStatus: string;
  transferredToHuman: boolean;
  summary: string | null;
  paymentReferenceId: string | null;
  paymentMethod: VoicePaymentMethod | null;
  paymentStatus: VoicePaymentStatus | null;
  paymentAmount: number | null;
  currency: string;
}

export interface VoiceCommerceKpis {
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  minutes: number;
  orders: number;
  reservations: number;
  conversionRate: number;
  attributableSales: number;
  pendingAmount: number;
  paidPayments: number;
  averageTicket: number;
  transfers: number;
  averageDurationSeconds: number;
  telephonyCost: number;
  aiCost: number;
  peakHour: string | null;
  currency: string;
}

export interface VoiceCommerceDashboard {
  clientId: string;
  profiles: VoicePaymentProfile[];
  references: VoicePaymentReference[];
  traces: VoiceCommerceTrace[];
  kpis: VoiceCommerceKpis;
}
