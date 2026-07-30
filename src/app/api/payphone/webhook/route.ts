import {
  applyPayphoneNotification,
} from "@/lib/payphone/partner-transactions";
import {
  getClientIP,
  rateLimit,
  RATE_LIMIT_ERROR,
} from "@/lib/security";
import { verifySharedSecret } from "@/lib/webhook-signature";

export const dynamic = "force-dynamic";

type PayphoneNotification = {
  storeId: string;
  clientTransactionId: string;
  providerTransactionId: string;
  statusCode: number;
  transactionStatus: string | null;
  amountCents: number;
  currency: string;
  authorizationCode: string | null;
  reference: string | null;
};

export function normalizePayphoneNotification(
  body: Record<string, unknown>
): PayphoneNotification {
  const text = (pascal: string, camel: string) =>
    String(body[pascal] ?? body[camel] ?? "").trim();
  const number = (pascal: string, camel: string) =>
    Number(body[pascal] ?? body[camel]);
  const storeId = text("StoreId", "storeId");
  const clientTransactionId = text(
    "ClientTransactionId",
    "clientTransactionId"
  );
  const providerTransactionId = text("TransactionId", "transactionId");
  const statusCode = number("StatusCode", "statusCode");
  const amountCents = number("Amount", "amount");
  const currency = text("Currency", "currency").toUpperCase() || "USD";
  if (
    !storeId ||
    !clientTransactionId ||
    !providerTransactionId ||
    !Number.isInteger(statusCode) ||
    ![1, 2, 3].includes(statusCode) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    currency !== "USD"
  ) {
    throw new Error("PAYPHONE_INVALID_NOTIFICATION");
  }
  return {
    storeId,
    clientTransactionId,
    providerTransactionId,
    statusCode,
    transactionStatus:
      text("TransactionStatus", "transactionStatus") || null,
    amountCents,
    currency,
    authorizationCode:
      text("AuthorizationCode", "authorizationCode") || null,
    reference: text("Reference", "reference") || null,
  };
}

function providerResponse(
  response: boolean,
  errorCode: string,
  status: number,
  details?: Record<string, unknown>
) {
  return Response.json(
    { Response: response, ErrorCode: errorCode, ...details },
    { status }
  );
}

export async function POST(request: Request) {
  const ip = getClientIP(request);
  if (!rateLimit(`payphone-partner-notification:${ip}`, 120, 60_000)) {
    return providerResponse(false, "777", 429, {
      error: RATE_LIMIT_ERROR,
    });
  }
  const requestUrl = new URL(request.url);
  const receivedSecret =
    request.headers.get("x-payphone-webhook-secret") ||
    requestUrl.searchParams.get("token");
  const configuredSecret =
    process.env.PAYPHONE_EXTERNAL_NOTIFICATION_SECRET || "";
  if (!verifySharedSecret(receivedSecret, configuredSecret)) {
    return providerResponse(false, "111", 401);
  }
  try {
    const notification = normalizePayphoneNotification(
      (await request.json().catch(() => ({}))) as Record<string, unknown>
    );
    const result = await applyPayphoneNotification({
      ...notification,
      receivedAt: new Date().toISOString(),
    });
    return providerResponse(true, "000", 200, {
      duplicate: result.duplicate,
      transition_applied: result.transition_applied,
      status: result.status,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "PAYPHONE_INVALID_NOTIFICATION") {
      return providerResponse(false, "222", 400);
    }
    if (code === "PAYPHONE_NOTIFICATION_UNAUTHORIZED") {
      return providerResponse(false, "111", 401);
    }
    if (code === "PAYPHONE_TRANSACTION_NOT_FOUND") {
      return providerResponse(false, "333", 404);
    }
    if (code === "PAYPHONE_NOTIFICATION_MISMATCH") {
      return providerResponse(false, "444", 409);
    }
    return providerResponse(false, "666", 500);
  }
}
