import { requireAdmin } from "@/lib/auth/require-session";
import { logAudit } from "@/lib/audit";
import {
  findPayphoneMerchantAccountByClient,
  PayphoneMerchantError,
  publicMerchantAccount,
  upsertPayphoneMerchantAccount,
} from "@/lib/payphone/merchant-credentials";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof PayphoneMerchantError) {
    return Response.json(
      { ok: false, code: error.code, error: error.message },
      { status: error.httpStatus }
    );
  }
  return Response.json(
    {
      ok: false,
      code: "PAYPHONE_ONBOARDING_FAILED",
      error: "No se pudo completar el onboarding PayPhone.",
    },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const clientId = new URL(request.url).searchParams.get("client_id");
    const account = await findPayphoneMerchantAccountByClient(clientId);
    return Response.json({
      ok: true,
      account: account ? publicMerchantAccount(account) : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "No autorizado." }, { status: 403 });
  }
  const ip = getClientIP(request);
  if (!rateLimit(`payphone-partner-onboarding:${ip}`, 10, 60_000)) {
    return Response.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const account = await upsertPayphoneMerchantAccount({
      clientId: body?.client_id,
      ruc: body?.ruc,
      storeId: body?.store_id,
      thirdPartyToken: body?.third_party_token,
      environment: body?.environment,
      fallbackUrl: body?.fallback_url,
      externalNotificationEnabled: body?.external_notification_enabled,
      createdBy: session.userId,
    });
    void logAudit({
      userId: session.userId,
      clientId: account.clientId,
      action: "payphone_partner_account_upserted",
      entityType: "payphone_partner_account",
      entityId: account.id,
      ipAddress: ip,
      metadata: {
        ruc_last_four: account.ruc.slice(-4),
        store_id_last_four: account.storeId.slice(-4),
        environment: account.environment,
        external_notification_enabled:
          account.externalNotificationEnabled,
        fallback_configured: Boolean(account.fallbackUrl),
      },
    });
    return Response.json(
      { ok: true, account: publicMerchantAccount(account) },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
