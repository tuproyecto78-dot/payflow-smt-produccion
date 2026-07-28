import {
  createExternalPaymentSandboxService,
  externalPaymentErrorResponse,
} from "@/lib/external-integrations/payments/runtime";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const token = new URL(request.url).searchParams.get("token") || "";
    const payment =
      await createExternalPaymentSandboxService().getCheckout(id, token);
    return Response.json({
      sandbox: true,
      real_charge: false,
      payment,
      instructions:
        payment.status === "pending"
          ? "Esta solicitud solo puede cambiar mediante un webhook sandbox firmado."
          : "La simulación ya tiene un estado final.",
    });
  } catch (error) {
    return externalPaymentErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
