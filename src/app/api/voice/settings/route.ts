import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import {
  getVoiceDashboard,
  resolveVoiceClientId,
  saveVoiceSettings,
  voiceApiError,
} from "@/lib/voice/repository";
import { voiceSettingsSchema } from "@/lib/voice/validation";

export async function PATCH(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const clientId = resolveVoiceClientId(session, request);
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  const parsed = voiceSettingsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message || "Revisa la configuración.",
      issues: parsed.error.flatten(),
    }, { status: 400 });
  }
  try {
    await getVoiceDashboard({ session, clientId });
    const result = await saveVoiceSettings({ session, clientId, values: parsed.data });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[voice settings PATCH]", error);
    const apiError = voiceApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
