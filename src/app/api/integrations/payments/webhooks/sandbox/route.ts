import {
  createExternalPaymentSandboxService,
  externalPaymentErrorResponse,
  externalPaymentWebhookSecret,
} from "@/lib/external-integrations/payments/runtime";
import { verifyExternalPaymentWebhookSignature } from "@/lib/external-integrations/payments/webhook-signature";

export async function POST(request: Request) {
  try {
    const secret = externalPaymentWebhookSecret();
    const rawBody = await request.text();
    const signature = request.headers.get("x-payflow-sandbox-signature");
    if (
      !verifyExternalPaymentWebhookSignature({
        rawBody,
        receivedSignature: signature,
        secret,
      })
    ) {
      return Response.json(
        {
          error: "Firma de webhook inválida.",
          code: "INVALID_WEBHOOK_SIGNATURE",
        },
        { status: 401 }
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return Response.json(
        { error: "El evento recibido no es válido.", code: "INVALID_WEBHOOK" },
        { status: 400 }
      );
    }

    const result =
      await createExternalPaymentSandboxService().applyWebhook(payload);
    return Response.json({
      ok: true,
      sandbox: true,
      real_charge: false,
      duplicate: result.duplicate,
      transition_applied: result.transitionApplied,
      payment: result.payment,
    });
  } catch (error) {
    return externalPaymentErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
