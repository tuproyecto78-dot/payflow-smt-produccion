import { requireActiveSession } from "@/lib/auth/require-session";
import {
  createExternalPaymentSandboxService,
  externalPaymentErrorResponse,
  externalPaymentPublicBaseUrl,
} from "@/lib/external-integrations/payments/runtime";

export async function POST(request: Request) {
  const session = await requireActiveSession();
  if (!session) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!session.clientId) {
    return Response.json(
      { error: "Selecciona un negocio antes de crear el pago de prueba." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const result = await createExternalPaymentSandboxService().create({
      clientId: session.clientId,
      createdBy: session.userId,
      amount: body?.amount,
      currency: body?.currency,
      description: body?.description,
      customerName: body?.customer_name,
      orderReference: body?.order_reference,
      idempotencyKey: body?.idempotency_key,
      publicBaseUrl: externalPaymentPublicBaseUrl(request),
    });
    return Response.json(
      {
        sandbox: true,
        real_charge: false,
        reused: result.reused,
        payment: result.payment,
        sandbox_test: {
          provider_reference: result.sandboxProviderReference,
          webhook_path: "/api/integrations/payments/webhooks/sandbox",
        },
      },
      { status: result.reused ? 200 : 201 }
    );
  } catch (error) {
    return externalPaymentErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
