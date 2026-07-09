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
 *
 * Priority order:
 * 1. AI_PROVIDER=openrouter → use OpenRouter
 * 2. AI_PROVIDER=zai → use Z.ai
 * 3. AI_PROVIDER=auto (or unset) → try Z.ai first, then OpenRouter, then mock
 * 4. AI_PROVIDER=mock → local fallback only
 */
export function getAIConfig(): AIProviderConfig {
  const provider = (process.env.AI_PROVIDER || "auto").toLowerCase().trim() as AIProviderName;

  // ─── OpenRouter ────────────────────────────────────────────────────
  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim() || null;
    const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
    let model = process.env.OPENROUTER_MODEL?.trim() || "";
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

  // ─── Z.ai ──────────────────────────────────────────────────────────
  if (provider === "zai") {
    const apiKey = process.env.ZAI_API_KEY?.trim() || null;
    const baseUrl = process.env.ZAI_BASE_URL?.trim() || "https://api.z.ai/api/coding/paas/v4";
    const model = process.env.ZAI_MODEL?.trim() || "glm-4-flash";
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

  // ─── Auto: try Z.ai first, then OpenRouter ─────────────────────────
  if (provider === "auto" || provider === "mock") {
    // Try Z.ai first
    const zaiKey = process.env.ZAI_API_KEY?.trim() || null;
    if (zaiKey) {
      const zaiBase = process.env.ZAI_BASE_URL?.trim() || "https://api.z.ai/api/coding/paas/v4";
      const zaiModel = process.env.ZAI_MODEL?.trim() || "glm-4-flash";
      console.log("[ai] Auto: using Z.ai (ZAI_API_KEY found)");
      return {
        provider: "zai",
        configured: true,
        hasApiKey: true,
        apiKey: zaiKey,
        baseUrl: zaiBase,
        model: zaiModel,
        endpoint: `${zaiBase}/chat/completions`,
      };
    }

    // Try OpenRouter
    const orKey = process.env.OPENROUTER_API_KEY?.trim() || null;
    if (orKey) {
      const orBase = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
      let orModel = process.env.OPENROUTER_MODEL?.trim() || "";
      if (!orModel || orModel === "openrouter/free" || orModel === "free") {
        orModel = "meta-llama/llama-3.2-3b-instruct:free";
      }
      console.log("[ai] Auto: using OpenRouter (OPENROUTER_API_KEY found)");
      return {
        provider: "openrouter",
        configured: true,
        hasApiKey: true,
        apiKey: orKey,
        baseUrl: orBase,
        model: orModel,
        endpoint: `${orBase}/chat/completions`,
      };
    }
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
