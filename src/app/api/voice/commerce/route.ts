import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth/require-session";
import {
  getVoiceCommerceDashboard,
  saveVoicePaymentProfile,
  updateVoicePaymentReferenceStatus,
} from "@/lib/voice/commerce";
import {
  voicePaymentProfileSchema,
  voicePaymentReferenceStatusSchema,
} from "@/lib/voice/commerce-validation";
import { voiceApiError } from "@/lib/voice/repository";

export async function GET(request: Request) {
  try {
    const session = await requireActiveSession();
    const clientId = new URL(request.url).searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId es obligatorio." }, { status: 400 });
    }
    return NextResponse.json(
      await getVoiceCommerceDashboard({ session, clientId }),
    );
  } catch (error) {
    return voiceApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireActiveSession();
    const parsed = voicePaymentProfileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Configuración de cobro inválida.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clientId, ...profile } = parsed.data;
    return NextResponse.json(
      await saveVoicePaymentProfile({ session, clientId, profile }),
      { status: 201 },
    );
  } catch (error) {
    return voiceApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireActiveSession();
    const parsed = voicePaymentReferenceStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Actualización de pago inválida.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await updateVoicePaymentReferenceStatus({
        session,
        clientId: parsed.data.clientId,
        referenceId: parsed.data.referenceId,
        status: parsed.data.status,
      }),
    );
  } catch (error) {
    return voiceApiError(error);
  }
}
