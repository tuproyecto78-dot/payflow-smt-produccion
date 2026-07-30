import "server-only";

import { createServiceRoleClient } from "@/lib/supabase";
import {
  decryptMerchantToken,
  encryptMerchantToken,
  normalizePayphoneRuc,
  normalizePayphoneStoreId,
  PayphoneMerchantError,
  requiredPayphoneUuid,
  type EncryptedMerchantToken,
} from "./merchant-crypto";

export {
  decryptMerchantToken,
  encryptMerchantToken,
  normalizePayphoneRuc,
  normalizePayphoneStoreId,
  PayphoneMerchantError,
  type EncryptedMerchantToken,
} from "./merchant-crypto";

export type PayphoneMerchantEnvironment = "sandbox" | "production";
export type PayphoneMerchantStatus =
  | "onboarding_pending"
  | "active"
  | "inactive"
  | "error";

export interface PayphoneMerchantAccount {
  id: string;
  clientId: string;
  ruc: string;
  storeId: string;
  tokenCiphertext: string;
  tokenIv: string;
  tokenAuthTag: string;
  tokenKeyVersion: number;
  tokenFingerprint: string;
  environment: PayphoneMerchantEnvironment;
  status: PayphoneMerchantStatus;
  fallbackUrl: string | null;
  externalNotificationEnabled: boolean;
  createdBy: string;
  updatedAt: string;
}

export interface PayphoneMerchantCredentials {
  accountId: string;
  clientId: string;
  storeId: string;
  token: string;
  environment: PayphoneMerchantEnvironment;
  fallbackUrl: string | null;
  externalNotificationEnabled: boolean;
}

function normalizeFallbackUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) {
    throw new PayphoneMerchantError(
      "PAYPHONE_INVALID_FALLBACK",
      "El enlace externo de respaldo no es válido.",
      400
    );
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new PayphoneMerchantError(
      "PAYPHONE_INVALID_FALLBACK",
      "El enlace externo de respaldo debe usar HTTPS y no incluir credenciales.",
      400
    );
  }
}

function mapAccount(row: Record<string, unknown>): PayphoneMerchantAccount {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    ruc: String(row.ruc),
    storeId: String(row.store_id),
    tokenCiphertext: String(row.token_ciphertext),
    tokenIv: String(row.token_iv),
    tokenAuthTag: String(row.token_auth_tag),
    tokenKeyVersion: Number(row.token_key_version),
    tokenFingerprint: String(row.token_fingerprint),
    environment: row.environment as PayphoneMerchantEnvironment,
    status: row.status as PayphoneMerchantStatus,
    fallbackUrl: row.fallback_url ? String(row.fallback_url) : null,
    externalNotificationEnabled: row.external_notification_enabled === true,
    createdBy: String(row.created_by),
    updatedAt: String(row.updated_at),
  };
}

export function publicMerchantAccount(account: PayphoneMerchantAccount) {
  return {
    id: account.id,
    client_id: account.clientId,
    ruc_masked: `*********${account.ruc.slice(-4)}`,
    store_id_masked: `****${account.storeId.slice(-4)}`,
    token_configured: true,
    environment: account.environment,
    status: account.status,
    fallback_url: account.fallbackUrl,
    external_notification_enabled: account.externalNotificationEnabled,
    updated_at: account.updatedAt,
  };
}

export async function upsertPayphoneMerchantAccount(input: {
  clientId: unknown;
  ruc: unknown;
  storeId: unknown;
  thirdPartyToken: unknown;
  environment: unknown;
  fallbackUrl?: unknown;
  externalNotificationEnabled?: unknown;
  createdBy: unknown;
}): Promise<PayphoneMerchantAccount> {
  const clientId = requiredPayphoneUuid(input.clientId, "client_id");
  const createdBy = requiredPayphoneUuid(input.createdBy, "created_by");
  const ruc = normalizePayphoneRuc(input.ruc);
  const storeId = normalizePayphoneStoreId(input.storeId);
  const thirdPartyToken =
    typeof input.thirdPartyToken === "string" ? input.thirdPartyToken.trim() : "";
  const environment =
    input.environment === "production" ? "production" : "sandbox";
  const fallbackUrl = normalizeFallbackUrl(input.fallbackUrl);
  const encrypted = encryptMerchantToken({
    token: thirdPartyToken,
    clientId,
    storeId,
  });
  const supabase = createServiceRoleClient();
  const business = await supabase
    .from("client_accounts")
    .select("id, status")
    .eq("id", clientId)
    .maybeSingle();
  if (business.error || !business.data) {
    throw new PayphoneMerchantError(
      "PAYPHONE_BUSINESS_NOT_FOUND",
      "El negocio no existe.",
      404
    );
  }
  if (business.data.status !== "active") {
    throw new PayphoneMerchantError(
      "PAYPHONE_BUSINESS_INACTIVE",
      "El negocio debe estar activo.",
      409
    );
  }
  const { data, error } = await supabase
    .from("payphone_partner_accounts")
    .upsert(
      {
        client_id: clientId,
        ruc,
        store_id: storeId,
        token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        token_auth_tag: encrypted.authTag,
        token_key_version: encrypted.keyVersion,
        token_fingerprint: encrypted.fingerprint,
        environment,
        status: "active",
        fallback_url: fallbackUrl,
        external_notification_enabled:
          input.externalNotificationEnabled === true,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" }
    )
    .select("*")
    .single();
  if (error || !data) {
    throw new PayphoneMerchantError(
      "PAYPHONE_ACCOUNT_WRITE_FAILED",
      "No se pudo registrar la cuenta PayPhone del negocio.",
      500
    );
  }
  return mapAccount(data as Record<string, unknown>);
}

export async function findPayphoneMerchantAccountByClient(
  clientIdValue: unknown
): Promise<PayphoneMerchantAccount | null> {
  const clientId = requiredPayphoneUuid(clientIdValue, "client_id");
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("payphone_partner_accounts")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    throw new PayphoneMerchantError(
      "PAYPHONE_ACCOUNT_READ_FAILED",
      "No se pudo consultar la cuenta PayPhone.",
      500
    );
  }
  return data ? mapAccount(data as Record<string, unknown>) : null;
}

export async function getPayphoneMerchantCredentials(
  clientId: unknown
): Promise<PayphoneMerchantCredentials> {
  const account = await findPayphoneMerchantAccountByClient(clientId);
  if (!account || account.status !== "active") {
    throw new PayphoneMerchantError(
      "PAYPHONE_ACCOUNT_NOT_ACTIVE",
      "PayPhone no está activo para este negocio.",
      409
    );
  }
  return {
    accountId: account.id,
    clientId: account.clientId,
    storeId: account.storeId,
    token: decryptMerchantToken({
      encrypted: {
        ciphertext: account.tokenCiphertext,
        iv: account.tokenIv,
        authTag: account.tokenAuthTag,
        keyVersion: account.tokenKeyVersion,
        fingerprint: account.tokenFingerprint,
      },
      clientId: account.clientId,
      storeId: account.storeId,
    }),
    environment: account.environment,
    fallbackUrl: account.fallbackUrl,
    externalNotificationEnabled: account.externalNotificationEnabled,
  };
}
