import "server-only";

import { executeWorkflow as executeLegacyWorkflow } from "./engine";
import {
  buildBusinessSystemInstructions,
  formatBusinessCatalog,
  formatBusinessGreeting,
  formatBusinessPayment,
  formatBusinessPromotions,
  sanitizeCustomerAnswer,
  type BusinessContext,
} from "@/lib/business-context-contract";
import { loadBusinessContext } from "@/lib/business-context-server";
import {
  detectSimulatorIntent,
  type SimulatorIntent,
} from "@/lib/simulator-intent";
import type {
  ExecutionResult,
  FlowEdge,
  FlowNode,
  LogEntry,
  PaymentOutcome,
  WhatsAppSimMessage,
} from "@/lib/workflow-types";

export type AiDeliveryMode = "simulation" | "assisted" | "automatic";

export interface GeminiEngineOptions {
  clientId?: string | null;
  workflowId?: string | null;
  forcePaymentOutcome?: PaymentOutcome;
  questionResponses?: Record<string, string>;
  maxSteps?: number;
  clientMessage?: string;
  aiMode?: AiDeliveryMode;
}

type ContextSource = "business" | "catalog" | "promotions" | "payment";

type GeminiCallResult = {
  text: string;
  model: string;
};

function nowIso() {
  return new Date().toISOString();
}

function entry(input: Omit<LogEntry, "timestamp">): LogEntry {
  return { ...input, timestamp: nowIso() };
}

function extractGeminiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const texts: string[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) texts.push(text.trim());
    }
  }

  return texts.join("\n").trim();
}

async function callGemini(input: {
  message: string;
  instructions: string;
}): Promise<GeminiCallResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Falta GEMINI_API_KEY en las variables de entorno de Vercel. No se usó una respuesta simulada."
    );
  }

  const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
  const modelsToTry = Array.from(
    new Set([configuredModel, "gemini-3.6-flash", "gemini-2.5-flash"])
  );

  let lastError = "Gemini no pudo generar una respuesta.";

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: input.instructions }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: input.message }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 700,
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.ok) {
        const payload = await response.json();
        const text = extractGeminiText(payload);
        if (!text) throw new Error("Gemini no devolvió texto utilizable.");
        return { text, model };
      }

      const detail = await response.text().catch(() => "");
      const safeDetail = detail.slice(0, 240);

      if (response.status === 401 || response.status === 403) {
        throw new Error("GEMINI_API_KEY inválida o sin permisos. Verifica la variable en Vercel.");
      }
      if (response.status === 429) {
        throw new Error(
          "Gemini rechazó la solicitud por límite de cuota. Revisa la cuota del proyecto en Google AI Studio."
        );
      }
      if (response.status === 404) {
        lastError = `El modelo ${model} no está disponible para esta clave.`;
        continue;
      }

      throw new Error(
        `Gemini respondió HTTP ${response.status}${safeDetail ? `: ${safeDetail}` : ""}`
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = `Gemini tardó demasiado en responder con el modelo ${model}.`;
        continue;
      }
      if (error instanceof Error) {
        if (
          error.message.includes("GEMINI_API_KEY") ||
          error.message.includes("límite de cuota") ||
          error.message.includes("HTTP")
        ) {
          throw error;
        }
        lastError = error.message;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError);
}

function directConversationResult(input: {
  message: string;
  answer: string;
  mode: AiDeliveryMode;
  intent: SimulatorIntent;
  model: string;
  provider: "gemini" | "business-rules";
  context: BusinessContext;
  dataSource: ContextSource;
}): ExecutionResult {
  const started = nowIso();
  const safeAnswer = sanitizeCustomerAnswer(input.answer, input.context.businessName);
  const responseText =
    input.mode === "assisted"
      ? `📝 Sugerencia pendiente de aprobación:\n\n${safeAnswer}`
      : safeAnswer;

  const messages: WhatsAppSimMessage[] = [
    {
      id: `sim-in-${Date.now()}`,
      direction: "inbound",
      phone: "+593000000000",
      text: input.message,
      timestamp: started,
      nodeId: "simulator-input",
    },
    {
      id: `sim-out-${Date.now() + 1}`,
      direction: "outbound",
      phone: "+593000000000",
      text: responseText,
      timestamp: nowIso(),
      nodeId: "simulator-response",
    },
  ];

  const entries: LogEntry[] = [
    entry({
      nodeId: "simulator-input",
      nodeType: "whatsapp",
      nodeLabel: "Mensaje del cliente",
      status: "success",
      message: `Intención detectada: ${input.intent}.`,
    }),
    entry({
      nodeId: "business-context",
      nodeType: "catalog_search",
      nodeLabel: "Contexto del negocio",
      status: "success",
      message: `Contexto cargado para ${input.context.businessName}: identidad, tipo, ${input.context.products.length} productos, promociones y ${input.context.rules.length} reglas.`,
    }),
  ];

  if (input.dataSource === "catalog") {
    entries.push(
      entry({
        nodeId: "catalog-context",
        nodeType: "catalog_search",
        nodeLabel: "Catálogo real",
        status: "success",
        message: `Se consultaron ${input.context.products.length} productos activos.`,
      })
    );
  } else if (input.dataSource === "promotions") {
    entries.push(
      entry({
        nodeId: "promotions-context",
        nodeType: "catalog_search",
        nodeLabel: "Promociones reales",
        status: "success",
        message: "Se consultaron las promociones vigentes del negocio.",
      })
    );
  } else if (input.dataSource === "payment") {
    entries.push(
      entry({
        nodeId: "payment-context",
        nodeType: "catalog_search",
        nodeLabel: "Reglas de pago",
        status: "success",
        message: "Se respondió con la configuración del negocio sin ejecutar cobros.",
      })
    );
  }

  entries.push(
    entry({
      nodeId: "simulator-response",
      nodeType: "ai_agent",
      nodeLabel: input.provider === "gemini" ? "Agente Gemini" : "Reglas del negocio",
      status: "success",
      message: `Proveedor: ${input.provider} · modelo: ${input.model} · modo: ${input.mode}.`,
    })
  );

  if (input.mode === "assisted") {
    entries.push(
      entry({
        nodeId: "approval-gate",
        nodeType: "end",
        nodeLabel: "Aprobación requerida",
        status: "info",
        message:
          "La respuesta quedó como sugerencia. No se envió por WhatsApp ni se ejecutó ningún cobro.",
      })
    );
  }

  return {
    status: "success",
    entries,
    variables: {
      user_response: input.message,
      ai_response: safeAnswer,
      ai_intent: input.intent,
      ai_provider: input.provider,
      ai_model: input.model,
      ai_mode: input.mode,
      business_context_loaded: true,
      business_name: input.context.businessName,
      business_type: input.context.businessType,
      business_rules_loaded: input.context.rules.length,
      catalog_items_consulted: input.context.products.length,
      promotions_consulted: input.dataSource === "promotions",
      payments_executed: false,
      whatsapp_sent: false,
      ai_requires_approval: input.mode === "assisted",
    },
    whatsappMessages: messages,
    finalNode: input.mode === "assisted" ? "approval-gate" : "simulator-response",
  };
}

