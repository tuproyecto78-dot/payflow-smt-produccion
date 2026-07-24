import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isSuperAdmin } from "@/lib/roles";
import { createServiceRoleClient } from "@/lib/supabase";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import { getWhatsAppApiVersion } from "@/lib/whatsapp/cloud-api";
import { recordWhatsAppAudit } from "@/lib/whatsapp/access";
import {
  createWhatsAppBusinessAccount,
  listWhatsAppBusinessAccounts,
  mutateWhatsAppBusinessAccount,
} from "@/lib/whatsapp/management-api";

function systemConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const businessPortfolioId = process.env.META_BUSINESS_PORTFOLIO_ID?.trim();
  if (!accessToken || !businessPortfolioId) return null;
  return { accessToken, apiVersion: getWhatsAppApiVersion(), businessPortfolioId };
}

async function portfolioContains(
  config: NonNullable<ReturnType<typeof systemConfig>>,
  businessAccountId: string
) {
  const [owned, shared] = await Promise.all([
    listWhatsAppBusinessAccounts({ ...config, relation: "owned" }),
    listWhatsAppBusinessAccounts({ ...config, relation: "shared" }),
  ]);
  return [...owned, ...shared].some((account) => String(account.id || "") === businessAccountId);
}

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Se requiere el rol super_admin." }, { status: 403 });
  const config = systemConfig();
  if (!config) return NextResponse.json({ error: "Configura WHATSAPP_ACCESS_TOKEN y META_BUSINESS_PORTFOLIO_ID." }, { status: 503 });
  try {
    const relation = new URL(req.url).searchParams.get("relation") === "shared" ? "shared" : "owned";
    return NextResponse.json({ accounts: await listWhatsAppBusinessAccounts({ ...config, relation }) });
  } catch {
    return NextResponse.json({ error: "No se pudieron consultar las cuentas comerciales." }, { status: 502 });
  }
}

const common = {
  client_id: z.string().trim().min(1).max(100),
  confirm: z.literal(true),
};
const schema = z.discriminatedUnion("action", [
  z.object({
    ...common,
    action: z.literal("create"),
    name: z.string().trim().min(1).max(200),
    currency: z.string().regex(/^[A-Z]{3}$/),
    timezone_id: z.string().trim().min(1).max(100),
  }),
  z.object({
    ...common,
    action: z.literal("update"),
    business_account_id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    timezone_id: z.string().trim().min(1).max(100).optional(),
  }).refine((value) => value.name !== undefined || value.currency !== undefined || value.timezone_id !== undefined, "No hay cambios."),
  z.object({
    ...common,
    action: z.literal("delete"),
    business_account_id: z.string().trim().min(1).max(100),
  }),
]);

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Se requiere el rol super_admin." }, { status: 403 });
  if (!rateLimit(`whatsapp-waba-write:${session.userId}:${getClientIP(req)}`, 3, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Operación inválida." }, { status: 400 });
  const config = systemConfig();
  if (!config) return NextResponse.json({ error: "Configura WHATSAPP_ACCESS_TOKEN y META_BUSINESS_PORTFOLIO_ID." }, { status: 503 });
  try {
    const { data: client } = await createServiceRoleClient()
      .from("client_accounts")
      .select("id")
      .eq("id", parsed.data.client_id)
      .maybeSingle();
    if (!client) return NextResponse.json({ error: "El negocio indicado no existe." }, { status: 404 });
    let result: Record<string, unknown>;
    let entityId: string;
    if (parsed.data.action === "create") {
      result = await createWhatsAppBusinessAccount({
        ...config,
        name: parsed.data.name,
        currency: parsed.data.currency,
        timezoneId: parsed.data.timezone_id,
      });
      entityId = String(result.id || parsed.data.name);
    } else {
      entityId = parsed.data.business_account_id;
      if (!await portfolioContains(config, entityId)) {
        return NextResponse.json({ error: "La cuenta no pertenece al portafolio configurado." }, { status: 403 });
      }
      const changes = parsed.data.action === "update"
        ? { name: parsed.data.name, currency: parsed.data.currency, timezone_id: parsed.data.timezone_id }
        : undefined;
      result = await mutateWhatsAppBusinessAccount({
        accessToken: config.accessToken,
        apiVersion: config.apiVersion,
        businessAccountId: entityId,
        action: parsed.data.action,
        changes: changes && Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)),
      });
    }
    await recordWhatsAppAudit({
      session,
      clientId: parsed.data.client_id,
      action: `whatsapp_business_account_${parsed.data.action}`,
      entityType: "whatsapp_business_account",
      entityId,
    });
    return NextResponse.json({ ok: true, result }, { status: parsed.data.action === "create" ? 201 : 200 });
  } catch {
    return NextResponse.json({ error: "Meta rechazó la operación sobre la cuenta comercial." }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
