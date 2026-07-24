import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { createServiceRoleClient } from "@/lib/supabase";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import {
  recordWhatsAppAudit,
  resolveWhatsAppApiContext,
  whatsappApiError,
} from "@/lib/whatsapp/access";
import { deleteWhatsAppMedia, getWhatsAppMedia, uploadWhatsAppMedia } from "@/lib/whatsapp/management-api";

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"];
const ALLOWED_DOCUMENTS = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

function allowedMime(type: string) {
  return ALLOWED_MIME_PREFIXES.some((prefix) => type.startsWith(prefix)) || ALLOWED_DOCUMENTS.has(type);
}

async function ownedAsset(clientId: string, mediaId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("whatsapp_media_assets")
    .select("id, meta_media_id, status, file_name, mime_type, size_bytes")
    .eq("client_id", clientId)
    .eq("meta_media_id", mediaId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const url = new URL(req.url);
  const mediaId = url.searchParams.get("mediaId")?.trim() || "";
  if (!mediaId) return NextResponse.json({ error: "mediaId es obligatorio." }, { status: 400 });
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: url.searchParams.get("clientId"),
    });
    const asset = await ownedAsset(context.clientId, mediaId);
    if (!asset) return NextResponse.json({ error: "El archivo no pertenece a este negocio." }, { status: 404 });
    const provider = await getWhatsAppMedia(context.config, mediaId);
    return NextResponse.json({ asset, provider });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo consultar el archivo multimedia.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-media:${session.userId}:${getClientIP(req)}`, 15, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Adjunta un archivo en el campo file." }, { status: 400 });
  if (!file.size || file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "El archivo debe pesar entre 1 byte y 20 MB." }, { status: 413 });
  }
  if (!allowedMime(file.type)) return NextResponse.json({ error: "Tipo de archivo no permitido." }, { status: 415 });

  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: String(form?.get("client_id") || "") || null,
    });
    const uploaded = await uploadWhatsAppMedia({
      config: context.config,
      file,
      fileName: file.name.slice(0, 240) || "media",
      mimeType: file.type,
    });
    if (!uploaded.id) throw new Error("META_MEDIA_ID_MISSING");
    const supabase = createServiceRoleClient();
    const { data: asset, error } = await supabase.from("whatsapp_media_assets").insert({
      client_id: context.clientId,
      meta_media_id: uploaded.id,
      phone_number_id: context.connection.phoneNumberId,
      file_name: file.name.slice(0, 240) || "media",
      mime_type: file.type,
      size_bytes: file.size,
      created_by: session.userId,
    }).select("id, meta_media_id, file_name, mime_type, size_bytes, status, created_at").single();
    if (error) {
      await deleteWhatsAppMedia(context.config, uploaded.id).catch(() => null);
      throw error;
    }
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: "whatsapp_media_uploaded",
      entityType: "whatsapp_media",
      entityId: uploaded.id,
      metadata: { mime_type: file.type, size_bytes: file.size },
    });
    return NextResponse.json({ ok: true, asset }, { status: 201 });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo subir el archivo. Verifica la migración y la conexión con Meta.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

const deleteSchema = z.object({
  client_id: z.string().trim().min(1).max(100).optional(),
  media_id: z.string().trim().min(1).max(512),
  confirm: z.literal(true),
});

export async function DELETE(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "media_id y confirm=true son obligatorios." }, { status: 400 });
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
      permission: "manage",
    });
    const asset = await ownedAsset(context.clientId, parsed.data.media_id);
    if (!asset) return NextResponse.json({ error: "El archivo no pertenece a este negocio." }, { status: 404 });
    const provider = await deleteWhatsAppMedia(context.config, parsed.data.media_id);
    await createServiceRoleClient().from("whatsapp_media_assets")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", asset.id);
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: "whatsapp_media_deleted",
      entityType: "whatsapp_media",
      entityId: parsed.data.media_id,
    });
    return NextResponse.json({ ok: true, provider });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo eliminar el archivo.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export const dynamic = "force-dynamic";
