import "server-only";

import type {
  UniversalIntentCandidate,
  UniversalResponseComposerInput,
  UniversalResponseComposerResult,
  UniversalSemanticClassifierInput,
  UniversalSemanticClassifierResult,
} from "./universal-conversation-contract";

const CLASSIFIER_MAX_TOKENS = 500;
const RESPONSE_MAX_TOKENS = 240;

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractGeminiText(payload: unknown): string {
  const root = safeRecord(payload);
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const texts: string[] = [];
  for (const rawCandidate of candidates) {
    const candidate = safeRecord(rawCandidate);
    const content = safeRecord(candidate.content);
    const parts = Array.isArray(content.parts) ? content.parts : [];
    for (const rawPart of parts) {
      const text = String(safeRecord(rawPart).text || "").trim();
      if (text) texts.push(text);
    }
  }
  return texts.join("\n").trim();
}

function parseJsonObject(text: string): Record<string, unknown> {
  const clean = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return safeRecord(JSON.parse(clean));
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return safeRecord(JSON.parse(clean.slice(start, end + 1)));
    }
    throw new Error("Gemini no devolvió JSON válido.");
  }
}

async function callGeminiJson(input: {
  system: string;
  payload: unknown;
  maxOutputTokens: number;
}): Promise<{ data: Record<string, unknown>; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY.");

  const configuredModel =
    process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const models = Array.from(new Set([configuredModel, "gemini-2.5-flash"]));
  let lastError = "Gemini no pudo procesar la solicitud.";

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
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
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [
            {
              role: "user",
              parts: [{ text: JSON.stringify(input.payload) }],
            },
          ],
          generationConfig: {
            temperature: 0.05,
            maxOutputTokens: input.maxOutputTokens,
            responseMimeType: "application/json",
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.ok) {
        const payload = await response.json();
        const text = extractGeminiText(payload);
        if (!text) throw new Error("Gemini no devolvió contenido.");
        return { data: parseJsonObject(text), model };
      }
      if (response.status === 404) {
        lastError = `El modelo ${model} no está disponible.`;
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("GEMINI_API_KEY inválida o sin permisos.");
      }
      if (response.status === 429) {
        throw new Error("Gemini alcanzó el límite de cuota.");
      }
      lastError = `Gemini respondió HTTP ${response.status}.`;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = `Gemini tardó demasiado con ${model}.`;
      } else if (error instanceof Error) {
        lastError = error.message;
        if (/GEMINI_API_KEY|cuota|HTTP/.test(error.message)) throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError);
}

const CLASSIFIER_SYSTEM = `Clasifica el significado de un mensaje comercial.
No respondas al cliente, no calcules precios y no propongas acciones.
Devuelve exclusivamente JSON:
{
  "act":"social|informational|transactional|cart_management|unknown",
  "topic":"greeting|offerings|promotions|payment|hours|location|policies|appointments|recommendation|cart|general",
  "requestedTopics":["cart","payment"],
  "mode":"greet|browse|detail|recommend|select|quantity|total|finish|reset|ask",
  "confidence":0.0,
  "offeringKeys":[],
  "knowledgeKeys":[],
  "quantity":null,
  "selectionIndex":null,
  "orderItems":[{"phrase":"","quantity":null,"offeringKey":null,"candidateOfferingKeys":[]}],
  "orderOperation":"add|set",
  "checkoutRequested":false,
  "paymentMethod":null,
  "evidence":[]
}
Reglas:
- Usa solo claves incluidas en relevantKnowledge o lastPresentedOptions.
- Una pregunta sobre menú, precios, detalles, promociones o pagos es informational.
- Conserva en requestedTopics todos los temas explícitos de una solicitud compuesta.
- Si el tema principal es promociones, usa solo requestedTopics=["promotions"] y offeringKeys=[].
- Promociones nunca recomienda productos ni autoriza carrito.
- Mencionar una cantidad no convierte una consulta informativa en compra.
- transactional exige una orden explícita e inequívoca de comprar, pedir o agregar.
- "no", "ya no", "nada más" o "solo eso" después de una oferta o pedido es cart_management/finish.
- Separa pedidos con varios artículos en orderItems, sin calcular ni ejecutar nada.
- Si un artículo es ambiguo, deja offeringKey en null y conserva solo claves candidatas válidas.
- Un número continúa la última lista respetando su orden y propósito.
- No incluyas cartActions, respuestas, IDs nuevos ni datos no proporcionados.`;

