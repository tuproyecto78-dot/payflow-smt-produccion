import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUC_PATTERN = /^\d{13}$/;
const STORE_ID_PATTERN = /^[A-Za-z0-9._:-]{3,160}$/;
const KEY_VERSION = 1;

export interface EncryptedMerchantToken {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  fingerprint: string;
}

export class PayphoneMerchantError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(
    code: string,
    message: string,
    httpStatus: number
  ) {
    super(message);
    this.name = "PayphoneMerchantError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function requiredPayphoneUuid(
  value: unknown,
  field: string
): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new PayphoneMerchantError(
      field === "client_id"
        ? "PAYPHONE_CLIENT_REQUIRED"
        : "PAYPHONE_INVALID_IDENTIFIER",
      `${field} no es válido.`,
      400
    );
  }
  return value.trim().toLowerCase();
}

export function normalizePayphoneRuc(value: unknown): string {
  const ruc = typeof value === "string" ? value.trim() : "";
  if (!RUC_PATTERN.test(ruc) || /^(\d)\1{12}$/.test(ruc)) {
    throw new PayphoneMerchantError(
      "PAYPHONE_INVALID_RUC",
      "El RUC debe contener 13 dígitos válidos.",
      400
    );
  }
  return ruc;
}

export function normalizePayphoneStoreId(value: unknown): string {
  const storeId = typeof value === "string" ? value.trim() : "";
  if (!STORE_ID_PATTERN.test(storeId)) {
    throw new PayphoneMerchantError(
      "PAYPHONE_INVALID_STORE_ID",
      "El Store ID no es válido.",
      400
    );
  }
  return storeId;
}

function readMasterKey(): Buffer {
  const encoded = process.env.PAYPHONE_CREDENTIALS_MASTER_KEY?.trim() || "";
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new PayphoneMerchantError(
      "PAYPHONE_CREDENTIAL_KEY_MISSING",
      "La clave maestra de credenciales PayPhone no está configurada.",
      503
    );
  }
  return key;
}

function aad(clientId: string, storeId: string, keyVersion: number): Buffer {
  return Buffer.from(
    `payflow-smt:payphone:${keyVersion}:${clientId}:${storeId}`,
    "utf8"
  );
}

export function encryptMerchantToken(input: {
  token: string;
  clientId: string;
  storeId: string;
  masterKey?: Buffer;
}): EncryptedMerchantToken {
  const clientId = requiredPayphoneUuid(input.clientId, "client_id");
  const storeId = normalizePayphoneStoreId(input.storeId);
  const token = input.token.trim();
  if (token.length < 16 || token.length > 4096) {
    throw new PayphoneMerchantError(
      "PAYPHONE_INVALID_TOKEN",
      "El token de terceros no es válido.",
      400
    );
  }
  const key = input.masterKey || readMasterKey();
  if (key.length !== 32) {
    throw new PayphoneMerchantError(
      "PAYPHONE_CREDENTIAL_KEY_INVALID",
      "La clave maestra debe tener 32 bytes.",
      500
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(clientId, storeId, KEY_VERSION));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const fingerprint = createHash("sha256")
    .update(token, "utf8")
    .digest("hex")
    .slice(0, 16);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: KEY_VERSION,
    fingerprint,
  };
}

export function decryptMerchantToken(input: {
  encrypted: EncryptedMerchantToken;
  clientId: string;
  storeId: string;
  masterKey?: Buffer;
}): string {
  const clientId = requiredPayphoneUuid(input.clientId, "client_id");
  const storeId = normalizePayphoneStoreId(input.storeId);
  const key = input.masterKey || readMasterKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(input.encrypted.iv, "base64")
  );
  decipher.setAAD(aad(clientId, storeId, input.encrypted.keyVersion));
  decipher.setAuthTag(Buffer.from(input.encrypted.authTag, "base64"));
  const token = Buffer.concat([
    decipher.update(Buffer.from(input.encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const expected = Buffer.from(input.encrypted.fingerprint, "utf8");
  const actual = Buffer.from(
    createHash("sha256").update(token, "utf8").digest("hex").slice(0, 16),
    "utf8"
  );
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    throw new PayphoneMerchantError(
      "PAYPHONE_CREDENTIAL_INTEGRITY_ERROR",
      "No se pudo validar la credencial del comercio.",
      500
    );
  }
  return token;
}
