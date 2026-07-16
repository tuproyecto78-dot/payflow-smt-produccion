import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-session";
import { getVoiceDashboard, provisionVoiceModule, voiceApiError } from "@/lib/voice/repository";
import { voiceProvisioningSchema } from "@/lib/voice/validation";

export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const json = await request.json().catch(() => ({}));
  const clientId = typeof json.clientId === "string" ? json.clientId.trim() : "";
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 400 });
  const parsed = voiceProvisioningSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message || "Revisa el aprovisionamiento.",
      issues: parsed.error.flatten(),
    }, { status: 400 });
  }
  try {
    await getVoiceDashboard({ session, clientId });
    const settings = await provisionVoiceModule({ session, clientId, values: parsed.data });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("[admin voice activation PATCH]", error);
    const apiError = voiceApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
