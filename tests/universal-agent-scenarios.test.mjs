import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUniversalCartActions,
  emptyUniversalAgentState,
  getUniversalCartSnapshot,
} from "../src/lib/universal-agent-contract.ts";
import {
  classifyUniversalIntent,
  composeUniversalSafeAnswer,
  resolveUniversalPlannerDecision,
} from "../src/lib/universal-intent-engine.ts";
import {
  classifyUniversalSessionIntent,
  composeUniversalSessionAnswer,
  normalizeUniversalSessionState,
  transitionUniversalSessionMemory,
} from "../src/lib/universal-session-memory.ts";

const context = {
  clientId: "client-any-business",
  businessName: "Sabor Local",
  businessType: "negocio de alimentos",
  tone: "amable, breve y comercial",
  hours: ["Lunes a sábado: 09:00 - 20:00"],
  offerings: [
    {
      key: "product:porcion-de-papas",
      kind: "product",
      name: "Porción de Papas",
      description: "Papas fritas crocantes",
      price: 2.5,
      currency: "USD",
      category: "Acompañamientos",
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
      key: "product:bebida-natural",
      kind: "product",
      name: "Bebida Natural",
      description: "Sabor del día",
      price: 1.75,
      currency: "USD",
      category: "Bebidas",
      available: true,
    },
  ],
  promotions: ["2x1 en Hamburguesa Clásica todos los viernes"],
  payment: {
    provider: "external",
    summary: "Tenemos un método de pago configurado.",
    conditions: ["Aceptamos transferencia bancaria."],
  },
  faqs: [],
  policies: [],
  address: "",
  humanHandoffRules: [],
  appointmentConditions: [],
  rules: ["Responder con brevedad y no inventar datos."],
  summary: "Ofrecemos alimentos preparados y bebidas.",
  warnings: [],
};

function classify(message, state = emptyUniversalAgentState()) {
  return classifyUniversalIntent({ message, context, state });
}

function answer(message, decision, state = emptyUniversalAgentState()) {
  return composeUniversalSafeAnswer({
    message,
    decision,
    context,
    state,
  });
}

function assertCommercialSafe(text) {
  assert.ok(text.length > 0 && text.length <= 560);
  assert.doesNotMatch(text, /PayFlow|client_id|metadata|supabase|workflow|prompt/i);
}

test('"hola" is a clear greeting and never other', () => {
  const result = classify("hola");
  assert.equal(result.intent, "greeting");
  assert.notEqual(result.intent, "other");
  const text = answer("hola", result);
  assert.match(text, /Sabor Local/);
  assertCommercialSafe(text);
});

test('"qué venden" discovers at most five real offerings', () => {
  const result = classify("¿qué venden?");
  assert.equal(result.intent, "discover_offerings");
  assert.deepEqual(result.scopes, ["identity", "offerings"]);
  const text = answer("¿qué venden?", result);
  assert.match(text, /Porción de Papas/);
  assert.match(text, /2\.50 USD/);
  assertCommercialSafe(text);
});

test('"cuál es el menú" stays informational and remembers the displayed list', () => {
  let state = normalizeUniversalSessionState(null, context);
  const result = classifyUniversalSessionIntent({
    message: "¿Cuál es el menú?",
    context,
    state,
  });

  assert.equal(result.intent, "discover_offerings");
  assert.deepEqual(result.scopes, ["identity", "offerings"]);
  assert.equal(result.cartActions.length, 0);

  const text = composeUniversalSessionAnswer({
    message: "¿Cuál es el menú?",
    decision: result,
    context,
    state,
  });
  assert.match(text, /Responde con un número para ver los detalles/i);
  assert.doesNotMatch(text, /cuántas unidades|subtotal|total temporal/i);
  assertCommercialSafe(text);

  state = transitionUniversalSessionMemory({
    state,
    decision: result,
    context,
  });
  assert.ok(state.sessionMemory.lastPresentedOfferingKeys.length > 0);
  assert.equal(state.sessionMemory.lastPresentedListPurpose, "information");
  assert.equal(state.sessionMemory.pendingOfferingKey, null);
});

test('"2x1 en viernes" queries only real promotions', () => {
  const result = classify("¿Tienen 2x1 en viernes?");
  assert.equal(result.intent, "query_promotion");
  assert.deepEqual(result.scopes, ["identity", "promotions"]);
  const text = answer("¿Tienen 2x1 en viernes?", result);
  assert.match(text, /2x1 en Hamburguesa Clásica todos los viernes/);
  assert.doesNotMatch(text, /Bebida Natural/);
  assertCommercialSafe(text);
});

test('"porciones de papas" resolves a real offering without inventing', () => {
  const result = classify("porciones de papas");
  assert.equal(result.intent, "query_offering");
  assert.deepEqual(result.selection.offeringKeys, ["product:porcion-de-papas"]);
  const text = answer("porciones de papas", result);
  assert.match(text, /Porción de Papas/);
  assert.match(text, /2\.50 USD/);
  assertCommercialSafe(text);
});

