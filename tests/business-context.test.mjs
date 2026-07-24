import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBusinessSystemInstructions,
  extractBusinessRules,
  formatBusinessCatalog,
  formatBusinessGreeting,
  formatBusinessPayment,
  formatBusinessPromotions,
  formatBusinessRecommendations,
  getVisibleBusinessProducts,
  sanitizeCustomerAnswer,
} from "../src/lib/business-context-contract.ts";
import { detectSimulatorIntent } from "../src/lib/simulator-intent.ts";

const context = {
  clientId: "client-123",
  businessName: "Café Andino",
  businessType: "restaurante",
  products: [
    {
      name: "Locro de papa",
      description: "Con aguacate y queso",
      price: 6.5,
      currency: "USD",
      stock: 8,
      trackInventory: true,
      category: "Platos",
    },
    {
      name: "Jugo de mora",
      description: "Vaso de 12 oz",
      price: 2.25,
      currency: "USD",
      stock: 0,
      trackInventory: false,
      category: "Bebidas",
    },
    {
      name: "Empanada de viento",
      description: "Con queso",
      price: 1.5,
      currency: "USD",
      stock: 12,
      trackInventory: true,
      category: "Entradas",
    },
    {
      name: "Café pasado",
      description: "Taza mediana",
      price: 1.75,
      currency: "USD",
      stock: 20,
      trackInventory: true,
      category: "Cafés",
    },
    {
      name: "Ensalada andina",
      description: "Vegetales frescos",
      price: 5,
      currency: "USD",
      stock: 6,
      trackInventory: true,
      category: "Ensaladas",
    },
    {
      name: "Sándwich de pollo",
      description: "Con vegetales",
      price: 4.5,
      currency: "USD",
      stock: 7,
      trackInventory: true,
      category: "Platos",
    },
    {
      name: "Producto interno sin precio",
      description: "No debe mostrarse",
      price: 0,
      currency: "USD",
      stock: 20,
      trackInventory: true,
      category: "Interno",
    },
    {
      name: "Producto agotado",
      description: "No debe mostrarse",
      price: 3,
      currency: "USD",
      stock: 0,
      trackInventory: true,
      category: "Agotado",
    },
  ],
  promotions: "2x1 en jugos de 15:00 a 17:00",
  rules: ["Atender con tono amable y confirmar cantidades antes del pedido."],
  paymentProvider: "payphone",
};

test('"Hola" responds briefly as the active business', () => {
  assert.equal(detectSimulatorIntent("Hola"), "greeting");
  const answer = formatBusinessGreeting(context);
  assert.match(answer, /Café Andino/);
  assert.match(answer, /\?$/);
  assert.ok(answer.length < 130);
  assert.doesNotMatch(answer, /PayFlow/i);
});

test("catalog intent shows at most five real priced products and closes with a question", () => {
  assert.equal(detectSimulatorIntent("¿Qué platos tienen hoy con precios?"), "catalog");
  const answer = formatBusinessCatalog(context);
  const bullets = answer.match(/^• /gm) || [];

  assert.equal(bullets.length, 5);
  assert.match(answer, /Locro de papa/);
  assert.match(answer, /6\.50 USD/);
  assert.doesNotMatch(answer, /Sándwich de pollo/);
  assert.doesNotMatch(answer, /Producto interno sin precio|Producto agotado/);
  assert.doesNotMatch(answer, /stock|inventario|client[_ -]?id/i);
  assert.match(answer, /catálogo completo\?$/i);
});

test("full catalog is a separate explicit intent and includes every visible product", () => {
  assert.equal(detectSimulatorIntent("Muéstrame el catálogo completo"), "catalog_full");
  const answer = formatBusinessCatalog(context, { complete: true });
  const bullets = answer.match(/^• /gm) || [];

  assert.equal(bullets.length, 6);
  assert.match(answer, /Sándwich de pollo/);
  assert.doesNotMatch(answer, /Producto interno sin precio|Producto agotado/);
  assert.match(answer, /¿Cuál te interesa\?$/);
});

