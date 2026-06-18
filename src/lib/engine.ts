// PayFlow SMT execution engine.
// Runs a workflow node-by-node, following edges and processing each node type.
import type {
  ExecutionResult,
  FlowEdge,
  FlowNode,
  LogEntry,
  NodeType,
  PaymentOutcome,
  WhatsAppSimMessage,
} from "@/lib/workflow-types";
import { compareValues, resolveTemplate } from "@/lib/workflow-types";

interface EngineOptions {
  // Override the payment outcome for deterministic testing.
  forcePaymentOutcome?: PaymentOutcome;
  // Override the question response (mock user input).
  questionResponses?: Record<string, string>;
  // Max nodes to process (cycle protection).
  maxSteps?: number;
}

function nowIso() {
  return new Date().toISOString();
}

function findNextNode(
  currentId: string,
  edges: FlowEdge[],
  nodes: FlowNode[],
  handle?: string | null
): FlowNode | null {
  const matching = edges.filter(
    (e) => e.source === currentId && (handle ? e.sourceHandle === handle : true)
  );
  // Prefer edges matching the explicit handle; fall back to any edge from this source.
  const edge = matching[0];
  if (!edge) return null;
  return nodes.find((n) => n.id === edge.target) ?? null;
}

function log(
  ctx: { log: LogEntry[] },
  entry: Omit<LogEntry, "timestamp">
) {
  ctx.log.push({ ...entry, timestamp: nowIso() });
}

// Mock payment outcome with realistic weights.
function mockPaymentOutcome(force?: PaymentOutcome): PaymentOutcome {
  if (force) return force;
  const r = Math.random();
  if (r < 0.65) return "payment_success";
  if (r < 0.8) return "payment_failed";
  if (r < 0.93) return "payment_pending";
  return "error";
}

