import { NextResponse } from "next/server";
import { runPaymentAgent, type AIProvider } from "@/lib/ai-payment-agent";
import { rateLimit, getClientIP, sanitizeText, RATE_LIMIT_ERROR, GENERIC_ERROR } from "@/lib/security";

export async function POST(req: Request) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit(`ai_agent:${ip}`, 30, 60_000)) return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
    const body = await req.json();
    const sanitizedMessage = sanitizeText(body.message);
    const result = await runPaymentAgent({
      message: sanitizedMessage.slice(0, 1000), context: body.context || {},
      customer_phone: body.customer_phone, customer_document: body.customer_document,
      customer_name: body.customer_name, payment_confirmation: body.payment_confirmation,
      amount: typeof body.amount === "number" ? body.amount : 0, currency: body.currency || "USD",
      order_id: body.order_id || "", payment_reason: body.payment_reason || "",
      provider: body.provider as AIProvider | undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ai/payment-agent] error", err);
    return NextResponse.json({ reply: "⚠️ Ocurrió un error procesando el pago.", customer_phone: "", customer_document: "", customer_name: "", payment_confirmation: false, amount: 0, currency: "USD", order_id: "", payment_reason: "", next_action: "stop", error: GENERIC_ERROR }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
