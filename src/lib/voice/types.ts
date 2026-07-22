export type VoiceActivationStatus = "not_enabled" | "requested" | "provisioning" | "active" | "suspended";
export type VoiceProvider = "telnyx" | "twilio" | "fonoster" | "sip" | "custom";
export type VoicePaymentProvider = "none" | "payphone" | "stripe";

export interface VoiceBusiness {
  id: string;
  businessName: string;
  status: string;
}

export interface VoiceModuleSettings {
  clientId: string;
  activationStatus: VoiceActivationStatus;
  provider: VoiceProvider;
  businessPhone: string;
  routingPhone: string;
  providerPhoneId: string;
  sipDomain: string;
  timezone: string;
  defaultPaymentProvider: VoicePaymentProvider;
  whatsappConfirmationsEnabled: boolean;
  humanTransferEnabled: boolean;
  humanTransferPhone: string;
  recordingEnabled: boolean;
  retentionDays: number;
}

export interface VoiceAgent {
  id: string | null;
  name: string;
  language: string;
  voiceId: string;
  greeting: string;
  instructions: string;
  useCatalog: boolean;
  canCreateOrders: boolean;
  canCreateReservations: boolean;
  canCreatePaymentLinks: boolean;
  canAnswerFaq: boolean;
  active: boolean;
}

export interface VoiceCall {
  id: string;
  providerCallId: string;
  callerPhone: string;
  businessPhone: string;
  status: string;
  outcome: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  summary: string;
  transcript: Array<{ speaker?: string; text?: string; at?: string }>;
  orderId: string | null;
  paymentTransactionId: string | null;
}

export interface VoiceReservation {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  partySize: number | null;
  scheduledAt: string;
  status: string;
  notes: string;
}

export interface VoiceIntegrationStatus {
  catalog: boolean;
  whatsapp: boolean;
  payphone: boolean;
  stripe: boolean;
}

export interface VoiceDashboardData {
  settings: VoiceModuleSettings | null;
  agent: VoiceAgent;
  calls: VoiceCall[];
  reservations: VoiceReservation[];
  integrations: VoiceIntegrationStatus;
  metrics: {
    callsToday: number;
    minutesThisMonth: number;
    completedCalls: number;
    convertedCalls: number;
  };
  businesses: VoiceBusiness[];
  selectedClientId: string | null;
  requiresBusinessSelection: boolean;
  canProvision: boolean;
}
