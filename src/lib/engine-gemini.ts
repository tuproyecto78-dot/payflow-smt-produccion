import "server-only";

import { executeWorkflow as executeLegacyWorkflow } from "./engine";
import { createServiceRoleClient } from "@/lib/supabase";
import {
  detectSimulatorIntent,
  formatSimulatorCatalog,
  formatSimulatorPromotions,
  getSimulatorDataNeeds,
  type SimulatorCatalogItem,
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

type CatalogProduct = SimulatorCatalogItem;

type BusinessContext = {
  businessName: string;
  products: CatalogProduct[];
  promotions: string;
};

type ContextSource = "none" | "catalog" | "promotions";

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

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function extractPromotions(value: unknown): string {
  const metadata = safeMetadata(value);
  if (typeof metadata.promotions === "string") {
    return metadata.promotions.trim();
  }
  if (Array.isArray(metadata.promotions)) {
    return metadata.promotions
      .map((promotion) => String(promotion || "").trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

async function loadCatalogContext(clientId: string): Promise<BusinessContext> {
  const supabase = createServiceRoleClient();
  const [businessResult, productsResult] = await Promise.all([
    supabase
      .from("client_accounts")
      .select("business_name")
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("catalog_products")
      .select("name, description, price, currency, stock, track_inventory, metadata")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(150),
  ]);

  if (businessResult.error) {
    throw new Error(`No se pudo consultar el negocio: ${businessResult.error.message}`);
  }
  if (productsResult.error) {
    throw new Error(`No se pudo consultar el catálogo: ${productsResult.error.message}`);
  }

  const products: CatalogProduct[] = (productsResult.data || []).map((row) => {
    const metadata = safeMetadata(row.metadata);
    return {
      name: String(row.name || "Producto"),
      description: String(row.description || ""),
      price: Number(row.price || 0),
      currency: String(row.currency || "USD"),
      stock: Number(row.stock || 0),
      trackInventory: row.track_inventory !== false,
      category: typeof metadata.category === "string" ? metadata.category : "",
    };
  });

  return {
    businessName: String(businessResult.data?.business_name || "el negocio"),
    products,
    promotions: "",
  };
}

async function loadPromotionContext(clientId: string): Promise<BusinessContext> {
  const supabase = createServiceRoleClient();
  const { data: business, error: businessError } = await supabase
    .from("client_accounts")
    .select("business_name")
    .eq("id", clientId)
    .maybeSingle();

  if (businessError) {
    throw new Error(`No se pudo consultar el negocio: ${businessError.message}`);
  }

  const [updatedResult, onboardingResult] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("metadata")
      .eq("action", "catalog_promotions_updated")
      .contains("metadata", { client_id: clientId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("audit_logs")
      .select("metadata")
      .eq("action", "onboarding_completed")
      .eq("entity_type", "client_account")
      .eq("entity_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (updatedResult.error) {
    throw new Error(
      `No se pudieron consultar las promociones: ${updatedResult.error.message}`
    );
  }
  if (onboardingResult.error) {
    throw new Error(
      `No se pudieron consultar las promociones iniciales: ${onboardingResult.error.message}`
    );
  }

  return {
    businessName: String(business?.business_name || "el negocio"),
    products: [],
    promotions:
      extractPromotions(updatedResult.data?.metadata) ||
      extractPromotions(onboardingResult.data?.metadata),
  };
}

function buildInstructions(
  intent: SimulatorIntent,
  mode: AiDeliveryMode
): string {
  return [
    "Eres un asistente comercial de PayFlow SMT.",
    "Responde en español claro, breve y amable.",
    "No inventes productos, precios, promociones, horarios ni disponibilidad.",
    "El catálogo y las promociones solo se consultan cuando la intención lo exige.",
    "No confirmes pedidos ni pagos y no actives WhatsApp.",
    "Si el usuario quiere comprar, solicita primero el producto y la cantidad.",
    `Intención preliminar detectada por el sistema: ${intent}.`,
    `Modo actual: ${mode}. En modo asistido la respuesta queda pendiente de aprobación.`,
  ].join("\n");
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
    throw new Error("Falta GEMINI_API_KEY en las variables de entorno de Vercel. No se usó una respuesta simulada.");
  }

  const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
  const modelsToTry = Array.from(new Set([
    configuredModel,
    "gemini-3.6-flash",
    "gemini-2.5-flash",
  ]));

  let lastError = "Gemini no pudo generar una respuesta.";

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
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
        if (!text) {
          throw new Error("Gemini no devolvió texto utilizable.");
        }
        return { text, model };
      }

      const detail = await response.text().catch(() => "");
      const safeDetail = detail.slice(0, 240);

      if (response.status === 401 || response.status === 403) {
        throw new Error("GEMINI_API_KEY inválida o sin permisos. Verifica la variable en Vercel.");
      }
      if (response.status === 429) {
        throw new Error("Gemini rechazó la solicitud por límite de cuota. Revisa la cuota del proyecto en Google AI Studio.");
      }
      if (response.status === 404) {
        lastError = `El modelo ${model} no está disponible para esta clave.`;
        continue;
      }

      throw new Error(`Gemini respondió HTTP ${response.status}${safeDetail ? `: ${safeDetail}` : ""}`);
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
  provider: "gemini" | "payflow-rules";
  clientId?: string | null;
  productCount?: number;
  dataSource: ContextSource;
}): ExecutionResult {
  const started = nowIso();
  const responseText = input.mode === "assisted"
    ? `📝 Sugerencia pendiente de aprobación:\n\n${input.answer}`
    : input.answer;

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
  ];

  if (input.dataSource === "catalog") {
    entries.push(entry({
      nodeId: "catalog-context",
      nodeType: "catalog_search",
      nodeLabel: "Catálogo real",
      status: "success",
      message: `Se consultaron ${input.productCount || 0} productos activos.`,
    }));
  } else if (input.dataSource === "promotions") {
    entries.push(entry({
      nodeId: "promotions-context",
      nodeType: "catalog_search",
      nodeLabel: "Promociones reales",
      status: "success",
      message: "Se consultaron únicamente las promociones del negocio.",
    }));
  }

  entries.push(entry({
    nodeId: "simulator-response",
    nodeType: "ai_agent",
    nodeLabel: input.provider === "gemini" ? "Agente Gemini" : "Reglas PayFlow",
    status: "success",
    message: `Proveedor: ${input.provider} · modelo: ${input.model} · modo: ${input.mode}.`,
  }));

  if (input.mode === "assisted") {
    entries.push(entry({
      nodeId: "approval-gate",
      nodeType: "end",
      nodeLabel: "Aprobación requerida",
      status: "info",
      message: "La respuesta quedó como sugerencia. No se envió por WhatsApp ni se ejecutó ningún cobro.",
    }));
  }

  return {
    status: "success",
    entries,
    variables: {
      user_response: input.message,
      ai_response: input.answer,
      ai_intent: input.intent,
      ai_provider: input.provider,
      ai_model: input.model,
      ai_mode: input.mode,
      catalog_items_consulted: input.productCount || 0,
      promotions_consulted: input.dataSource === "promotions",
      business_data_consulted: input.dataSource !== "none",
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
      entries: [entry({
        nodeId: "automatic-mode",
        nodeType: "ai_agent",
        nodeLabel: "Modo automático",
        status: "error",
        message: "El modo automático está deshabilitado. Usa simulación o asistido.",
      })],
      variables: { ai_mode: mode },
      whatsappMessages: [],
      finalNode: "automatic-mode",
      error: "El modo automático está deshabilitado por seguridad.",
    };
  }

  const intent = detectSimulatorIntent(message);
  const needs = getSimulatorDataNeeds(intent);

  // A plain greeting is intentionally deterministic and database-free.
  if (intent === "greeting") {
    return directConversationResult({
      message,
      answer: "¡Hola! ¿En qué puedo ayudarte?",
      mode,
      intent,
      model: "deterministic-v1",
      provider: "payflow-rules",
      dataSource: "none",
    });
  }

  if ((needs.catalog || needs.promotions) && !options.clientId) {
    return {
      status: "failed",
      entries: [entry({
        nodeId: "business-context",
        nodeType: "catalog_search",
        nodeLabel: "Datos reales del negocio",
        status: "error",
        message: "No se pudo asociar este flujo con un cliente.",
      })],
      variables: { ai_mode: mode, ai_intent: intent },
      whatsappMessages: [],
      finalNode: "business-context",
      error: "El flujo no tiene un cliente asociado para consultar datos reales.",
    };
  }

  try {
    if (needs.catalog && options.clientId) {
      const context = await loadCatalogContext(options.clientId);
      return directConversationResult({
        message,
        answer: formatSimulatorCatalog(context.products),
        mode,
        intent,
        model: "catalog-query-v1",
        provider: "payflow-rules",
        clientId: options.clientId,
        productCount: context.products.length,
        dataSource: "catalog",
      });
    }

    if (needs.promotions && options.clientId) {
      const context = await loadPromotionContext(options.clientId);
      return directConversationResult({
        message,
        answer: formatSimulatorPromotions(context.promotions),
        mode,
        intent,
        model: "promotions-query-v1",
        provider: "payflow-rules",
        clientId: options.clientId,
        dataSource: "promotions",
      });
    }

    // Other conversational intents use Gemini without loading catalog or promotions.
    const ai = await callGemini({
      message,
      instructions: buildInstructions(intent, mode),
    });
    return directConversationResult({
      message,
      answer: ai.text,
      mode,
      intent,
      model: ai.model,
      provider: "gemini",
      dataSource: "none",
    });
  } catch (error) {
    const messageText = error instanceof Error
      ? error.message
      : "No se pudo generar la respuesta del simulador.";
    return {
      status: "failed",
      entries: [entry({
        nodeId: "simulator-response",
        nodeType: "ai_agent",
        nodeLabel: "Simulador real",
        status: "error",
        message: messageText,
      })],
      variables: {
        ai_provider: "gemini",
        ai_mode: mode,
        ai_intent: intent,
      },
      whatsappMessages: [],
      finalNode: "simulator-response",
      error: messageText,
    };
  }
}
