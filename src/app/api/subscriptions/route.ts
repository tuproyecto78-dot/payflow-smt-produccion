import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  isSupabaseConfigured,
  createServiceRoleClient,
} from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth/require-session";
import {
  rateLimit,
  getClientIP,
  sanitizeText,
  sanitizeName,
  isValidEmail,
  isValidPhone,
  isValidCountryCode,
  isValidDocument,
  RATE_LIMIT_ERROR,
} from "@/lib/security";
import { logAudit } from "@/lib/audit";

function normalizeSupabaseRequest(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    selectedPlan: String(row.selected_plan || ""),
    selectedPlanLabel: row.selected_plan_label ? String(row.selected_plan_label) : null,
    selectedPlanPrice: row.selected_plan_price == null ? null : Number(row.selected_plan_price),
    fullName: String(row.full_name || ""),
    countryCode: String(row.country_code || ""),
    phoneNumber: String(row.phone_number || ""),
    email: String(row.email || ""),
    documentId: String(row.document_id || ""),
    businessName: String(row.business_name || ""),
    businessType: row.business_type ? String(row.business_type) : null,
    country: row.country ? String(row.country) : null,
    city: row.city ? String(row.city) : null,
    paymentProvider: String(row.payment_provider || "payphone"),
    payphoneBusinessStatus: String(row.payphone_business_status || "not_configured"),
    payphonePreregistrationStatus: row.payphone_preregistration_status
      ? String(row.payphone_preregistration_status)
      : "not_requested",
    hasPayphoneBusiness: String(row.has_payphone_business || "no"),
    startPaymentsConfig: Boolean(row.start_payments_config),
    consentAccepted: Boolean(row.consent_accepted),
    subscriptionStatus: String(row.subscription_status || "pending_review"),
    activatedClientId: row.activated_client_id ? String(row.activated_client_id) : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || row.created_at || ""),
  };
}

