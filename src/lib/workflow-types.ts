// Shared types for PayFlow SMT workflow nodes & execution engine.

export type NodeType =
  // Flujo
  | "start"
  | "message"
  | "question"
  | "condition"
  | "end"
  // Canales
  | "whatsapp"
  // Pagos (módulo especializado)
  | "create_payment"
  | "verify_payment"
  | "wait_confirmation"
  | "payment_success"
  | "payment_failed"
  | "payment_pending"
  // Inteligencia
  | "ai_agent"
  // Integraciones
  | "api"
  // Legacy alias (tratado como create_payment en el motor)
  | "payment";

export interface BaseNodeData {
  label: string;
  [key: string]: unknown;
}

export interface StartNodeData extends BaseNodeData {
  trigger?: "manual" | "webhook" | "schedule";
}

export interface MessageNodeData extends BaseNodeData {
  message?: string;
}

export interface QuestionNodeData extends BaseNodeData {
  question?: string;
  variable?: string;
  defaultResponse?: string;
}

export interface ConditionNodeData extends BaseNodeData {
  variable?: string;
  operator?: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
  value?: string;
}

export interface WhatsAppNodeData extends BaseNodeData {
  phoneNumber?: string;
  message?: string;
  templateName?: string;
}

export interface PaymentNodeData extends BaseNodeData {
  provider?: "Mock" | "Stripe" | "Mercado Pago" | "PayPal" | "API externa";
  amount?: number;
  currency?: string;
  description?: string;
  merchantName?: string;
  customer?: string;
  phoneNumber?: string;
  orderId?: string;
  paymentUrl?: string;
  paymentStatus?: string;
}

export interface AIAgentNodeData extends BaseNodeData {
  systemPrompt?: string;
  prompt?: string;
  inputVariable?: string;
  outputVariable?: string;
  model?: string;
}

export interface ApiNodeData extends BaseNodeData {
  url?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: string; // JSON string of header key/values
  body?: string;
  outputVariable?: string;
}

export interface EndNodeData extends BaseNodeData {
  message?: string;
}

export type PaymentOutcome = "payment_success" | "payment_failed" | "payment_pending" | "error";

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface LogEntry {
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;
  status: "started" | "success" | "error" | "info";
  message: string;
  timestamp: string;
  durationMs?: number;
}

export interface WhatsAppSimMessage {
  id: string;
  direction: "outbound" | "inbound";
  phone: string;
  text: string;
  timestamp: string;
  nodeId: string;
}

export interface ExecutionContext {
  variables: Record<string, unknown>;
  log: LogEntry[];
  whatsappMessages: WhatsAppSimMessage[];
  paymentOutcome?: PaymentOutcome;
}

export interface ExecutionResult {
  status: "success" | "failed" | "stopped";
  entries: LogEntry[];
  variables: Record<string, unknown>;
  whatsappMessages: WhatsAppSimMessage[];
  finalNode?: string;
  error?: string;
}

// Node metadata for the UI palette
export type NodeCategory =
  | "flow" // Flujo
  | "channel" // Canales
  | "payment" // Pagos
  | "intelligence" // Inteligencia
  | "integration"; // Integraciones

export interface NodeMeta {
  type: NodeType;
  label: string;
  description: string;
  icon: string; // lucide icon name
  category: NodeCategory;
  color: string;
  outputs: { id: string; label: string }[];
}

