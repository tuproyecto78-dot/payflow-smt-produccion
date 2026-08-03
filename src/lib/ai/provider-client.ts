export type AIMessage = { role: "user" | "assistant"; content: string };
export type AIFailoverReason = "rate_limit" | "server_error" | "timeout" | "empty_response" | "invalid_json";

export interface AIProviderTransportConfig {
  provider: "groq" | "gemini";
  apiKey: string | null;
  endpoint: string;
  model: string;
}

export interface AIProviderChain {
  primary: AIProviderTransportConfig;
  fallback: AIProviderTransportConfig;
}

export interface AICompletionResult {
  content: string;
  provider: "groq" | "gemini";
  model: string;
  fallbackUsed: boolean;
  fallbackReason?: AIFailoverReason;
}

interface CompleteOptions {
  systemPrompt: string;
  messages: AIMessage[];
  temperature: number;
  maxOutputTokens: number;
  validateContent?: (content: string) => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class AIProviderError extends Error {
  readonly reason: AIFailoverReason | "credential_error" | "client_error" | "network_error" | "not_configured";
  readonly provider: string;

  constructor(reason: AIFailoverReason | "credential_error" | "client_error" | "network_error" | "not_configured", provider: string, message: string) {
    super(message);
    this.reason = reason;
    this.provider = provider;
  }
}

function geminiText(payload: unknown): string {
  const data = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (data.candidates || []).flatMap((candidate) => candidate.content?.parts || []).map((part) => String(part.text || "").trim()).filter(Boolean).join("\n").trim();
}

function reasonForStatus(status: number): AIProviderError["reason"] {
  if (status === 401 || status === 403) return "credential_error";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server_error";
  return "client_error";
}

async function callProvider(config: AIProviderTransportConfig, options: CompleteOptions): Promise<string> {
  if (!config.apiKey) throw new AIProviderError("not_configured", config.provider, `${config.provider} no está configurado.`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const isGemini = config.provider === "gemini";
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: isGemini ? { "Content-Type": "application/json", "x-goog-api-key": config.apiKey } : { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(isGemini ? {
        systemInstruction: { parts: [{ text: options.systemPrompt }] },
        contents: options.messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
        generationConfig: { temperature: options.temperature, maxOutputTokens: options.maxOutputTokens },
      } : {
        model: config.model,
        messages: [{ role: "system", content: options.systemPrompt }, ...options.messages],
        temperature: options.temperature,
        max_tokens: options.maxOutputTokens,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new AIProviderError(reasonForStatus(response.status), config.provider, `${config.provider} respondió HTTP ${response.status}.`);
    const payload = await response.json();
    const content = isGemini ? geminiText(payload) : String((payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content || "").trim();
    if (!content) throw new AIProviderError("empty_response", config.provider, `${config.provider} devolvió una respuesta vacía.`);
    try { options.validateContent?.(content); }
    catch { throw new AIProviderError("invalid_json", config.provider, `${config.provider} devolvió JSON inválido.`); }
    return content;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new AIProviderError("timeout", config.provider, `${config.provider} excedió el tiempo límite.`);
    throw new AIProviderError("network_error", config.provider, `${config.provider} no está disponible.`);
  } finally { clearTimeout(timeout); }
}

const FALLBACK_REASONS = new Set<AIFailoverReason>(["rate_limit", "server_error", "timeout", "empty_response", "invalid_json"]);

export async function completeWithGroqFallback(options: CompleteOptions, chain: AIProviderChain): Promise<AICompletionResult> {
  const { primary, fallback } = chain;
  try {
    const content = await callProvider(primary, options);
    return { content, provider: "groq", model: primary.model, fallbackUsed: false };
  } catch (error) {
    if (!(error instanceof AIProviderError) || !FALLBACK_REASONS.has(error.reason as AIFailoverReason) || !fallback.apiKey) throw error;
    console.warn("[ai] primary provider unavailable; using configured fallback", { provider: primary.provider, reason: error.reason, fallbackProvider: fallback.provider });
    const content = await callProvider(fallback, options);
    return { content, provider: "gemini", model: fallback.model, fallbackUsed: true, fallbackReason: error.reason as AIFailoverReason };
  }
}
