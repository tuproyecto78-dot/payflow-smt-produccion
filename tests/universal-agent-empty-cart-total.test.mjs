import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmptyCartTotalState,
  EMPTY_CART_TOTAL_ANSWER,
  isEmptyCartTotalRequest,
  parseSimulatorState,
  simulatorCartIsEmpty,
} from "../src/lib/universal-empty-cart-total.ts";

test("empty-cart total phrases are recognized exactly", () => {
  for (const message of [
    "total",
    "Total",
    "mi total",
    "¿Cuánto es?",
    "resumen",
  ]) {
    assert.equal(isEmptyCartTotalRequest(message), true, message);
  }
});

test("unrelated product, promotion and payment questions keep the normal engine", () => {
  for (const message of [
    "cuánto cuesta la hamburguesa",
    "resumen de promociones",
    "total con transferencia",
    "qué venden",
  ]) {
    assert.equal(isEmptyCartTotalRequest(message), false, message);
  }
});

test("the protection only applies when the temporary cart is empty", () => {
  assert.equal(simulatorCartIsEmpty({ cart: [] }), true);
  assert.equal(simulatorCartIsEmpty({}), true);
  assert.equal(
    simulatorCartIsEmpty({
      cart: [{ offeringKey: "product:hamburguesa", quantity: 2 }],
    }),
    false
  );
});

test("the empty total answer is fixed and leaves no clarification", () => {
  const state = buildEmptyCartTotalState({
    state: {
      version: 2,
      cart: [],
      recentTurns: [],
      lastIntent: "general_inquiry",
      pendingQuestion: "¿Qué producto deseas?",
      sessionMemory: {
        version: 3,
        lastPresentedOfferingKeys: [],
        lastPresentedListPurpose: "information",
        pendingOfferingKey: null,
        pendingOrderDraft: null,
        checkoutStage: "browsing",
        selectedPaymentMethod: null,
        lastSuggestedOfferingKey: null,
        intentCounts: {},
        lastSelectionIndex: null,
      },
    },
    customerMessage: "resumen",
  });

  assert.equal(EMPTY_CART_TOTAL_ANSWER, "Tu pedido está vacío por ahora.");
  assert.deepEqual(state.cart, []);
  assert.equal(state.lastIntent, "cart_total");
  assert.equal(state.pendingQuestion, null);
  assert.deepEqual(state.recentTurns, [
    { role: "customer", text: "resumen" },
    { role: "business", text: EMPTY_CART_TOTAL_ANSWER },
  ]);
  assert.equal(state.sessionMemory.intentCounts.cart_total, 1);
});

test("malformed simulator memory is not treated as a confirmed empty cart", () => {
  assert.equal(parseSimulatorState(undefined).parsed, true);
  assert.equal(parseSimulatorState(undefined).state.cart, undefined);
  assert.equal(parseSimulatorState("not-json").parsed, false);
});
