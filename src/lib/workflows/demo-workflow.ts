/**
 * PayFlow SMT — Local demo workflow.
 *
 * This is the canonical "Cobro por WhatsApp con IA" demo flow used as a
 * fallback when the database (Supabase or Prisma) is not available.
 *
 * It's displayed in /dashboard and /dashboard/flujos even when no DB is
 * configured, so the UI never shows an empty state.
 *
 * Provider: mock (default) · Mode: payphone_api_link (real option)
 * Status: testing (En prueba)
 *
 * Reglas:
 *   - Crear pago real queda payment_pending.
 *   - IA nunca marca payment_success.
 *   - Frontend nunca marca payment_success.
 *   - No usar API Sale.
 */

import type { FlowNode, FlowEdge } from "@/lib/workflow-types";

let _id = 0;
function nid() {
  _id += 1;
  return `demo_n${_id}`;
}
function eid() {
  _id += 1;
  return `demo_e${_id}`;
}

_id = 0;

const DEMO_NODES: FlowNode[] = [
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 40, y: 320 },
    data: {
      label: "Mensaje inicial",
      phoneNumber: "+15551234567",
      message:
        "¡Hola! 👋 Soy el asistente virtual. Puedo ayudarte con información y generar un link seguro de pago PayPhone.",
      outputVariable: "user_response",
      defaultResponse: "sí",
    },
  },
  {
    id: nid(),
    type: "create_payment",
    position: { x: 320, y: 320 },
    data: {
      label: "Crear pago",
      provider: "Mock",
      providerMode: "payphone_api_link",
      amount: 49.99,
      currency: "USD",
      description: "Pedido Pro",
      customer: "Cliente WhatsApp",
      phoneNumber: "+15551234567",
      orderId: "ord_{{timestamp}}",
      message:
        "Te comparto tu link seguro de pago PayPhone. Cuando completes el pago, confirmaremos tu transacción.",
    },
  },
  {
    id: nid(),
    type: "ai_agent",
    position: { x: 600, y: 320 },
    data: {
      label: "Agente IA de pagos",
      systemPrompt:
        "Eres un agente de cobros por WhatsApp. Confirmas la intención de pago del cliente de forma amable y breve. REGLA: nunca confirmas pagos exitosos, solo confirmas la intención del cliente.",
      prompt:
        "El cliente respondió: {{user_response}}\n\nConfirma si el cliente tiene intención de pagar.",
      inputVariable: "user_response",
      outputVariable: "ai_confirmation",
    },
  },
  {
    id: nid(),
    type: "condition",
    position: { x: 880, y: 320 },
    data: {
      label: "Estado del pago",
      variable: "payment_outcome",
      operator: "equals",
      value: "payment_success",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1160, y: 180 },
    data: {
      label: "WhatsApp éxito",
      phoneNumber: "+15551234567",
      message:
        "¡Pago confirmado! Gracias, tu transacción fue aprobada correctamente.",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1160, y: 340 },
    data: {
      label: "WhatsApp pago fallido",
      phoneNumber: "+15551234567",
      message:
        "No pudimos confirmar tu pago. Puedes intentar nuevamente o contactar al comercio.",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1160, y: 500 },
    data: {
      label: "WhatsApp pago pendiente",
      phoneNumber: "+15551234567",
      message:
        "Tu pago está pendiente. Cuando PayPhone confirme la transacción, te avisaremos.",
    },
  },
  {
    id: nid(),
    type: "end",
    position: { x: 1440, y: 320 },
    data: { label: "Fin", message: "Flujo de cobro completado" },
  },
];

// Node id references for edges.
const [
  nWelcome,
  nCreatePay,
  nAi,
  nCond,
  nWaSuccess,
  nWaFailed,
  nWaPending,
  nEnd,
] = DEMO_NODES.map((n) => n.id);

const DEMO_EDGES: FlowEdge[] = [
  { id: eid(), source: nWelcome, target: nCreatePay, sourceHandle: "out" },
  { id: eid(), source: nCreatePay, target: nAi, sourceHandle: "out" },
  { id: eid(), source: nAi, target: nCond, sourceHandle: "out" },
  // Estado del pago → 4 salidas
  { id: eid(), source: nCond, target: nWaSuccess, sourceHandle: "payment_success" },
  { id: eid(), source: nCond, target: nWaFailed, sourceHandle: "payment_failed" },
  { id: eid(), source: nCond, target: nWaPending, sourceHandle: "payment_pending" },
  { id: eid(), source: nCond, target: nWaFailed, sourceHandle: "error" },
  // Todos los WhatsApp → Fin
  { id: eid(), source: nWaSuccess, target: nEnd, sourceHandle: "out" },
  { id: eid(), source: nWaFailed, target: nEnd, sourceHandle: "out" },
  { id: eid(), source: nWaPending, target: nEnd, sourceHandle: "out" },
];

export interface DemoWorkflow {
  id: string;
  name: string;
  description: string;
  status: string;
  provider: string;
  mode: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const demoWorkflow: DemoWorkflow = {
  id: "demo-cobro-whatsapp-ia",
  name: "Cobro por WhatsApp con IA",
  description:
    "Flujo demo para cobrar por WhatsApp usando IA y link seguro PayPhone.",
  status: "testing",
  provider: "mock",
  mode: "payphone_api_link",
  nodes: DEMO_NODES,
  edges: DEMO_EDGES,
};

/**
 * The demo project that contains the demo workflow.
 * Used as fallback when no projects exist in the DB.
 */
export const demoProject = {
  id: "demo-project",
  name: "Cobro por WhatsApp con IA",
  description: "Flujo demo para cobrar por WhatsApp usando IA y link seguro PayPhone.",
};

/**
 * Convert the demo workflow into the FlowItem shape expected by the
 * /api/workflows GET response.
 */
export function getDemoFlowItem() {
  return {
    id: demoWorkflow.id,
    name: demoWorkflow.name,
    projectId: demoProject.id,
    projectName: demoProject.name,
    nodeCount: demoWorkflow.nodes.length,
    status: "active",
    provider: "PayPhone",
    channel: "WhatsApp",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date(),
  };
}
