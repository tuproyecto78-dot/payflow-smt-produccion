import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-flash",
];

/**
 * GET /api/ai/test-gemini
 *
 * Tests the Gemini API connection with a simple prompt.
 * Tries the configured model first, then falls back to other models.
 * Admin-only. NEVER returns the API key.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

  console.log("[ai] provider:", process.env.AI_PROVIDER);
  console.log("[ai] gemini configured:", Boolean(apiKey));
  console.log("[ai] model:", configuredModel);

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      provider: "gemini",
      model: configuredModel,
      errorType: "missing_api_key",
      safeMessage: "GEMINI_API_KEY no está configurada en Vercel.",
    });
  }

  // Try each model until one works
  const modelsToTry = [
    configuredModel,
    ...FALLBACK_MODELS.filter((m) => m !== configuredModel),
  ];

  for (const model of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      console.log("[ai] testing model:", model);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Responde solo: Gemini conectado" }],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 50 },
        }),
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        console.log("[ai] gemini success with model:", model, "response:", text.slice(0, 50));

        return NextResponse.json({
          success: true,
          provider: "gemini",
          model,
          configuredModel,
          modelChanged: model !== configuredModel,
          response: text.trim(),
        });
      }

      const errText = await res.text().catch(() => "");
      let errBody: { error?: { code?: number; message?: string; status?: string } } = {};
      try { errBody = JSON.parse(errText); } catch {}

      const code = errBody?.error?.code || res.status;
      const msg = errBody?.error?.message || errText.slice(0, 200) || `HTTP ${res.status}`;

      console.log("[ai] gemini error with model:", model, "code:", code, "msg:", msg.slice(0, 100));

      // If it's a 404 (model not found), try next model
      if (res.status === 404) {
        continue;
      }

      // For other errors, return immediately
      let errorType = "api_error";
      if (res.status === 401 || res.status === 403) errorType = "invalid_api_key";
      else if (res.status === 429) errorType = "quota_exceeded";

      return NextResponse.json({
        success: false,
        provider: "gemini",
        model,
        configuredModel,
        errorType,
        safeMessage: msg.slice(0, 300),
        httpStatus: res.status,
      });
    } catch (err) {
      console.warn("[ai] gemini network error with model:", model, err);
      // Try next model
      continue;
    }
  }

  // All models failed
  return NextResponse.json({
    success: false,
    provider: "gemini",
    model: configuredModel,
    errorType: "all_models_failed",
    safeMessage: `Ninguno de los modelos funcionó: ${modelsToTry.join(", ")}. Verifica que la API key tenga acceso a Gemini.`,
    modelsTried: modelsToTry,
  });
}
