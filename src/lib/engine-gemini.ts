import "server-only";

import { executeWorkflow as executeLegacyWorkflow } from "./engine";
import { createServiceRoleClient } from "@/lib/supabase";
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

type CatalogProduct = {
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number;
  trackInventory: boolean;
  category: string;
};

type BusinessContext = {
  businessName: string;
  products: CatalogProduct[];
  promotions: string;
};

type AiIntent = "greeting" | "catalog" | "promotion" | "buy" | "other";

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

function detectIntent(message: string): AiIntent {
  const text = message.toLowerCase().trim();
  if (!text) return "greeting";

  const promotionTerms = ["promoción", "promocion", "descuento", "oferta", "combo", "especial"];
  const buyTerms = [
    "quiero pedir",
    "quiero comprar",
    "quiero ordenar",
    "hacer pedido",
    "realizar pedido",
    "deseo pedir",
    "deseo comprar",
    "cómo pago",
    "como pago",
    "link de pago",
  ];
  const catalogTerms = [
    "menú",
    "menu",
    "carta",
    "plato",
    "platos",
    "producto",
    "productos",
    "precio",
    "precios",
    "qué tienen",
    "que tienen",
    "qué hay",
    "que hay",
    "disponible",
  ];
  const greetings = [
    "hola",
    "buenas",
    "buenos días",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "saludos",
  ];

  if (promotionTerms.some((term) => text.includes(term))) return "promotion";
  if (buyTerms.some((term) => text.includes(term))) return "buy";
  if (catalogTerms.some((term) => text.includes(term))) return "catalog";
  if (greetings.some((term) => text === term || text.startsWith(`${term} `))) return "greeting";
  return "other";
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function loadBusinessContext(clientId: string): Promise<BusinessContext> {
  const supabase = createServiceRoleClient();

  const [businessResult, productsResult, promotionsResult] = await Promise.all([
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
    supabase
      .from("audit_logs")
      .select("metadata")
      .eq("client_id", clientId)
      .eq("action", "catalog_promotions_updated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (businessResult.error) {
    throw new Error(`No se pudo consultar el negocio: ${businessResult.error.message}`);
  }
  if (productsResult.error) {
    throw new Error(`No se pudo consultar el catálogo: ${productsResult.error.message}`);
  }
  if (promotionsResult.error) {
    throw new Error(`No se pudieron consultar las promociones: ${promotionsResult.error.message}`);
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

  const promotionMetadata = safeMetadata(promotionsResult.data?.metadata);
  const promotions = typeof promotionMetadata.promotions === "string"
    ? promotionMetadata.promotions.trim()
    : "";

  return {
    businessName: String(businessResult.data?.business_name || "el negocio"),
    products,
    promotions,
  };
}

function formatCatalog(context: BusinessContext): string {
  if (context.products.length === 0) {
    return "No hay productos activos cargados en el catálogo.";
  }

  return context.products
    .map((product) => {
      const stock = product.trackInventory
        ? product.stock > 0
          ? `stock ${product.stock}`
          : "sin stock"
        : "stock no controlado";
      const detail = [product.category, product.description].filter(Boolean).join(" · ");
      return `- ${product.name}: ${product.price.toFixed(2)} ${product.currency} · ${stock}${detail ? ` · ${detail}` : ""}`;
    })
    .join("\n");
}

function buildInstructions(context: BusinessContext, intent: AiIntent, mode: AiDeliveryMode): string {
  const promotions = context.promotions || "No hay promociones vigentes registradas.";

  return [
    `Eres el asistente comercial de ${context.businessName}.`,
    "Responde en español claro, breve y amable.",
    "Usa únicamente los datos del catálogo y promociones incluidos abajo.",
    "Nunca inventes productos, precios, disponibilidad, promociones, horarios ni condiciones.",
    "Cuando falte un dato, dilo de forma explícita y ofrece derivar la consulta al negocio.",
    "No confirmes que un pago fue recibido, aprobado o acreditado. Solo un webhook oficial o una persona autorizada puede confirmarlo.",
    "Si el usuario solo consulta información, no inicies cobro, pedido ni aviso al negocio.",
    "Si manifiesta intención real de compra, recopila producto, cantidad y datos mínimos antes de mencionar el siguiente paso de pago.",
    `Intención preliminar detectada por el sistema: ${intent}.`,
    `Modo actual: ${mode}. En modo asistido tu respuesta es una sugerencia pendiente de aprobación y no debe considerarse enviada.`,
    "CATÁLOGO REAL DEL NEGOCIO:",
    formatCatalog(context),
    "PROMOCIONES VIGENTES:",
    promotions,
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
  intent: AiIntent;
  model: string;
  clientId: string;
  productCount: number;
}): ExecutionResult {
  const started = nowIso();
  const responseText = input.mode === "assisted"
    ? `📝 Sugerencia de Gemini pendiente de aprobación:\n\n${input.answer}`
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
      nodeId: "gemini-agent",
    },
  ];

  const entries: LogEntry[] = [
    entry({
      nodeId: "simulator-input",
      nodeType: "whatsapp",
      nodeLabel: "Mensaje del cliente",
      status: "success",
      message: `Mensaje recibido en modo ${input.mode}.`,
    }),
    entry({
      nodeId: "catalog-context",
      nodeType: "catalog_search",
      nodeLabel: "Catálogo real",
      status: "success",
      message: `Se consultaron ${input.productCount} productos activos para el cliente ${input.clientId}.`,
    }),
    entry({
      nodeId: "gemini-agent",
      nodeType: "ai_agent",
      nodeLabel: "Agente Gemini",
      status: "success",
      message: `Proveedor: Gemini · modelo: ${input.model} · intención: ${input.intent} · modo: ${input.mode}.`,
    }),
  ];

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
      ai_provider: "gemini",
      ai_model: input.model,
      ai_mode: input.mode,
      catalog_items_consulted: input.productCount,
      ai_requires_approval: input.mode === "assisted",
    },
    whatsappMessages: messages,
    finalNode: input.mode === "assisted" ? "approval-gate" : "gemini-agent",
  };
}

