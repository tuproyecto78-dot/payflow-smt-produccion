import "server-only";

import { getPayphoneBaseUrl, getPayphoneConfig } from "@/lib/payphone/config";
import { mapPayphoneWebhookStatus } from "@/lib/payphone-link";

export interface VerifiedPayphoneTransaction {
  clientTransactionId: string;
  transactionId: string;
  status: "payment_pending" | "payment_success" | "payment_failed" | "error";
  statusCode?: number;
  transactionStatus?: string;
  amount: number;
  currency: string;
  authorizationCode?: string;
}

/**
 * Confirms a notification against PayPhone's authenticated Sale API. The
 * webhook body is treated only as a hint and can never approve a payment by
 * itself.
 */
export async function verifyPayphoneTransaction(
  clientTransactionId: string
): Promise<VerifiedPayphoneTransaction> {
  const cfg = getPayphoneConfig();
  if (!cfg.token) throw new Error("PAYPHONE_TOKEN_NOT_CONFIGURED");

  const response = await fetch(
    `${getPayphoneBaseUrl()}/Sale/client/${encodeURIComponent(clientTransactionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }
  );
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`PAYPHONE_VERIFICATION_FAILED_${response.status}`);
  }

  const verifiedClientId = String(payload.clientTransactionId || payload.ClientTransactionId || "").trim();
  if (verifiedClientId !== clientTransactionId) throw new Error("PAYPHONE_TRANSACTION_ID_MISMATCH");
  const rawStatusCode = payload.statusCode ?? payload.StatusCode;
  const statusCode = typeof rawStatusCode === "number" ? rawStatusCode : Number(rawStatusCode);
  const transactionStatus = String(payload.transactionStatus || payload.TransactionStatus || "").trim();
  const rawAmount = Number(payload.amount ?? payload.Amount);
  if (!Number.isFinite(rawAmount)) throw new Error("PAYPHONE_AMOUNT_MISSING");

  return {
    clientTransactionId: verifiedClientId,
    transactionId: String(payload.transactionId || payload.TransactionId || "").trim(),
    status: mapPayphoneWebhookStatus(Number.isFinite(statusCode) ? statusCode : undefined, transactionStatus),
    statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
    transactionStatus: transactionStatus || undefined,
    amount: rawAmount / 100,
    currency: String(payload.currency || payload.Currency || "USD").trim().toUpperCase(),
    authorizationCode: String(payload.authorizationCode || payload.AuthorizationCode || "").trim() || undefined,
  };
}
