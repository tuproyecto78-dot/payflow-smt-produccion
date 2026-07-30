/**
 * POST /api/payments/sandbox-test
 *
 * Sandbox-only endpoint to validate the two per-business payment routes:
 *   1. manual_link   → returns the manual external link stored for the business.
 *   2. payphone_token → creates a REAL PayPhone API Link using the business's
 *                       own token + storeId (stored in PaymentAccount).
 *
 * This endpoint DOES NOT touch the Agente IA, cart, catalog, or WhatsApp.
 * It only validates that the payment motor works with per-business credentials.
 *
 * Response (sanitized — never returns the token):
 *   {
 *     ok: boolean,
 *     route: "manual_link" | "payphone_token" | "global",
 *     payment_link?: string,
 *     client_transaction_id?: string,
 *     store_id_last_four?: string,
 *     error?: string
 *   }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isInternalAccessRole } from "@/lib/auth/access-profile";
import {
  resolvePaymentCredentials,
  safeCredentialsStatus,
  type PaymentRoute,
} from "@/lib/payphone/business-credentials";
import {
  createPayphoneApiLink,
  generateClientTransactionId,
  type PayphoneLinkRequestInput,
} from "@/lib/payphone/api-link";
import { rateLimit, getClientIP, RATE_LIMIT_ERROR } from "@/lib/security";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIP(req);
  if (!rateLimit(`payments:sandbox-test:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  // Sandbox guard: only allow in non-production OR when explicitly enabled.
  if (process.env.NODE_ENV === "production" && process.env.PAYMENTS_SANDBOX_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Las pruebas de sandbox están desactivadas en producción." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Admins can test any client; clients can only test their own.
    const clientId = isInternalAccessRole(session.role)
      ? (body.clientId as string) || session.clientId || null
      : session.clientId || null;

    if (!clientId) {
      return NextResponse.json(
        { error: "Se requiere clientId para probar las credenciales por negocio." },
        { status: 400 }
      );
    }

    const amount = Number(body.amount) || 1.0;
    const reference = String(body.reference || `sandbox-test-${Date.now()}`).slice(0, 100);

    const creds = await resolvePaymentCredentials(clientId);

    // ─── Ruta 1: manual_link ──────────────────────────────────────
    if (creds.route === "manual_link") {
      if (!creds.ready) {
        return NextResponse.json({
          ok: false,
          route: "manual_link" as PaymentRoute,
          error: creds.notReadyReason || "El negocio no tiene link manual cargado.",
          credentials: safeCredentialsStatus(creds),
        }, { status: 400 });
      }
      // Save the test transaction (status=pending, the external link resolves it).
      const tx = await db.paymentTransaction.create({
        data: {
          userId: session.userId,
          clientId,
          provider: "manual_link",
          providerMode: "link",
          integrationType: "MANUAL_LINK",
          credentialMode: "PER_BUSINESS",
          orderId: `manual-${Date.now()}`,
          amount,
          currency: "USD",
          reference,
          paymentLink: creds.manualPaymentLink,
          status: "payment_pending",
          rawRequest: JSON.stringify({ route: "manual_link", amount, reference }),
          rawResponse: JSON.stringify({ manual_link: true, host: safeHost(creds.manualPaymentLink) }),
        },
      });
      void logAudit({
        userId: session.userId,
        clientId,
        action: "sandbox_test_manual_link",
        entityType: "payment",
        entityId: tx.id,
        ipAddress: ip,
        metadata: { route: "manual_link", amount },
      });
      return NextResponse.json({
        ok: true,
        route: "manual_link",
        payment_link: creds.manualPaymentLink,
        payment_transaction_id: tx.id,
        credentials: safeCredentialsStatus(creds),
      });
    }

    // ─── Ruta 2: payphone_token (per business) ────────────────────
    if (creds.route === "payphone_token") {
      if (!creds.ready || !creds.payphoneToken || !creds.payphoneStoreId) {
        return NextResponse.json({
          ok: false,
          route: "payphone_token" as PaymentRoute,
          error: creds.notReadyReason || "Faltan credenciales de PayPhone del negocio.",
          credentials: safeCredentialsStatus(creds),
        }, { status: 400 });
      }

      const clientTransactionId = generateClientTransactionId();
      const linkReq: PayphoneLinkRequestInput = {
        amount,
        currency: "USD",
        reference,
        storeId: creds.payphoneStoreId,
      };
      // Call PayPhone API Link with the business's own token.
      const result = await createPayphoneApiLinkWithToken(
        linkReq,
        clientTransactionId,
        creds.payphoneToken
      );

      const tx = await db.paymentTransaction.create({
        data: {
          userId: session.userId,
          clientId,
          provider: "payphone",
          providerMode: "link",
          integrationType: "API_LINK",
          credentialMode: "PER_BUSINESS",
          clientTransactionId,
          storeId: creds.payphoneStoreId,
          orderId: clientTransactionId,
          amount,
          amountWithoutTax: amount,
          currency: "USD",
          reference,
          paymentLink: result.payment_link || null,
          status: result.ok ? "payment_pending" : "error",
          rawRequest: JSON.stringify({ route: "payphone_token", amount, reference, clientTransactionId }),
          rawResponse: JSON.stringify(result.raw_response),
        },
      });

      void logAudit({
        userId: session.userId,
        clientId,
        action: "sandbox_test_payphone_token",
        entityType: "payment",
        entityId: tx.id,
        ipAddress: ip,
        metadata: {
          route: "payphone_token",
          amount,
          client_transaction_id: clientTransactionId,
          store_id_last_four: creds.storeIdLastFour,
          link_created: result.ok,
        },
      });

      if (!result.ok) {
        return NextResponse.json({
          ok: false,
          route: "payphone_token",
          error: result.error || "PayPhone rechazó la solicitud.",
          client_transaction_id: clientTransactionId,
          payment_transaction_id: tx.id,
          credentials: safeCredentialsStatus(creds),
        }, { status: 502 });
      }

      return NextResponse.json({
        ok: true,
        route: "payphone_token",
        payment_link: result.payment_link,
        client_transaction_id: clientTransactionId,
        payment_transaction_id: tx.id,
        store_id_last_four: creds.storeIdLastFour,
        credentials: safeCredentialsStatus(creds),
      });
    }

    // ─── Ruta 3: global (fallback) ────────────────────────────────
    if (!creds.ready) {
      return NextResponse.json({
        ok: false,
        route: "global" as PaymentRoute,
        error: "PayPhone global no está configurado. Configura PAYPHONE_TOKEN y PAYPHONE_STORE_ID en el env, o cambia la ruta del negocio a manual_link / payphone_token.",
        credentials: safeCredentialsStatus(creds),
      }, { status: 400 });
    }
    // Use the existing global createPayphoneApiLink (reads env internally).
    const { createPayphoneApiLink } = await import("@/lib/payphone/api-link");
    const clientTransactionId = generateClientTransactionId();
    const result = await createPayphoneApiLink(
      { amount, currency: "USD", reference },
      clientTransactionId
    );
    const tx = await db.paymentTransaction.create({
      data: {
        userId: session.userId,
        clientId,
        provider: "payphone",
        providerMode: "link",
        integrationType: "API_LINK",
        credentialMode: "GLOBAL_ADMIN_ACCOUNT",
        clientTransactionId,
        storeId: creds.globalConfig.storeId,
        orderId: clientTransactionId,
        amount,
        amountWithoutTax: amount,
        currency: "USD",
        reference,
        paymentLink: result.payment_link || null,
        status: result.ok ? "payment_pending" : "error",
        rawRequest: JSON.stringify({ route: "global", amount, reference, clientTransactionId }),
        rawResponse: JSON.stringify(result.raw_response),
      },
    });
    return NextResponse.json({
      ok: result.ok,
      route: "global",
      payment_link: result.payment_link,
      client_transaction_id: clientTransactionId,
      payment_transaction_id: tx.id,
      store_id_last_four: creds.storeIdLastFour,
      error: result.ok ? undefined : result.error,
      credentials: safeCredentialsStatus(creds),
    });
  } catch (err) {
    console.error("[payments/sandbox-test] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en sandbox test." },
      { status: 500 }
    );
  }
}

/**
 * Create a PayPhone API Link using a SPECIFIC token (per-business).
 * This is a variant of createPayphoneApiLink that accepts a token override
 * instead of reading from env. Server-only, never exposes the token.
 */
