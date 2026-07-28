import assert from "node:assert/strict";
import test from "node:test";

import { getUniversalCartSnapshot } from "../src/lib/universal-agent-contract.ts";
import { runUniversalConversation } from "../src/lib/universal-agent-orchestrator.ts";

const context = {
  clientId: "stable-business",
  businessName: "Sabor Estable",
  businessType: "restaurante",
  tone: "breve y comercial",
  hours: ["Lunes a sábado: 09:00 - 20:00"],
  offerings: [
    {
      key: "product:hamburguesa-clasica",
      kind: "product",
      name: "Hamburguesa Clásica",
      description: "Carne, queso y vegetales",
      price: 5,
      currency: "USD",
      category: "Hamburguesas",
      available: true,
    },
    {
      key: "product:papas-fritas",
      kind: "product",
      name: "Papas Fritas",
      description: "Porción crocante",
      price: 2.5,
      currency: "USD",
      category: "Acompañamientos",
      available: true,
    },
  ],
  promotions: [],
  payment: {
    provider: "external",
    summary: "Aceptamos transferencia bancaria.",
    conditions: ["Aceptamos transferencia bancaria."],
  },
  faqs: [],
  policies: [],
  address: "",
  humanHandoffRules: [],
  appointmentConditions: [],
  rules: ["Responder con brevedad y no inventar datos."],
  summary: "Preparamos hamburguesas y acompañamientos.",
  warnings: [],
};

async function conversationTurn(message, rawState, businessContext = context) {
  return runUniversalConversation({
    message,
    context: businessContext,
    rawState,
  });
}

function assertSafe(text) {
  assert.ok(text.length > 0 && text.length <= 560);
  assert.doesNotMatch(
    text,
    /Payflow|client_id|metadata|supabase|workflow|prompt|cartActions/i
  );
}

test("stable sequence: Promoción, Pagos, 3 hamburguesas clásicas, Nada más, Total", async () => {
  let state = null;

  const promotion = await conversationTurn("Promoción", state);
  state = promotion.state;
  assert.equal(promotion.decision.intent, "query_promotion");
  assert.deepEqual(promotion.decision.scopes, ["identity", "promotions"]);
  assert.equal(promotion.decision.cartActions.length, 0);
  assert.equal(getUniversalCartSnapshot(state, context).unitCount, 0);
  assert.match(promotion.answer, /no hay promociones activas/i);
  assert.doesNotMatch(
    promotion.answer,
    /Hamburguesa|Papas|recomienda|opciones disponibles|carrito|pedido/i
  );
  assert.doesNotMatch(promotion.answer, /\?/);
  assertSafe(promotion.answer);

  const payments = await conversationTurn("Pagos", state);
  state = payments.state;
  assert.equal(payments.decision.intent, "query_payment");
  assert.deepEqual(payments.decision.scopes, ["identity", "payment"]);
  assert.equal(payments.decision.cartActions.length, 0);
  assert.match(payments.answer, /transferencia/i);
  assert.doesNotMatch(payments.answer, /Hamburguesa|Papas/i);
  assertSafe(payments.answer);

  const order = await conversationTurn("3 hamburguesas clásicas", state);
  state = order.state;
  assert.equal(order.decision.intent, "add_to_cart");
  const orderedCart = getUniversalCartSnapshot(state, context);
  assert.equal(orderedCart.unitCount, 3);
  assert.equal(orderedCart.totals.USD, 15);
  assert.match(order.answer, /3 × Hamburguesa Clásica/i);
  assertSafe(order.answer);

  const finish = await conversationTurn("Nada más", state);
  state = finish.state;
  assert.equal(finish.decision.intent, "finish_order_selection");
  assert.equal(getUniversalCartSnapshot(state, context).unitCount, 3);
  assertSafe(finish.answer);

  const total = await conversationTurn("Total", state);
  state = total.state;
  assert.equal(total.decision.intent, "cart_total");
  const finalCart = getUniversalCartSnapshot(state, context);
  assert.equal(finalCart.unitCount, 3);
  assert.equal(finalCart.totals.USD, 15);
  assert.match(total.answer, /15\.00 USD/);
  assertSafe(total.answer);
});

test("an active promotion response contains promotions only and never touches the cart", async () => {
  const promotionContext = {
    ...context,
    promotions: ["2x1 en Hamburguesa Clásica todos los viernes"],
  };
  const result = await conversationTurn("Promoción", null, promotionContext);

  assert.equal(result.decision.intent, "query_promotion");
  assert.deepEqual(result.decision.scopes, ["identity", "promotions"]);
  assert.equal(result.decision.cartActions.length, 0);
  assert.equal(getUniversalCartSnapshot(result.state, promotionContext).unitCount, 0);
  assert.match(result.answer, /2x1 en Hamburguesa Clásica todos los viernes/i);
  assert.doesNotMatch(result.answer, /recomienda|¿Qué deseas|carrito|subtotal|total/i);
  assertSafe(result.answer);
});
