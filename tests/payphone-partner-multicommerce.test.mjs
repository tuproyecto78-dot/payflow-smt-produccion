import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  decryptMerchantToken,
  encryptMerchantToken,
  normalizePayphoneRuc,
  PayphoneMerchantError,
  requiredPayphoneUuid,
} from "../src/lib/payphone/merchant-crypto.ts";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const STORE_A = "partner-store-a";
const STORE_B = "partner-store-b";
const TOKEN_A = "third-party-token-business-a";
const TOKEN_B = "third-party-token-business-b";
const MASTER_KEY = randomBytes(32);

async function source(file) {
  return readFile(path.join(process.cwd(), file), "utf8");
}

test("1. client_id is mandatory and must be a UUID", () => {
  assert.throws(
    () => requiredPayphoneUuid(null, "client_id"),
    (error) =>
      error instanceof PayphoneMerchantError &&
      error.code === "PAYPHONE_CLIENT_REQUIRED"
  );
  assert.equal(requiredPayphoneUuid(CLIENT_A, "client_id"), CLIENT_A);
});

test("2. onboarding validates a 13-digit RUC", () => {
  assert.equal(normalizePayphoneRuc("1790012345001"), "1790012345001");
  for (const invalid of ["", "123", "AAAAAAAAAAAAA", "1111111111111"]) {
    assert.throws(
      () => normalizePayphoneRuc(invalid),
      (error) =>
        error instanceof PayphoneMerchantError &&
        error.code === "PAYPHONE_INVALID_RUC"
    );
  }
});

test("3. merchant token is encrypted with AES-256-GCM and decrypts correctly", () => {
  const encrypted = encryptMerchantToken({
    token: TOKEN_A,
    clientId: CLIENT_A,
    storeId: STORE_A,
    masterKey: MASTER_KEY,
  });
  assert.notEqual(encrypted.ciphertext, TOKEN_A);
  assert.equal(Buffer.from(encrypted.iv, "base64").length, 12);
  assert.equal(Buffer.from(encrypted.authTag, "base64").length, 16);
  assert.equal(
    decryptMerchantToken({
      encrypted,
      clientId: CLIENT_A,
      storeId: STORE_A,
      masterKey: MASTER_KEY,
    }),
    TOKEN_A
  );
});

test("4. the same token never produces reusable ciphertext", () => {
  const input = {
    token: TOKEN_A,
    clientId: CLIENT_A,
    storeId: STORE_A,
    masterKey: MASTER_KEY,
  };
  const first = encryptMerchantToken(input);
  const second = encryptMerchantToken(input);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(first.fingerprint, second.fingerprint);
});

test("5. encrypted credentials are cryptographically bound to business and Store ID", () => {
  const encrypted = encryptMerchantToken({
    token: TOKEN_A,
    clientId: CLIENT_A,
    storeId: STORE_A,
    masterKey: MASTER_KEY,
  });
  assert.throws(() =>
    decryptMerchantToken({
      encrypted,
      clientId: CLIENT_B,
      storeId: STORE_B,
      masterKey: MASTER_KEY,
    })
  );
  const second = encryptMerchantToken({
    token: TOKEN_B,
    clientId: CLIENT_B,
    storeId: STORE_B,
    masterKey: MASTER_KEY,
  });
  assert.notEqual(encrypted.ciphertext, second.ciphertext);
});

