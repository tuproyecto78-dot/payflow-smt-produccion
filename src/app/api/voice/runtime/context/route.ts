import { NextResponse } from "next/server";
import { verifySha256Signature } from "@/lib/webhook-signature";
import { getVoiceRuntimeContext, voiceApiError } from "@/lib/voice/repository";
import { voiceRuntimeContextSchema } from "@/lib/voice/validation";

export async function POST(request: Request) {
  const secret = process.env.VOICE_RUNTIME_WEBHOOK_SECRET || "";
  if (!secret) return NextResponse.json({ error: "Voice runtime no configurado." }, { status: 503 });
  const rawBody = await request.text();
  if (!verifySha256Signature(rawBody, request.headers.get("x-payflow-signature"), secret)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }
  let json: unknown;
  try { json = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const parsed = voiceRuntimeContextSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud de contexto inválida.", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json(await getVoiceRuntimeContext(parsed.data));
  } catch (error) {
    console.error("[voice runtime context]", error);
    const apiError = voiceApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
