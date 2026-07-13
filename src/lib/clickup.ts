import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
const ENCRYPTED_SECRET_PREFIX = "enc:v1";

let supabaseAdmin: SupabaseClient | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  supabaseAdmin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supabaseAdmin;
}

export function getClickUpToken(): string {
  return requiredEnv("CLICKUP_API_TOKEN");
}

export function getClickUpTokenRef(): string {
  return process.env.CLICKUP_TOKEN_REF?.trim() || "main_clickup_token";
}

export async function clickUpRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${CLICKUP_API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: getClickUpToken(),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail =
      typeof payload === "string" ? payload : JSON.stringify(payload || {});
    throw new Error(`ClickUp devolvio HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }

  return payload as T;
}

function encryptionKey(): Buffer {
  const sessionSecret = requiredEnv("SESSION_SECRET");
  return createHash("sha256")
    .update(`payflow-clickup-webhook:${sessionSecret}`)
    .digest();
}

export function encryptWebhookSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_SECRET_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptWebhookSecret(value: string): string {
  const [enc, version, ivEncoded, tagEncoded, encryptedEncoded] =
    value.split(":");
  if (`${enc}:${version}` !== ENCRYPTED_SECRET_PREFIX) {
    throw new Error("La referencia del secreto de ClickUp no esta cifrada.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivEncoded, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function verifyClickUpSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export function clickUpIdempotencyKey(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

