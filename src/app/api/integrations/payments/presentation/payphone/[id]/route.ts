import { requireActiveSession } from "@/lib/auth/require-session";
import { assertPaymentClientAccess } from "@/lib/external-integrations/payments/access";
import {
  createExternalPaymentService,
  externalPaymentErrorResponse,
} from "@/lib/external-integrations/payments/runtime";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const session = await requireActiveSession();
  if (!session) {
    return Response.json(
      { error: "No autorizado.", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  try {
    const clientId = assertPaymentClientAccess({
      session,
      requestedClientId: new URL(request.url).searchParams.get("client_id"),
      permission: "view",
    });
    const { id } = await params;
    const payment =
      await createExternalPaymentService().getPayPhonePresentation(
        id,
        clientId
      );
    return Response.json({
      presentation: true,
      provider: "payphone",
      real_charge: false,
      message: "Demostración PayPhone: no se realizará ningún cobro.",
      payment,
    });
  } catch (error) {
    return externalPaymentErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
