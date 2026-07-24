import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import {
  getVoiceDashboard,
  requestVoiceActivation,
  resolveVoiceClientId,
  voiceApiError,
} from "@/lib/voice/repository";

export async function POST(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveVoiceClientId(session, request);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  try {
    await getVoiceDashboard({ session, clientId });
    const settings = await requestVoiceActivation({ session, clientId });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("[voice activation POST]", error);
    const apiError = voiceApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
