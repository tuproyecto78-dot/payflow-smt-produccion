import { z } from "zod";

const optionalPhone = z.string().trim().max(30).regex(/^\+?[0-9 ()-]*$/, "Número de teléfono inválido.");

export const voiceSettingsSchema = z.object({
  provider: z.enum(["twilio", "fonoster", "sip", "custom"]),
  businessPhone: optionalPhone,
  routingPhone: optionalPhone,
  providerPhoneId: z.string().trim().max(120),
  sipDomain: z.string().trim().max(255),
  timezone: z.string().trim().min(1).max(80),
  defaultPaymentProvider: z.enum(["none", "payphone", "stripe"]),
  whatsappConfirmationsEnabled: z.boolean(),
  humanTransferEnabled: z.boolean(),
  humanTransferPhone: optionalPhone,
  recordingEnabled: z.boolean(),
  retentionDays: z.number().int().min(1).max(365),
  agent: z.object({
    name: z.string().trim().min(2).max(80),
    language: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
    voiceId: z.string().trim().min(1).max(120),
    greeting: z.string().trim().min(10).max(500),
    instructions: z.string().trim().max(5000),
    useCatalog: z.boolean(),
    canCreateOrders: z.boolean(),
    canCreateReservations: z.boolean(),
    canCreatePaymentLinks: z.boolean(),
    canAnswerFaq: z.boolean(),
  }),
}).superRefine((value, ctx) => {
  if (value.humanTransferEnabled && !value.humanTransferPhone) {
    ctx.addIssue({ code: "custom", path: ["humanTransferPhone"], message: "Indica un número para transferir llamadas." });
  }
});

export const voiceRuntimeEventSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  eventType: z.enum([
    "call.started",
    "call.updated",
    "call.completed",
    "order.created",
    "reservation.created",
    "payment.linked",
  ]),
  provider: z.enum(["twilio", "fonoster", "sip", "custom"]),
  providerCallId: z.string().trim().min(1).max(160),
  providerPhoneId: z.string().trim().max(160).optional().default(""),
  businessPhone: z.string().trim().max(30).optional().default(""),
  callerPhone: z.string().trim().max(30).optional().default(""),
  occurredAt: z.string().datetime().optional(),
  data: z.object({
    status: z.enum(["queued", "ringing", "in_progress", "completed", "failed", "busy", "no_answer", "cancelled"]).optional(),
    outcome: z.enum(["unknown", "information", "order", "reservation", "payment", "transferred", "abandoned"]).optional(),
    startedAt: z.string().datetime().optional(),
    answeredAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    durationSeconds: z.number().int().min(0).max(86400).optional(),
    summary: z.string().trim().max(2000).optional(),
    transcript: z.array(z.object({
      speaker: z.enum(["customer", "agent", "system"]),
      text: z.string().max(5000),
      at: z.string().datetime().optional(),
    })).max(1000).optional(),
    customerName: z.string().trim().max(160).optional(),
    customerPhone: z.string().trim().max(40).optional(),
    customerEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional(),
    items: z.array(z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().min(1).max(99),
    })).min(1).max(50).optional(),
    serviceName: z.string().trim().max(160).optional(),
    partySize: z.number().int().min(1).max(100).optional(),
    scheduledAt: z.string().datetime().optional(),
    paymentTransactionId: z.string().trim().max(160).optional(),
    // A voice runtime may only initiate/link a payment. Provider webhooks are
    // the sole authority allowed to mark it paid, failed or refunded.
    paymentStatus: z.enum(["unpaid", "pending"]).optional(),
  }).default({}),
});

export const voiceRuntimeContextSchema = z.object({
  provider: z.enum(["twilio", "fonoster", "sip", "custom"]),
  providerPhoneId: z.string().trim().max(160).optional().default(""),
  businessPhone: z.string().trim().max(30).optional().default(""),
}).superRefine((value, ctx) => {
  if (!value.providerPhoneId && !value.businessPhone) {
    ctx.addIssue({ code: "custom", path: ["businessPhone"], message: "Falta el número de destino." });
  }
});

export const voiceProvisioningSchema = z.object({
  activationStatus: z.enum(["requested", "provisioning", "active", "suspended"]),
  provider: z.enum(["twilio", "fonoster", "sip", "custom"]),
  businessPhone: optionalPhone,
  routingPhone: optionalPhone,
  providerPhoneId: z.string().trim().max(120),
  sipDomain: z.string().trim().max(255),
}).superRefine((value, ctx) => {
  if (value.activationStatus === "active" && !value.businessPhone) {
    ctx.addIssue({ code: "custom", path: ["businessPhone"], message: "Indica el número del negocio antes de activar." });
  }
  if (value.activationStatus === "active" && !value.routingPhone && !value.providerPhoneId) {
    ctx.addIssue({ code: "custom", path: ["routingPhone"], message: "Configura el destino o ID del proveedor antes de activar." });
  }
});
