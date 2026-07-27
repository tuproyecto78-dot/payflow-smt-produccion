// End-to-end contracts for the universal conversation core.
import assert from "node:assert/strict";
import test from "node:test";

import { runUniversalConversation } from "../src/lib/universal-agent-orchestrator.ts";

function businessContext(overrides = {}) {
  return {
    clientId: "restaurant-la-estancia",
    businessName: "La Estancia",
    businessType: "restaurante",
    tone: "amable, breve y comercial",
    hours: ["Lunes a sábado: 09:00 - 21:00"],
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
        source: "catalog",
      },
      {
        key: "product:porcion-de-papas",
        kind: "product",
        name: "Porción de Papas",
        description: "Papas fritas crocantes",
        price: 2.5,
        currency: "USD",
        category: "Acompañamientos",
        available: true,
        source: "catalog",
      },
      {
        key: "product:jugo-natural",
        kind: "product",
        name: "Jugo Natural",
        description: "Sabor del día",
        price: 1.75,
        currency: "USD",
        category: "Bebidas",
        available: true,
        source: "catalog",
      },
    ],
    promotions: ["2x1 en Hamburguesa Clásica los viernes"],
    payment: {
      provider: "external",
      summary: "Aceptamos transferencia bancaria.",
      conditions: ["La transferencia se confirma antes de finalizar."],
    },
    faqs: [
      {
        question: "¿Realizan entregas?",
        answer: "Entregamos en el centro de Cuenca con costo según el sector.",
      },
    ],
    policies: [],
    address: "Centro de Cuenca",
    humanHandoffRules: [],
    appointmentConditions: [],
    rules: ["Responder con brevedad y no inventar datos."],
    knowledge: [
      {
        key: "knowledge-document:delivery",
        title: "Cobertura de entrega",
        content: "Entregamos en el centro de Cuenca con costo según el sector.",
        category: "entregas",
      },
    ],
    summary: "Hamburguesas, acompañamientos y bebidas.",
    warnings: [],
    ...overrides,
  };
}

function assertCustomerSafe(answer) {
  assert.ok(answer.length > 0 && answer.length <= 560);
  assert.doesNotMatch(
    answer,
    /PayFlow|client_id|metadata|supabase|workflow|prompt|audit_logs/i
  );
}

test("the v3 pipeline keeps a generic menu informational", async () => {
  const result = await runUniversalConversation({
    message: "Menú",
    context: businessContext(),
  });

  assert.equal(result.diagnostics.architectureVersion, 3);
  assert.equal(result.diagnostics.resolvedCandidate.act, "informational");
  assert.equal(result.decision.intent, "discover_offerings");
  assert.equal(result.decision.cartActions.length, 0);
  assert.equal(result.state.cart.length, 0);
  assert.match(result.answer, /Hamburguesa Clásica/);
  assert.match(result.answer, /Porción de Papas/);
  assert.doesNotMatch(result.answer, /agregar|unidades|total temporal/i);
  assertCustomerSafe(result.answer);
});

test("generic commercial vocabulary discovers offerings without phrase patches", async () => {
  const result = await runUniversalConversation({
    message: "¿Qué venden?",
    context: businessContext(),
  });

  assert.equal(result.decision.intent, "discover_offerings");
  assert.equal(result.decision.cartActions.length, 0);
  assert.match(result.answer, /Hamburguesa Clásica/);
  assert.doesNotMatch(result.answer, /cuántas unidades|total temporal/i);
});

test("a specific price question never becomes a purchase", async () => {
  const result = await runUniversalConversation({
    message: "Quiero saber el precio de dos hamburguesas clásicas",
    context: businessContext(),
  });

  assert.equal(result.diagnostics.resolvedCandidate.act, "informational");
  assert.equal(result.decision.intent, "query_offering");
  assert.equal(result.decision.cartActions.length, 0);
  assert.equal(result.state.cart.length, 0);
  assert.match(result.answer, /5\.00 USD/);
  assert.doesNotMatch(result.answer, /agregamos|cuántas unidades|total temporal/i);
});

