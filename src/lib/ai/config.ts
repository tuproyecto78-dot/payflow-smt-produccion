/**
 * PayFlow SMT — AI provider configuration (server-only).
 *
 * Reads env vars: AI_PROVIDER, GEMINI_API_KEY, GEMINI_MODEL,
 * OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL,
 * ZAI_API_KEY, ZAI_BASE_URL, ZAI_MODEL.
 *
 * NEVER exposes API keys to the frontend.
 */

import "server-only";

export type AIProviderName = "gemini" | "openrouter" | "zai" | "auto" | "mock";

export interface AIProviderConfig {
  provider: AIProviderName;
  configured: boolean;
  hasApiKey: boolean;
  apiKey: string | null; // server-only, NEVER send to frontend
  baseUrl: string;
  model: string;
  endpoint: string;
  /** "gemini" for Gemini API format, "openai" for OpenAI-compatible format */
  mode: "gemini" | "openai";
}

/**
 * Get the current AI provider config from env vars.
 *
 * Priority order:
 * 1. AI_PROVIDER=gemini → use Gemini
 * 2. AI_PROVIDER=openrouter → use OpenRouter
 * 3. AI_PROVIDER=zai → use Z.ai
 * 4. AI_PROVIDER=auto (or unset) → try Gemini, then Z.ai, then OpenRouter
 * 5. AI_PROVIDER=mock → local fallback only
 */
export function getAIConfig(): AIProviderConfig {
  const provider = (process.env.AI_PROVIDER || "auto").toLowerCase().trim() as AIProviderName;

  // ─── Gemini ────────────────────────────────────────────────────────
  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY?.trim() || null;
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    const baseUrl = "https://generativelanguage.googleapis.com/v1beta";
    return {
      provider: "gemini",
      configured: !!apiKey,
      hasApiKey: !!apiKey,
      apiKey,
      baseUrl,
      model,
      endpoint: `${baseUrl}/models/${model}:generateContent`,
      mode: "gemini",
    };
  }

  // ─── OpenRouter ────────────────────────────────────────────────────
  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim() || null;
    const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
    let model = process.env.OPENROUTER_MODEL?.trim() || "";
    if (!model || model === "openrouter/free" || model === "free") {
      model = "meta-llama/llama-3.2-3b-instruct:free";
    }
    return {
      provider: "openrouter",
      configured: !!apiKey,
      hasApiKey: !!apiKey,
      apiKey,
      baseUrl,
      model,
      endpoint: `${baseUrl}/chat/completions`,
      mode: "openai",
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
      mode: "openai",
    };
  }

  // ─── Auto: try Gemini, then Z.ai, then OpenRouter ──────────────────
  if (provider === "auto" || provider === "mock") {
    // Try Gemini first
    const gemKey = process.env.GEMINI_API_KEY?.trim();
    if (gemKey) {
      const gemModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
      const gemBase = "https://generativelanguage.googleapis.com/v1beta";
      console.log("[ai] Auto: using Gemini (GEMINI_API_KEY found)");
      return {
        provider: "gemini",
        configured: true,
        hasApiKey: true,
        apiKey: gemKey,
        baseUrl: gemBase,
        model: gemModel,
        endpoint: `${gemBase}/models/${gemModel}:generateContent`,
        mode: "gemini",
      };
    }

    // Try Z.ai
    const zaiKey = process.env.ZAI_API_KEY?.trim();
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
        mode: "openai",
      };
    }

    // Try OpenRouter
    const orKey = process.env.OPENROUTER_API_KEY?.trim();
    if (orKey) {
      const orBase = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
      let orModel = process.env.OPENROUTER_MODEL?.trim() || "meta-llama/llama-3.2-3b-instruct:free";
      if (orModel === "openrouter/free" || orModel === "free") {
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
        mode: "openai",
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
    mode: "openai",
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
    mode: cfg.mode,
    missing: cfg.hasApiKey ? [] : [`${cfg.provider.toUpperCase()}_API_KEY`],
  };
}

/**
 * Log safe AI config info (no API keys).
 */
export function logAIConfig() {
  console.log("[ai] provider:", process.env.AI_PROVIDER || "auto");
  console.log("[ai] gemini configured:", Boolean(process.env.GEMINI_API_KEY));
  console.log("[ai] gemini model:", process.env.GEMINI_MODEL || "gemini-2.5-flash");
  console.log("[ai] openrouter configured:", Boolean(process.env.OPENROUTER_API_KEY));
  console.log("[ai] zai configured:", Boolean(process.env.ZAI_API_KEY));
}
