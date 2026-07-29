import { requireActiveSession } from "@/lib/auth/require-session";
import { assertPaymentClientAccess } from "@/lib/external-integrations/payments/access";
import { assertNoSensitivePaymentFields } from "@/lib/external-integrations/payments/domain";
import {
  createExternalPaymentService,
  externalPaymentErrorResponse,
} from "@/lib/external-integrations/payments/runtime";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const session = await requireActiveSession();
  if (!session) {
    return Response.json(
      { error: "No autorizado.", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  try {
    const body = await request.json();
    assertNoSensitivePaymentFields(body);
    const clientId = assertPaymentClientAccess({
      session,
      requestedClientId: body?.client_id,
      permission: "confirm",
    });
    const { id } = await params;
    const result = await createExternalPaymentService().confirmManual({
      clientId,
      paymentRequestId: id,
      actorUserId: session.userId,
      actorRole: session.role,
      status: body?.status,
      idempotencyKey: body?.idempotency_key,
      note: body?.note,
    });
    return Response.json({
      orchestrator: true,
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
