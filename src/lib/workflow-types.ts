// Shared types for PayFlow SMT workflow nodes & execution engine.

export type NodeType =
  | "start"
  | "message"
  | "question"
  | "condition"
  | "whatsapp"
  | "payment"
  | "ai_agent"
  | "api"
  | "end";

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
  amount?: number;
  currency?: string;
  description?: string;
  merchantName?: string;
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
export interface NodeMeta {
  type: NodeType;
  label: string;
  description: string;
  icon: string; // lucide icon name
  category: "trigger" | "flow" | "channel" | "logic" | "integration";
  color: string;
  outputs: { id: string; label: string }[];
}

export const NODE_METADATA: Record<NodeType, NodeMeta> = {
  start: {
    type: "start",
    label: "Start",
    description: "Entry point of the workflow",
    icon: "Play",
    category: "trigger",
    color: "#10b981",
    outputs: [{ id: "out", label: "Next" }],
  },
  message: {
    type: "message",
    label: "Message",
    description: "Send a static text message",
    icon: "MessageSquare",
    category: "flow",
    color: "#0ea5e9",
    outputs: [{ id: "out", label: "Next" }],
  },
  question: {
    type: "question",
    label: "Question",
    description: "Ask a question and capture the reply",
    icon: "HelpCircle",
    category: "flow",
    color: "#8b5cf6",
    outputs: [{ id: "out", label: "Next" }],
  },
  condition: {
    type: "condition",
    label: "Condition",
    description: "Branch the flow based on a variable",
    icon: "GitBranch",
    category: "logic",
    color: "#f59e0b",
    outputs: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
  },
  whatsapp: {
    type: "whatsapp",
    label: "WhatsApp",
    description: "Send a WhatsApp message to a contact",
    icon: "MessageCircle",
    category: "channel",
    color: "#22c55e",
    outputs: [{ id: "out", label: "Next" }],
  },
  payment: {
    type: "payment",
    label: "Payment",
    description: "Process a payment with 4 possible outcomes",
    icon: "CreditCard",
    category: "channel",
    color: "#ef4444",
    outputs: [
      { id: "payment_success", label: "Success" },
      { id: "payment_failed", label: "Failed" },
      { id: "payment_pending", label: "Pending" },
      { id: "error", label: "Error" },
    ],
  },
  ai_agent: {
    type: "ai_agent",
    label: "AI Agent",
    description: "Run an AI agent to generate a response",
    icon: "Bot",
    category: "integration",
    color: "#ec4899",
    outputs: [{ id: "out", label: "Next" }],
  },
  api: {
    type: "api",
    label: "API / Webhook",
    description: "Make an HTTP request to an external service",
    icon: "Webhook",
    category: "integration",
    color: "#14b8a6",
    outputs: [{ id: "out", label: "Next" }],
  },
  end: {
    type: "end",
    label: "End",
    description: "Terminate the workflow",
    icon: "Square",
    category: "flow",
    color: "#64748b",
    outputs: [],
  },
};

export const NODE_PALETTE_ORDER: NodeType[] = [
  "start",
  "message",
  "question",
  "condition",
  "whatsapp",
  "payment",
  "ai_agent",
  "api",
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