export async function POST(req: Request) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit(`subscription:${ip}`, 3, 60_000)) {
      return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
    }

    const body = await req.json();
    const {
      selected_plan,
      full_name,
      country_code,
      phone_number,
      email,
      document_id,
      business_name,
      business_type,
      country,
      city,
      // PayPhone selection
      payment_provider = "payphone",
      has_payphone_business = "no",
      start_payments_config = false,
      // Optional PayPhone business data
      payphone_ruc,
      payphone_trade_name,
      payphone_admin_email,
      payphone_admin_phone,
      payphone_city,
      payphone_category,
      payphone_admin_first_name,
      payphone_admin_last_name,
      payphone_admin_document,
      // Consent
      consent_accepted = false,
    } = body;

    // Required-field validation
    if (!full_name?.trim() || full_name.length < 3) return NextResponse.json({ error: "El nombre completo es obligatorio." }, { status: 400 });
    if (!isValidEmail(email)) return NextResponse.json({ error: "El correo electrónico no es válido." }, { status: 400 });
    if (!isValidPhone(phone_number)) return NextResponse.json({ error: "El número de celular no es válido." }, { status: 400 });
    if (!isValidCountryCode(country_code)) return NextResponse.json({ error: "El código de país no es válido." }, { status: 400 });
    if (!isValidDocument(document_id)) return NextResponse.json({ error: "La cédula o DNI no es válida." }, { status: 400 });
    if (!business_name?.trim()) return NextResponse.json({ error: "El nombre del negocio es obligatorio." }, { status: 400 });
    if (!selected_plan || !["trimestral", "anual"].includes(selected_plan)) return NextResponse.json({ error: "Debe seleccionar un plan válido." }, { status: 400 });
    if (!consent_accepted) return NextResponse.json({ error: "Debes autorizar el inicio de la configuración de pagos por WhatsApp con PayPhone Business." }, { status: 400 });

    // Resolve PayPhone business status from "has_payphone_business"
    const hasPP = String(has_payphone_business || "no").toLowerCase();
    const payphoneBusinessStatus =
      hasPP === "yes" ? "configured" :
      hasPP === "in_process" ? "in_process" :
      "not_configured";

    const row = {
      selectedPlan: selected_plan,
      selectedPlanLabel: body.selected_plan_label || (selected_plan === "anual" ? "Plan Anual" : "Plan Trimestral"),
      selectedPlanPrice: body.selected_plan_price || (selected_plan === "anual" ? 89 : 25),
      fullName: sanitizeName(full_name),
      countryCode: sanitizeText(country_code),
      phoneNumber: sanitizeText(phone_number),
      email: sanitizeText(email).toLowerCase(),
      documentId: sanitizeText(document_id),
      businessName: sanitizeText(business_name),
      businessType: sanitizeText(business_type) || null,
      country: sanitizeText(country) || null,
      city: sanitizeText(city) || null,
      paymentProvider: sanitizeText(payment_provider) || "payphone",
      payphoneBusinessStatus,
      payphonePreregistrationStatus: "not_requested",
      hasPayphoneBusiness: hasPP,
      startPaymentsConfig: Boolean(start_payments_config),
      payphoneRuc: sanitizeText(payphone_ruc) || null,
      payphoneTradeName: sanitizeText(payphone_trade_name) || null,
      payphoneAdminEmail: sanitizeText(payphone_admin_email) || null,
      payphoneAdminPhone: sanitizeText(payphone_admin_phone) || null,
      payphoneCity: sanitizeText(payphone_city) || null,
      payphoneCategory: sanitizeText(payphone_category) || null,
      payphoneAdminFirstName: sanitizeText(payphone_admin_first_name) || null,
      payphoneAdminLastName: sanitizeText(payphone_admin_last_name) || null,
      payphoneAdminDocument: sanitizeText(payphone_admin_document) || null,
      consentAccepted: Boolean(consent_accepted),
      consentAcceptedAt: Boolean(consent_accepted) ? new Date() : null,
      subscriptionStatus: "pending_review" as const,
    };

    // Supabase path (kept for backward compatibility if configured).
    if (isSupabaseConfigured) {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.from("subscription_requests").insert({
        selected_plan: row.selectedPlan,
        selected_plan_label: row.selectedPlanLabel,
        selected_plan_price: row.selectedPlanPrice,
        full_name: row.fullName,
        country_code: row.countryCode,
        phone_number: row.phoneNumber,
        email: row.email,
        document_id: row.documentId,
        business_name: row.businessName,
        business_type: row.businessType,
        country: row.country,
        city: row.city,
        payment_provider: row.paymentProvider,
        payphone_business_status: row.payphoneBusinessStatus,
        has_payphone_business: row.hasPayphoneBusiness,
        start_payments_config: row.startPaymentsConfig,
        consent_accepted: row.consentAccepted,
        consent_accepted_at: row.consentAcceptedAt?.toISOString() || null,
        subscription_status: row.subscriptionStatus,
      }).select().single();
      if (error) throw error;
      const newId = (data as { id: string }).id;
      void logAudit({
        action: "subscription_request_created",
        entityType: "subscription_request",
        entityId: newId,
        ipAddress: ip,
        metadata: {
          plan: row.selectedPlan,
          email: row.email,
          business_name: row.businessName,
          payment_provider: row.paymentProvider,
          payphone_business_status: row.payphoneBusinessStatus,
        },
      });
      return NextResponse.json({ ok: true, id: newId });
    }

    const created = await db.subscriptionRequest.create({ data: row });

    void logAudit({
      action: "subscription_request_created",
      entityType: "subscription_request",
      entityId: created.id,
      ipAddress: ip,
      metadata: {
        plan: row.selectedPlan,
        email: row.email,
        business_name: row.businessName,
        payment_provider: row.paymentProvider,
        payphone_business_status: row.payphoneBusinessStatus,
      },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    console.error("[subscriptions POST] error", err);
    return NextResponse.json({ error: "Error al guardar la solicitud." }, { status: 500 });
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Se requiere rol de administrador." }, { status: 403 });

  // If Supabase is configured, query subscription_requests from Supabase.
  if (isSupabaseConfigured) {
    try {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.from("subscription_requests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ requests: (data || []).map((row) => normalizeSupabaseRequest(row)) });
    } catch (err) {
      console.error("[subscriptions GET] Supabase query failed, falling back to Prisma:", err);
      // Fall through to Prisma
    }
  }

  // Prisma fallback (local dev / ephemeral Vercel DB).
  try {
    const requests = await db.subscriptionRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return NextResponse.json({
      requests: requests.map((r) => ({
        id: r.id,
        selectedPlan: r.selectedPlan,
        selectedPlanLabel: r.selectedPlanLabel,
        selectedPlanPrice: r.selectedPlanPrice,
        fullName: r.fullName,
        countryCode: r.countryCode,
        phoneNumber: r.phoneNumber,
        email: r.email,
        documentId: r.documentId,
        businessName: r.businessName,
        businessType: r.businessType,
        country: r.country,
        city: r.city,
        paymentProvider: r.paymentProvider,
        payphoneBusinessStatus: r.payphoneBusinessStatus,
        payphonePreregistrationStatus: r.payphonePreregistrationStatus,
        hasPayphoneBusiness: r.hasPayphoneBusiness,
        startPaymentsConfig: r.startPaymentsConfig,
        consentAccepted: r.consentAccepted,
        subscriptionStatus: r.subscriptionStatus,
        activatedClientId: r.activatedClientId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    console.error("[subscriptions GET] Prisma query failed:", err);
    return NextResponse.json({ requests: [] });
  }
}

export const dynamic = "force-dynamic";