test('"cuánto pago" returns the validated temporary-cart total', () => {
  const initial = emptyUniversalAgentState();
  const addDecision = classify("quiero dos porciones de papas", initial);
  assert.equal(addDecision.intent, "add_to_cart");
  const applied = applyUniversalCartActions({
    state: initial,
    decision: addDecision,
    context,
  });
  assert.equal(applied.invalidActions.length, 0);

  const totalDecision = classify("¿cuánto pago?", applied.state);
  assert.equal(totalDecision.intent, "cart_total");
  const snapshot = getUniversalCartSnapshot(applied.state, context);
  assert.equal(snapshot.unitCount, 2);
  assert.equal(snapshot.totals.USD, 5);

  const text = answer("¿cuánto pago?", totalDecision, applied.state);
  assert.match(text, /5\.00 USD/);
  assertCommercialSafe(text);
});

test('"nuevo pedido" clears the complete temporary cart', () => {
  const addDecision = classify("quiero dos porciones de papas");
  const withCart = applyUniversalCartActions({
    state: emptyUniversalAgentState(),
    decision: addDecision,
    context,
  }).state;

  const resetDecision = classify("nuevo pedido", withCart);
  assert.equal(resetDecision.intent, "reset_cart");
  const cleared = applyUniversalCartActions({
    state: withCart,
    decision: resetDecision,
    context,
  }).state;
  assert.equal(getUniversalCartSnapshot(cleared, context).unitCount, 0);

  const text = answer("nuevo pedido", resetDecision, cleared);
  assert.match(text, /pedido nuevo/i);
  assertCommercialSafe(text);
});

test('"aceptan transferencia" uses payment only and never catalog', () => {
  const result = classify("¿aceptan transferencia?");
  assert.equal(result.intent, "query_payment");
  assert.deepEqual(result.scopes, ["identity", "payment"]);
  assert.equal(result.selection.mode, "none");
  assert.equal(result.cartActions.length, 0);

  const text = answer("¿aceptan transferencia?", result);
  assert.match(text, /Aceptamos transferencia bancaria/);
  assert.doesNotMatch(text, /Papas|Hamburguesa|Bebida/);
  assertCommercialSafe(text);
});

test('"medios de pagos" is informational and never activates cart', () => {
  const result = classify("¿Cuáles son los medios de pagos?");
  assert.equal(result.intent, "query_payment");
  assert.deepEqual(result.scopes, ["identity", "payment"]);
  assert.equal(result.selection.offeringKeys.length, 0);
  assert.equal(result.cartActions.length, 0);

  const text = answer("¿Cuáles son los medios de pagos?", result);
  assert.doesNotMatch(text, /unidades|subtotal|total temporal|Hamburguesa|Papas/i);
  assertCommercialSafe(text);
});

test("Gemini cannot turn an informational baseline into a cart action", () => {
  const baseline = classify("Quiero saber el precio de la Hamburguesa Clásica");
  assert.equal(baseline.intent, "query_offering");

  const resolved = resolveUniversalPlannerDecision({
    baseline,
    model: {
      intent: "add_to_cart",
      confidence: 0.99,
      scopes: ["identity", "offerings", "cart"],
      selection: {
        mode: "selected",
        offeringKeys: ["product:hamburguesa-clasica"],
        maxItems: 1,
      },
      cartActions: [
        {
          type: "add",
          offeringKey: "product:hamburguesa-clasica",
          quantity: 1,
        },
      ],
      needsClarification: false,
      clarificationQuestion: "",
      responseGoal: "Agregar al carrito.",
    },
  });

  assert.equal(resolved.intent, "query_offering");
  assert.equal(resolved.cartActions.length, 0);
  assert.ok(!resolved.scopes.includes("cart"));
});

test("price and quantity wording remains informational without a buy command", () => {
  const result = classify("Quiero saber el precio de dos porciones de papas");
  assert.equal(result.intent, "query_offering");
  assert.equal(result.cartActions.length, 0);
  assert.ok(!result.scopes.includes("cart"));

  const text = answer(
    "Quiero saber el precio de dos porciones de papas",
    result
  );
  assert.doesNotMatch(text, /agregamos|subtotal|total temporal|cuántas unidades/i);
  assertCommercialSafe(text);
});

test("clear local capabilities override an incorrect model intent", () => {
  const baseline = classify("¿aceptan transferencia?");
  const resolved = resolveUniversalPlannerDecision({
    baseline,
    model: {
      intent: "other",
      confidence: 0.99,
      scopes: ["offerings"],
      selection: {
        mode: "preview",
        offeringKeys: ["product:hamburguesa-clasica"],
        maxItems: 5,
      },
      cartActions: [],
      needsClarification: false,
      clarificationQuestion: "",
      responseGoal: "Mostrar productos.",
    },
  });
  assert.equal(resolved.intent, "query_payment");
  assert.deepEqual(resolved.scopes, ["identity", "payment"]);
});

