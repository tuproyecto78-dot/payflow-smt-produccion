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

// ─────────────────────────────────────────────────────────────────────
// Plantilla "Flujo demo WhatsApp + IA + PayPhone"
//
// Flujo de ejemplo para cobrar por WhatsApp usando IA y link seguro PayPhone.
// Inicio → Bienvenida WhatsApp → Agente IA de pagos → Crear link de pago PayPhone
//   Crear link ├─ payment_success → Condición → (true)  Mensaje pago confirmado → Fin
//              │                   └─ (false) ─→ Mensaje error → Fin
//              ├─ payment_failed  → Mensaje pago fallido  → Fin
//              ├─ payment_pending → Mensaje pago pendiente → Fin
//              └─ error           → Mensaje error          → Fin
//
// Provider: payphone · Mode: payphone_api_link · Estado: active
// ─────────────────────────────────────────────────────────────────────
_id = 100; // reset counter for the second template (avoids id collisions)
const DEMO_WHATSAPP_IA_PAYPHONE_NODES: FlowNode[] = [
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
      phoneNumber: "+593987654321",
      message:
        "¡Hola! 👋 Soy el asistente virtual. Puedo ayudarte con información y generar un link seguro de pago PayPhone.",
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
        "Eres un agente de cobros por WhatsApp que usa PayPhone Business. Confirmas la intención de pago del cliente de forma amable y breve. REGLA: nunca confirmas pagos exitosos, solo confirmas la intención del cliente y generas un link seguro de pago PayPhone.",
      prompt:
        "El cliente respondió: {{user_response}}\n\nConfirma si el cliente tiene intención de pagar y prepárate para generar un link seguro de pago PayPhone.",
      inputVariable: "user_response",
      outputVariable: "ai_confirmation",
    },
  },
  {
    id: nid(),
    type: "create_payment",
    position: { x: 820, y: 360 },
    data: {
      label: "Crear link de pago PayPhone",
      provider: "PayPhone",
      providerMode: "payphone_api_link",
      amount: 49.99,
      currency: "USD",
      description: "Link seguro PayPhone",
      customer: "Cliente WhatsApp",
      phoneNumber: "+593987654321",
      orderId: "pay_{{timestamp}}",
      message:
        "Te comparto tu link seguro de pago PayPhone. Cuando completes el pago, confirmaremos tu transacción.",
    },
  },
  {
    id: nid(),
    type: "condition",
    position: { x: 1080, y: 220 },
    data: {
      label: "Condición estado de pago",
      variable: "payment_outcome",
      operator: "equals",
      value: "payment_success",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1080, y: 620 },
    data: {
      label: "Mensaje pago pendiente",
      phoneNumber: "+593987654321",
      message:
        "Tu pago está pendiente. Cuando PayPhone confirme la transacción, te avisaremos.",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1340, y: 140 },
    data: {
      label: "Mensaje pago confirmado",
      phoneNumber: "+593987654321",
      message:
        "¡Pago confirmado! Gracias, tu transacción fue aprobada correctamente.",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1080, y: 480 },
    data: {
      label: "Mensaje pago fallido",
      phoneNumber: "+593987654321",
      message:
        "No pudimos confirmar tu pago. Puedes intentar nuevamente o contactar al comercio.",
    },
  },
  {
    id: nid(),
    type: "whatsapp",
    position: { x: 1340, y: 300 },
    data: {
      label: "Mensaje error",
      phoneNumber: "+593987654321",
      message:
        "Ocurrió un problema al generar el pago. Un asesor revisará tu caso.",
    },
  },
  {
    id: nid(),
    type: "end",
    position: { x: 1620, y: 360 },
    data: { label: "Fin", message: "Flujo de cobro PayPhone completado" },
  },
];

// Referencias a IDs para armar las aristas.
const [
  dStart,
  dWaWelcome,
  dAi,
  dCreatePay,
  dCond,
  dWaPending,
  dWaConfirmed,
  dWaFailed,
  dWaError,
  dEnd,
] = DEMO_WHATSAPP_IA_PAYPHONE_NODES.map((n) => n.id);

const DEMO_WHATSAPP_IA_PAYPHONE_EDGES: FlowEdge[] = [
  { id: eid(), source: dStart, target: dWaWelcome, sourceHandle: "out" },
  { id: eid(), source: dWaWelcome, target: dAi, sourceHandle: "out" },
  { id: eid(), source: dAi, target: dCreatePay, sourceHandle: "out" },
  // Crear link → 4 salidas
  { id: eid(), source: dCreatePay, target: dCond, sourceHandle: "payment_success" },
  { id: eid(), source: dCreatePay, target: dWaFailed, sourceHandle: "payment_failed" },
  { id: eid(), source: dCreatePay, target: dWaPending, sourceHandle: "payment_pending" },
  { id: eid(), source: dCreatePay, target: dWaError, sourceHandle: "error" },
  // Condición → 2 salidas
  { id: eid(), source: dCond, target: dWaConfirmed, sourceHandle: "true" },
  { id: eid(), source: dCond, target: dWaError, sourceHandle: "false" },
  // Todos los WhatsApp → Fin
  { id: eid(), source: dWaConfirmed, target: dEnd, sourceHandle: "out" },
  { id: eid(), source: dWaError, target: dEnd, sourceHandle: "out" },
  { id: eid(), source: dWaFailed, target: dEnd, sourceHandle: "out" },
  { id: eid(), source: dWaPending, target: dEnd, sourceHandle: "out" },
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
  {
    id: "demo-whatsapp-ia-payphone",
    name: "Flujo demo WhatsApp + IA + PayPhone",
    description:
      "Flujo de ejemplo para cobrar por WhatsApp usando IA y link seguro PayPhone.",
    nodes: DEMO_WHATSAPP_IA_PAYPHONE_NODES,
    edges: DEMO_WHATSAPP_IA_PAYPHONE_EDGES,
  },
];
