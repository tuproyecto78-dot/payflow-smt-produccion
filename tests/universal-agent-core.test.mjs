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

function restaurantConversationContext(overrides = {}) {
  return businessContext({
    offerings: [
      {
        key: "product:hamburguesa-clasica-estancia",
        kind: "product",
        name: "Hamburguesa Clásica Estancia",
        description: "Carne, queso y vegetales",
        price: 1.2,
        currency: "USD",
        category: "Hamburguesas",
        available: true,
        source: "catalog",
      },
      {
        key: "product:hamburguesa-bbq-tocino",
        kind: "product",
        name: "Hamburguesa BBQ Tocino",
        description: "Carne, queso, BBQ y tocino",
        price: 1.55,
        currency: "USD",
        category: "Hamburguesas",
        available: true,
        source: "catalog",
      },
      {
        key: "product:hamburguesa-doble",
        kind: "product",
        name: "Hamburguesa Doble Queso y Carne",
        description: "Doble carne y doble queso",
        price: 1.95,
        currency: "USD",
        category: "Hamburguesas",
        available: true,
        source: "catalog",
      },
      {
        key: "product:papas-estancia-cintas",
        kind: "product",
        name: "Papas Estancia Cintas",
        description: "Papas en corte cinta",
        price: 0.95,
        currency: "USD",
        category: "Papas",
        available: true,
        source: "catalog",
      },
      {
        key: "product:papas-fritas-clasicas",
        kind: "product",
        name: "Papas Fritas Clásicas",
        description: "Papas fritas",
        price: 0.55,
        currency: "USD",
        category: "Papas",
        available: true,
        source: "catalog",
      },
      {
        key: "product:nachos-carne",
        kind: "product",
        name: "Nachos Supremos con Carne",
        description: "Nachos con carne y queso",
        price: 1.3,
        currency: "USD",
        category: "Papas y acompañamientos",
        available: true,
        source: "catalog",
      },
    ],
    payment: {
      provider: "external",
      summary: "Aceptamos transferencia bancaria o efectivo.",
      conditions: ["El medio de pago se confirma al finalizar."],
    },
    ...overrides,
  });
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
  assert.match(result.answer, /Total: 10\.00 USD/);
  assert.match(result.answer, /cómo prefieres pagar/i);
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
  assert.match(quantity.answer, /Total: 7\.50 USD/);
  assert.match(quantity.answer, /cómo prefieres pagar/i);
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

test("commercial shorthand resolves a unique product and a correction does not duplicate it", async () => {
  const context = restaurantConversationContext();
  const first = await runUniversalConversation({
    message: "3 hamburguesas Estancia",
    context,
  });

  assert.equal(first.decision.intent, "add_to_cart");
  assert.deepEqual(first.state.cart, [
    {
      offeringKey: "product:hamburguesa-clasica-estancia",
      quantity: 3,
    },
  ]);
  assert.match(first.answer, /Total: 3\.60 USD/);
  assert.match(first.answer, /cómo prefieres pagar/i);

  const correction = await runUniversalConversation({
    message: "Te pedí 3 hamburguesas Estancia",
    context,
    rawState: first.state,
  });
  assert.equal(correction.decision.intent, "add_to_cart");
  assert.equal(correction.decision.cartActions[0].type, "set");
  assert.deepEqual(correction.state.cart, first.state.cart);
  assert.match(correction.answer, /Total: 3\.60 USD/);
});

test("a multi-item order calculates the complete total and then collects payment preference", async () => {
  const context = restaurantConversationContext();
  const order = await runUniversalConversation({
    message:
      "Quiero dos Papas Estancia Cintas y 3 Hamburguesas Clásica Estancia, ¿cuánto es?",
    context,
  });

  assert.equal(order.decision.intent, "add_to_cart");
  assert.equal(order.decision.cartActions.length, 2);
  assert.deepEqual(order.state.cart, [
    {
      offeringKey: "product:papas-estancia-cintas",
      quantity: 2,
    },
    {
      offeringKey: "product:hamburguesa-clasica-estancia",
      quantity: 3,
    },
  ]);
  assert.match(order.answer, /2 × Papas Estancia Cintas/);
  assert.match(order.answer, /3 × Hamburguesa Clásica Estancia/);
  assert.match(order.answer, /Total: 5\.50 USD/);
  assert.match(order.answer, /Cómo deseas pagar/i);
  assert.equal(order.state.sessionMemory.checkoutStage, "awaiting_payment");

  const payment = await runUniversalConversation({
    message: "Transferencia",
    context,
    rawState: order.state,
  });
  assert.equal(payment.decision.intent, "select_payment_method");
  assert.equal(payment.decision.cartActions.length, 0);
  assert.equal(
    payment.state.sessionMemory.selectedPaymentMethod,
    "transferencia bancaria"
  );
  assert.equal(payment.state.sessionMemory.checkoutStage, "payment_selected");
  assert.match(payment.answer, /elegiste transferencia bancaria/i);
  assert.match(payment.answer, /¿Confirmas el resumen\?/);
  assert.deepEqual(payment.state.cart, order.state.cart);
});

test("an ambiguous multi-item order is preserved until each variety is selected", async () => {
  const context = restaurantConversationContext();
  const draft = await runUniversalConversation({
    message: "Quiero dos papas y 3 hamburguesas, ¿cuánto es?",
    context,
  });

  assert.equal(draft.decision.intent, "clarification");
  assert.equal(draft.state.cart.length, 0);
  assert.equal(draft.state.sessionMemory.pendingOrderDraft.items.length, 2);
  assert.match(draft.answer, /Para completar tu pedido/i);

  const papas = await runUniversalConversation({
    message: "1",
    context,
    rawState: draft.state,
  });
  assert.equal(papas.decision.intent, "clarification");
  assert.equal(papas.state.cart.length, 0);
  assert.equal(
    papas.state.sessionMemory.pendingOrderDraft.items.filter(
      (item) => !item.offeringKey
    ).length,
    1
  );

  const hamburger = await runUniversalConversation({
    message: "1",
    context,
    rawState: papas.state,
  });
  assert.equal(hamburger.decision.intent, "add_to_cart");
  assert.equal(hamburger.state.cart.length, 2);
  assert.deepEqual(
    hamburger.state.cart.map((item) => item.quantity),
    [2, 3]
  );
  assert.match(hamburger.answer, /Total:/);
  assert.match(hamburger.answer, /Cómo deseas pagar/i);
});

test("no promotions uses a configured featured dish and accepts the suggestion", async () => {
  const context = restaurantConversationContext({
    promotions: [],
    knowledge: [
      {
        key: "knowledge-document:plato-dia",
        title: "Plato del día",
        content:
          "El plato del día es Hamburguesa Clásica Estancia.",
        category: "plato del día",
      },
    ],
  });
  const promotions = await runUniversalConversation({
    message: "¿Hay promociones?",
    context,
  });

  assert.equal(promotions.decision.intent, "query_promotion");
  assert.equal(promotions.state.cart.length, 0);
  assert.match(promotions.answer, /no hay promociones activas/i);
  assert.match(
    promotions.answer,
    /plato del día es Hamburguesa Clásica Estancia/i
  );

  const accepted = await runUniversalConversation({
    message: "Sí",
    context,
    rawState: promotions.state,
  });
  assert.equal(accepted.decision.intent, "add_to_cart");
  assert.deepEqual(accepted.state.cart, [
    {
      offeringKey: "product:hamburguesa-clasica-estancia",
      quantity: 1,
    },
  ]);
});

test("without configured featured knowledge the agent recommends a real offering without inventing a dish of the day", async () => {
  const result = await runUniversalConversation({
    message: "¿Tienen promociones?",
    context: restaurantConversationContext({
      promotions: [],
      knowledge: [],
    }),
  });

  assert.equal(result.decision.intent, "query_promotion");
  assert.match(result.answer, /no hay promociones activas/i);
  assert.match(result.answer, /Te sugerimos/);
  assert.doesNotMatch(result.answer, /plato del día/i);
  assertCustomerSafe(result.answer);
});

test("negative completion replies never reopen the catalog and keep the order unchanged", async () => {
  const context = businessContext();
  const order = await runUniversalConversation({
    message: "Quiero dos hamburguesas clásicas",
    context,
  });

  for (const message of [
    "No",
    "Ya no",
    "Nada más",
    "Solo eso",
    "Ya no deseo más, solo lo que le pedí",
  ]) {
    const result = await runUniversalConversation({
      message,
      context,
      rawState: order.state,
    });
    assert.equal(result.decision.intent, "finish_order_selection");
    assert.equal(result.decision.cartActions.length, 0);
    assert.deepEqual(result.state.cart, order.state.cart);
    assert.match(result.answer, /pedido queda como está/i);
    assert.match(result.answer, /finalizar o ver el total/i);
    assert.doesNotMatch(
      result.answer,
      /Estas son las opciones|Hamburguesa Clásica|Porción de Papas|Jugo Natural/
    );
    assert.equal(
      result.state.sessionMemory.lastPresentedOfferingKeys.length,
      0
    );
    assert.equal(result.state.sessionMemory.pendingOrderDraft, null);
    assertCustomerSafe(result.answer);
  }
});

test("a negative reply without cart closes the offer without inventing an order", async () => {
  const context = businessContext();
  const menu = await runUniversalConversation({
    message: "Menú",
    context,
  });
  const result = await runUniversalConversation({
    message: "No",
    context,
    rawState: menu.state,
  });

  assert.equal(result.decision.intent, "finish_order_selection");
  assert.equal(result.state.cart.length, 0);
  assert.equal(
    result.answer,
    "Entendido, no agregaré productos. ¿Deseas finalizar?"
  );
  assert.doesNotMatch(result.answer, /opciones|Hamburguesa|Papas|Jugo/i);
});

test("payment questions contain only configured payment information", async () => {
  const result = await runUniversalConversation({
    message: "¿Qué formas de pago tienen?",
    context: businessContext(),
  });

  assert.equal(result.decision.intent, "query_payment");
  assert.equal(
    result.answer,
    "Puedes pagar por transferencia bancaria."
  );
  assert.doesNotMatch(
    result.answer,
    /Hamburguesa|Papas|Jugo|producto|catálogo|PayFlow/i
  );
  assert.ok(result.answer.length < 120);
});

test("missing payment methods are explained commercially without technical wording", async () => {
  const result = await runUniversalConversation({
    message: "¿Cuál forma de pago tienen?",
    context: businessContext({
      payment: {
        provider: "none",
        summary: "No hay una forma de pago registrada.",
        conditions: [],
      },
    }),
  });

  assert.equal(result.decision.intent, "query_payment");
  assert.equal(
    result.answer,
    "Por el momento no contamos con formas de pago habilitadas."
  );
  assert.doesNotMatch(
    result.answer,
    /registrad|configur|proveedor|producto|PayFlow/i
  );
});

test("asking for the total returns only the order summary and total", async () => {
  const context = businessContext();
  const order = await runUniversalConversation({
    message: "Quiero dos hamburguesas clásicas",
    context,
  });
  const result = await runUniversalConversation({
    message: "Quiero el total del pedido",
    context,
    rawState: order.state,
  });

  assert.equal(result.decision.intent, "cart_total");
  assert.match(result.answer, /^Tu pedido:/);
  assert.match(result.answer, /2 × Hamburguesa Clásica — 10\.00 USD/);
  assert.match(result.answer, /Total: 10\.00 USD\.$/);
  assert.doesNotMatch(
    result.answer,
    /¿|pagar|pago|agregar|algo más|PayFlow/i
  );
  assert.ok(result.answer.length < 180);
});
