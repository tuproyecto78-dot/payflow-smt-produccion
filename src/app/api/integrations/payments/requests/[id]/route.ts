import { requireActiveSession } from "@/lib/auth/require-session";
import {
  createExternalPaymentSandboxService,
  externalPaymentErrorResponse,
} from "@/lib/external-integrations/payments/runtime";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const session = await requireActiveSession();
  if (!session) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!session.clientId) {
    return Response.json(
      { error: "Selecciona un negocio para consultar el pago de prueba." },
      { status: 400 }
    );
  }

  try {
    const { id } = await params;
    const payment =
      await createExternalPaymentSandboxService().getForClient(
        id,
        session.clientId
      );
    return Response.json({
      sandbox: true,
      real_charge: false,
      payment,
    });
  } catch (error) {
    return externalPaymentErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