test("6. onboarding responses and audit metadata cannot expose the token", async () => {
  const onboarding = await source(
    "src/app/api/payphone/partner/onboarding/route.ts"
  );
  const credentials = await source(
    "src/lib/payphone/merchant-credentials.ts"
  );
  assert.match(onboarding, /publicMerchantAccount\(account\)/);
  assert.doesNotMatch(onboarding, /Response\.json\(\s*\{[^}]*token:/i);
  assert.match(credentials, /token_configured:\s*true/);
  assert.match(credentials, /store_id_masked/);
  assert.doesNotMatch(credentials, /token:\s*account\.token/i);
});

test("7. schema isolates one encrypted Partner account per active client", async () => {
  const migration = await source(
    "supabase/migrations/20260729150000_payphone_partner_multicommerce.sql"
  );
  assert.match(
    migration,
    /client_id uuid not null[\s\S]*references public\.client_accounts/i
  );
  assert.match(migration, /unique \(client_id\)/i);
  assert.match(migration, /unique \(ruc\)/i);
  assert.match(migration, /unique \(store_id\)/i);
  assert.match(migration, /token_ciphertext text not null/i);
  assert.match(migration, /PAYPHONE_BUSINESS_INACTIVE/i);
  assert.doesNotMatch(migration, /token\s+text\s+not null/i);
});

test("8. partner transactions enforce tenant idempotency and explicit real-charge state", async () => {
  const migration = await source(
    "supabase/migrations/20260729150000_payphone_partner_multicommerce.sql"
  );
  assert.match(
    migration,
    /payphone_partner_tx_idempotency_unique[\s\S]*unique \(client_id, idempotency_key\)/i
  );
  assert.match(migration, /real_charge boolean not null default false/i);
  assert.match(
    migration,
    /foreign key \(account_id, client_id\)[\s\S]*payphone_partner_accounts\(id, client_id\)/i
  );
});

test("9. API Link receives explicit per-business credentials and uses official cents payload", async () => {
  const apiLink = await source("src/lib/payphone/api-link.ts");
  assert.match(
    apiLink,
    /https:\/\/pay\.payphonetodoesposible\.com\/api/i
  );
  assert.match(apiLink, /credentials\?: PayphoneApiCredentials/);
  assert.match(apiLink, /Authorization: `Bearer \$\{token\}`/);
  assert.match(apiLink, /amount: Math\.round\(req\.amount \* 100\)/);
  assert.doesNotMatch(apiLink, /process\.env\.PAYPHONE_(TOKEN|STORE_ID)/);
  assert.doesNotMatch(apiLink, /\.\.\.data/);
});

test("10. external notification validates Store ID, amount, currency and official response", async () => {
  const migration = await source(
    "supabase/migrations/20260729150000_payphone_partner_multicommerce.sql"
  );
  const webhook = await source(
    "src/app/api/payphone/webhook/route.ts"
  );
  assert.match(migration, /where store_id = p_store_id/i);
  assert.match(
    migration,
    /v_transaction\.amount_cents <> p_amount_cents[\s\S]*currency <> upper\(p_currency\)/i
  );
  assert.match(webhook, /Response: response, ErrorCode: errorCode/);
  assert.match(webhook, /PAYPHONE_EXTERNAL_NOTIFICATION_SECRET/);
  assert.doesNotMatch(webhook, /console\.(log|error)/);
});

test("11. webhook replay is idempotent and terminal states are protected", async () => {
  const migration = await source(
    "supabase/migrations/20260729150000_payphone_partner_multicommerce.sql"
  );
  assert.match(migration, /unique \(event_key\)/i);
  assert.match(migration, /on conflict \(event_key\) do nothing/i);
  assert.match(migration, /'duplicate', true/i);
  assert.match(
    migration,
    /v_transaction\.status in \('approved', 'rejected'\)/i
  );
  assert.match(migration, /for update/i);
});

test("12. fallback remains available and protected product areas are untouched", async () => {
  const createLink = await source(
    "src/app/api/payphone/create-link/route.ts"
  );
  assert.match(createLink, /credentials\.fallbackUrl/);
  assert.match(createLink, /external_link_fallback/);
  assert.match(createLink, /PAYPHONE_REAL_CHARGES_ENABLED/);
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", "631706ac37fa925446c6c1f381ac3bb0d5f42cb5"],
    { encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const protectedPattern =
    /(^|\/)(universal-agent|cart|catalog|promotions?|whatsapp)(\/|[-_.])/i;
  assert.deepEqual(changed.filter((file) => protectedPattern.test(file)), []);
  assert.equal(
    changed.some((file) =>
      /\.(tsx|css|scss)$/.test(file)
    ),
    false
  );
});