async function createPayphoneApiLinkWithToken(
  req: PayphoneLinkRequestInput,
  clientTransactionId: string,
  token: string
): Promise<{ ok: boolean; payment_link: string; raw_response: Record<string, unknown>; error?: string; http_status?: number }> {
  const storeId = (req.storeId || "").toString();
  if (!storeId) {
    return { ok: false, payment_link: "", raw_response: { error: "Store ID no configurado." }, error: "Store ID no configurado." };
  }
  const body: Record<string, unknown> = {
    amount: Math.round(req.amount * 100),
    amountWithoutTax: Math.round(req.amount * 100),
    amountWithTax: 0,
    tax: 0,
    service: 0,
    tip: 0,
    currency: "USD",
    clientTransactionId,
    storeId,
    reference: String(req.reference || "").slice(0, 100),
    oneTime: true,
    isAmountEditable: false,
    expireIn: 0,
    language: "es",
  };
  try {
    const res = await fetch("https://pay.payphonetodoesposible.com/api/Links", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const providerMsg =
        (data as { message?: string }).message ||
        (data as { Message?: string }).Message ||
        `PayPhone devolvió HTTP ${res.status}`;
      return { ok: false, payment_link: "", http_status: res.status, raw_response: { httpStatus: res.status, ...data }, error: providerMsg };
    }
    const link = String(
      (data as { paymentLink?: string }).paymentLink ||
      (data as { link?: string }).link ||
      (data as { paymentUrl?: string }).paymentUrl ||
      (data as { url?: string }).url ||
      (data as { payment_link?: string }).payment_link ||
      ""
    );
    return { ok: true, payment_link: link, http_status: res.status, raw_response: { httpStatus: res.status, ...data } };
  } catch (err) {
    return { ok: false, payment_link: "", raw_response: { error: err instanceof Error ? err.message : String(err) }, error: err instanceof Error ? err.message : String(err) };
  }
}

function safeHost(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).host; } catch { return null; }
}
