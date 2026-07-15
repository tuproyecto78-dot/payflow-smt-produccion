import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import {
  recordWhatsAppAudit,
  resolveWhatsAppApiContext,
  whatsappApiError,
} from "@/lib/whatsapp/access";
import {
  createWhatsAppFlow,
  getWhatsAppFlow,
  listWhatsAppFlows,
  performWhatsAppFlowAction,
  updateWhatsAppFlow,
  uploadWhatsAppFlowJson,
} from "@/lib/whatsapp/management-api";

async function ensureOwnedFlow(config: Parameters<typeof listWhatsAppFlows>[0], flowId: string) {
  const flows = await listWhatsAppFlows(config);
  if (!flows.some((flow) => String(flow.id || "") === flowId)) throw new Error("FLOW_NOT_OWNED");
}

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const url = new URL(req.url);
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: url.searchParams.get("clientId"),
      requireWaba: true,
    });
    const flowId = url.searchParams.get("flowId")?.trim();
    if (!flowId) return NextResponse.json({ flows: await listWhatsAppFlows(context.config) });
    await ensureOwnedFlow(context.config, flowId);
    return NextResponse.json({ flow: await getWhatsAppFlow(context.config, flowId) });
  } catch (error) {
    if (error instanceof Error && error.message === "FLOW_NOT_OWNED") {
      return NextResponse.json({ error: "El Flow no pertenece a este negocio." }, { status: 404 });
    }
    const result = whatsappApiError(error, "No se pudieron consultar los Flows de WhatsApp.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

const common = { client_id: z.string().trim().min(1).max(100).optional() };
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    ...common,
    action: z.literal("create"),
    name: z.string().trim().min(1).max(200),
    categories: z.array(z.string().trim().min(1).max(64)).min(1).max(10),
    endpoint_uri: z.string().url().startsWith("https://").max(2048).optional(),
    clone_flow_id: z.string().trim().min(1).max(100).optional(),
  }),
  z.object({
    ...common,
    action: z.literal("upload_json"),
    flow_id: z.string().trim().min(1).max(100),
    flow_json: z.string().min(2).max(1_000_000),
  }),
  z.object({
    ...common,
    action: z.enum(["publish", "delete"]),
    flow_id: z.string().trim().min(1).max(100),
    confirm: z.literal(true),
  }),
]);

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-flow-write:${session.userId}:${getClientIP(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Operación de Flow inválida." }, { status: 400 });
  }
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
      permission: "manage",
      requireWaba: true,
    });
    let result: Record<string, unknown>;
    let entityId: string;
    if (parsed.data.action === "create") {
      result = await createWhatsAppFlow({
        config: context.config,
        name: parsed.data.name,
        categories: parsed.data.categories,
        endpointUri: parsed.data.endpoint_uri,
        cloneFlowId: parsed.data.clone_flow_id,
      });
      entityId = String(result.id || parsed.data.name);
    } else {
      entityId = parsed.data.flow_id;
      await ensureOwnedFlow(context.config, entityId);
      if (parsed.data.action === "upload_json") {
        try { JSON.parse(parsed.data.flow_json); } catch {
          return NextResponse.json({ error: "flow_json no contiene JSON válido." }, { status: 400 });
        }
        result = await uploadWhatsAppFlowJson({ config: context.config, flowId: entityId, json: parsed.data.flow_json });
      } else {
        result = await performWhatsAppFlowAction({ config: context.config, flowId: entityId, action: parsed.data.action });
      }
    }
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: `whatsapp_flow_${parsed.data.action}`,
      entityType: "whatsapp_flow",
      entityId,
    });
    return NextResponse.json({ ok: true, result }, { status: parsed.data.action === "create" ? 201 : 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "FLOW_NOT_OWNED") {
      return NextResponse.json({ error: "El Flow no pertenece a este negocio." }, { status: 404 });
    }
    const result = whatsappApiError(error, "No se pudo completar la operación sobre el Flow.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

const updateSchema = z.object({
  client_id: z.string().trim().min(1).max(100).optional(),
  flow_id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200).optional(),
  categories: z.array(z.string().trim().min(1).max(64)).min(1).max(10).optional(),
  endpoint_uri: z.union([z.string().url().startsWith("https://").max(2048), z.literal("")]).optional(),
}).refine((value) => value.name !== undefined || value.categories !== undefined || value.endpoint_uri !== undefined, "No hay cambios.");

export async function PATCH(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.client_id,
      permission: "manage",
      requireWaba: true,
    });
    await ensureOwnedFlow(context.config, parsed.data.flow_id);
    const { client_id: _clientId, flow_id: flowId, ...changes } = parsed.data;
    const result = await updateWhatsAppFlow(context.config, flowId, changes);
    await recordWhatsAppAudit({
      session,
      clientId: context.clientId,
      action: "whatsapp_flow_updated",
      entityType: "whatsapp_flow",
      entityId: flowId,
      metadata: { fields: Object.keys(changes) },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof Error && error.message === "FLOW_NOT_OWNED") {
      return NextResponse.json({ error: "El Flow no pertenece a este negocio." }, { status: 404 });
    }
    const result = whatsappApiError(error, "No se pudo actualizar el Flow.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export const dynamic = "force-dynamic";