test("recommendation wording is classified correctly and returns three to five options", () => {
  assert.equal(
    detectSimulatorIntent("¿Qué platos me recomiendas para hoy?"),
    "recommendation"
  );
  const answer = formatBusinessRecommendations(context);
  const bullets = answer.match(/^• /gm) || [];

  assert.ok(bullets.length >= 3 && bullets.length <= 5);
  assert.doesNotMatch(answer, /Producto interno sin precio|Producto agotado/);
  assert.match(answer, /preferencia.*recomendación\?$/i);
});

test("visible products exclude zero prices and unavailable tracked inventory", () => {
  const products = getVisibleBusinessProducts(context);
  assert.equal(products.length, 6);
  assert.ok(products.every((product) => product.price > 0));
  assert.ok(products.every((product) => !product.trackInventory || product.stock > 0));
});

test("promotion query uses real data and remains commercial", () => {
  assert.equal(detectSimulatorIntent("Promoción de hoy"), "promotion");
  const answer = formatBusinessPromotions(context);
  assert.match(answer, /Café Andino/);
  assert.match(answer, /2x1 en jugos de 15:00 a 17:00/);
  assert.match(answer, /\?$/);
  assert.doesNotMatch(answer, /50%|gratis|PayFlow/i);
});

test("missing promotions suggest a useful alternative instead of a dead end", () => {
  const answer = formatBusinessPromotions({ ...context, promotions: "" });
  assert.match(answer, /no tenemos promociones registradas/i);
  assert.match(answer, /presupuesto/i);
  assert.match(answer, /\?$/);
});

test("payment query responds briefly as the business and never confirms a payment", () => {
  assert.equal(detectSimulatorIntent("Pagos"), "payment");
  const answer = formatBusinessPayment(context);
  assert.ok(answer.length < 190);
  assert.match(answer, /confirmación depende del proveedor/i);
  assert.match(answer, /\?$/);
  assert.doesNotMatch(answer, /PayFlow|pago aprobado|pago recibido/i);
});

test("Gemini instructions enforce short commercial WhatsApp responses", () => {
  const instructions = buildBusinessSystemInstructions(
    context,
    "recommendation",
    "simulation"
  );
  assert.match(instructions, /Café Andino/);
  assert.match(instructions, /restaurante/);
  assert.match(instructions, /máximo cuatro frases cortas o cinco productos/i);
  assert.match(instructions, /entre tres y cinco productos reales/i);
  assert.match(instructions, /precio cero/i);
  assert.match(instructions, /cantidades de inventario, IDs, tablas, variables, logs/i);
  assert.match(instructions, /No envíes mensajes reales, no ejecutes cobros/i);
  assert.doesNotMatch(instructions, /Producto interno sin precio|Producto agotado|PayFlow/i);
});

test("legacy workflow rules are sanitized before entering the context", () => {
  const rules = extractBusinessRules(
    [
      {
        type: "ai_agent",
        data: {
          systemPrompt:
            "Eres el asistente de Café Andino. PayFlow genera el enlace y espera confirmación.",
        },
      },
    ],
    "Café Andino"
  );
  assert.equal(rules.length, 1);
  assert.match(rules[0], /Café Andino genera el enlace/i);
  assert.doesNotMatch(rules[0], /PayFlow/i);
});

test("customer answers remove platform branding and internal implementation data", () => {
  const answer = sanitizeCustomerAnswer(
    "Soy el asistente de PayFlow SMT para ayudarte.\nclient_id: client-123\nmetadata: interna",
    context.businessName
  );
  assert.match(answer, /Café Andino/);
  assert.doesNotMatch(answer, /PayFlow|client_id|metadata/i);
});

test("general customer answers are capped for WhatsApp", () => {
  const answer = sanitizeCustomerAnswer("Respuesta comercial ".repeat(100), context.businessName);
  assert.ok(answer.length <= 650);
  assert.match(answer, /…$/);
});
