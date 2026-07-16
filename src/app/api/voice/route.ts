import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getVoiceDashboard, resolveVoiceClientId, voiceApiError } from "@/lib/voice/repository";

export async function GET(request: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    const dashboard = await getVoiceDashboard({
      session,
      clientId: resolveVoiceClientId(session, request),
    });
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[voice GET]", error);
    const apiError = voiceApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
