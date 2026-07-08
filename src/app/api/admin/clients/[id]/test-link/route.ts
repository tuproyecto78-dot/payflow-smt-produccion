import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";
import { getPayphoneConfig, maskStoreId } from "@/lib/payphone/config";
import {
  createPayphoneApiLink,
  generateClientTransactionId,
} from "@/lib/payphone/api-link";

/**
 * POST /api/admin/clients/[id]/test-link
 *
 * Generates a TEST PayPhone API Link for $1.00 against the server-wide
 * PayPhone configuration. Saves a PaymentTransaction with status
 * "payment_pending" (or "error"). Updates the client's PaymentAccount
 * testLinkStatus.
 *
 * Admin-only. NEVER returns the token.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== ROLES.ADMIN && session.role !== ROLES.SUPER_ADMIN) {
    return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`admin-test-link:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  try {
    const { id } = await params;
    const client = await db.clientAccount.findUnique({
      where: { id },
      include: { paymentAccounts: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
    }

    const cfg = getPayphoneConfig();
    if (!cfg.configured) {
      return NextResponse.json(
        { error: "PayPhone no está configurado. Revisa PAYPHONE_TOKEN y PAYPHONE_STORE_ID en variables de servidor." },
        { status: 503 }
      );
    }

    const amount = 1.0; // $1.00 test
    const clientTransactionId = generateClientTransactionId();
    const reference = `TEST-${client.id.slice(-6)}-${Date.now().toString(36).slice(-4)}`;

    const result = await createPayphoneApiLink(
      {
        amount,
        currency: "USD",
        reference,
        oneTime: true,
        isAmountEditable: false,
        expireIn: 0,
        language: "es",
        storeId: cfg.storeId || undefined,
      },
      clientTransactionId
    );

    // Save the transaction
    const tx = await db.paymentTransaction.create({
      data: {
        userId: session.userId,
        clientId: client.id,
        provider: "payphone",
        providerMode: "link",
        integrationType: "API_LINK",
        credentialMode: "GLOBAL_ADMIN_ACCOUNT",
        clientTransactionId,
        storeId: cfg.storeId,
        orderId: clientTransactionId,
        amount,
        amountWithoutTax: amount,
        currency: "USD",
        reference,
        paymentLink: result.payment_link || null,
        status: result.ok ? "payment_pending" : "error",
        rawRequest: JSON.stringify({ amount: Math.round(amount * 100), clientTransactionId, storeId: cfg.storeId, reference, oneTime: true, isAmountEditable: false, expireIn: 0, language: "es" }),
        rawResponse: JSON.stringify(result.raw_response),
      },
    });

    // Update the PaymentAccount testLinkStatus
    let pa = client.paymentAccounts.find((p) => p.provider === "payphone") || null;
    if (!pa) {
      pa = await db.paymentAccount.create({
        data: {
          clientId: client.id,
          provider: "payphone",
          providerMode: "link",
          payphoneBusinessStatus: "not_configured",
          tokenConfigured: cfg.tokenConfigured,
          storeIdConfigured: cfg.storeIdConfigured,
          storeIdLastFour: cfg.storeIdLastFour,
          externalNotificationStatus: cfg.externalNotificationEnabled ? "active" : "not_active",
          testLinkStatus: result.ok ? "generated" : "error",
        },
      });
    } else {
      await db.paymentAccount.update({
        where: { id: pa.id },
        data: {
          testLinkStatus: result.ok ? "generated" : "error",
          tokenConfigured: cfg.tokenConfigured,
          storeIdConfigured: cfg.storeIdConfigured,
          storeIdLastFour: cfg.storeIdLastFour,
        },
      });
    }

    void logAudit({
      userId: session.userId,
      clientId: client.id,
      action: "payphone_link_created",
      entityType: "payment",
      entityId: tx.id,
      ipAddress: ip,
      metadata: {
        test: true,
        amount,
        client_transaction_id: clientTransactionId,
        store_id_masked: maskStoreId(cfg.storeId),
        ok: result.ok,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "No se pudo generar el link de prueba.",
          payment_transaction_id: tx.id,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      payment_link: result.payment_link,
      client_transaction_id: clientTransactionId,
      payment_transaction_id: tx.id,
      amount,
      currency: "USD",
      reference,
      store_id_masked: maskStoreId(cfg.storeId),
      message: "Link de prueba generado. El pago quedará como payment_pending hasta que PayPhone confirme.",
    });
  } catch (err) {
    console.error("[/api/admin/clients/[id]/test-link] error:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
