import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isAdmin } from "@/lib/roles";
import {
  getWhatsAppApiVersion,
  listWhatsAppTemplates,
  WhatsAppCloudError,
} from "@/lib/whatsapp/cloud-api";
import { resolveWhatsAppConnection } from "@/lib/whatsapp/repository";
import { createWhatsAppTemplate, deleteWhatsAppTemplate, updateWhatsAppTemplate } from "@/lib/whatsapp/management-api";
import { recordWhatsAppAudit, resolveWhatsAppApiContext, whatsappApiError } from "@/lib/whatsapp/access";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-templates:${session.userId}:${getClientIP(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  const requestedClientId = new URL(req.url).searchParams.get("clientId")?.trim() || null;
  if (session.clientId && requestedClientId && requestedClientId !== session.clientId) {
    return NextResponse.json({ error: "No puedes consultar plantillas de otro negocio." }, { status: 403 });
  }
  const clientId = session.clientId || (
    isAdmin(session)
      ? requestedClientId || process.env.WHATSAPP_CLIENT_ID?.trim() || null
      : null
  );
  if (!clientId) return NextResponse.json({ error: "Selecciona un negocio." }, { status: 409 });

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const connection = await resolveWhatsAppConnection(clientId).catch(() => null);
  if (!accessToken || !connection?.businessAccountId) {
    return NextResponse.json(
      { error: "El negocio no tiene configurado el WABA ID para consultar plantillas." },
      { status: 409 }
    );
  }

  try {
    const templates = await listWhatsAppTemplates({
      accessToken,
      apiVersion: getWhatsAppApiVersion(),
      businessAccountId: connection.businessAccountId,
    });
    return NextResponse.json({
      templates,
      approved: templates.filter((template) => template.status.toUpperCase() === "APPROVED"),
    });
  } catch (error) {
    const message = error instanceof WhatsAppCloudError
      ? error.message
      : "No se pudieron consultar las plantillas de WhatsApp.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

const createSchema = z.object({
  client_id: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().regex(/^[a-z0-9_]+$/).max(512),
  language: z.string().trim().min(2).max(20),
  category: z.enum(["AUTHENTICATION", "MARKETING", "UTILITY"]),
  components: z.array(z.record(z.string(), z.unknown())).min(1).max(10),
  allow_category_change: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-template-write:${session.userId}:${getClientIP(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || JSON.stringify(parsed.data?.components || []).length > 50_000) {
    return NextResponse.json({ error: parsed.success ? "La plantilla es demasiado grande." : parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
      permission: "manage",
      requireWaba: true,
    });
    const result = await createWhatsAppTemplate({
      config: context.config,
      name: parsed.data.name,
      language: parsed.data.language,
      category: parsed.data.category,
      components: parsed.data.components,
      allowCategoryChange: parsed.data.allow_category_change,
    });
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: "whatsapp_template_created",
      entityType: "whatsapp_template",
      entityId: parsed.data.name,
      metadata: { language: parsed.data.language, category: parsed.data.category },
    });
    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo crear la plantilla.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

const deleteSchema = z.object({
  client_id: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().regex(/^[a-z0-9_]+$/).max(512),
  template_id: z.string().trim().min(1).max(100).optional(),
  confirm: z.literal(true),
});

export async function DELETE(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "name y confirm=true son obligatorios." }, { status: 400 });
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
      permission: "manage",
      requireWaba: true,
    });
    if (parsed.data.template_id) {
      const templates = await listWhatsAppTemplates({
        accessToken: context.config.accessToken,
        apiVersion: context.config.apiVersion,
        businessAccountId: context.config.businessAccountId || "",
      });
      if (!templates.some((template) => template.id === parsed.data.template_id && template.name === parsed.data.name)) {
        return NextResponse.json({ error: "La plantilla no pertenece a este negocio." }, { status: 404 });
      }
    }
    const result = await deleteWhatsAppTemplate(context.config, parsed.data.name, parsed.data.template_id);
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: "whatsapp_template_deleted",
      entityType: "whatsapp_template",
      entityId: parsed.data.template_id || parsed.data.name,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo eliminar la plantilla.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

const updateSchema = z.object({
  client_id: z.string().trim().min(1).max(100).optional(),
  template_id: z.string().trim().min(1).max(100),
  category: z.enum(["AUTHENTICATION", "MARKETING", "UTILITY"]).optional(),
  components: z.array(z.record(z.string(), z.unknown())).min(1).max(10).optional(),
}).refine((value) => value.category !== undefined || value.components !== undefined, "No hay cambios.");

export async function PATCH(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || JSON.stringify(parsed.data?.components || []).length > 50_000) {
    return NextResponse.json({ error: parsed.success ? "La plantilla es demasiado grande." : parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
      permission: "manage",
      requireWaba: true,
    });
    const templates = await listWhatsAppTemplates({
      accessToken: context.config.accessToken,
      apiVersion: context.config.apiVersion,
      businessAccountId: context.config.businessAccountId || "",
    });
    if (!templates.some((template) => template.id === parsed.data.template_id)) {
      return NextResponse.json({ error: "La plantilla no pertenece a este negocio." }, { status: 404 });
    }
    const result = await updateWhatsAppTemplate({
      config: context.config,
      templateId: parsed.data.template_id,
      category: parsed.data.category,
      components: parsed.data.components,
    });
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: "whatsapp_template_updated",
      entityType: "whatsapp_template",
      entityId: parsed.data.template_id,
      metadata: { fields: [parsed.data.category ? "category" : null, parsed.data.components ? "components" : null].filter(Boolean) },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo actualizar la plantilla.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export const dynamic = "force-dynamic";
