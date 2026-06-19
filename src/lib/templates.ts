// Plantillas de flujos preconstruidas para PayFlow SMT.
import type { FlowEdge, FlowNode } from "@/lib/workflow-types";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

let _id = 0;
function nid() {
  _id += 1;
  return `tpl_n${_id}`;
}
function eid() {
  _id += 1;
  return `tpl_e${_id}`;
}

// Plantilla "Cobro por WhatsApp con IA"
// Inicio → WhatsApp (bienvenida) → Agente IA de pagos → Crear pago
//   Crear pago ├─ payment_success → Condición → (true) WhatsApp pago exitoso → Fin
//              │                   └─ (false) → WhatsApp error → Fin
//              ├─ payment_failed  → WhatsApp pago fallido → Fin
//              ├─ payment_pending → WhatsApp pago pendiente → Fin
//              └─ error           → WhatsApp error → Fin
_id = 0;
const COBRO_WHATSAPP_IA_NODES: FlowNode[] = [
  {
    id: nid(),
    type: "start",
    position: { x: 40, y: 360 },
    data: { label: "Inicio", trigger: "manual" },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 300, y: 360 },
    data: {
      label: "Bienvenida WhatsApp",
      phoneNumber: "+15551234567",
      message:
        "¡Hola! Soy tu asistente de pagos de PayFlow SMT. Para confirmar tu pedido, responde 'sí'.",
      outputVariable: "user_response",
      defaultResponse: "sí",
    },
  },
  {
    id: nid(),
    type: "ai_agent",
    position: { x: 560, y: 360 },
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
    type: "create_payment",
    position: { x: 820, y: 360 },
    data: {
      label: "Crear pago",
      provider: "Mock",
      amount: 49.99,
      currency: "USD",
      description: "Pedido Pro",
      customer: "Cliente WhatsApp",
      phoneNumber: "+15551234567",
      orderId: "ord_{{timestamp}}",
    },
  },
  {
    id: nid(),
    type: "condition",
    position: { x: 1080, y: 220 },
    data: {
      label: "¿Pago exitoso?",
      variable: "payment_outcome",
      operator: "equals",
      value: "payment_success",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1340, y: 140 },
    data: {
      label: "WhatsApp pago exitoso",
      phoneNumber: "+15551234567",
      message:
        "¡Pago confirmado! 🎉 Gracias por tu compra. Tu pedido está siendo procesado.",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1340, y: 300 },
    data: {
      label: "WhatsApp error",
      phoneNumber: "+15551234567",
      message:
        "Ocurrió un error inesperado al procesar tu pago. Por favor, intenta nuevamente en unos minutos.",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1080, y: 480 },
    data: {
      label: "WhatsApp pago fallido",
      phoneNumber: "+15551234567",
      message:
        "Tu pago fue rechazado. ❌ Verifica los datos de tu tarjeta e intenta nuevamente.",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1080, y: 620 },
    data: {
      label: "WhatsApp pago pendiente",
      phoneNumber: "+15551234567",
      message:
        "Tu pago está pendiente de confirmación. ⏳ Te avisaremos en cuanto se acredite.",
    },
  },
  {
    id: nid(),
    type: "end",
    position: { x: 1620, y: 360 },
    data: { label: "Fin", message: "Flujo de cobro completado" },
  },
];

// Referencias a IDs para armar las aristas.
const [
  tStart,
  tWaWelcome,
  tAi,
  tCreatePay,
  tCond,
  tWaSuccess,
  tWaError,
  tWaFailed,
  tWaPending,
  tEnd,
] = COBRO_WHATSAPP_IA_NODES.map((n) => n.id);

const COBRO_WHATSAPP_IA_EDGES: FlowEdge[] = [
  { id: eid(), source: tStart, target: tWaWelcome, sourceHandle: "out" },
  { id: eid(), source: tWaWelcome, target: tAi, sourceHandle: "out" },
  { id: eid(), source: tAi, target: tCreatePay, sourceHandle: "out" },
  // Crear pago → 4 salidas
  { id: eid(), source: tCreatePay, target: tCond, sourceHandle: "payment_success" },
  { id: eid(), source: tCreatePay, target: tWaFailed, sourceHandle: "payment_failed" },
  { id: eid(), source: tCreatePay, target: tWaPending, sourceHandle: "payment_pending" },
  { id: eid(), source: tCreatePay, target: tWaError, sourceHandle: "error" },
  // Condición → 2 salidas
  { id: eid(), source: tCond, target: tWaSuccess, sourceHandle: "true" },
  { id: eid(), source: tCond, target: tWaError, sourceHandle: "false" },
  // Todos los WhatsApp → Fin
  { id: eid(), source: tWaSuccess, target: tEnd, sourceHandle: "out" },
  { id: eid(), source: tWaError, target: tEnd, sourceHandle: "out" },
  { id: eid(), source: tWaFailed, target: tEnd, sourceHandle: "out" },
  { id: eid(), source: tWaPending, target: tEnd, sourceHandle: "out" },
];

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "cobro-whatsapp-ia",
    name: "Cobro por WhatsApp con IA",
    description:
      "Flujo completo de cobro por WhatsApp: bienvenida, agente IA de pagos, creación de pago y mensajes personalizados según el resultado (éxito, fallido, pendiente o error).",
    nodes: COBRO_WHATSAPP_IA_NODES,
    edges: COBRO_WHATSAPP_IA_EDGES,
  },
];