test("unregistered promotions and payments are communicated without invention", () => {
  const emptyContext = {
    ...context,
    promotions: [],
    payment: {
      provider: "none",
      summary: "No hay una forma de pago registrada.",
      conditions: [],
    },
  };
  const state = emptyUniversalAgentState();
  const promo = classifyUniversalIntent({
    message: "¿Tienen 2x1 el viernes?",
    context: emptyContext,
    state,
  });
  const promoText = composeUniversalSafeAnswer({
    message: "¿Tienen 2x1 el viernes?",
    decision: promo,
    context: emptyContext,
    state,
  });
  assert.match(promoText, /no tenemos promociones registradas/i);

  const payment = classifyUniversalIntent({
    message: "¿Aceptan transferencia?",
    context: emptyContext,
    state,
  });
  const paymentText = composeUniversalSafeAnswer({
    message: "¿Aceptan transferencia?",
    decision: payment,
    context: emptyContext,
    state,
  });
  assert.match(paymentText, /no tenemos formas de pago registradas/i);
  assert.doesNotMatch(paymentText, /sí aceptamos/i);
});

const memoryContext = {
  ...context,
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
  ],
};

test("session memory preserves an informational list without arming option 3", () => {
  let state = normalizeUniversalSessionState(null, memoryContext);
  const category = classifyUniversalSessionIntent({
    message: "hamburguesas",
    context: memoryContext,
    state,
  });

  assert.equal(category.selection.offeringKeys.length, 4);
  const list = composeUniversalSessionAnswer({
    message: "hamburguesas",
    decision: category,
    context: memoryContext,
    state,
  });
  assert.match(list, /1\. Hamburguesa BBQ/);
  assert.match(list, /3\. Hamburguesa Doble/);

  state = transitionUniversalSessionMemory({
    state,
    decision: category,
    context: memoryContext,
  });

  const selection = classifyUniversalSessionIntent({
    message: "3",
    context: memoryContext,
    state,
  });
  assert.equal(selection.intent, "query_offering");
  assert.deepEqual(selection.selection.offeringKeys, [
    "product:hamburguesa-doble",
  ]);

  state = transitionUniversalSessionMemory({
    state,
    decision: selection,
    context: memoryContext,
  });
  assert.equal(state.sessionMemory.pendingOfferingKey, null);
  assert.equal(state.sessionMemory.lastPresentedListPurpose, "information");
});

test("the next number becomes quantity and totals are accumulated", () => {
  let state = normalizeUniversalSessionState(
    {
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
        intentCounts: {},
        lastSelectionIndex: 3,
      },
    },
    memoryContext
  );

  const quantity = classifyUniversalSessionIntent({
    message: "2",
    context: memoryContext,
    state,
  });
  assert.equal(quantity.intent, "add_to_cart");
  assert.deepEqual(quantity.cartActions, [
    {
      type: "add",
      offeringKey: "product:hamburguesa-doble",
      quantity: 2,
    },
  ]);

  const applied = applyUniversalCartActions({
    state,
    decision: quantity,
    context: memoryContext,
  });
  state = transitionUniversalSessionMemory({
    state: applied.state,
    decision: quantity,
    context: memoryContext,
  });

  const addAnswer = composeUniversalSessionAnswer({
    message: "2",
    decision: quantity,
    context: memoryContext,
    state,
  });
  assert.match(addAnswer, /Subtotal: 15\.00 USD/);
  assert.match(addAnswer, /Total temporal: 15\.00 USD/);

  const total = classifyUniversalSessionIntent({
    message: "cuánto pago",
    context: memoryContext,
    state,
  });
  const totalAnswer = composeUniversalSessionAnswer({
    message: "cuánto pago",
    decision: total,
    context: memoryContext,
    state,
  });
  assert.match(totalAnswer, /15\.00 USD/);

  const reset = classifyUniversalSessionIntent({
    message: "nuevo pedido",
    context: memoryContext,
    state,
  });
  const cleared = applyUniversalCartActions({
    state,
    decision: reset,
    context: memoryContext,
  });
  state = transitionUniversalSessionMemory({
    state: cleared.state,
    decision: reset,
    context: memoryContext,
  });
  assert.equal(state.cart.length, 0);
  assert.equal(state.sessionMemory.pendingOfferingKey, null);
  assert.deepEqual(state.sessionMemory.lastPresentedOfferingKeys, []);
});

test("an out-of-range number never adds a random product", () => {
  const state = normalizeUniversalSessionState(
    {
      sessionMemory: {
        version: 2,
        lastPresentedOfferingKeys: [
          "product:hamburguesa-bbq",
          "product:hamburguesa-clasica",
        ],
        lastPresentedListPurpose: "information",
      },
    },
    memoryContext
  );
  const selection = classifyUniversalSessionIntent({
    message: "3",
    context: memoryContext,
    state,
  });
  assert.equal(selection.intent, "clarification");
  assert.equal(selection.cartActions.length, 0);
  assert.match(selection.clarificationQuestion, /del 1 al 2/);
});
