import assert from "node:assert/strict";
import test from "node:test";

import { getUniversalCartSnapshot } from "../src/lib/universal-agent-contract.ts";
import { runUniversalConversation } from "../src/lib/universal-agent-orchestrator.ts";
import {
  isUniversalSessionResetMessage,
  universalMessageForFreshOrder,
} from "../src/lib/universal-session-reset.ts";

const context = {
  clientId: "memory-reset-business",
  businessName: "Sabor Limpio",
  businessType: "restaurante",
  tone: "breve y comercial",
  hours: [],
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
    provider: "none",
    summary: "No hay formas de pago configuradas.",
    conditions: [],
  },
  faqs: [],
  policies: [],
  address: "",
  humanHandoffRules: [],
  appointmentConditions: [],
  rules: [],
  knowledge: [],
  summary: "Restaurante de hamburguesas.",
  warnings: [],
};

async function createOrder() {
  const result = await runUniversalConversation({
    message: "3 hamburguesas clásicas",
    context,
  });
  assert.equal(result.decision.intent, "add_to_cart");
  assert.equal(getUniversalCartSnapshot(result.state, context).unitCount, 3);
  return result.state;
}

function assertCleanState(state) {
  const cart = getUniversalCartSnapshot(state, context);
  assert.equal(cart.itemCount, 0);
  assert.equal(cart.unitCount, 0);
  assert.deepEqual(cart.totals, {});
  assert.deepEqual(state.sessionMemory.lastPresentedOfferingKeys, []);
  assert.equal(state.sessionMemory.pendingOfferingKey, null);
  assert.equal(state.sessionMemory.pendingOrderDraft, null);
  assert.equal(state.sessionMemory.checkoutStage, "browsing");
  assert.equal(state.sessionMemory.selectedPaymentMethod, null);
  assert.equal(state.sessionMemory.lastSuggestedOfferingKey, null);
  assert.equal(state.sessionMemory.lastSelectionIndex, null);
}

test("reset phrases are explicit and do not erase unrelated conversations", () => {
  for (const phrase of [
    "nuevo pedido",
    "cancelar",
    "cancelar pedido",
    "empezar de nuevo",
    "comenzar de nuevo",
    "reiniciar pedido",
  ]) {
    assert.equal(isUniversalSessionResetMessage(phrase), true, phrase);
    assert.equal(universalMessageForFreshOrder(phrase), "nuevo pedido");
  }

  assert.equal(isUniversalSessionResetMessage("cancelar cita"), false);
  assert.equal(isUniversalSessionResetMessage("cancelar una hamburguesa"), false);
});

test("every reset command discards the previous cart and conversation memory", async () => {
  const orderedState = await createOrder();

  for (const phrase of ["nuevo pedido", "cancelar", "empezar de nuevo"]) {
    const reset = await runUniversalConversation({
      message: phrase,
      context,
      rawState: orderedState,
    });

    assert.equal(reset.decision.intent, "reset_cart", phrase);
    assertCleanState(reset.state);
    assert.equal(reset.state.recentTurns.length, 2);
    assert.deepEqual(reset.state.recentTurns[0], {
      role: "customer",
      text: phrase,
    });
    assert.doesNotMatch(
      reset.state.recentTurns.map((turn) => turn.text).join(" "),
      /3 hamburguesas|15\.00/i
    );
  }
});

test("a new order starts from zero and never carries products from the prior order", async () => {
  const orderedState = await createOrder();
  const reset = await runUniversalConversation({
    message: "nuevo pedido",
    context,
    rawState: orderedState,
  });
  assertCleanState(reset.state);

  const newOrder = await runUniversalConversation({
    message: "2 papas fritas",
    context,
    rawState: reset.state,
  });
  const cart = getUniversalCartSnapshot(newOrder.state, context);

  assert.equal(cart.itemCount, 1);
  assert.equal(cart.unitCount, 2);
  assert.equal(cart.totals.USD, 5);
  assert.deepEqual(cart.items.map((item) => item.name), ["Papas Fritas"]);
});

test("restarting the simulator with no raw state produces an empty cart", async () => {
  await createOrder();

  const restarted = await runUniversalConversation({
    message: "Total",
    context,
    rawState: undefined,
  });

  assert.equal(restarted.decision.intent, "cart_total");
  assertCleanState(restarted.state);
  assert.match(restarted.answer, /pedido está vacío/i);
});
