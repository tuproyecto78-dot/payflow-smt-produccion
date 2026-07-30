// Legacy dispatcher guard.
//
// Real PayPhone operations require a client_id and are executed by the
// tenant-aware Partner path. This adapter deliberately has no environment
// credential fallback and cannot issue a provider request.

import {
  type CreatePaymentInput,
  type NormalizedPaymentResult,
} from "../types";
import {
  type AdapterBase,
  buildResult,
  whatsappMessageForStatus,
} from "./_shared";

export async function payphoneProvider(
  input: CreatePaymentInput,
  base: AdapterBase
): Promise<NormalizedPaymentResult> {
  return buildResult({
    payment_id: `pp_guard_${Date.now()}`,
    provider: "PayPhone",
    provider_payment_id: null,
    payment_status: "error",
    payment_link: "",
    input,
    base,
    whatsapp_message:
      input.language === "en"
        ? "PayPhone must be configured for this business."
        : "PayPhone debe configurarse para este negocio.",
    extras: {
      payphone_business_status: "partner_account_required",
      payphone_store_id: null,
      payphone_personal_status: "skipped",
    },
    raw_response: {
      provider: "PayPhone",
      code: "PAYPHONE_PARTNER_ACCOUNT_REQUIRED",
      global_credentials_allowed: false,
    },
  });
}

export { whatsappMessageForStatus };
