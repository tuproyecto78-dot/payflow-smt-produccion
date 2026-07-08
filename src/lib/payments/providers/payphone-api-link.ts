/**
 * PayFlow SMT — PayPhone API Link provider.
 *
 * This is the canonical import path for the PayPhone API Link integration
 * inside the payments providers layer. It re-exports the implementation
 * from `@/lib/payphone/api-link` so that callers can use either path:
 *
 *   import { createPayphoneApiLink } from "@/lib/payments/providers/payphone-api-link";
 *   import { createPayphoneApiLink } from "@/lib/payphone/api-link";
 *
 * Backend-only. NEVER import from a Client Component.
 */

export {
  createPayphoneApiLink,
  generateClientTransactionId,
  payphoneLinkWhatsAppMessage,
  payphoneStatusWhatsAppMessage,
  mapPayphoneWebhookStatus,
  validatePayphoneConfig,
  type PayphoneLinkRequestInput,
  type PayphoneLinkResult,
} from "@/lib/payphone/api-link";