test("asking how to order explains instead of opening a purchase", async () => {
  const result = await runUniversalConversation({
    message: "¿Cómo puedo pedir?",
    context: businessContext(),
  });

  assert.equal(result.diagnostics.resolvedCandidate.act, "informational");
  assert.equal(result.decision.cartActions.length, 0);
  assert.equal(result.state.cart.length, 0);
  assert.doesNotMatch(result.answer, /agregamos|subtotal|total temporal/i);
});

test("only an explicit order creates a temporary-cart action", async () => {
  const result = await runUniversalConversation({
    message: "Quiero dos hamburguesas clásicas",
    context: businessContext(),
  });

  assert.equal(result.diagnostics.resolvedCandidate.act, "transactional");
  assert.equal(result.decision.intent, "add_to_cart");
  assert.deepEqual(result.decision.cartActions, [
    {
      type: "add",
      offeringKey: "product:hamburguesa-clasica",
      quantity: 2,
    },
  ]);
  assert.deepEqual(result.state.cart, [
    {
      offeringKey: "product:hamburguesa-clasica",
      quantity: 2,
    },
  ]);
  assert.match(result.answer, /Total temporal: 10\.00 USD/);
});

test("Gemini cannot upgrade information into a transaction", async () => {
  const result = await runUniversalConversation({
    message: "¿Cuál es el precio de la hamburguesa clásica?",
    context: businessContext(),
    adapters: {
      classifySemantics: async () => ({
        model: "gemini-test",
        candidate: {
          act: "transactional",
          topic: "offerings",
          mode: "quantity",
          confidence: 0.99,
          offeringKeys: ["product:hamburguesa-clasica"],
          knowledgeKeys: [],
          quantity: 1,
          selectionIndex: null,
          source: "model",
          evidence: ["model_guess"],
        },
      }),
    },
  });

  assert.equal(result.diagnostics.resolvedCandidate.act, "informational");
  assert.equal(result.decision.intent, "query_offering");
  assert.equal(result.decision.cartActions.length, 0);
  assert.equal(result.state.cart.length, 0);
});

test("memory preserves list purpose through selection and quantity", async () => {
  const context = businessContext();
  const list = await runUniversalConversation({
    message: "Quiero pedir del menú",
    context,
  });
  assert.equal(list.decision.intent, "clarification");
  assert.equal(list.state.sessionMemory.lastPresentedListPurpose, "purchase");
  assert.equal(list.state.sessionMemory.lastPresentedOfferingKeys.length, 3);

  const selection = await runUniversalConversation({
    message: "2",
    context,
    rawState: list.state,
  });
  assert.equal(selection.decision.intent, "clarification");
  assert.match(selection.answer, /Cuántas unidades de Porción de Papas/i);
  assert.equal(
    selection.state.sessionMemory.pendingOfferingKey,
    "product:porcion-de-papas"
  );

  const quantity = await runUniversalConversation({
    message: "3",
    context,
    rawState: selection.state,
  });
  assert.equal(quantity.decision.intent, "add_to_cart");
  assert.deepEqual(quantity.state.cart, [
    { offeringKey: "product:porcion-de-papas", quantity: 3 },
  ]);
  assert.match(quantity.answer, /Total temporal: 7\.50 USD/);
});

test("an informational numbered selection remains informational", async () => {
  const context = businessContext();
  const list = await runUniversalConversation({
    message: "Precios",
    context,
  });
  assert.equal(list.state.sessionMemory.lastPresentedListPurpose, "information");

  const details = await runUniversalConversation({
    message: "2",
    context,
    rawState: list.state,
  });
  assert.equal(details.decision.intent, "query_offering");
  assert.equal(details.decision.cartActions.length, 0);
  assert.equal(details.state.sessionMemory.pendingOfferingKey, null);
  assert.match(details.answer, /Porción de Papas/);
  assert.doesNotMatch(details.answer, /cuántas unidades|total temporal/i);
});

test("payment questions use payment knowledge and never catalog", async () => {
  const result = await runUniversalConversation({
    message: "¿Cuáles son los medios de pago?",
    context: businessContext(),
  });

  assert.equal(result.decision.intent, "query_payment");
  assert.equal(result.decision.cartActions.length, 0);
  assert.match(result.answer, /transferencia/i);
  assert.doesNotMatch(result.answer, /Hamburguesa|Papas|Jugo/);
});

