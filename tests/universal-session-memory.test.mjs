import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUniversalCartActions,
  getUniversalCartSnapshot,
} from "../src/lib/universal-agent-contract.ts";
import {
  appendUniversalSessionTurn,
  classifyUniversalSessionIntent,
  composeUniversalSessionAnswer,
  normalizeUniversalSessionState,
  transitionUniversalSessionMemory,
} from "../src/lib/universal-session-memory.ts";

const context = {
  clientId: "client-memory",
  businessName: "Burger Central",
  businessType: "restaurante",
  tone: "amable y comercial",
  hours: ["Viernes: 10:00 - 22:00"],
  offerings: [
    {
      key: "product:hamburguesa-bbq",
      kind: "product",
      name: "Hamburguesa BBQ",
      description: "Carne, queso y salsa BBQ",
      price: 6.5,
      currency: "USD",
      category: "Hamburguesas",
      available: true,
    },
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
      key: "product:hamburguesa-doble",
      kind: "product",
      name: "Hamburguesa Doble",
      description: "Doble carne y queso",
      price: 7.5,
      currency: "USD",
      category: "Hamburguesas",
      available: true,
    },
    {
      key: "product:hamburguesa-vegana",
      kind: "product",
      name: "Hamburguesa Vegana",
      description: "Proteína vegetal",
      price: 6,
      currency: "USD",
      category: "Hamburguesas",
      available: true,
    },
    {
      key: "product:papas",
      kind: "product",
      name: "Porción de Papas",
      description: "Papas fritas",
      price: 2.5,
      currency: "USD",
      category: "Acompañamientos",
      available: true,
    },
  ],
  promotions: ["2x1 en hamburguesas los viernes"],
  payment: {
    provider: "none",
    summary: "No hay una forma de pago registrada.",
    conditions: [],
  },
  faqs: [],
  policies: [],
  address: "",
  humanHandoffRules: [],
  appointmentConditions: [],
  rules: ["Responder corto."],
  summary: "Hamburguesas y acompañamientos.",
  warnings: [],
};

function answerFor(message, decision, state) {
  return composeUniversalSessionAnswer({
    message,
    decision,
    context,
    state,
  });
}

test("an informational list remembers order without arming a purchase", () => {
  let state = normalizeUniversalSessionState(null, context);

  const categoryDecision = classifyUniversalSessionIntent({
    message: "hamburguesas",
    context,
    state,
  });
  assert.notEqual(categoryDecision.intent, "other");
  assert.equal(categoryDecision.selection.offeringKeys.length, 4);

  const categoryAnswer = answerFor("hamburguesas", categoryDecision, state);
  assert.match(categoryAnswer, /1\. Hamburguesa BBQ/);
  assert.match(categoryAnswer, /3\. Hamburguesa Doble/);
  assert.ok(categoryAnswer.length <= 560);

  state = transitionUniversalSessionMemory({
    state,
    decision: categoryDecision,
    context,
  });
  state = appendUniversalSessionTurn({
    state,
    customerMessage: "hamburguesas",
    businessAnswer: categoryAnswer,
    intent: categoryDecision.intent,
    pendingQuestion: categoryDecision.clarificationQuestion,
  });

  assert.deepEqual(state.sessionMemory.lastPresentedOfferingKeys, [
    "product:hamburguesa-bbq",
    "product:hamburguesa-clasica",
    "product:hamburguesa-doble",
    "product:hamburguesa-vegana",
  ]);
  assert.equal(state.sessionMemory.lastPresentedListPurpose, "information");

  const selectionDecision = classifyUniversalSessionIntent({
    message: "3",
    context,
    state,
  });
  assert.equal(selectionDecision.intent, "query_offering");
  assert.deepEqual(selectionDecision.selection.offeringKeys, [
    "product:hamburguesa-doble",
  ]);
  assert.deepEqual(selectionDecision.scopes, ["identity", "offerings"]);
  assert.equal(selectionDecision.cartActions.length, 0);

  const selectionAnswer = answerFor("3", selectionDecision, state);
  assert.match(selectionAnswer, /Hamburguesa Doble/);
  assert.doesNotMatch(selectionAnswer, /cuántas unidades|subtotal|total temporal/i);

  state = transitionUniversalSessionMemory({
    state,
    decision: selectionDecision,
    context,
  });
  assert.equal(state.sessionMemory.pendingOfferingKey, null);
  assert.deepEqual(state.sessionMemory.lastPresentedOfferingKeys, [
    "product:hamburguesa-bbq",
    "product:hamburguesa-clasica",
    "product:hamburguesa-doble",
    "product:hamburguesa-vegana",
  ]);

  const purchaseDecision = classifyUniversalSessionIntent({
    message: "quiero la opción 3",
    context,
    state,
  });
  assert.equal(purchaseDecision.intent, "clarification");
  assert.ok(purchaseDecision.scopes.includes("cart"));
  assert.equal(purchaseDecision.cartActions.length, 0);

  state = transitionUniversalSessionMemory({
    state,
    decision: purchaseDecision,
    context,
  });
  assert.equal(
    state.sessionMemory.pendingOfferingKey,
    "product:hamburguesa-doble"
  );
});

test("an explicit order marks the list as purchase before asking quantity", () => {
  let state = normalizeUniversalSessionState(null, context);
  const order = classifyUniversalSessionIntent({
    message: "quiero pedir del menú",
    context,
    state,
  });

  assert.equal(order.intent, "clarification");
  assert.ok(order.scopes.includes("cart"));
  assert.equal(order.cartActions.length, 0);

  state = transitionUniversalSessionMemory({
    state,
    decision: order,
    context,
  });
  assert.equal(state.sessionMemory.lastPresentedListPurpose, "purchase");

  const selection = classifyUniversalSessionIntent({
    message: "3",
    context,
    state,
  });
  assert.equal(selection.intent, "select_presented_option");
  assert.equal(selection.cartActions.length, 0);
  assert.match(selection.clarificationQuestion, /cuántas unidades/i);
});

