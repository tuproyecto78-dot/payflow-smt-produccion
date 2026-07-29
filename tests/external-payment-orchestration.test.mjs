import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  ManualLinkPaymentAdapter,
  PayPhonePresentationAdapter,
  PaymentAdapterRegistry,
} from "../src/lib/external-integrations/payments/adapters.ts";
import { assertPaymentClientAccess } from "../src/lib/external-integrations/payments/access.ts";
import {
  assertNoSensitivePaymentFields,
  ExternalPaymentError,
} from "../src/lib/external-integrations/payments/domain.ts";
import { InMemoryExternalPaymentRepository } from "../src/lib/external-integrations/payments/repository.ts";
import { ExternalPaymentOrchestrationService } from "../src/lib/external-integrations/payments/service.ts";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const OWNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function fixture(options = {}) {
  const repository =
    options.repository ||
    new InMemoryExternalPaymentRepository({
      [CLIENT_A]: { businessName: "La Estancia", status: "active" },
      [CLIENT_B]: { businessName: "Negocio B", status: "active" },
    });
  const service = new ExternalPaymentOrchestrationService(
    repository,
    new PaymentAdapterRegistry([
      new ManualLinkPaymentAdapter(),
      new PayPhonePresentationAdapter({
        enabled: options.payphoneEnabled ?? true,
        mode: options.payphoneMode || "presentation",
        realChargesEnabled: options.realChargesEnabled ?? false,
      }),
    ]),
    () => "2026-07-29T15:00:00.000Z"
  );
  return { repository, service };
}

async function registerManual(service, overrides = {}) {
  return service.registerMethod({
    clientId: CLIENT_A,
    createdBy: OWNER_A,
    kind: "manual_link",
    mode: "manual",
    displayName: "Link bancario",
    externalUrl: "https://payments.example.com/business-a",
    ...overrides,
  });
}

function requestInput(methodId, overrides = {}) {
  return {
    clientId: CLIENT_A,
    paymentMethodId: methodId,
    createdBy: OWNER_A,
    amount: 15,
    currency: "USD",
    description: "Pedido de prueba",
    customerName: "Cliente Demo",
    orderReference: "ORDER-MANUAL-001",
    idempotencyKey: "manual-payment-001",
    publicBaseUrl: "https://preview.example.com",
    ...overrides,
  };
}

test("1. client_id null is rejected before any payment operation", async () => {
  const { service } = fixture();
  await assert.rejects(
    () =>
      service.registerMethod({
        clientId: null,
        createdBy: OWNER_A,
        kind: "manual_link",
        displayName: "Link",
        externalUrl: "https://payments.example.com/a",
      }),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "PAYMENT_CLIENT_REQUIRED" &&
      error.httpStatus === 400
  );
});

test("2. suspended businesses cannot register or use payment methods", async () => {
  const repository = new InMemoryExternalPaymentRepository({
    [CLIENT_A]: { businessName: "Suspendido", status: "suspended" },
  });
  const { service } = fixture({ repository });
  await assert.rejects(
    () => registerManual(service),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "PAYMENT_BUSINESS_INACTIVE"
  );
});

test("3. tenant and role authorization is explicit", () => {
  assert.equal(
    assertPaymentClientAccess({
      session: { userId: ADMIN, role: "admin", clientId: null },
      requestedClientId: CLIENT_A,
      permission: "manage",
    }),
    CLIENT_A
  );
  assert.equal(
    assertPaymentClientAccess({
      session: {
        userId: OWNER_A,
        role: "client_owner",
        clientId: CLIENT_A,
      },
      requestedClientId: CLIENT_A,
      permission: "confirm",
    }),
    CLIENT_A
  );
  assert.throws(
    () =>
      assertPaymentClientAccess({
        session: {
          userId: OWNER_B,
          role: "client_owner",
          clientId: CLIENT_B,
        },
        requestedClientId: CLIENT_A,
        permission: "manage",
      }),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "PAYMENT_CLIENT_FORBIDDEN"
  );
  assert.throws(
    () =>
      assertPaymentClientAccess({
        session: {
          userId: OWNER_A,
          role: "client_operator",
          clientId: CLIENT_A,
        },
        requestedClientId: CLIENT_A,
        permission: "confirm",
      }),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "PAYMENT_PERMISSION_FORBIDDEN"
  );
});