export async function executeWorkflow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: GeminiEngineOptions = {}
): Promise<ExecutionResult> {
  const message = options.clientMessage?.trim();

  // The regular Run button preserves the complete node engine.
  if (!message) {
    return executeLegacyWorkflow(nodes, edges, options);
  }

  const mode: AiDeliveryMode = options.aiMode || "simulation";
  if (mode === "automatic" && process.env.AI_AUTOMATIC_MODE_ENABLED !== "true") {
    return {
      status: "failed",
      entries: [
        entry({
          nodeId: "automatic-mode",
          nodeType: "ai_agent",
          nodeLabel: "Modo automático",
          status: "error",
          message: "El modo automático está deshabilitado. Usa simulación o asistido.",
        }),
      ],
      variables: { ai_mode: mode, payments_executed: false, whatsapp_sent: false },
      whatsappMessages: [],
      finalNode: "automatic-mode",
      error: "El modo automático está deshabilitado por seguridad.",
    };
  }

  if (!options.clientId) {
    return {
      status: "failed",
      entries: [
        entry({
          nodeId: "business-context",
          nodeType: "catalog_search",
          nodeLabel: "Contexto del negocio",
          status: "error",
          message: "No se pudo asociar este flujo con un negocio.",
        }),
      ],
      variables: {
        ai_mode: mode,
        business_context_loaded: false,
        payments_executed: false,
        whatsapp_sent: false,
      },
      whatsappMessages: [],
      finalNode: "business-context",
      error: "El flujo no tiene un negocio asociado para cargar su contexto real.",
    };
  }

  const intent = detectSimulatorIntent(message);

  try {
    // Structural rule: every simulator message loads the full tenant context
    // before a deterministic response or a Gemini call is produced.
    const context = await loadBusinessContext({
      clientId: options.clientId,
      nodes,
    });

    if (intent === "greeting") {
      return directConversationResult({
        message,
        answer: formatBusinessGreeting(context),
        mode,
        intent,
        model: "business-greeting-v1",
        provider: "business-rules",
        context,
        dataSource: "business",
      });
    }

    if (intent === "catalog") {
      return directConversationResult({
        message,
        answer: formatBusinessCatalog(context),
        mode,
        intent,
        model: "business-catalog-v1",
        provider: "business-rules",
        context,
        dataSource: "catalog",
      });
    }

    if (intent === "promotion") {
      return directConversationResult({
        message,
        answer: formatBusinessPromotions(context),
        mode,
        intent,
        model: "business-promotions-v1",
        provider: "business-rules",
        context,
        dataSource: "promotions",
      });
    }

    if (intent === "payment") {
      return directConversationResult({
        message,
        answer: formatBusinessPayment(context),
        mode,
        intent,
        model: "business-payment-v1",
        provider: "business-rules",
        context,
        dataSource: "payment",
      });
    }

    const ai = await callGemini({
      message,
      instructions: buildBusinessSystemInstructions(context, intent, mode),
    });

    return directConversationResult({
      message,
      answer: ai.text,
      mode,
      intent,
      model: ai.model,
      provider: "gemini",
      context,
      dataSource: "business",
    });
  } catch (error) {
    const messageText =
      error instanceof Error
        ? error.message
        : "No se pudo generar la respuesta del simulador.";
    return {
      status: "failed",
      entries: [
        entry({
          nodeId: "business-context",
          nodeType: "ai_agent",
          nodeLabel: "Contexto del negocio",
          status: "error",
          message: messageText,
        }),
      ],
      variables: {
        ai_provider: "gemini",
        ai_mode: mode,
        ai_intent: intent,
        business_context_loaded: false,
        payments_executed: false,
        whatsapp_sent: false,
      },
      whatsappMessages: [],
      finalNode: "business-context",
      error: messageText,
    };
  }
}