export const NODE_METADATA: Record<NodeType, NodeMeta> = {
  // ── Flujo ──────────────────────────────────────────
  start: {
    type: "start",
    label: "Inicio",
    description: "Punto de entrada del flujo",
    icon: "Play",
    category: "flow",
    color: "#10b981",
    outputs: [{ id: "out", label: "Siguiente" }],
  },
  condition: {
    type: "condition",
    label: "Condición",
    description: "Bifurcar el flujo según una variable",
    icon: "GitBranch",
    category: "flow",
    color: "#f59e0b",
    outputs: [
      { id: "true", label: "Verdadero" },
      { id: "false", label: "Falso" },
    ],
  },
  message: {
    type: "message",
    label: "Mensaje",
    description: "Enviar un mensaje de texto fijo",
    icon: "MessageSquare",
    category: "flow",
    color: "#0ea5e9",
    outputs: [{ id: "out", label: "Siguiente" }],
  },
  question: {
    type: "question",
    label: "Pregunta",
    description: "Hacer una pregunta y capturar la respuesta",
    icon: "HelpCircle",
    category: "flow",
    color: "#8b5cf6",
    outputs: [{ id: "out", label: "Siguiente" }],
  },
  end: {
    type: "end",
    label: "Fin",
    description: "Terminar el flujo",
    icon: "Square",
    category: "flow",
    color: "#64748b",
    outputs: [],
  },

  // ── Canales ────────────────────────────────────────
  whatsapp: {
    type: "whatsapp",
    label: "WhatsApp",
    description: "Enviar un mensaje de WhatsApp a un contacto",
    icon: "MessageCircle",
    category: "channel",
    color: "#22c55e",
    outputs: [{ id: "out", label: "Siguiente" }],
  },

  // ── Pagos (módulo especializado) ──────────────────
  create_payment: {
    type: "create_payment",
    label: "Crear pago",
    description: "Generar un cobro con 4 resultados posibles",
    icon: "CreditCard",
    category: "payment",
    color: "#6366f1",
    outputs: [
      { id: "payment_success", label: "Éxito" },
      { id: "payment_failed", label: "Fallido" },
      { id: "payment_pending", label: "Pendiente" },
      { id: "error", label: "Error" },
    ],
  },
  verify_payment: {
    type: "verify_payment",
    label: "Verificar pago",
    description: "Consultar el estado de un pago existente",
    icon: "Search",
    category: "payment",
    color: "#6366f1",
    outputs: [{ id: "out", label: "Siguiente" }],
  },
  wait_confirmation: {
    type: "wait_confirmation",
    label: "Esperar confirmación",
    description: "Pausar hasta recibir confirmación del webhook",
    icon: "Hourglass",
    category: "payment",
    color: "#6366f1",
    outputs: [{ id: "out", label: "Siguiente" }],
  },
  payment_success: {
    type: "payment_success",
    label: "Pago exitoso",
    description: "Marcar el pago como confirmado",
    icon: "CheckCircle2",
    category: "payment",
    color: "#6366f1",
    outputs: [{ id: "out", label: "Siguiente" }],
  },
  payment_failed: {
    type: "payment_failed",
    label: "Pago fallido",
    description: "Marcar el pago como rechazado",
    icon: "XCircle",
    category: "payment",
    color: "#6366f1",
    outputs: [{ id: "out", label: "Siguiente" }],
  },
  payment_pending: {
    type: "payment_pending",
    label: "Pago pendiente",
    description: "Marcar el pago como pendiente",
    icon: "Clock",
    category: "payment",
    color: "#6366f1",
    outputs: [{ id: "out", label: "Siguiente" }],
  },

  // ── Inteligencia ─────────────────────────────────
  ai_agent: {
    type: "ai_agent",
    label: "Agente IA",
    description: "Ejecutar un agente de IA para generar una respuesta",
    icon: "Bot",
    category: "intelligence",
    color: "#ec4899",
    outputs: [{ id: "out", label: "Siguiente" }],
  },

  // ── Integraciones ─────────────────────────────────
  api: {
    type: "api",
    label: "API / Webhook",
    description: "Hacer una petición HTTP a un servicio externo",
    icon: "Webhook",
    category: "integration",
    color: "#14b8a6",
    outputs: [{ id: "out", label: "Siguiente" }],
  },

  // Legacy alias → mismo metadata que create_payment
  payment: {
    type: "payment",
    label: "Crear pago",
    description: "Generar un cobro con 4 resultados posibles",
    icon: "CreditCard",
    category: "payment",
    color: "#6366f1",
    outputs: [
      { id: "payment_success", label: "Éxito" },
      { id: "payment_failed", label: "Fallido" },
      { id: "payment_pending", label: "Pendiente" },
      { id: "error", label: "Error" },
    ],
  },
};

// Orden de la paleta agrupado por categoría.
export const PALETTE_CATEGORY_ORDER: NodeCategory[] = [
  "channel",
  "payment",
  "intelligence",
  "integration",
  "flow",
];

export const NODE_PALETTE_ORDER: NodeType[] = [
  // Canales
  "whatsapp",
  // Pagos
  "create_payment",
  "verify_payment",
  "wait_confirmation",
  "payment_success",
  "payment_failed",
  "payment_pending",
  // Inteligencia
  "ai_agent",
  // Integraciones
  "api",
  // Flujo
  "start",
  "condition",
  "message",
  "question",
  "end",
];

// Resolve {{variable}} template placeholders against the context variables.
export function resolveTemplate(template: string, variables: Record<string, unknown>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
    const val = variables[key];
    if (val === undefined || val === null) return "";
    return String(val);
  });
}

export function compareValues(
  left: unknown,
  operator: NonNullable<ConditionNodeData["operator"]>,
  right: string
): boolean {
  const leftStr = left === undefined || left === null ? "" : String(left);
  switch (operator) {
    case "equals":
      return leftStr === right;
    case "not_equals":
      return leftStr !== right;
    case "contains":
      return leftStr.includes(right);
    case "greater_than": {
      const l = parseFloat(leftStr);
      const r = parseFloat(right);
      return !isNaN(l) && !isNaN(r) && l > r;
    }
    case "less_than": {
      const l = parseFloat(leftStr);
      const r = parseFloat(right);
      return !isNaN(l) && !isNaN(r) && l < r;
    }
    default:
      return false;
  }
}
