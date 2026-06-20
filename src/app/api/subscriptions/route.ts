import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  isSupabaseConfigured,
  getSupabaseUser,
  createServerClientHelper,
} from "@/lib/supabase";
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

export async function POST(req: Request) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit(`subscription:${ip}`, 3, 60_000)) {
      return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
    }

    const body = await req.json();
    const { selected_plan, full_name, country_code, phone_number, email, document_id, business_name, business_type, country } = body;

    if (!full_name?.trim() || full_name.length < 3) return NextResponse.json({ error: "El nombre completo es obligatorio." }, { status: 400 });
    if (!isValidEmail(email)) return NextResponse.json({ error: "El correo electrónico no es válido." }, { status: 400 });
    if (!isValidPhone(phone_number)) return NextResponse.json({ error: "El número de celular no es válido." }, { status: 400 });
    if (!isValidCountryCode(country_code)) return NextResponse.json({ error: "El código de país no es válido." }, { status: 400 });
    if (!isValidDocument(document_id)) return NextResponse.json({ error: "La cédula o DNI no es válida." }, { status: 400 });
    if (!selected_plan || !["trimestral", "anual"].includes(selected_plan)) return NextResponse.json({ error: "Debe seleccionar un plan válido." }, { status: 400 });

    const row = {
      selectedPlan: selected_plan,
      fullName: sanitizeName(full_name),
      countryCode: sanitizeText(country_code),
      phoneNumber: sanitizeText(phone_number),
      email: sanitizeText(email).toLowerCase(),
      documentId: sanitizeText(document_id),
      businessName: sanitizeText(business_name) || null,
      businessType: sanitizeText(business_type) || null,
      country: sanitizeText(country) || null,
      subscriptionStatus: "pending_review" as const,
    };

    if (isSupabaseConfigured) {
      const supabase = await createServerClientHelper();
      const { data, error } = await supabase.from("subscription_requests").insert({
        selected_plan: row.selectedPlan, full_name: row.fullName, country_code: row.countryCode,
        phone_number: row.phoneNumber, email: row.email, document_id: row.documentId,
        business_name: row.businessName, business_type: row.businessType, country: row.country,
        subscription_status: row.subscriptionStatus,
      }).select().single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: (data as { id: string }).id });
    }

    const created = await db.subscriptionRequest.create({ data: row });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    console.error("[subscriptions POST] error", err);
    return NextResponse.json({ error: "Error al guardar la solicitud." }, { status: 500 });
  }
}

export async function GET() {
  if (isSupabaseConfigured) {
    const user = await getSupabaseUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = await createServerClientHelper();
    const { data, error } = await supabase.from("subscription_requests").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ requests: (data || []).map((r: Record<string, unknown>) => ({
      id: r.id, selectedPlan: r.selected_plan, fullName: r.full_name, countryCode: r.country_code,
      phoneNumber: r.phone_number, email: r.email, documentId: r.document_id,
      businessName: r.business_name, businessType: r.business_type, country: r.country,
      subscriptionStatus: r.subscription_status, createdAt: r.created_at,
    })) });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requests = await db.subscriptionRequest.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ requests: requests.map((r) => ({
    id: r.id, selectedPlan: r.selectedPlan, fullName: r.fullName, countryCode: r.countryCode,
    phoneNumber: r.phoneNumber, email: r.email, documentId: r.documentId,
    businessName: r.businessName, businessType: r.businessType, country: r.country,
    subscriptionStatus: r.subscriptionStatus, createdAt: r.createdAt,
  })) });
}

export const dynamic = "force-dynamic";
