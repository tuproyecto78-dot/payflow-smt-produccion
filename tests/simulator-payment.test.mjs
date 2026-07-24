import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPaymentMethodAnswer,
  isPaymentMethodMessage,
} from "../src/lib/simulator-payment.ts";

const baseContext = {
  clientId: "client-123",
  businessName: "Burger House",
};

test("payment methods have priority over product words", () => {
  assert.equal(isPaymentMethodMessage("¿Tienen transferencia?"), true);
  assert.equal(isPaymentMethodMessage("¿Aceptan tarjeta?"), true);
  assert.equal(isPaymentMethodMessage("¿Qué tipos de pago manejan?"), true);
  assert.equal(
    isPaymentMethodMessage("¿Aceptan tarjeta para las hamburguesas?"),
    true
  );
});

test("cart totals remain a cart intent", () => {
  assert.equal(isPaymentMethodMessage("¿Cuánto pago?"), false);
  assert.equal(isPaymentMethodMessage("¿Cuál es el total del pedido?"), false);
});

test("configured online payment is short and never mentions products", () => {
  const answer = formatPaymentMethodAnswer({
    ...baseContext,
    paymentProvider: "payphone",
  });
  assert.match(answer, /pago en línea configurado/i);
  assert.ok(answer.length < 180);
  assert.doesNotMatch(answer, /hamburguesa|papas|catálogo|PayFlow/i);
});

test("external payment is described without inventing card or transfer", () => {
  const answer = formatPaymentMethodAnswer({
    ...baseContext,
    paymentProvider: "external",
  });
  assert.match(answer, /método de pago externo configurado/i);
  assert.doesNotMatch(answer, /tarjeta|transferencia|efectivo|PayFlow/i);
});

test("missing payment configuration is communicated commercially", () => {
  const answer = formatPaymentMethodAnswer({
    ...baseContext,
    paymentProvider: "none",
  });
  assert.match(answer, /no tenemos formas de pago registradas/i);
  assert.ok(answer.length < 180);
  assert.doesNotMatch(answer, /hamburguesa|papas|catálogo|PayFlow/i);
});
