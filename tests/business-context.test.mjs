import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBusinessSystemInstructions,
  extractBusinessRules,
  formatBusinessCatalog,
  formatBusinessGreeting,
  formatBusinessPayment,
  formatBusinessPromotions,
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
  ],
  promotions: "2x1 en jugos de 15:00 a 17:00",
  rules: ["Atender con tono amable y confirmar cantidades antes del pedido."],
  paymentProvider: "payphone",
};

test('"Hola" responds as the business and never as the platform', () => {
  assert.equal(detectSimulatorIntent("Hola"), "greeting");
  const answer = formatBusinessGreeting(context);
  assert.match(answer, /Café Andino/);
  assert.doesNotMatch(answer, /PayFlow/i);
});

test("catalog query uses only the real catalog and exact prices", () => {
  assert.equal(
    detectSimulatorIntent("¿Qué platos tienen hoy con precios?"),
    "catalog"
  );
  const answer = formatBusinessCatalog(context);
  assert.match(answer, /Café Andino/);
  assert.match(answer, /Locro de papa/);
  assert.match(answer, /6\.50 USD/);
  assert.match(answer, /Jugo de mora/);
  assert.match(answer, /2\.25 USD/);
  assert.doesNotMatch(answer, /Ceviche|Hamburguesa|PayFlow/i);
});

test("promotion query uses the real promotion and does not invent another", () => {
  assert.equal(detectSimulatorIntent("Promoción de hoy"), "promotion");
  const answer = formatBusinessPromotions(context);
  assert.match(answer, /Café Andino/);
  assert.match(answer, /2x1 en jugos de 15:00 a 17:00/);
  assert.doesNotMatch(answer, /50%|gratis|PayFlow/i);
});

test("payment query responds as the business and never confirms a payment", () => {
  assert.equal(detectSimulatorIntent("Pagos"), "payment");
  const answer = formatBusinessPayment(context);
  assert.match(answer, /Café Andino/);
  assert.match(answer, /solo se considera confirmado/i);
  assert.doesNotMatch(answer, /PayFlow/i);
  assert.doesNotMatch(answer, /pago aprobado|pago recibido/i);
});

test("Gemini instructions always include the full business context", () => {
  const instructions = buildBusinessSystemInstructions(
    context,
    "buy",
    "simulation"
  );
  assert.match(instructions, /Café Andino/);
  assert.match(instructions, /restaurante/);
  assert.match(instructions, /Locro de papa/);
  assert.match(instructions, /6\.50 USD/);
  assert.match(instructions, /2x1 en jugos/);
  assert.match(instructions, /confirmar cantidades/);
  assert.match(instructions, /No inventes productos, precios, promociones/i);
  assert.match(instructions, /No envíes mensajes reales, no ejecutes cobros/i);
  assert.doesNotMatch(instructions, /PayFlow/i);
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

test("any unexpected platform branding is removed from the customer answer", () => {
  const answer = sanitizeCustomerAnswer(
    "Soy el asistente de PayFlow SMT para ayudarte.",
    context.businessName
  );
  assert.match(answer, /Café Andino/);
  assert.doesNotMatch(answer, /PayFlow/i);
});
