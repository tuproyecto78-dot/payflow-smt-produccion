// Flow template generator for PayFlow SMT.
// Generates complete visual workflows from simple parameters.
// Payment is OPTIONAL — if payment_required=false, no payment nodes are created.

import type { FlowNode, FlowEdge } from "@/lib/workflow-types";

export type FlowTemplateId =
  | "venta"
  | "cobro"
  | "agenda"
  | "venta_cobro"
  | "agenda_cobro"
  | "agente_completo"
  | "solo_ia"; // New: no payment, just IA + notification

export interface FlowTemplateParams {
  templateId: FlowTemplateId;
  business_name: string;
  business_type: string;
  product_or_service: string;
  amount_mode: "fixed" | "variable";
  fixed_amount?: number;
  currency: string;
  welcome_message: string;
  business_hours: string;
  whatsapp_number: string;
  payment_provider: "none" | "payphone" | "mock";
  payment_required: boolean;
  agent_mode: "vender" | "cobrar" | "agendar" | "completo";
}

export interface GeneratedFlow {
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const FLOW_TEMPLATES: Array<{
  id: FlowTemplateId;
  name: string;
  description: string;
}> = [
  { id: "venta", name: "Venta por WhatsApp", description: "Agente que vende productos y responde preguntas." },
  { id: "cobro", name: "Cobro por WhatsApp", description: "Agente que cobra con PayPhone API Link." },
  { id: "agenda", name: "Agenda de citas", description: "Agente que agenda citas automáticamente." },
  { id: "venta_cobro", name: "Venta + cobro", description: "Vende y cobra con PayPhone en un solo flujo." },
  { id: "agenda_cobro", name: "Agenda + cobro", description: "Agenda cita y cobra depósito con PayPhone." },
  { id: "agente_completo", name: "Agente comercial completo", description: "Vende, cobra, agenda y deriva a humano." },
  { id: "solo_ia", name: "Solo IA (sin pagos)", description: "Agente que responde, agenda y notifica sin cobros." },
];

let _counter = 0;
function nid() {
  _counter += 1;
  return `ft_${_counter}_${Math.random().toString(36).slice(2, 6)}`;
}
function eid() {
  _counter += 1;
  return `fe_${_counter}_${Math.random().toString(36).slice(2, 6)}`;
}

function edge(source: string, target: string, handle?: string): FlowEdge {
  return { id: eid(), source, target, sourceHandle: handle || "out" };
}

function waNode(label: string, message: string, phone: string, x: number, y: number): FlowNode {
  return { id: nid(), type: "whatsapp", position: { x, y }, data: { label, phoneNumber: phone, message } };
}

function startNode(x: number, y: number): FlowNode {
  return { id: nid(), type: "start", position: { x, y }, data: { label: "Inicio", trigger: "manual" } };
}

function endNode(x: number, y: number): FlowNode {
  return { id: nid(), type: "end", position: { x, y }, data: { label: "Fin", message: "Flujo completado" } };
}

function aiNode(params: FlowTemplateParams, x: number, y: number): FlowNode {
  return {
    id: nid(),
    type: "ai_agent",
    position: { x, y },
    data: {
      label: "Agente IA",
      systemPrompt: `Eres el agente comercial de ${params.business_name}. ${params.agent_mode === "vender" ? "Ayudas a vender productos." : params.agent_mode === "cobrar" ? "Ayudas a cobrar." : params.agent_mode === "agendar" ? "Ayudas a agendar citas." : "Ayudas a vender, cobrar y agendar."} Sé amable y conciso. NO pidas datos de tarjeta ni CVV.`,
      prompt: "Cliente escribió: {{user_response}}",
      inputVariable: "user_response",
      outputVariable: "ai_response",
    },
  };
}

function createPaymentNode(params: FlowTemplateParams, x: number, y: number): FlowNode | null {
  if (!params.payment_required || params.payment_provider === "none") return null;
  const provider = params.payment_provider === "mock" ? "Mock" : "PayPhone";
  return {
    id: nid(),
    type: "create_payment",
    position: { x, y },
    data: {
      label: "Crear pago",
      provider,
      amount: params.fixed_amount || 0,
      currency: params.currency || "USD",
      description: params.product_or_service,
      customer: "{{customer_name}}",
      phoneNumber: "{{customer_phone}}",
      orderId: "ord_{{timestamp}}",
      ...(provider === "PayPhone" ? { payphoneIntegration: "API Link", countryCode: "593" } : {}),
    },
  };
}

// ─── Template: Solo IA (sin pagos) ──────────────────────────────────
function generateSoloIA(params: FlowTemplateParams): GeneratedFlow {
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode(params, x + step * 2, y);
  const waReply = waNode("WhatsApp respuesta", "{{ai_response}}", params.whatsapp_number, x + step * 3, y);
  const waNotify = waNode("WhatsApp notificación negocio", `Nueva consulta de {{customer_name}}: {{user_response}}`, params.whatsapp_number, x + step * 3, y + 150);
  const end = endNode(x + step * 4, y);

  return {
    name: "Solo IA (sin pagos)",
    description: `Flujo de IA sin pagos para ${params.business_name}`,
    nodes: [start, wa1, ai, waReply, waNotify, end],
    edges: [
      edge(start.id, wa1.id),
      edge(wa1.id, ai.id),
      edge(ai.id, waReply.id),
      edge(waReply.id, end.id),
      edge(ai.id, waNotify.id),
      edge(waNotify.id, end.id),
    ],
  };
}

// ─── Template: Venta (con o sin pago) ───────────────────────────────
function generateVenta(params: FlowTemplateParams): GeneratedFlow {
  if (!params.payment_required || params.payment_provider === "none") {
    return generateSoloIA(params);
  }
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode(params, x + step * 2, y);
  const pay = createPaymentNode(params, x + step * 3, y);
  const waLink = waNode("WhatsApp link", "✅ Tu enlace de pago: {{payment_link}}", params.whatsapp_number, x + step * 4, y);
  const waSuccess = waNode("WhatsApp confirmado", "✅ Pago confirmado. ¡Gracias!", params.whatsapp_number, x + step * 5, y - 80);
  const waFailed = waNode("WhatsApp fallido", "❌ Pago rechazado. Intenta nuevamente.", params.whatsapp_number, x + step * 5, y + 80);
  const end = endNode(x + step * 6, y);

  return {
    name: "Venta por WhatsApp",
    description: `Venta con ${params.payment_provider} para ${params.business_name}`,
    nodes: [start, wa1, ai, pay!, waLink, waSuccess, waFailed, end],
    edges: [
      edge(start.id, wa1.id),
      edge(wa1.id, ai.id),
      edge(ai.id, pay!.id),
      edge(pay!.id, waLink.id, "payment_pending"),
      edge(waLink.id, waSuccess.id, "payment_success"),
      edge(waLink.id, waFailed.id, "payment_failed"),
      edge(waSuccess.id, end.id),
      edge(waFailed.id, end.id),
    ],
  };
}

// ─── Template: Cobro ────────────────────────────────────────────────
function generateCobro(params: FlowTemplateParams): GeneratedFlow {
  return generateVenta({ ...params, agent_mode: "cobrar", templateId: "cobro" });
}

// ─── Template: Agenda (con o sin pago) ──────────────────────────────
function generateAgenda(params: FlowTemplateParams): GeneratedFlow {
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode({ ...params, agent_mode: "agendar" }, x + step * 2, y);
  const waConfirm = waNode("WhatsApp cita", "✅ Tu cita quedó agendada para {{appointment_date}} a las {{appointment_time}}.", params.whatsapp_number, x + step * 3, y);
  const end = endNode(x + step * 4, y);

  return {
    name: "Agenda de citas",
    description: `Agenda de citas para ${params.business_name}`,
    nodes: [start, wa1, ai, waConfirm, end],
    edges: [
      edge(start.id, wa1.id),
      edge(wa1.id, ai.id),
      edge(ai.id, waConfirm.id),
      edge(waConfirm.id, end.id),
    ],
  };
}

// ─── Template: Venta + cobro ────────────────────────────────────────
function generateVentaCobro(params: FlowTemplateParams): GeneratedFlow {
  if (!params.payment_required || params.payment_provider === "none") {
    return generateSoloIA(params);
  }
  return generateVenta({ ...params, templateId: "venta_cobro" });
}

// ─── Template: Agenda + cobro ───────────────────────────────────────
function generateAgendaCobro(params: FlowTemplateParams): GeneratedFlow {
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode({ ...params, agent_mode: "agendar" }, x + step * 2, y);
  const waCita = waNode("WhatsApp cita", "✅ Cita confirmada: {{appointment_date}} {{appointment_time}}", params.whatsapp_number, x + step * 3, y);

  const nodes: FlowNode[] = [start, wa1, ai, waCita];
  const edges: FlowEdge[] = [
    edge(start.id, wa1.id),
    edge(wa1.id, ai.id),
    edge(ai.id, waCita.id),
  ];

  if (params.payment_required && params.payment_provider !== "none") {
    const pay = createPaymentNode(params, x + step * 4, y);
    const waLink = waNode("WhatsApp link", "✅ Tu enlace de pago: {{payment_link}}", params.whatsapp_number, x + step * 5, y - 80);
    const waSuccess = waNode("WhatsApp confirmado", "✅ Pago confirmado. Cita garantizada.", params.whatsapp_number, x + step * 6, y - 80);
    const waFailed = waNode("WhatsApp fallido", "❌ Pago rechazado.", params.whatsapp_number, x + step * 6, y + 80);
    const end = endNode(x + step * 7, y);
    nodes.push(pay!, waLink, waSuccess, waFailed, end);
    edges.push(
      edge(waCita.id, pay!.id),
      edge(pay!.id, waLink.id, "payment_pending"),
      edge(waLink.id, waSuccess.id, "payment_success"),
      edge(waLink.id, waFailed.id, "payment_failed"),
      edge(waSuccess.id, end.id),
      edge(waFailed.id, end.id),
    );
  } else {
    const end = endNode(x + step * 4, y);
    nodes.push(end);
    edges.push(edge(waCita.id, end.id));
  }

  return {
    name: "Agenda + cobro",
    description: `Agenda${params.payment_required ? " + cobro" : ""} para ${params.business_name}`,
    nodes,
    edges,
  };
}

// ─── Template: Agente completo (con o sin pago) ─────────────────────
function generateAgenteCompleto(params: FlowTemplateParams): GeneratedFlow {
  const x = 60, y = 320, step = 280;
  const start = startNode(x, y);
  const wa1 = waNode("WhatsApp bienvenida", params.welcome_message, params.whatsapp_number, x + step, y);
  const ai = aiNode({ ...params, agent_mode: "completo" }, x + step * 2, y);
  const waReply = waNode("WhatsApp respuesta", "{{ai_response}}", params.whatsapp_number, x + step * 3, y);

  const nodes: FlowNode[] = [start, wa1, ai, waReply];
  const edges: FlowEdge[] = [
    edge(start.id, wa1.id),
    edge(wa1.id, ai.id),
    edge(ai.id, waReply.id),
  ];

  if (params.payment_required && params.payment_provider !== "none") {
    const pay = createPaymentNode(params, x + step * 4, y - 100);
    const waLink = waNode("WhatsApp link", "✅ Tu enlace de pago: {{payment_link}}", params.whatsapp_number, x + step * 5, y - 100);
    const waPayOk = waNode("WhatsApp pago OK", "✅ Pago confirmado. ¡Gracias!", params.whatsapp_number, x + step * 6, y - 100);
    const waPayFail = waNode("WhatsApp pago fail", "❌ Pago rechazado.", params.whatsapp_number, x + step * 6, y);
    const end = endNode(x + step * 7, y);
    nodes.push(pay!, waLink, waPayOk, waPayFail, end);
    edges.push(
      edge(waReply.id, pay!.id),
      edge(pay!.id, waLink.id, "payment_pending"),
      edge(waLink.id, waPayOk.id, "payment_success"),
      edge(waLink.id, waPayFail.id, "payment_failed"),
      edge(waPayOk.id, end.id),
      edge(waPayFail.id, end.id),
    );
  } else {
    const end = endNode(x + step * 4, y);
    nodes.push(end);
    edges.push(edge(waReply.id, end.id));
  }

  return {
    name: "Agente comercial completo",
    description: `Agente completo${params.payment_required ? " con pagos" : " sin pagos"} para ${params.business_name}`,
    nodes,
    edges,
  };
}

export function generateFlowFromTemplate(params: FlowTemplateParams): GeneratedFlow {
  _counter = 0;
  switch (params.templateId) {
    case "venta": return generateVenta(params);
    case "cobro": return generateCobro(params);
    case "agenda": return generateAgenda(params);
    case "venta_cobro": return generateVentaCobro(params);
    case "agenda_cobro": return generateAgendaCobro(params);
    case "agente_completo": return generateAgenteCompleto(params);
    case "solo_ia": return generateSoloIA(params);
    default: return generateSoloIA(params);
  }
}
