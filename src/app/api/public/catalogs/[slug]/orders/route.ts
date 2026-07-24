import { NextResponse } from "next/server";
import { catalogApiError } from "@/lib/catalog-server";
import { firstValidationError, publicOrderSchema } from "@/lib/catalog-validation";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import { createServiceRoleClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-message";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  const ip = getClientIP(request);
  if (!rateLimit(`public-catalog-order:${ip}`, 8, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const parsed = publicOrderSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: firstValidationError(parsed.error) }, { status: 400 });
  const { slug } = await params;
  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase.rpc("create_catalog_order", {
      p_catalog_slug: slug,
      p_customer_name: parsed.data.customerName,
      p_customer_phone: parsed.data.customerPhone || null,
      p_customer_email: parsed.data.customerEmail || null,
      p_notes: parsed.data.notes || null,
      p_channel: "web",
      p_source_key: parsed.data.requestId,
      p_items: parsed.data.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
    });
    if (error) throw error;
    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.order_id) throw new Error("ORDER_NOT_CREATED");

    const { data: catalog } = await supabase
      .from("catalogs")
      .select("client_id, business_name, whatsapp_notifications_enabled, whatsapp_template_name, whatsapp_template_language")
      .eq("slug", slug)
      .single();

    const { data: currentOrder } = await supabase
      .from("catalog_orders")
      .select("whatsapp_notification_status")
      .eq("id", created.order_id)
      .maybeSingle();
    let notificationStatus = String(currentOrder?.whatsapp_notification_status || "disabled");
    if (!created.was_existing && catalog?.whatsapp_notifications_enabled && catalog.whatsapp_template_name && parsed.data.customerPhone) {
      try {
        const result = await sendWhatsAppMessage({
          clientId: String(catalog.client_id),
          phoneNumber: parsed.data.customerPhone,
          messageText: `Hola ${parsed.data.customerName}, recibimos tu pedido ${created.order_number} por ${Number(created.total).toFixed(2)} ${created.currency} en ${catalog.business_name}. Te avisaremos cuando cambie de estado.`,
          template: {
            name: String(catalog.whatsapp_template_name),
            languageCode: String(catalog.whatsapp_template_language || "es"),
            bodyParameters: [
              parsed.data.customerName,
              String(created.order_number),
              `${Number(created.total).toFixed(2)} ${created.currency}`,
              String(catalog.business_name),
            ],
          },
        });
        notificationStatus = result.status;
      } catch (notificationError) {
        notificationStatus = "failed";
        console.error("[public catalog order POST] WhatsApp notification failed", notificationError);
      }
      await supabase
        .from("catalog_orders")
        .update({ whatsapp_notification_status: notificationStatus })
        .eq("id", created.order_id)
        .eq("client_id", catalog.client_id);
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: created.order_id,
        orderNumber: created.order_number,
        total: Number(created.total),
        currency: created.currency,
        whatsappNotificationStatus: notificationStatus,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[public catalog order POST]", error);
    const apiError = catalogApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

export const dynamic = "force-dynamic";
