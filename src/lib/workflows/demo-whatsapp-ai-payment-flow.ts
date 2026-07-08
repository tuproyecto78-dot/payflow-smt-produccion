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

/** Node id that should be auto-selected when the demo flow opens. */
export const DEMO_DEFAULT_SELECTED_NODE = "create-payment";

export interface DemoWorkflow {
  id: string;
  name: string;
  description: string;
  status: "testing" | "active" | "draft";
  statusLabel: string;
  savedState: string;
  provider: "mock" | "payphone";
  mode: string;
  paymentProviderOptions: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ─── Nodes (10 nodes, exact positions per spec) ──────────────────────

const DEMO_NODES: FlowNode[] = [
  // 1. Inicio
  {
    id: "start",
    type: "start",
    position: { x: 80, y: 220 },
    data: {
      label: "Inicio",
      description:
        "Inicia el flujo cuando llega un mensaje del cliente por WhatsApp.",
      trigger: "manual",
    },
  },
  // 2. Mensaje inicial WhatsApp
  {
    id: "whatsapp-initial",
    type: "whatsapp",
    position: { x: 280, y: 160 },
    data: {
      label: "Mensaje inicial",
      description: "Enviar un mensaje de bienvenida por WhatsApp.",
      phoneNumber: "+15551234567",
      message:
        "¡Hola! 👋 Soy el asistente virtual. Puedo ayudarte con información y generar un link seguro de pago PayPhone.",
      outputVariable: "user_response",
      defaultResponse: "sí",
      templateName: "confirmacion_pedido",
    },
  },
  // 3. Agente IA de pagos
  {
    id: "ai-agent",
    type: "ai_agent",
    position: { x: 280, y: 340 },
    data: {
      label: "Agente IA de pagos",
      description: "Ejecutar un agente de IA para generar una respuesta.",
      systemPrompt:
        "Eres un agente de cobros por WhatsApp. Confirmas la intención de pago del cliente de forma amable y breve. REGLA: nunca confirmas pagos exitosos, solo confirmas la intención del cliente.",
      prompt:
        "El cliente respondió: {{user_response}}\n\nConfirma si el cliente tiene intención de pagar.",
      inputVariable: "user_response",
      outputVariable: "ai_confirmation",
    },
  },
  // 4. Crear pago
  {
    id: "create-payment",
    type: "create_payment",
    position: { x: 520, y: 250 },
    data: {
      label: "Crear pago",
      description: "Generar un cobro con 4 resultados posibles.",
      moduleDescription:
        "Módulo de Pagos. Genera un cobro y se bifurca en 4 resultados. Proveedor predeterminado: Mock.",
      paymentProvider: "mock",
      paymentProviderLabel: "Mock (predeterminado)",
      provider: "Mock",
      providerMode: "payphone_api_link",
      amount: 49.99,
      currency: "USD",
      description: "Pedido Pro",
      paymentDescription: "Pedido Pro",
      customerName: "Cliente WhatsApp",
      customer: "Cliente WhatsApp",
      phoneNumber: "+15551234567",
      customerPhone: "+15551234567",
      orderId: "ord_{{timestamp}}",
      generatedPaymentUrl: "https://pay.payflow.smt/ord_{{timestamp}}",
      paymentStatus: "pendiente hasta ejecutar",
      possibleResults: [
        "payment_success",
        "payment_failed",
        "payment_pending",
        "error",
      ],
      message:
        "Te comparto tu link seguro de pago PayPhone. Cuando completes el pago, confirmaremos tu transacción.",
    },
  },
  // 5. Condición estado del pago
  {
    id: "payment-status",
    type: "condition",
    position: { x: 760, y: 250 },
    data: {
      label: "Estado del pago",
      description: "Evalúa el resultado del pago.",
      variable: "payment_status",
      conditionVariable: "payment_status",
      operator: "equals",
      value: "payment_success",
      outputs: ["payment_success", "payment_failed", "payment_pending", "error"],
    },
  },
  // 6. WhatsApp éxito
  {
    id: "whatsapp-success",
    type: "whatsapp",
    position: { x: 1030, y: 100 },
    data: {
      label: "WhatsApp éxito",
      description: "Mensaje cuando el pago fue confirmado.",
      phoneNumber: "+15551234567",
      message:
        "¡Pago confirmado! Gracias, tu transacción fue aprobada correctamente.",
    },
  },
  // 7. WhatsApp pago fallido
  {
    id: "whatsapp-failed",
    type: "whatsapp",
    position: { x: 1030, y: 240 },
    data: {
      label: "WhatsApp pago fallido",
      description: "Mensaje cuando el pago falla.",
      phoneNumber: "+15551234567",
      message:
        "No pudimos confirmar tu pago. Puedes intentar nuevamente o contactar al comercio.",
    },
  },
  // 8. WhatsApp pago pendiente
  {
    id: "whatsapp-pending",
    type: "whatsapp",
    position: { x: 1030, y: 380 },
    data: {
      label: "WhatsApp pago pendiente",
      description: "Mensaje cuando el pago queda pendiente.",
      phoneNumber: "+15551234567",
      message:
        "Tu pago está pendiente. Cuando PayPhone confirme la transacción, te avisaremos.",
    },
  },
  // 9. WhatsApp error
  {
    id: "whatsapp-error",
    type: "whatsapp",
    position: { x: 1030, y: 520 },
    data: {
      label: "WhatsApp error",
      description: "Mensaje cuando ocurre un error.",
      phoneNumber: "+15551234567",
      message:
        "Ocurrió un problema al generar el pago. Un asesor revisará tu caso.",
    },
  },
  // 10. Fin
  {
    id: "end",
    type: "end",
    position: { x: 1280, y: 300 },
    data: {
      label: "Fin",
      description: "Finaliza el flujo.",
      message: "Flujo de cobro completado",
    },
  },
];

// ─── Edges (12 connections per spec) ──────────────────────────────────

const DEMO_EDGES: FlowEdge[] = [
  { id: "e-start-whatsapp-initial", source: "start", target: "whatsapp-initial", sourceHandle: "out" },
  { id: "e-whatsapp-initial-ai-agent", source: "whatsapp-initial", target: "ai-agent", sourceHandle: "out" },
  { id: "e-ai-agent-create-payment", source: "ai-agent", target: "create-payment", sourceHandle: "out" },
  { id: "e-create-payment-payment-status", source: "create-payment", target: "payment-status", sourceHandle: "out" },
  // Estado del pago → 4 salidas
  { id: "e-payment-status-success", source: "payment-status", target: "whatsapp-success", sourceHandle: "payment_success" },
  { id: "e-payment-status-failed", source: "payment-status", target: "whatsapp-failed", sourceHandle: "payment_failed" },
  { id: "e-payment-status-pending", source: "payment-status", target: "whatsapp-pending", sourceHandle: "payment_pending" },
  { id: "e-payment-status-error", source: "payment-status", target: "whatsapp-error", sourceHandle: "error" },
  // WhatsApp → Fin
  { id: "e-whatsapp-success-end", source: "whatsapp-success", target: "end", sourceHandle: "out" },
  { id: "e-whatsapp-failed-end", source: "whatsapp-failed", target: "end", sourceHandle: "out" },
  { id: "e-whatsapp-pending-end", source: "whatsapp-pending", target: "end", sourceHandle: "out" },
  { id: "e-whatsapp-error-end", source: "whatsapp-error", target: "end", sourceHandle: "out" },
];

// ─── Export ───────────────────────────────────────────────────────────

export const demoWhatsappAiPaymentFlow: DemoWorkflow = {
  id: DEMO_WORKFLOW_ID,
  name: "Cobro por WhatsApp con IA",
  description: "Flujo demo para cobrar por WhatsApp usando IA y pagos.",
  status: "testing",
  statusLabel: "En prueba",
  savedState: "sin guardar",
  provider: "mock",
  mode: "payment_flow",
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
