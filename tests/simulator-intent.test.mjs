import assert from "node:assert/strict";
import test from "node:test";

import {
  detectSimulatorIntent,
  formatSimulatorCatalog,
  formatSimulatorPromotions,
  getSimulatorDataNeeds,
} from "../src/lib/simulator-intent.ts";
import {
  getAuditClientId,
  withAuditClientId,
} from "../src/lib/audit-metadata.ts";

test('"Hola" is a greeting and requests no business data', () => {
  const intent = detectSimulatorIntent("Hola");
  assert.equal(intent, "greeting");
  assert.deepEqual(getSimulatorDataNeeds(intent), {
    catalog: false,
    promotions: false,
  });
});

test("catalog wording requests catalog only and formats real prices", () => {
  const intent = detectSimulatorIntent("¿Qué platos tienen hoy con precios?");
  assert.equal(intent, "catalog");
  assert.deepEqual(getSimulatorDataNeeds(intent), {
    catalog: true,
    promotions: false,
  });

  const answer = formatSimulatorCatalog([
    {
      name: "Ceviche",
      description: "Con chifles",
      price: 8.5,
      currency: "USD",
      stock: 12,
      trackInventory: true,
      category: "Platos",
    },
  ]);
  assert.match(answer, /Ceviche/);
  assert.match(answer, /8\.50 USD/);
});

test("promotion wording requests promotions only", () => {
  const intent = detectSimulatorIntent("¿Hay promociones?");
  assert.equal(intent, "promotion");
  assert.deepEqual(getSimulatorDataNeeds(intent), {
    catalog: false,
    promotions: true,
  });
  assert.equal(
    formatSimulatorPromotions(""),
    "No hay promociones vigentes cargadas."
  );
  assert.match(
    formatSimulatorPromotions("2x1 los martes"),
    /2x1 los martes/
  );
});

test("audit tenant identity lives in metadata or client_account entity", () => {
  const metadata = withAuditClientId("client-123", { source: "test" });
  assert.equal(getAuditClientId({ metadata }), "client-123");
  assert.equal(
    getAuditClientId({
      entity_type: "client_account",
      entity_id: "legacy-client",
      metadata: {},
    }),
    "legacy-client"
  );
});