test("4. manual methods can be registered and listed without secrets", async () => {
  const { service } = fixture();
  const method = await registerManual(service);
  const methods = await service.listMethods(CLIENT_A);
  assert.equal(method.kind, "manual_link");
  assert.equal(method.mode, "manual");
  assert.equal(method.externalUrl, "https://payments.example.com/business-a");
  assert.equal(method.status, "active");
  assert.deepEqual(methods, [method]);
  assert.doesNotMatch(
    JSON.stringify(methods),
    /token|secret|api_key|credential/i
  );
});

test("5. method deactivation is idempotent and blocks new requests", async () => {
  const { service } = fixture();
  const method = await registerManual(service);
  const first = await service.deactivateMethod({
    clientId: CLIENT_A,
    methodId: method.id,
    actorUserId: OWNER_A,
  });
  const second = await service.deactivateMethod({
    clientId: CLIENT_A,
    methodId: method.id,
    actorUserId: OWNER_A,
  });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  await assert.rejects(
    () => service.create(requestInput(method.id)),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "PAYMENT_METHOD_NOT_FOUND"
  );
});

test("6. a manual request stays pending and only exposes the configured link", async () => {
  const { service } = fixture();
  const method = await registerManual(service);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("payment orchestration must not call a provider");
  };
  try {
    const result = await service.create(requestInput(method.id));
    assert.equal(result.reused, false);
    assert.equal(result.payment.status, "pending");
    assert.equal(result.payment.confirmationMode, "manual");
    assert.equal(result.payment.realCharge, false);
    assert.equal(
      result.payment.paymentLink,
      "https://payments.example.com/business-a"
    );
    assert.deepEqual(result.payment.button, {
      label: "Abrir enlace externo",
      url: "https://payments.example.com/business-a",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("7. request idempotency reuses facts and rejects conflicts", async () => {
  const { service } = fixture();
  const method = await registerManual(service);
  const first = await service.create(requestInput(method.id));
  const repeated = await service.create(requestInput(method.id));
  assert.equal(repeated.reused, true);
  assert.equal(repeated.payment.id, first.payment.id);
  await assert.rejects(
    () => service.create(requestInput(method.id, { amount: 16 })),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "IDEMPOTENCY_CONFLICT"
  );
});

test("8. a method from another business cannot create a payment", async () => {
  const { service } = fixture();
  const method = await service.registerMethod({
    clientId: CLIENT_B,
    createdBy: OWNER_B,
    kind: "manual_link",
    displayName: "Link B",
    externalUrl: "https://payments.example.com/business-b",
  });
  await assert.rejects(
    () => service.create(requestInput(method.id)),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "PAYMENT_METHOD_NOT_FOUND"
  );
});

test("9. manual confirmation is audited and transitions pending once", async () => {
  const { repository, service } = fixture();
  const method = await registerManual(service);
  const created = await service.create(requestInput(method.id));
  const confirmed = await service.confirmManual({
    clientId: CLIENT_A,
    paymentRequestId: created.payment.id,
    actorUserId: OWNER_A,
    actorRole: "client_owner",
    status: "approved",
    idempotencyKey: "manual-confirm-001",
    note: "Comprobante revisado",
  });
  assert.equal(confirmed.transitionApplied, true);
  assert.equal(confirmed.duplicate, false);
  assert.equal(confirmed.payment.status, "approved");
  assert.equal(repository.getConfirmationAudit().length, 1);
  assert.equal(repository.getConfirmationAudit()[0].newStatus, "approved");
});

test("10. duplicate confirmation is harmless and terminal states are protected", async () => {
  const { service } = fixture();
  const method = await registerManual(service);
  const created = await service.create(requestInput(method.id));
  const command = {
    clientId: CLIENT_A,
    paymentRequestId: created.payment.id,
    actorUserId: OWNER_A,
    actorRole: "client_owner",
    status: "rejected",
    idempotencyKey: "manual-confirm-002",
  };
  await service.confirmManual(command);
  const duplicate = await service.confirmManual(command);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.transitionApplied, false);
  assert.equal(duplicate.payment.status, "rejected");
  await assert.rejects(
    () =>
      service.confirmManual({
        ...command,
        status: "approved",
        idempotencyKey: "manual-confirm-003",
      }),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "PAYMENT_TERMINAL"
  );
});

test("11. PayPhone sandbox and presentation are adapter-only and can never charge", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("PayPhone presentation must not call a provider");
  };
  try {
    for (const mode of ["sandbox", "presentation"]) {
      const { service } = fixture({ payphoneMode: mode });
      const method = await service.registerMethod({
        clientId: CLIENT_A,
        createdBy: OWNER_A,
        kind: "payphone",
        mode,
        displayName: `PayPhone ${mode}`,
        providerAccountReference: `demo-account-${mode}`,
      });
      const result = await service.create(
        requestInput(method.id, {
          idempotencyKey: `payphone-${mode}-001`,
          orderReference: `ORDER-PAYPHONE-${mode.toUpperCase()}`,
        })
      );
      assert.equal(result.payment.provider, "payphone");
      assert.equal(result.payment.providerMode, mode);
      assert.equal(result.payment.confirmationMode, "presentation");
      assert.equal(result.payment.status, "pending");
      assert.equal(result.payment.realCharge, false);
      assert.match(
        result.payment.paymentLink,
        /\/api\/integrations\/payments\/presentation\/payphone\//
      );
      assert.doesNotMatch(result.payment.paymentLink, /token|secret/i);
    }
    const unsafe = fixture({ realChargesEnabled: true });
    const unsafeMethod = await unsafe.service.registerMethod({
      clientId: CLIENT_A,
      createdBy: OWNER_A,
      kind: "payphone",
      mode: "presentation",
      displayName: "PayPhone blocked",
    });
    await assert.rejects(
      () =>
        unsafe.service.create(
          requestInput(unsafeMethod.id, {
            idempotencyKey: "payphone-blocked-001",
            orderReference: "ORDER-PAYPHONE-BLOCKED",
          })
        ),
      (error) =>
        error instanceof ExternalPaymentError &&
        error.code === "REAL_CHARGES_DISABLED"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("12. migration, endpoints and source preserve security and module isolation", async () => {
  assert.throws(
    () =>
      assertNoSensitivePaymentFields({
        kind: "payphone",
        api_token: "must-not-enter",
      }),
    (error) =>
      error instanceof ExternalPaymentError &&
      error.code === "SENSITIVE_PAYMENT_FIELD"
  );

  const sourceFiles = [
    "src/lib/external-integrations/payments/types.ts",
    "src/lib/external-integrations/payments/domain.ts",
    "src/lib/external-integrations/payments/access.ts",
    "src/lib/external-integrations/payments/adapters.ts",
    "src/lib/external-integrations/payments/repository.ts",
    "src/lib/external-integrations/payments/service.ts",
    "src/lib/external-integrations/payments/supabase-repository.ts",
    "src/lib/external-integrations/payments/runtime.ts",
    "src/app/api/integrations/payments/methods/route.ts",
    "src/app/api/integrations/payments/methods/[id]/deactivate/route.ts",
    "src/app/api/integrations/payments/requests/route.ts",
    "src/app/api/integrations/payments/requests/[id]/route.ts",
    "src/app/api/integrations/payments/requests/[id]/manual-confirmation/route.ts",
    "src/app/api/integrations/payments/presentation/payphone/[id]/route.ts",
  ];
  const source = (
    await Promise.all(
      sourceFiles.map((file) =>
        readFile(path.join(process.cwd(), file), "utf8")
      )
    )
  ).join("\n");
  assert.doesNotMatch(
    source,
    /universal-|catalog|cart|promotion|whatsapp|@\/lib\/payments(?:["'])/i
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /process\.env\.PAYPHONE_TOKEN/);

  const migration = await readFile(
    path.join(
      process.cwd(),
      "supabase/migrations/20260729110000_business_payment_methods.sql"
    ),
    "utf8"
  );
  assert.match(
    migration,
    /foreign key \(client_id\)[\s\S]*references public\.client_accounts\(id\)/i
  );
  assert.match(migration, /EXTERNAL_PAYMENT_CLIENT_REQUIRED/i);
  assert.match(migration, /status = 'active'/i);
  assert.match(migration, /check \(real_charge = false\)/i);
  assert.match(migration, /confirm_external_payment_manual/i);
  assert.match(migration, /for update/i);
  assert.match(
    migration,
    /external_payment_confirmation_audit[\s\S]*unique \(payment_request_id, idempotency_key\)/i
  );
  assert.match(
    migration,
    /revoke execute on function public\.apply_external_payment_event/i
  );
});