test("uses the next number as quantity, calculates subtotal and total, then resets", () => {
  let state = normalizeUniversalSessionState(
    {
      cart: [],
      recentTurns: [],
      lastIntent: "select_presented_option",
      pendingQuestion: "¿Cuántas unidades deseas?",
      sessionMemory: {
        version: 2,
        lastPresentedOfferingKeys: [
          "product:hamburguesa-bbq",
          "product:hamburguesa-clasica",
          "product:hamburguesa-doble",
          "product:hamburguesa-vegana",
        ],
        lastPresentedListPurpose: "purchase",
        pendingOfferingKey: "product:hamburguesa-doble",
        intentCounts: { clarification: 1 },
        lastSelectionIndex: 3,
      },
    },
    context
  );

  const quantityDecision = classifyUniversalSessionIntent({
    message: "2",
    context,
    state,
  });
  assert.equal(quantityDecision.intent, "add_to_cart");
  assert.deepEqual(quantityDecision.cartActions, [
    {
      type: "add",
      offeringKey: "product:hamburguesa-doble",
      quantity: 2,
    },
  ]);

  const cartResult = applyUniversalCartActions({
    state,
    decision: quantityDecision,
    context,
  });
  state = transitionUniversalSessionMemory({
    state: cartResult.state,
    decision: quantityDecision,
    context,
  });

  const addAnswer = answerFor("2", quantityDecision, state);
  assert.match(addAnswer, /2 × Hamburguesa Doble/);
  assert.match(addAnswer, /Subtotal: 15\.00 USD/);
  assert.match(addAnswer, /Total temporal: 15\.00 USD/);
  assert.equal(state.sessionMemory.pendingOfferingKey, null);

  const snapshot = getUniversalCartSnapshot(state, context);
  assert.equal(snapshot.unitCount, 2);
  assert.equal(snapshot.totals.USD, 15);

  const totalDecision = classifyUniversalSessionIntent({
    message: "cuánto pago",
    context,
    state,
  });
  assert.equal(totalDecision.intent, "cart_total");
  const totalAnswer = answerFor("cuánto pago", totalDecision, state);
  assert.match(totalAnswer, /15\.00 USD/);

  const resetDecision = classifyUniversalSessionIntent({
    message: "nuevo pedido",
    context,
    state,
  });
  assert.equal(resetDecision.intent, "reset_cart");

  const resetCart = applyUniversalCartActions({
    state,
    decision: resetDecision,
    context,
  });
  state = transitionUniversalSessionMemory({
    state: resetCart.state,
    decision: resetDecision,
    context,
  });

  assert.equal(state.cart.length, 0);
  assert.equal(state.sessionMemory.pendingOfferingKey, null);
  assert.deepEqual(state.sessionMemory.lastPresentedOfferingKeys, []);
});

test("rejects a numbered option outside the remembered list", () => {
  const state = normalizeUniversalSessionState(
    {
      sessionMemory: {
        version: 1,
        lastPresentedOfferingKeys: [
          "product:hamburguesa-bbq",
          "product:hamburguesa-clasica",
        ],
      },
    },
    context
  );

  const decision = classifyUniversalSessionIntent({
    message: "3",
    context,
    state,
  });
  assert.equal(decision.intent, "clarification");
  assert.equal(decision.cartActions.length, 0);
  assert.match(decision.clarificationQuestion, /del 1 al 2/);
});

test("revalidates persisted session memory against the active business", () => {
  const state = normalizeUniversalSessionState(
    {
      cart: [
        { offeringKey: "product:hamburguesa-doble", quantity: 2 },
        { offeringKey: "product:inventado", quantity: 9 },
      ],
      sessionMemory: {
        lastPresentedOfferingKeys: [
          "product:hamburguesa-doble",
          "product:inventado",
        ],
        pendingOfferingKey: "product:inventado",
        intentCounts: {
          discover_offerings: 3,
          select_presented_option: 2,
        },
        lastSelectionIndex: 2,
      },
    },
    context
  );

  assert.deepEqual(state.cart, [
    { offeringKey: "product:hamburguesa-doble", quantity: 2 },
  ]);
  assert.deepEqual(state.sessionMemory.lastPresentedOfferingKeys, [
    "product:hamburguesa-doble",
  ]);
  assert.equal(state.sessionMemory.pendingOfferingKey, null);
  assert.equal(state.sessionMemory.lastPresentedListPurpose, "information");
  assert.equal(state.sessionMemory.version, 3);
  assert.equal(state.sessionMemory.intentCounts.discover_offerings, 3);
});

test("supports option and quantity in one message", () => {
  const state = normalizeUniversalSessionState(
    {
      sessionMemory: {
        version: 2,
        lastPresentedOfferingKeys: [
          "product:hamburguesa-bbq",
          "product:hamburguesa-clasica",
          "product:hamburguesa-doble",
        ],
        lastPresentedListPurpose: "information",
      },
    },
    context
  );

  const decision = classifyUniversalSessionIntent({
    message: "3 x 2",
    context,
    state,
  });
  assert.equal(decision.intent, "add_to_cart");
  assert.deepEqual(decision.cartActions, [
    {
      type: "add",
      offeringKey: "product:hamburguesa-doble",
      quantity: 2,
    },
  ]);
});
