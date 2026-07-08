/**
 * PayFlow SMT — Canonical local demo workflow.
 *
 * This is the single source of truth for the "Cobro por WhatsApp con IA"
 * demo flow. It exists in code (not in a database) so it's always
 * available — even when Supabase is down, DATABASE_URL is missing, or
 * no workflows exist in the DB.
 *
 * The demo flow is read-only by default. Users can open it in the visual
 * editor, simulate it, or duplicate it — but saving requires a real DB.
 *
 * Provider: mock (default) · PayPhone API Link available as real option.
 *
 * Reglas:
 *   - Crear pago real con PayPhone = payment_pending
 *   - Frontend nunca marca payment_success real
 *   - IA nunca marca payment_success real
 *   - No usar API Sale
 *   - Usar "link seguro PayPhone"
 */

import type { FlowNode, FlowEdge } from "@/lib/workflow-types";

export const DEMO_WORKFLOW_ID = "demo-cobro-whatsapp-ia";

export interface DemoWorkflow {
  id: string;
  name: string;
  description: string;
  status: "testing" | "active" | "draft";
  provider: "mock" | "payphone";
  paymentProviderOptions: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ─── Nodes ────────────────────────────────────────────────────────────

const DEMO_NODES: FlowNode[] = [
  {
    id: "whatsapp-initial",
    type: "whatsapp",
    position: { x: 120, y: 120 },
    data: {
      label: "Mensaje inicial",
      description: "Enviar un mensaje de bienvenida por WhatsApp.",
      phoneNumber: "+15551234567",
      message:
        "¡Hola! 👋 Soy el asistente virtual. Puedo ayudarte con información y generar un link seguro de pago PayPhone.",
      outputVariable: "user_response",
      defaultResponse: "sí",
    },
  },
  {
    id: "create-payment",
    type: "create_payment",
    position: { x: 360, y: 180 },
    data: {
      label: "Crear pago",
      description: "Genera una orden y solicita el pago.",
      paymentProvider: "mock",
      provider: "Mock",
      providerMode: "payphone_api_link",
      amount: 49.99,
      currency: "USD",
      description: "Pedido Pro",
      customerName: "Cliente WhatsApp",
      customer: "Cliente WhatsApp",
      phoneNumber: "+15551234567",
      orderId: "ord_{{timestamp}}",
      message:
        "Te comparto tu link seguro de pago PayPhone. Cuando completes el pago, confirmaremos tu transacción.",
    },
  },
  {
    id: "ai-agent",
    type: "ai_agent",
    position: { x: 360, y: 340 },
    data: {
      label: "Agente IA de pagos",
      description: "Agente IA procesa y guía el pago.",
      systemPrompt:
        "Eres un agente de cobros por WhatsApp. Confirmas la intención de pago del cliente de forma amable y breve. REGLA: nunca confirmas pagos exitosos, solo confirmas la intención del cliente.",
      prompt:
        "El cliente respondió: {{user_response}}\n\nConfirma si el cliente tiene intención de pagar.",
      inputVariable: "user_response",
      outputVariable: "ai_confirmation",
    },
  },
  {
    id: "payment-status",
    type: "condition",
    position: { x: 620, y: 260 },
    data: {
      label: "Estado del pago",
      description: "Evalúa el resultado del pago.",
      variable: "payment_outcome",
      operator: "equals",
      value: "payment_success",
    },
  },
  {
    id: "whatsapp-success",
    type: "whatsapp",
    position: { x: 900, y: 120 },
    data: {
      label: "WhatsApp éxito",
      description: "Mensaje cuando el pago fue confirmado.",
      phoneNumber: "+15551234567",
      message:
        "¡Pago confirmado! Gracias, tu transacción fue aprobada correctamente.",
    },
  },
  {
    id: "whatsapp-failed",
    type: "whatsapp",
    position: { x: 900, y: 260 },
    data: {
      label: "WhatsApp pago fallido",
      description: "Mensaje cuando el pago falla.",
      phoneNumber: "+15551234567",
      message:
        "No pudimos confirmar tu pago. Puedes intentar nuevamente o contactar al comercio.",
    },
  },
  {
    id: "whatsapp-pending",
    type: "whatsapp",
    position: { x: 900, y: 400 },
    data: {
      label: "WhatsApp pago pendiente",
      description: "Mensaje cuando el pago queda pendiente.",
      phoneNumber: "+15551234567",
      message:
        "Tu pago está pendiente. Cuando PayPhone confirme la transacción, te avisaremos.",
    },
  },
  {
    id: "end",
    type: "end",
    position: { x: 1180, y: 260 },
    data: {
      label: "Fin",
      description: "Finaliza el flujo.",
      message: "Flujo de cobro completado",
    },
  },
];

// ─── Edges ────────────────────────────────────────────────────────────

const DEMO_EDGES: FlowEdge[] = [
  { id: "e-whatsapp-initial-create-payment", source: "whatsapp-initial", target: "create-payment", sourceHandle: "out" },
  { id: "e-create-payment-ai-agent", source: "create-payment", target: "ai-agent", sourceHandle: "out" },
  { id: "e-ai-agent-payment-status", source: "ai-agent", target: "payment-status", sourceHandle: "out" },
  // Estado del pago → 4 salidas
  { id: "e-payment-status-success", source: "payment-status", target: "whatsapp-success", sourceHandle: "payment_success" },
  { id: "e-payment-status-failed", source: "payment-status", target: "whatsapp-failed", sourceHandle: "payment_failed" },
  { id: "e-payment-status-pending", source: "payment-status", target: "whatsapp-pending", sourceHandle: "payment_pending" },
  { id: "e-payment-status-error", source: "payment-status", target: "whatsapp-failed", sourceHandle: "error" },
  // WhatsApp → Fin
  { id: "e-whatsapp-success-end", source: "whatsapp-success", target: "end", sourceHandle: "out" },
  { id: "e-whatsapp-failed-end", source: "whatsapp-failed", target: "end", sourceHandle: "out" },
  { id: "e-whatsapp-pending-end", source: "whatsapp-pending", target: "end", sourceHandle: "out" },
];

// ─── Export ───────────────────────────────────────────────────────────

export const demoWhatsappAiPaymentFlow: DemoWorkflow = {
  id: DEMO_WORKFLOW_ID,
  name: "Cobro por WhatsApp con IA",
  description: "Flujo demo para cobrar por WhatsApp usando IA y pagos.",
  status: "testing",
  provider: "mock",
  paymentProviderOptions: ["mock", "payphone_api_link"],
  nodes: DEMO_NODES,
  edges: DEMO_EDGES,
};

/**
 * Returns the demo workflow if the id matches, null otherwise.
 */
export function getDemoWorkflowById(id: string): DemoWorkflow | null {
  if (id === DEMO_WORKFLOW_ID) return demoWhatsappAiPaymentFlow;
  return null;
}

/**
 * True if the id is the demo workflow id.
 */
export function isDemoWorkflowId(id: string): boolean {
  return id === DEMO_WORKFLOW_ID;
}

/**
 * The demo project that contains the demo workflow.
 * Used as fallback when no projects exist in the DB.
 */
export const demoProject = {
  id: "demo-project",
  name: "Cobro por WhatsApp con IA",
  description: "Flujo demo para cobrar por WhatsApp usando IA y pagos.",
};

/**
 * Convert the demo workflow into the FlowItem shape expected by the
 * /api/workflows GET response and the /dashboard + /dashboard/flujos UIs.
 */
export function getDemoFlowItem() {
  return {
    id: demoWhatsappAiPaymentFlow.id,
    name: demoWhatsappAiPaymentFlow.name,
    projectId: demoProject.id,
    projectName: demoProject.name,
    nodeCount: demoWhatsappAiPaymentFlow.nodes.length,
    status: "active",
    provider: "Mock",
    channel: "WhatsApp",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date(),
  };
}
