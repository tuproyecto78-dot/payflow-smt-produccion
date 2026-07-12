/**
 * PayFlow SMT — AI provider configuration (server-only).
 *
 * Reads env vars: AI_PROVIDER, GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL,
 * GEMINI_API_KEY, GEMINI_MODEL, NIM_API_KEY, NIM_BASE_URL, NIM_MODEL,
 * OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL,
 * ZAI_API_KEY, ZAI_BASE_URL, ZAI_MODEL.
 *
 * NEVER exposes API keys to the frontend.
 */

import "server-only";

export type AIProviderName = "groq" | "gemini" | "nim" | "openrouter" | "zai" | "auto" | "mock";

export interface AIProviderConfig {
  provider: AIProviderName;
  configured: boolean;
  hasApiKey: boolean;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  endpoint: string;
  mode: "groq" | "gemini" | "openai";
}

/**
 * Get the current AI provider config from env vars.
 */
export function getAIConfig(): AIProviderConfig {
  const provider = (process.env.AI_PROVIDER || "auto").toLowerCase().trim() as AIProviderName;

  // ─── Groq ──────────────────────────────────────────────────────────
  if (provider === "groq") {
    const apiKey = process.env.GROQ_API_KEY?.trim() || null;
    const baseUrl = process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1";
    const model = process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant";
    return { provider: "groq", configured: !!apiKey, hasApiKey: !!apiKey, apiKey, baseUrl, model, endpoint: `${baseUrl}/chat/completions`, mode: "groq" };
  }

  // ─── Gemini ────────────────────────────────────────────────────────
  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY?.trim() || null;
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    const baseUrl = "https://generativelanguage.googleapis.com/v1beta";
    return { provider: "gemini", configured: !!apiKey, hasApiKey: !!apiKey, apiKey, baseUrl, model, endpoint: `${baseUrl}/models/${model}:generateContent`, mode: "gemini" };
  }

  // ─── NVIDIA NIM ────────────────────────────────────────────────────
  if (provider === "nim") {
    const apiKey = process.env.NIM_API_KEY?.trim() || null;
    const baseUrl = process.env.NIM_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1";
    const model = process.env.NIM_MODEL?.trim() || "meta/llama-3.3-70b-instruct";
    return { provider: "nim", configured: !!apiKey, hasApiKey: !!apiKey, apiKey, baseUrl, model, endpoint: `${baseUrl}/chat/completions`, mode: "openai" };
  }

  // ─── OpenRouter ────────────────────────────────────────────────────
  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim() || null;
    const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
    let model = process.env.OPENROUTER_MODEL?.trim() || "meta-llama/llama-3.2-3b-instruct:free";
    if (model === "openrouter/free" || model === "free") model = "meta-llama/llama-3.2-3b-instruct:free";
    return { provider: "openrouter", configured: !!apiKey, hasApiKey: !!apiKey, apiKey, baseUrl, model, endpoint: `${baseUrl}/chat/completions`, mode: "openai" };
  }

  // ─── Z.ai ──────────────────────────────────────────────────────────
  if (provider === "zai") {
    const apiKey = process.env.ZAI_API_KEY?.trim() || null;
    const baseUrl = process.env.ZAI_BASE_URL?.trim() || "https://api.z.ai/api/coding/paas/v4";
    const model = process.env.ZAI_MODEL?.trim() || "glm-4-flash";
    return { provider: "zai", configured: !!apiKey, hasApiKey: !!apiKey, apiKey, baseUrl, model, endpoint: `${baseUrl}/chat/completions`, mode: "openai" };
  }

  // ─── Auto: Groq → Gemini → NIM → OpenRouter → Z.ai ────────────────
  if (provider === "auto" || provider === "mock") {
    const tryConfigs: Array<{ env: string; build: () => AIProviderConfig }> = [
      { env: "GROQ_API_KEY", build: () => { const k = process.env.GROQ_API_KEY!.trim(); const b = process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1"; const m = process.env.GROQ_MODEL?.trim() || "llama-3.1-8b-instant"; return { provider: "groq" as const, configured: true, hasApiKey: true, apiKey: k, baseUrl: b, model: m, endpoint: `${b}/chat/completions`, mode: "groq" as const }; } },
      { env: "GEMINI_API_KEY", build: () => { const k = process.env.GEMINI_API_KEY!.trim(); const m = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash"; const b = "https://generativelanguage.googleapis.com/v1beta"; return { provider: "gemini" as const, configured: true, hasApiKey: true, apiKey: k, baseUrl: b, model: m, endpoint: `${b}/models/${m}:generateContent`, mode: "gemini" as const }; } },
      { env: "NIM_API_KEY", build: () => { const k = process.env.NIM_API_KEY!.trim(); const b = process.env.NIM_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1"; const m = process.env.NIM_MODEL?.trim() || "meta/llama-3.3-70b-instruct"; return { provider: "nim" as const, configured: true, hasApiKey: true, apiKey: k, baseUrl: b, model: m, endpoint: `${b}/chat/completions`, mode: "openai" as const }; } },
      { env: "OPENROUTER_API_KEY", build: () => { const k = process.env.OPENROUTER_API_KEY!.trim(); const b = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1"; let m = process.env.OPENROUTER_MODEL?.trim() || "meta-llama/llama-3.2-3b-instruct:free"; if (m === "openrouter/free") m = "meta-llama/llama-3.2-3b-instruct:free"; return { provider: "openrouter" as const, configured: true, hasApiKey: true, apiKey: k, baseUrl: b, model: m, endpoint: `${b}/chat/completions`, mode: "openai" as const }; } },
      { env: "ZAI_API_KEY", build: () => { const k = process.env.ZAI_API_KEY!.trim(); const b = process.env.ZAI_BASE_URL?.trim() || "https://api.z.ai/api/coding/paas/v4"; const m = process.env.ZAI_MODEL?.trim() || "glm-4-flash"; return { provider: "zai" as const, configured: true, hasApiKey: true, apiKey: k, baseUrl: b, model: m, endpoint: `${b}/chat/completions`, mode: "openai" as const }; } },
    ];
    for (const t of tryConfigs) {
      if (process.env[t.env]?.trim()) {
        console.log(`[ai] Auto: using ${t.build().provider} (${t.env} found)`);
        return t.build();
      }
    }
  }

  return { provider: "mock", configured: false, hasApiKey: false, apiKey: null, baseUrl: "", model: "mock", endpoint: "", mode: "openai" };
}

export function getSafeAIStatus() {
  const cfg = getAIConfig();
  return { provider: cfg.provider, configured: cfg.configured, model: cfg.model, hasApiKey: cfg.hasApiKey, mode: cfg.mode, missing: cfg.hasApiKey ? [] : [`${cfg.provider.toUpperCase()}_API_KEY`] };
}

export function logAIConfig() {
  console.log("[ai] provider:", process.env.AI_PROVIDER || "auto");
  console.log("[ai] groq configured:", Boolean(process.env.GROQ_API_KEY));
  console.log("[ai] groq model:", process.env.GROQ_MODEL || "llama-3.1-8b-instant");
  console.log("[ai] gemini configured:", Boolean(process.env.GEMINI_API_KEY));
  console.log("[ai] nim configured:", Boolean(process.env.NIM_API_KEY));
}
