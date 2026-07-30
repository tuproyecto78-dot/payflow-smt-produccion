import "server-only";

import { createServiceRoleClient } from "@/lib/supabase";

export type PayphonePartnerPaymentStatus =
  | "creating"
  | "pending"
  | "approved"
  | "rejected"
  | "error";

export interface PayphonePartnerTransaction {
  id: string;
  clientId: string;
  accountId: string;
  createdBy: string;
  clientTransactionId: string;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  reference: string;
  paymentLink: string | null;
  fallbackUsed: boolean;
  status: PayphonePartnerPaymentStatus;
  realCharge: boolean;
  providerTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapTransaction(
  row: Record<string, unknown>
): PayphonePartnerTransaction {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    accountId: String(row.account_id),
    createdBy: String(row.created_by),
    clientTransactionId: String(row.client_transaction_id),
    idempotencyKey: String(row.idempotency_key),
    amountCents: Number(row.amount_cents),
    currency: String(row.currency),
    reference: String(row.reference),
    paymentLink: row.payment_link ? String(row.payment_link) : null,
    fallbackUsed: row.fallback_used === true,
    status: row.status as PayphonePartnerPaymentStatus,
    realCharge: row.real_charge === true,
    providerTransactionId: row.provider_transaction_id
      ? String(row.provider_transaction_id)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function assertSameIdempotentRequest(
  transaction: PayphonePartnerTransaction,
  input: {
    accountId: string;
    amountCents: number;
    currency: string;
    reference: string;
  }
) {
  if (
    transaction.accountId !== input.accountId ||
    transaction.amountCents !== input.amountCents ||
    transaction.currency !== input.currency ||
    transaction.reference !== input.reference
  ) {
    throw new Error("PAYPHONE_IDEMPOTENCY_CONFLICT");
  }
}

export function publicPartnerTransaction(tx: PayphonePartnerTransaction) {
  return {
    id: tx.id,
    client_id: tx.clientId,
    client_transaction_id: tx.clientTransactionId,
    amount: tx.amountCents / 100,
    currency: tx.currency,
    reference: tx.reference,
    payment_link: tx.paymentLink,
    fallback_used: tx.fallbackUsed,
    status: tx.status,
    real_charge: tx.realCharge,
    provider_transaction_id: tx.providerTransactionId,
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
  };
}

export async function findPartnerTransaction(input: {
  id: string;
  clientId: string;
}): Promise<PayphonePartnerTransaction | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payphone_partner_transactions")
    .select("*")
    .eq("id", input.id)
    .eq("client_id", input.clientId)
    .maybeSingle();
  if (error) throw new Error("PAYPHONE_TRANSACTION_READ_FAILED");
  return data ? mapTransaction(data as Record<string, unknown>) : null;
}

export async function reservePartnerTransaction(input: {
  clientId: string;
  accountId: string;
  createdBy: string;
  clientTransactionId: string;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  reference: string;
  realCharge: boolean;
}): Promise<{ transaction: PayphonePartnerTransaction; reused: boolean }> {
  const supabase = createServiceRoleClient();
  const existing = await supabase
    .from("payphone_partner_transactions")
    .select("*")
    .eq("client_id", input.clientId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing.error) {
    throw new Error("PAYPHONE_TRANSACTION_READ_FAILED");
  }
  if (existing.data) {
    const transaction = mapTransaction(
      existing.data as Record<string, unknown>
    );
    assertSameIdempotentRequest(transaction, input);
    return { transaction, reused: true };
  }
  const inserted = await supabase
    .from("payphone_partner_transactions")
    .insert({
      client_id: input.clientId,
      account_id: input.accountId,
      created_by: input.createdBy,
      client_transaction_id: input.clientTransactionId,
      idempotency_key: input.idempotencyKey,
      amount_cents: input.amountCents,
      currency: input.currency,
      reference: input.reference,
      status: "creating",
      real_charge: input.realCharge,
    })
    .select("*")
    .single();
  if (!inserted.error && inserted.data) {
    return {
      transaction: mapTransaction(
        inserted.data as Record<string, unknown>
      ),
      reused: false,
    };
  }

  // A concurrent request may have won the unique idempotency constraint.
  const raced = await supabase
    .from("payphone_partner_transactions")
    .select("*")
    .eq("client_id", input.clientId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (raced.data && !raced.error) {
    const transaction = mapTransaction(
      raced.data as Record<string, unknown>
    );
    assertSameIdempotentRequest(transaction, input);
    return {
      transaction,
      reused: true,
    };
  }
  throw new Error("PAYPHONE_TRANSACTION_CREATE_FAILED");
}

export async function completePartnerTransaction(input: {
  id: string;
  clientId: string;
  status: "pending" | "error";
  paymentLink?: string | null;
  fallbackUsed: boolean;
  providerResponse: Record<string, unknown>;
}): Promise<PayphonePartnerTransaction> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payphone_partner_transactions")
    .update({
      status: input.status,
      payment_link: input.paymentLink || null,
      fallback_used: input.fallbackUsed,
      provider_response: input.providerResponse,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("client_id", input.clientId)
    .eq("status", "creating")
    .select("*")
    .single();
  if (error || !data) throw new Error("PAYPHONE_TRANSACTION_UPDATE_FAILED");
  return mapTransaction(data as Record<string, unknown>);
}

export async function applyPayphoneNotification(input: {
  storeId: string;
  clientTransactionId: string;
  providerTransactionId: string;
  statusCode: number;
  transactionStatus: string | null;
  amountCents: number;
  currency: string;
  authorizationCode: string | null;
  reference: string | null;
  receivedAt: string;
}) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc(
    "apply_payphone_partner_notification",
    {
      p_store_id: input.storeId,
      p_client_transaction_id: input.clientTransactionId,
      p_provider_transaction_id: input.providerTransactionId,
      p_status_code: input.statusCode,
      p_transaction_status: input.transactionStatus,
      p_amount_cents: input.amountCents,
      p_currency: input.currency,
      p_authorization_code: input.authorizationCode,
      p_reference: input.reference,
      p_received_at: input.receivedAt,
    }
  );
  if (error) {
    const message = String(error.message || "");
    if (message.includes("PAYPHONE_NOTIFICATION_UNAUTHORIZED")) {
      throw new Error("PAYPHONE_NOTIFICATION_UNAUTHORIZED");
    }
    if (message.includes("PAYPHONE_TRANSACTION_NOT_FOUND")) {
      throw new Error("PAYPHONE_TRANSACTION_NOT_FOUND");
    }
    if (message.includes("PAYPHONE_NOTIFICATION_MISMATCH")) {
      throw new Error("PAYPHONE_NOTIFICATION_MISMATCH");
    }
    throw new Error("PAYPHONE_NOTIFICATION_FAILED");
  }
  return data as {
    Response: boolean;
    ErrorCode: string;
    duplicate: boolean;
    transition_applied: boolean;
    status: "pending" | "approved" | "rejected";
    client_id: string;
  };
}