export async function executeWorkflow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: GeminiEngineOptions = {}
): Promise<ExecutionResult> {
  const message = options.clientMessage?.trim();

  // El botón Ejecutar conserva el motor completo de nodos.
  // Los mensajes del simulador usan Gemini y el catálogo real del cliente.
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

  if (!options.clientId) {
    return {
      status: "failed",
      entries: [entry({
        nodeId: "catalog-context",
        nodeType: "catalog_search",
        nodeLabel: "Catálogo real",
        status: "error",
        message: "No se pudo asociar este flujo con un cliente. Revisa el historial de creación del flujo.",
      })],
      variables: { ai_mode: mode },
      whatsappMessages: [],
      finalNode: "catalog-context",
      error: "El flujo no tiene un cliente asociado para consultar el catálogo.",
    };
  }

  try {
    const context = await loadBusinessContext(options.clientId);
    const intent = detectIntent(message);
    const instructions = buildInstructions(context, intent, mode);
    const ai = await callGemini({ message, instructions });

    return directConversationResult({
      message,
      answer: ai.text,
      mode,
      intent,
      model: ai.model,
      clientId: options.clientId,
      productCount: context.products.length,
    });
  } catch (error) {
    const messageText = error instanceof Error
      ? error.message
      : "No se pudo generar la respuesta con Gemini.";
    return {
      status: "failed",
      entries: [entry({
        nodeId: "gemini-agent",
        nodeType: "ai_agent",
        nodeLabel: "Agente Gemini",
        status: "error",
        message: messageText,
      })],
      variables: {
        ai_provider: "gemini",
        ai_mode: mode,
      },
      whatsappMessages: [],
      finalNode: "gemini-agent",
      error: messageText,
    };
  }
}
