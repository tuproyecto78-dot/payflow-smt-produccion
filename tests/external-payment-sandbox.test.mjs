import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ExternalPaymentError } from "../src/lib/external-integrations/payments/domain.ts";
import { InMemoryExternalPaymentRepository } from "../src/lib/external-integrations/payments/repository.ts";
import { ExternalPaymentSandboxService } from "../src/lib/external-integrations/payments/service.ts";
import {
  signExternalPaymentWebhook,
  verifyExternalPaymentWebhookSignature,
} from "../src/lib/external-integrations/payments/webhook-signature.ts";

function paymentFixture(overrides = {}) {
  return {
    clientId: "client-test",
    createdBy: "user-test",
    amount: 15,
    currency: "USD",
    description: "Pedido de prueba",
    customerName: "Cliente Demo",
    orderReference: "ORDER-TEST-001",
    idempotencyKey: "payment-test-001",
    publicBaseUrl: "https://preview.example.com",
    ...overrides,
  };
}

function sandboxEvent(creation, overrides = {}) {
  return {
    provider: "sandbox",
    event_id: "event-test-001",
    payment_request_id: creation.payment.id,
    provider_reference: creation.sandboxProviderReference,
    status: "approved",
    occurred_at: "2026-07-28T12:00:00.000Z",
    ...overrides,
  };
}

test("a sandbox request starts pending, returns a link and never calls a real provider", async () => {
  const repository = new InMemoryExternalPaymentRepository({
    "client-test": "La Estancia",
  });
  const service = new ExternalPaymentSandboxService(repository);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("A sandbox payment must never call fetch");
  };

  try {
    const result = await service.create(paymentFixture());
    assert.equal(result.reused, false);
    assert.equal(result.payment.status, "pending");
    assert.equal(result.payment.sandbox, true);
    assert.match(
      result.payment.customerConfirmation,
      /^La Estancia: tu pago de prueba está pendiente de confirmación\.$/
    );
    assert.deepEqual(result.payment.button, {
      label: "Abrir pago de prueba",
      url: result.payment.paymentLink,
    });
    const link = new URL(result.payment.paymentLink);
    assert.equal(link.origin, "https://preview.example.com");
    assert.equal(
      link.pathname,
      `/api/integrations/payments/sandbox/checkout/${result.payment.id}`
    );
    assert.equal(link.searchParams.get("token")?.length, 64);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creation is idempotent and rejects reuse with different payment facts", async () => {
  const service = new ExternalPaymentSandboxService(
    new InMemoryExternalPaymentRepository({
      "client-test": "La Estancia",
    })
  );
  const first = await service.create(paymentFixture());
  const repeated = await service.create(paymentFixture());
  assert.equal(repeated.reused, true);
  assert.equal(repeated.payment.id, first.payment.id);
  assert.equal(
    repeated.sandboxProviderReference,
    first.sandboxProviderReference
  );

  await assert.rejects(
    () => service.create(paymentFixture({ amount: 16 })),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "IDEMPOTENCY_CONFLICT" &&
      error.httpStatus === 409
  );
});

test("only a webhook event moves pending to approved and duplicates are harmless", async () => {
  const service = new ExternalPaymentSandboxService(
    new InMemoryExternalPaymentRepository({
      "client-test": "La Estancia",
    })
  );
  const creation = await service.create(paymentFixture());
  const event = sandboxEvent(creation);
  const approved = await service.applyWebhook(event);

  assert.equal(approved.duplicate, false);
  assert.equal(approved.transitionApplied, true);
  assert.equal(approved.payment.status, "approved");
  assert.equal(
    approved.payment.customerConfirmation,
    "La Estancia: pago de prueba aprobado."
  );
  assert.equal(approved.payment.button, null);

  const repeated = await service.applyWebhook(event);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.transitionApplied, false);
  assert.equal(repeated.payment.status, "approved");
});

