/**
 * PayFlow SMT — AI provider configuration (server-only).
 *
 * Reads env vars: AI_PROVIDER, OPENROUTER_API_KEY, OPENROUTER_BASE_URL,
 * OPENROUTER_MODEL, ZAI_API_KEY, ZAI_BASE_URL, ZAI_MODEL.
 *
 * NEVER exposes API keys to the frontend.
 */

import "server-only";

export type AIProviderName = "openrouter" | "zai" | "mock";

export interface AIProviderConfig {
  provider: AIProviderName;
  configured: boolean;
  hasApiKey: boolean;
  apiKey: string | null; // server-only, NEVER send to frontend
  baseUrl: string;
  model: string;
  endpoint: string;
}

/**
 * Get the current AI provider config from env vars.
 */
export function getAIConfig(): AIProviderConfig {
  const provider = (process.env.AI_PROVIDER || "mock").toLowerCase().trim() as AIProviderName;

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim() || null;
    const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
    let model = process.env.OPENROUTER_MODEL?.trim() || "";
    // "openrouter/free" is NOT a valid model — replace with a valid free model
    if (!model || model === "openrouter/free" || model === "free") {
      model = "meta-llama/llama-3.2-3b-instruct:free";
      console.log("[ai] Model 'openrouter/free' is invalid, using default:", model);
    }
    return {
      provider: "openrouter",
      configured: !!apiKey,
      hasApiKey: !!apiKey,
      apiKey,
      baseUrl,
      model,
      endpoint: `${baseUrl}/chat/completions`,
    };
  }

  if (provider === "zai") {
    const apiKey = process.env.ZAI_API_KEY?.trim() || null;
    const baseUrl = process.env.ZAI_BASE_URL?.trim() || "https://api.z.ai/api/coding/paas/v4";
    const model = process.env.ZAI_MODEL?.trim() || "glm-5.1";
    return {
      provider: "zai",
      configured: !!apiKey,
      hasApiKey: !!apiKey,
      apiKey,
      baseUrl,
      model,
      endpoint: `${baseUrl}/chat/completions`,
    };
  }

  return {
    provider: "mock",
    configured: false,
    hasApiKey: false,
    apiKey: null,
    baseUrl: "",
    model: "mock",
    endpoint: "",
  };
}

/**
 * Safe status for frontend (no secrets).
 */
export function getSafeAIStatus() {
  const cfg = getAIConfig();
  return {
    provider: cfg.provider,
    configured: cfg.configured,
    model: cfg.model,
    hasApiKey: cfg.hasApiKey,
  };
}

/**
 * Log safe AI config info (no API keys).
 */
export function logAIConfig() {
  const cfg = getAIConfig();
  console.log("[ai] provider:", cfg.provider);
  console.log("[ai] configured:", cfg.configured);
  console.log("[ai] hasApiKey:", cfg.hasApiKey);
  console.log("[ai] model:", cfg.model);
  console.log("[ai] endpoint:", cfg.endpoint);
}
