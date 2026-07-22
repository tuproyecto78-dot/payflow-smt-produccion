import { z } from "zod";

const booleanString = z.string().optional().transform((value) => value !== "false");

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  PUBLIC_BASE_URL: z.string().url(),
  PAYFLOW_BASE_URL: z.string().url(),
  VOICE_RUNTIME_WEBHOOK_SECRET: z.string().min(32),
  VOICE_SESSION_SECRET: z.string().min(32),

  TWILIO_AUTH_TOKEN: z.string().optional().default(""),
  TWILIO_VALIDATE_SIGNATURES: booleanString,
  TWILIO_RELAY_LANGUAGE: z.string().min(2).default("es-US"),
  TWILIO_RELAY_VOICE: z.string().optional().default(""),
  TWILIO_RELAY_TTS_PROVIDER: z.string().optional().default(""),

  TELNYX_API_KEY: z.string().optional().default(""),
  TELNYX_PUBLIC_KEY: z.string().optional().default(""),
  TELNYX_ASSISTANT_ID: z.string().optional().default(""),
  TELNYX_VALIDATE_SIGNATURES: booleanString,
  // Leave blank to use the voice configured in the Telnyx Assistant portal.
  TELNYX_VOICE: z.string().optional().default(""),

  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().min(1).default("gpt-4.1-mini"),
});

export type RuntimeConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Configuración inválida del runtime: ${missing}`);
  }
  const publicBaseUrl = parsed.data.PUBLIC_BASE_URL.replace(/\/$/, "");
  const payflowBaseUrl = parsed.data.PAYFLOW_BASE_URL.replace(/\/$/, "");
  return { ...parsed.data, PUBLIC_BASE_URL: publicBaseUrl, PAYFLOW_BASE_URL: payflowBaseUrl };
}
