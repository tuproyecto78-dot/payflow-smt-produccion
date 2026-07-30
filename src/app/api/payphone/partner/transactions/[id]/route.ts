import { requireActiveSession } from "@/lib/auth/require-session";
import { assertPaymentClientAccess } from "@/lib/external-integrations/payments/access";
import {
  findPartnerTransaction,
  publicPartnerTransaction,
} from "@/lib/payphone/partner-transactions";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requireActiveSession();
  if (!session) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const clientId = assertPaymentClientAccess({
      session,
      requestedClientId: new URL(request.url).searchParams.get("client_id"),
      permission: "view",
    });
    const { id } = await context.params;
    const transaction = await findPartnerTransaction({ id, clientId });
    if (!transaction) {
      return Response.json(
        { error: "Pago no encontrado.", code: "PAYMENT_NOT_FOUND" },
        { status: 404 }
      );
    }
    return Response.json({
      ok: true,
      payment: publicPartnerTransaction(transaction),
    });
  } catch {
    return Response.json(
      { error: "No se pudo consultar el pago." },
      { status: 400 }
    );
  }
}