test("location is answered from the active business only", async () => {
  const result = await runUniversalConversation({
    message: "¿Dónde están ubicados?",
    context: businessContext(),
  });

  assert.equal(result.decision.intent, "query_location");
  assert.match(result.answer, /Centro de Cuenca/);
  assert.equal(result.decision.cartActions.length, 0);
});

test("the knowledge center answers only with the active business context", async () => {
  const restaurant = businessContext();
  const clinic = businessContext({
    clientId: "clinic-dental",
    businessName: "Clínica Dental Norte",
    businessType: "clínica",
    offerings: [
      {
        key: "service:limpieza-dental",
        kind: "service",
        name: "Limpieza Dental",
        description: "Evaluación y limpieza",
        price: 25,
        currency: "USD",
        category: "Odontología",
        available: true,
        source: "knowledge_center",
      },
    ],
    faqs: [
      {
        question: "¿Atienden emergencias?",
        answer: "Las emergencias se coordinan por disponibilidad del odontólogo.",
      },
    ],
    knowledge: [
      {
        key: "knowledge-document:emergencies",
        title: "Atención de emergencias",
        content: "Las emergencias se coordinan por disponibilidad del odontólogo.",
        category: "agenda",
      },
    ],
  });

  const restaurantAnswer = await runUniversalConversation({
    message: "¿Cómo funcionan las entregas?",
    context: restaurant,
  });
  const clinicAnswer = await runUniversalConversation({
    message: "¿Atienden emergencias?",
    context: clinic,
  });

  assert.match(restaurantAnswer.answer, /centro de Cuenca/i);
  assert.doesNotMatch(restaurantAnswer.answer, /odontólogo|emergencias/i);
  assert.match(clinicAnswer.answer, /odontólogo/i);
  assert.doesNotMatch(clinicAnswer.answer, /Cuenca|entregamos/i);
});

test("catalog authority is isolated between different businesses", async () => {
  const restaurant = businessContext();
  const clinic = businessContext({
    clientId: "clinic-dental",
    businessName: "Clínica Dental Norte",
    businessType: "clínica",
    offerings: [
      {
        key: "service:limpieza-dental",
        kind: "service",
        name: "Limpieza Dental",
        description: "Evaluación y limpieza",
        price: 25,
        currency: "USD",
        category: "Odontología",
        available: true,
        source: "catalog",
      },
      {
        key: "service:consulta-odontologica",
        kind: "service",
        name: "Consulta Odontológica",
        description: "Valoración inicial",
        price: 18,
        currency: "USD",
        category: "Odontología",
        available: true,
        source: "catalog",
      },
    ],
  });

  const result = await runUniversalConversation({
    message: "¿Qué servicios ofrecen?",
    context: clinic,
  });
  assert.match(result.answer, /Limpieza Dental/);
  assert.match(result.answer, /Consulta Odontológica/);
  assert.doesNotMatch(result.answer, /Hamburguesa|Papas|Jugo/);

  const restaurantResult = await runUniversalConversation({
    message: "Menú",
    context: restaurant,
  });
  assert.doesNotMatch(restaurantResult.answer, /Dental|Odontológica/);
});

test("appointment intent never performs a real reservation", async () => {
  const result = await runUniversalConversation({
    message: "Quiero agendar una cita para mañana",
    context: businessContext({
      appointmentConditions: ["Las citas se confirman según disponibilidad."],
    }),
  });

  assert.equal(result.decision.intent, "query_appointment");
  assert.equal(result.decision.cartActions.length, 0);
  assert.equal(result.state.cart.length, 0);
  assert.match(result.answer, /disponibilidad/i);
  assert.doesNotMatch(result.answer, /cita confirmada|reserva confirmada/i);
});

test("the result never executes WhatsApp or real payments", async () => {
  const result = await runUniversalConversation({
    message: "Quiero dos hamburguesas clásicas",
    context: businessContext(),
  });

  assert.equal(result.decision.intent, "add_to_cart");
  assert.equal(result.state.cart.length, 1);
  assert.equal(result.diagnostics.architectureVersion, 3);
  assertCustomerSafe(result.answer);
});