test("approved and rejected are terminal states", async () => {
  const service = new ExternalPaymentSandboxService(
    new InMemoryExternalPaymentRepository({
      "client-test": "La Estancia",
    })
  );
  const approvedCreation = await service.create(paymentFixture());
  await service.applyWebhook(sandboxEvent(approvedCreation));
  const attemptedRegression = await service.applyWebhook(
    sandboxEvent(approvedCreation, {
      event_id: "event-test-002",
      status: "rejected",
      occurred_at: "2026-07-28T12:01:00.000Z",
    })
  );
  assert.equal(attemptedRegression.transitionApplied, false);
  assert.equal(attemptedRegression.payment.status, "approved");

  const rejectedCreation = await service.create(
    paymentFixture({
      orderReference: "ORDER-TEST-002",
      idempotencyKey: "payment-test-002",
    })
  );
  const rejected = await service.applyWebhook(
    sandboxEvent(rejectedCreation, {
      event_id: "event-test-003",
      status: "rejected",
      occurred_at: "2026-07-28T12:02:00.000Z",
    })
  );
  assert.equal(rejected.transitionApplied, true);
  assert.equal(rejected.payment.status, "rejected");
  assert.equal(
    rejected.payment.customerConfirmation,
    "La Estancia: el pago de prueba fue rechazado."
  );
});

test("checkout tokens and tenant ownership are enforced", async () => {
  const service = new ExternalPaymentSandboxService(
    new InMemoryExternalPaymentRepository({
      "client-test": "La Estancia",
    })
  );
  const creation = await service.create(paymentFixture());
  const token = new URL(creation.payment.paymentLink).searchParams.get("token");
  assert.ok(token);

  const checkout = await service.getCheckout(creation.payment.id, token);
  assert.equal(checkout.id, creation.payment.id);

  await assert.rejects(
    () => service.getCheckout(creation.payment.id, "invalid"),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "INVALID_CHECKOUT_TOKEN"
  );
  await assert.rejects(
    () => service.getForClient(creation.payment.id, "another-client"),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "PAYMENT_NOT_FOUND"
  );
});

test("webhook signatures reject tampering", () => {
  const secret = "sandbox-secret-with-at-least-32-characters";
  const rawBody = JSON.stringify({
    provider: "sandbox",
    event_id: "event-test-001",
  });
  const signature = signExternalPaymentWebhook(rawBody, secret);
  assert.equal(
    verifyExternalPaymentWebhookSignature({
      rawBody,
      receivedSignature: signature,
      secret,
    }),
    true
  );
  assert.equal(
    verifyExternalPaymentWebhookSignature({
      rawBody: `${rawBody} `,
      receivedSignature: signature,
      secret,
    }),
    false
  );
  assert.equal(
    verifyExternalPaymentWebhookSignature({
      rawBody,
      receivedSignature: signature,
      secret: "short",
    }),
    false
  );
});

test("the external payment module has no dependency on the stable agent or commerce modules", async () => {
  const sourceFiles = [
    "src/lib/external-integrations/payments/types.ts",
    "src/lib/external-integrations/payments/domain.ts",
    "src/lib/external-integrations/payments/repository.ts",
    "src/lib/external-integrations/payments/sandbox-provider.ts",
    "src/lib/external-integrations/payments/service.ts",
    "src/lib/external-integrations/payments/supabase-repository.ts",
    "src/lib/external-integrations/payments/runtime.ts",
    "src/lib/external-integrations/payments/webhook-signature.ts",
    "src/app/api/integrations/payments/requests/route.ts",
    "src/app/api/integrations/payments/requests/[id]/route.ts",
    "src/app/api/integrations/payments/sandbox/checkout/[id]/route.ts",
    "src/app/api/integrations/payments/webhooks/sandbox/route.ts",
  ];
  const contents = await Promise.all(
    sourceFiles.map((file) =>
      readFile(path.join(process.cwd(), file), "utf8")
    )
  );
  const source = contents.join("\n");
  assert.doesNotMatch(
    source,
    /universal-|catalog|cart|promotion|whatsapp|@\/lib\/payments(?:["'])/i
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test("the migration keeps payment events atomic and server-only", async () => {
  const migration = await readFile(
    path.join(
      process.cwd(),
      "supabase/migrations/20260728050000_external_payment_sandbox.sql"
    ),
    "utf8"
  );
  assert.match(
    migration,
    /status in \('pending', 'approved', 'rejected'\)/i
  );
  assert.match(migration, /for update/i);
  assert.match(
    migration,
    /on conflict \(provider, provider_event_id\) do nothing/i
  );
  assert.match(
    migration,
    /alter table public\.external_payment_requests enable row level security/i
  );
  assert.match(
    migration,
    /revoke all on public\.external_payment_requests from anon, authenticated/i
  );
  assert.match(
    migration,
    /grant execute on function public\.apply_external_payment_event[\s\S]*to service_role/i
  );
});