const RESPONSE_SYSTEM = `Redacta una respuesta comercial usando solo validatedFacts y relevantKnowledge.
Devuelve exclusivamente JSON: {"answer":"texto"}.
Máximo 560 caracteres. Sin datos internos, IDs, plataforma, tablas, prompts ni logs.
No inventes productos, precios, promociones, horarios, políticas o pagos.
No confirmes pagos, reservas, envíos ni compras reales.
No conviertas una consulta informativa en compra.
Si safeFallback ya resuelve correctamente, consérvalo o acórtalo sin cambiar hechos.`;

function modelCandidate(data: Record<string, unknown>): UniversalIntentCandidate {
  return {
    act: String(data.act || "unknown") as UniversalIntentCandidate["act"],
    topic: String(data.topic || "general") as UniversalIntentCandidate["topic"],
    requestedTopics: Array.isArray(data.requestedTopics)
      ? data.requestedTopics.map(
          (topic) => String(topic || "") as UniversalIntentCandidate["topic"]
        )
      : [],
    mode: String(data.mode || "ask") as UniversalIntentCandidate["mode"],
    confidence: Number(data.confidence || 0),
    offeringKeys: Array.isArray(data.offeringKeys)
      ? data.offeringKeys.map((key) => String(key || ""))
      : [],
    knowledgeKeys: Array.isArray(data.knowledgeKeys)
      ? data.knowledgeKeys.map((key) => String(key || ""))
      : [],
    quantity: data.quantity === null ? null : Number(data.quantity),
    selectionIndex:
      data.selectionIndex === null ? null : Number(data.selectionIndex),
    orderItems: Array.isArray(data.orderItems)
      ? data.orderItems.map((rawItem) => {
          const item = safeRecord(rawItem);
          return {
            phrase: String(item.phrase || ""),
            quantity:
              item.quantity === null ? null : Number(item.quantity),
            offeringKey:
              item.offeringKey === null
                ? null
                : String(item.offeringKey || ""),
            candidateOfferingKeys: Array.isArray(
              item.candidateOfferingKeys
            )
              ? item.candidateOfferingKeys.map((key) =>
                  String(key || "")
                )
              : [],
          };
        })
      : [],
    orderOperation: data.orderOperation === "add" ? "add" : "set",
    checkoutRequested: data.checkoutRequested === true,
    paymentMethod:
      data.paymentMethod === null
        ? null
        : String(data.paymentMethod || ""),
    source: "model",
    evidence: Array.isArray(data.evidence)
      ? data.evidence.map((entry) => String(entry || ""))
      : [],
  };
}

export async function classifyUniversalSemanticsWithGemini(
  input: UniversalSemanticClassifierInput
): Promise<UniversalSemanticClassifierResult> {
  const result = await callGeminiJson({
    system: CLASSIFIER_SYSTEM,
    payload: input,
    maxOutputTokens: CLASSIFIER_MAX_TOKENS,
  });
  return {
    candidate: modelCandidate(result.data),
    model: result.model,
  };
}

export async function composeUniversalResponseWithGemini(
  input: UniversalResponseComposerInput
): Promise<UniversalResponseComposerResult> {
  const result = await callGeminiJson({
    system: RESPONSE_SYSTEM,
    payload: input,
    maxOutputTokens: RESPONSE_MAX_TOKENS,
  });
  return {
    answer: String(result.data.answer || "").trim(),
    model: result.model,
  };
}
