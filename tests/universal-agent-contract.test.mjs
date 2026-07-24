import assert from "node:assert/strict";
import test from "node:test";

import {
  answerUsesOnlyKnownMoney,
  applyUniversalCartActions,
  buildUniversalValidatedFacts,
  emptyUniversalAgentState,
  getUniversalCartSnapshot,
  normalizePlannerDecision,
  normalizeUniversalAgentState,
  sanitizeUniversalAnswer,
} from "../src/lib/universal-agent-contract.ts";

const context = {
  clientId: "client-123",
  businessName: "Negocio Universal",
  businessType: "comercio y servicios",
  tone: "amable y comercial",
  hours: ["Lunes a viernes: 09:00 - 18:00"],
  offerings: [
    {
      key: "product:hamburguesa-clasica",
      kind: "product",
      name: "Hamburguesa Clásica",
      description: "Carne y queso",
      price: 5,
      currency: "USD",
      category: "Hamburguesas",
      available: true,
    },
    {
      key: "service:consulta-inicial",
      kind: "service",
      name: "Consulta Inicial",
      description: "Evaluación de 30 minutos",
      price: 20,
      currency: "USD",
      category: "Consultas",
      available: true,
    },
    {
      key: "service:servicio-sin-tarifa",
      kind: "service",
      name: "Servicio sin tarifa",
      description: "Precio pendiente de confirmación",
      price: null,
      currency: "USD",
      category: "Servicios",
      available: true,
    },
  ],
  promotions: [],
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
  rules: ["Responder con brevedad."],
  summary: "Atención de productos y servicios.",
  warnings: [],
};

test("normalizes current and legacy simulator state against real offerings", () => {
  const state = normalizeUniversalAgentState(
    {
      cart: [
        { offeringKey: "service:consulta-inicial", quantity: 2 },
        { productName: "Hamburguesa Clásica", quantity: 3 },
        { offeringKey: "service:servicio-sin-tarifa", quantity: 5 },
        { offeringKey: "product:inventado", quantity: 9 },
      ],
      recentTurns: [
        { role: "customer", text: "Hola" },
        { role: "business", text: "¿Cómo te ayudamos?" },
      ],
    },
    context
  );

  assert.deepEqual(state.cart, [
    { offeringKey: "service:consulta-inicial", quantity: 2 },
    { offeringKey: "product:hamburguesa-clasica", quantity: 3 },
  ]);
  assert.equal(state.recentTurns.length, 2);
});

test("accepts free-form intent but validates scopes, offering keys and limits", () => {
  const decision = normalizePlannerDecision(
    {
      intent: "comparar alternativas para una necesidad",
      confidence: 0.92,
      scopes: ["identity", "offerings", "unknown", "offerings"],
      selection: {
        mode: "selected",
        offeringKeys: [
          "service:consulta-inicial",
          "product:inventado",
          "product:hamburguesa-clasica",
        ],
        maxItems: 25,
      },
      cartActions: [],
      needsClarification: false,
      responseGoal: "Comparar opciones reales.",
    },
    context
  );

  assert.equal(decision.intent, "comparar alternativas para una necesidad");
  assert.deepEqual(decision.scopes, ["identity", "offerings"]);
  assert.deepEqual(decision.selection.offeringKeys, [
    "service:consulta-inicial",
    "product:hamburguesa-clasica",
  ]);
  assert.equal(decision.selection.maxItems, 5);
});

test("cart accepts only real priced offerings and calculates validated totals", () => {
  const decision = normalizePlannerDecision(
    {
      intent: "crear solicitud temporal",
      confidence: 0.99,
      scopes: ["cart", "offerings"],
      selection: { mode: "selected", offeringKeys: [], maxItems: 5 },
      cartActions: [
        {
          type: "add",
          offeringKey: "product:hamburguesa-clasica",
          quantity: 4,
        },
        {
          type: "add",
          offeringKey: "service:consulta-inicial",
          quantity: 1,
        },
        {
          type: "add",
          offeringKey: "service:servicio-sin-tarifa",
          quantity: 2,
        },
        {
          type: "add",
          offeringKey: "product:inventado",
          quantity: 3,
        },
      ],
      needsClarification: false,
      responseGoal: "Confirmar el pedido temporal.",
    },
    context
  );

  const applied = applyUniversalCartActions({
    state: emptyUniversalAgentState(),
    decision,
    context,
  });
  const snapshot = getUniversalCartSnapshot(applied.state, context);

  assert.deepEqual(applied.invalidActions, [
    "service:servicio-sin-tarifa",
    "product:inventado",
  ]);
  assert.equal(snapshot.unitCount, 5);
  assert.equal(snapshot.totals.USD, 40);
});

test("validated facts respect preview limits and report missing payment data", () => {
  const decision = normalizePlannerDecision(
    {
      intent: "consultar catálogo y pago",
      confidence: 0.9,
      scopes: ["offerings", "payment"],
      selection: { mode: "preview", offeringKeys: [], maxItems: 50 },
      cartActions: [],
      needsClarification: false,
      responseGoal: "Mostrar opciones y forma de pago.",
    },
    context
  );
  const facts = buildUniversalValidatedFacts({
    context,
    state: emptyUniversalAgentState(),
    decision,
  });

  assert.ok(facts.selectedOfferings.length <= 5);
  assert.equal(facts.missing.payment, true);
  assert.equal(facts.safety.whatsappRealEnabled, false);
  assert.equal(facts.safety.paymentsRealEnabled, false);
});

test("sanitizes platform branding and rejects invented monetary amounts", () => {
  const answer = sanitizeUniversalAnswer(
    "Payflow SMT puede ayudarte con la Consulta Inicial a 20 USD.",
    context.businessName
  );
  assert.doesNotMatch(answer, /Payflow/i);

  const decision = normalizePlannerDecision(
    {
      intent: "consultar servicio",
      confidence: 0.9,
      scopes: ["offerings"],
      selection: {
        mode: "selected",
        offeringKeys: ["service:consulta-inicial"],
        maxItems: 5,
      },
      cartActions: [],
      needsClarification: false,
      responseGoal: "Informar el servicio.",
    },
    context
  );
  const facts = buildUniversalValidatedFacts({
    context,
    state: emptyUniversalAgentState(),
    decision,
  });

  assert.equal(answerUsesOnlyKnownMoney("La consulta cuesta 20 USD.", facts), true);
  assert.equal(answerUsesOnlyKnownMoney("La consulta cuesta 25 USD.", facts), false);
});
