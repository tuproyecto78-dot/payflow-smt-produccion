import { z } from "zod";

export const voicePaymentProfileSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  label: z.string().trim().min(2).max(80),
  method: z.enum(["payment_link", "bank_transfer", "cash", "cash_on_delivery"]),
  providerLabel: z.string().trim().max(80).nullable().optional(),
  paymentUrl: z.string().url().nullable().optional().or(z.literal("")),
  bankName: z.string().trim().max(100).nullable().optional(),
  accountHolder: z.string().trim().max(120).nullable().optional(),
  accountType: z.string().trim().max(60).nullable().optional(),
  accountReferenceMasked: z.string().trim().max(20).nullable().optional(),
  instructions: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const voicePaymentReferenceStatusSchema = z.object({
  clientId: z.string().uuid(),
  referenceId: z.string().uuid(),
  status: z.enum(["pending", "proof_received", "paid", "cancelled", "refunded"]),
});
