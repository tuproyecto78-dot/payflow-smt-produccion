import assert from "node:assert/strict";
import test from "node:test";

import {
  emptySimulatorConversationState,
  getSimulatorCartMetrics,
  isPotentialCommerceMessage,
  normalizeSimulatorConversationState,
  processSimulatorCommerceMessage,
} from "../src/lib/simulator-commerce.ts";

const context = {
  clientId: "client-123",
  businessName: "Burger House",
  businessType: "restaurante",
  promotions: "",
  rules: [],
  paymentProvider: "none",
  products: [
    {
      name: "Hamburguesa Clásica",
      description: "Carne y queso",
      price: 5,
      currency: "USD",
      stock: 10,
      trackInventory: true,
      category: "Hamburguesas",
    },
    {
      name: "Hamburguesa Doble",
      description: "Doble carne",
      price: 7,
      currency: "USD",
      stock: 10,
      trackInventory: true,
      category: "Hamburguesas",
    },
    {
      name: "Papas Fritas",
      description: "Porción mediana",
      price: 2.5,
      currency: "USD",
      stock: 20,
      trackInventory: true,
      category: "Acompañamientos",
    },
    {
      name: "Producto sin precio",
      description: "No debe mostrarse",
      price: 0,
      currency: "USD",
      stock: 10,
      trackInventory: true,
      category: "Otros",
    },
  ],
};

test("commerce pre-classifier catches product, quantity and total messages", () => {
  assert.equal(isPotentialCommerceMessage("¿Tienen hamburguesas?", null), true);
  assert.equal(isPotentialCommerceMessage("quiero cuatro clásicas", null), true);
  assert.equal(isPotentialCommerceMessage("¿cuánto pago?", null), true);
  assert.equal(isPotentialCommerceMessage("hola", null), false);
});

test('"¿tienen hamburguesas?" is a real product query', () => {
  const result = processSimulatorCommerceMessage({
    message: "¿tienen hamburguesas?",
    context,
    state: emptySimulatorConversationState(),
  });
  assert.equal(result?.intent, "product_query");
  assert.match(result?.answer || "", /Hamburguesa Clásica/);
  assert.match(result?.answer || "", /Hamburguesa Doble/);
  assert.doesNotMatch(result?.answer || "", /Producto sin precio/);
});

test('"¿cuánto cuestan las papas?" returns the exact catalog price', () => {
  const result = processSimulatorCommerceMessage({
    message: "¿cuánto cuestan las papas?",
    context,
    state: emptySimulatorConversationState(),
  });
  assert.equal(result?.intent, "product_query");
  assert.match(result?.answer || "", /Papas Fritas/);
  assert.match(result?.answer || "", /2\.50 USD/);
});

test('"quiero cuatro clásicas" adds quantity and subtotal', () => {
  const result = processSimulatorCommerceMessage({
    message: "quiero cuatro clásicas",
    context,
    state: emptySimulatorConversationState(),
  });
  assert.equal(result?.intent, "add_to_cart");
  assert.match(result?.answer || "", /Agregué 4 Hamburguesa Clásica/);
  assert.match(result?.answer || "", /20\.00 USD/);
  assert.deepEqual(result?.state.cart, [
    { productName: "Hamburguesa Clásica", quantity: 4 },
  ]);
});

test("missing quantity creates a clarification and remembers the product", () => {
  const first = processSimulatorCommerceMessage({
    message: "quiero papas",
    context,
    state: emptySimulatorConversationState(),
  });
  assert.equal(first?.intent, "clarification");
  assert.match(first?.answer || "", /Cuántas Papas Fritas/);

  const second = processSimulatorCommerceMessage({
    message: "dos",
    context,
    state: first?.state || emptySimulatorConversationState(),
  });
  assert.equal(second?.intent, "add_to_cart");
  assert.match(second?.answer || "", /Agregué 2 Papas Fritas/);
});

test("ambiguous product requests ask which option instead of inventing", () => {
  const result = processSimulatorCommerceMessage({
    message: "quiero dos hamburguesas",
    context,
    state: emptySimulatorConversationState(),
  });
  assert.equal(result?.intent, "clarification");
  assert.match(result?.answer || "", /Cuál producto/);
  assert.match(result?.answer || "", /Hamburguesa Clásica/);
  assert.match(result?.answer || "", /Hamburguesa Doble/);
});

test('"¿cuánto pago?" sums the validated temporary cart', () => {
  const first = processSimulatorCommerceMessage({
    message: "quiero cuatro clásicas",
    context,
    state: emptySimulatorConversationState(),
  });
  const second = processSimulatorCommerceMessage({
    message: "dame dos papas",
    context,
    state: first?.state || emptySimulatorConversationState(),
  });
  const total = processSimulatorCommerceMessage({
    message: "¿cuánto pago?",
    context,
    state: second?.state || emptySimulatorConversationState(),
  });
  assert.equal(total?.intent, "cart_total");
  assert.match(total?.answer || "", /25\.00 USD/);
  const metrics = getSimulatorCartMetrics(
    total?.state || emptySimulatorConversationState(),
    context
  );
  assert.equal(metrics.unitCount, 6);
});

test("unknown products are rejected and client state is revalidated", () => {
  const unknown = processSimulatorCommerceMessage({
    message: "quiero tres pizzas familiares",
    context,
    state: emptySimulatorConversationState(),
  });
  assert.equal(unknown?.intent, "add_to_cart");
  assert.match(unknown?.answer || "", /No encuentro/);
  assert.doesNotMatch(unknown?.answer || "", /subtotal/i);

  const safeState = normalizeSimulatorConversationState(
    {
      cart: [
        { productName: "Hamburguesa Clásica", quantity: 4 },
        { productName: "Producto inventado", quantity: 9 },
        { productName: "Producto sin precio", quantity: 3 },
      ],
    },
    context
  );
  assert.deepEqual(safeState.cart, [
    { productName: "Hamburguesa Clásica", quantity: 4 },
  ]);
});

test("a new explicit product overrides a pending quantity question", () => {
  const first = processSimulatorCommerceMessage({
    message: "¿cuánto cuestan las papas?",
    context,
    state: emptySimulatorConversationState(),
  });
  const second = processSimulatorCommerceMessage({
    message: "quiero cuatro clásicas",
    context,
    state: first?.state || emptySimulatorConversationState(),
  });
  assert.equal(second?.intent, "add_to_cart");
  assert.deepEqual(second?.state.cart, [
    { productName: "Hamburguesa Clásica", quantity: 4 },
  ]);
});