export async function executeWorkflow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: EngineOptions = {}
): Promise<ExecutionResult> {
  const ctx = {
    variables: {} as Record<string, unknown>,
    log: [] as LogEntry[],
    whatsappMessages: [] as WhatsAppSimMessage[],
    paymentOutcome: undefined as PaymentOutcome | undefined,
  };

  const maxSteps = options.maxSteps ?? 200;

  // Find the Start node.
  const startNode = nodes.find((n) => n.type === "start");
  if (!startNode) {
    log(ctx, {
      nodeId: "—",
      nodeType: "start",
      nodeLabel: "Start",
      status: "error",
      message: "No Start node found in the workflow.",
    });
    return {
      status: "failed",
      entries: ctx.log,
      variables: ctx.variables,
      whatsappMessages: ctx.whatsappMessages,
      error: "No Start node",
    };
  }

  let current: FlowNode | null = startNode;
  let steps = 0;
  const visited = new Set<string>();

  while (current && steps < maxSteps) {
    steps++;
    const node = current;
    const startedAt = Date.now();
    const data = node.data || {};
    const label = String(data.label || node.type);

    log(ctx, {
      nodeId: node.id,
      nodeType: node.type as NodeType,
      nodeLabel: label,
      status: "started",
      message: `Executing ${label}`,
    });

    let nextHandle: string | null = "out";
    let shouldStop = false;
    let errorMsg: string | null = null;

    try {
      switch (node.type) {
        case "start": {
          const trigger = (data.trigger as string) || "manual";
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "info",
            message: `Workflow triggered via ${trigger}.`,
          });
          nextHandle = "out";
          break;
        }

        case "message": {
          const message = resolveTemplate(
            String(data.message || "Hello!"),
            ctx.variables
          );
          ctx.variables["last_message"] = message;
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Message prepared: "${message.slice(0, 80)}${message.length > 80 ? "…" : ""}"`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = "out";
          break;
        }

        case "question": {
          const question = resolveTemplate(
            String(data.question || "Please respond."),
            ctx.variables
          );
          const variable = String(data.variable || "user_response");
          const override = options.questionResponses?.[variable];
          const response =
            override ??
            (data.defaultResponse
              ? resolveTemplate(String(data.defaultResponse), ctx.variables)
              : "yes");
          ctx.variables[variable] = response;
          // Also push the inbound reply into the WhatsApp simulator if we have a phone context.
          if (ctx.whatsappMessages.length > 0) {
            const lastPhone = ctx.whatsappMessages[ctx.whatsappMessages.length - 1].phone;
            ctx.whatsappMessages.push({
              id: `${node.id}-in-${Date.now()}`,
              direction: "inbound",
              phone: lastPhone,
              text: response,
              timestamp: nowIso(),
              nodeId: node.id,
            });
          }
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Asked: "${question}" → captured "${response}" into {{${variable}}}`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = "out";
          break;
        }

        case "condition": {
          const variable = String(data.variable || "");
          const operator = (data.operator as "equals" | "not_equals" | "contains" | "greater_than" | "less_than") || "equals";
          const value = String(data.value ?? "");
          const left = ctx.variables[variable];
          const result = compareValues(left, operator, value);
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Condition {{${variable}}} (${JSON.stringify(left)}) ${operator} "${value}" → ${result}`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = result ? "true" : "false";
          break;
        }

        case "whatsapp": {
          const phone = resolveTemplate(
            String(data.phoneNumber || "+15551234567"),
            ctx.variables
          );
          const message = resolveTemplate(
            String(data.message || "Hello from PayFlow SMT!"),
            ctx.variables
          );
          ctx.whatsappMessages.push({
            id: `${node.id}-out-${Date.now()}`,
            direction: "outbound",
            phone,
            text: message,
            timestamp: nowIso(),
            nodeId: node.id,
          });
          ctx.variables["last_whatsapp_phone"] = phone;
          ctx.variables["last_whatsapp_message"] = message;
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `WhatsApp message sent to ${phone}: "${message.slice(0, 80)}${message.length > 80 ? "…" : ""}"`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = "out";
          break;
        }

        case "payment": {
          const amount = Number(data.amount ?? 0);
          const currency = String(data.currency || "USD");
          const description = resolveTemplate(
            String(data.description || "Payment"),
            ctx.variables
          );
          const outcome = mockPaymentOutcome(options.forcePaymentOutcome);
          ctx.paymentOutcome = outcome;
          ctx.variables["payment_outcome"] = outcome;
          ctx.variables["payment_amount"] = amount;
          ctx.variables["payment_currency"] = currency;
          const statusMsg =
            outcome === "payment_success"
              ? `Payment of ${amount} ${currency} succeeded.`
              : outcome === "payment_failed"
              ? `Payment of ${amount} ${currency} was declined.`
              : outcome === "payment_pending"
              ? `Payment of ${amount} ${currency} is pending.`
              : `Payment processor error for ${amount} ${currency}.`;
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: outcome === "error" ? "error" : "success",
            message: `${statusMsg} (description: "${description}") → branching to ${outcome}`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = outcome;
          break;
        }

        case "ai_agent": {
          const systemPrompt =
            String(data.systemPrompt || "You are a helpful assistant.");
          const inputVar = String(data.inputVariable || "");
          const inputText = inputVar ? ctx.variables[inputVar] : undefined;
          const prompt = resolveTemplate(
            String(data.prompt || "Hello"),
            ctx.variables
          ) + (inputText ? `\n\nInput: ${String(inputText)}` : "");
          const outputVariable = String(data.outputVariable || "ai_response");
          let aiContent = "";
          try {
            const ZAIModule = await import("z-ai-web-dev-sdk");
            const ZAI = ZAIModule.default;
            const zai = await ZAI.create();
            const completion = await zai.chat.completions.create({
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
              ],
              thinking: { type: "disabled" },
            });
            aiContent = completion.choices[0]?.message?.content || "";
          } catch (err) {
            aiContent = `[AI error: ${err instanceof Error ? err.message : "unknown"}]`;
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "error",
              message: `AI Agent call failed: ${err instanceof Error ? err.message : String(err)}`,
              durationMs: Date.now() - startedAt,
            });
          }
          ctx.variables[outputVariable] = aiContent;
          ctx.variables["last_ai_response"] = aiContent;
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `AI Agent responded (${aiContent.length} chars) → stored in {{${outputVariable}}}`,
            durationMs: Date.now() - startedAt,
          });
          nextHandle = "out";
          break;
        }

        case "api": {
          const url = resolveTemplate(String(data.url || ""), ctx.variables);
          const method = (String(data.method || "GET").toUpperCase()) as
            | "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
          let headers: Record<string, string> = {};
          if (data.headers) {
            try {
              headers = JSON.parse(String(data.headers));
            } catch {
              // ignore malformed headers
            }
          }
          const rawBody = data.body
            ? resolveTemplate(String(data.body), ctx.variables)
            : undefined;
          const outputVariable = String(data.outputVariable || "api_response");
          let responseSummary = "";
          let responseData: unknown = null;
          try {
            const res = await fetch(url, {
              method,
              headers,
              body: ["POST", "PUT", "PATCH"].includes(method) && rawBody ? rawBody : undefined,
            });
            const text = await res.text();
            try {
              responseData = JSON.parse(text);
            } catch {
              responseData = text;
            }
            responseSummary = `HTTP ${res.status} ${res.statusText}`;
            ctx.variables[outputVariable] = responseData;
            ctx.variables["last_api_status"] = res.status;
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: res.ok ? "success" : "error",
              message: `${method} ${url} → ${responseSummary}`,
              durationMs: Date.now() - startedAt,
            });
          } catch (err) {
            ctx.variables[outputVariable] = null;
            errorMsg = `API request failed: ${err instanceof Error ? err.message : String(err)}`;
            log(ctx, {
              nodeId: node.id,
              nodeType: node.type as NodeType,
              nodeLabel: label,
              status: "error",
              message: errorMsg,
              durationMs: Date.now() - startedAt,
            });
          }
          nextHandle = "out";
          break;
        }

        case "end": {
          const message = resolveTemplate(
            String(data.message || "Workflow ended."),
            ctx.variables
          );
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "success",
            message: `Workflow ended. ${message}`,
            durationMs: Date.now() - startedAt,
          });
          shouldStop = true;
          break;
        }

        default: {
          log(ctx, {
            nodeId: node.id,
            nodeType: node.type as NodeType,
            nodeLabel: label,
            status: "error",
            message: `Unknown node type: ${node.type}`,
          });
          shouldStop = true;
        }
      }
    } catch (err) {
      log(ctx, {
        nodeId: node.id,
        nodeType: node.type as NodeType,
        nodeLabel: label,
        status: "error",
        message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startedAt,
      });
      return {
        status: "failed",
        entries: ctx.log,
        variables: ctx.variables,
        whatsappMessages: ctx.whatsappMessages,
        finalNode: node.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (shouldStop) {
      return {
        status: "success",
        entries: ctx.log,
        variables: ctx.variables,
        whatsappMessages: ctx.whatsappMessages,
        finalNode: node.id,
      };
    }

    // Cycle protection: if we revisit the same node with the same handle too many times, stop.
    const visitKey = `${node.id}:${nextHandle}`;
    if (visited.has(visitKey)) {
      // Allow re-visits but rely on maxSteps to break true infinite loops.
    }
    visited.add(visitKey);

    current = findNextNode(node.id, edges, nodes, nextHandle);
    if (!current) {
      log(ctx, {
        nodeId: node.id,
        nodeType: node.type as NodeType,
        nodeLabel: label,
        status: "info",
        message: `No outgoing connection from handle "${nextHandle}". Workflow finished.`,
      });
      return {
        status: "success",
        entries: ctx.log,
        variables: ctx.variables,
        whatsappMessages: ctx.whatsappMessages,
        finalNode: node.id,
      };
    }
  }

  if (steps >= maxSteps) {
    log(ctx, {
      nodeId: "—",
      nodeType: "end",
      nodeLabel: "Engine",
      status: "error",
      message: `Execution stopped: reached max steps (${maxSteps}). Possible infinite loop.`,
    });
    return {
      status: "stopped",
      entries: ctx.log,
      variables: ctx.variables,
      whatsappMessages: ctx.whatsappMessages,
      error: "Max steps reached",
    };
  }

  return {
    status: "success",
    entries: ctx.log,
    variables: ctx.variables,
    whatsappMessages: ctx.whatsappMessages,
  };
}
