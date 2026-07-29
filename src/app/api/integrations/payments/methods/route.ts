import { requireActiveSession } from "@/lib/auth/require-session";
import { assertPaymentClientAccess } from "@/lib/external-integrations/payments/access";
import { assertNoSensitivePaymentFields } from "@/lib/external-integrations/payments/domain";
import {
  createExternalPaymentService,
  externalPaymentErrorResponse,
} from "@/lib/external-integrations/payments/runtime";

export async function GET(request: Request) {
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
    const methods = await createExternalPaymentService().listMethods(clientId);
    return Response.json({
      orchestrator: true,
      real_charge: false,
      methods,
    });
  } catch (error) {
    return externalPaymentErrorResponse(error);
  }
}

export async function POST(request: Request) {
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
      permission: "manage",
    });
    const method = await createExternalPaymentService().registerMethod({
      clientId,
      createdBy: session.userId,
      kind: body?.kind,
      mode: body?.mode,
      displayName: body?.display_name,
      externalUrl: body?.external_url,
      providerAccountReference: body?.provider_account_reference,
    });
    return Response.json(
      {
        orchestrator: true,
        real_charge: false,
        method,
      },
      { status: 201 }
    );
  } catch (error) {
    return externalPaymentErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
