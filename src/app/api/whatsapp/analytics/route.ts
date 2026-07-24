import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";
import { resolveWhatsAppApiContext, whatsappApiError } from "@/lib/whatsapp/access";
import { getWhatsAppAnalytics } from "@/lib/whatsapp/management-api";

const querySchema = z.object({
  clientId: z.string().trim().min(1).max(100).optional(),
  kind: z.enum(["account", "conversation", "phone"]).default("account"),
  start: z.coerce.number().int().positive(),
  end: z.coerce.number().int().positive(),
  granularity: z.enum(["HALF_HOUR", "DAY", "MONTHLY"]).default("DAY"),
  phoneNumbers: z.string().max(500).optional(),
  countryCodes: z.string().max(200).optional(),
  conversationDirections: z.string().max(100).optional(),
  dimensions: z.string().max(200).optional(),
}).refine((value) => value.end > value.start, "end debe ser posterior a start.")
  .refine((value) => value.end - value.start <= 366 * 24 * 60 * 60, "El rango máximo es de 366 días.");

export async function GET(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!rateLimit(`whatsapp-analytics:${session.userId}:${getClientIP(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const context = await resolveWhatsAppApiContext({
      session,
      requestedClientId: parsed.data.clientId,
      requireWaba: parsed.data.kind !== "phone",
    });
    const split = (value?: string) => value?.split(",").map((item) => item.trim()).filter(Boolean);
    const phoneNumbers = split(parsed.data.phoneNumbers);
    const countryCodes = split(parsed.data.countryCodes);
    if (phoneNumbers?.some((item) => !/^\d{8,15}$/.test(item))) {
      return NextResponse.json({ error: "phoneNumbers solo admite números E.164 sin el signo +." }, { status: 400 });
    }
    if (countryCodes?.some((item) => !/^[A-Z]{2}$/.test(item))) {
      return NextResponse.json({ error: "countryCodes debe usar códigos ISO de dos letras en mayúsculas." }, { status: 400 });
    }
    const rawDirections = split(parsed.data.conversationDirections);
    const rawDimensions = split(parsed.data.dimensions);
    const conversationDirections = rawDirections?.filter(
      (item): item is "business_initiated" | "user_initiated" => ["business_initiated", "user_initiated"].includes(item)
    );
    const dimensions = rawDimensions?.filter(
      (item): item is "conversation_type" | "conversation_direction" | "country" | "phone" =>
        ["conversation_type", "conversation_direction", "country", "phone"].includes(item)
    );
    if (rawDirections && conversationDirections?.length !== rawDirections.length) {
      return NextResponse.json({ error: "conversationDirections contiene un valor no permitido." }, { status: 400 });
    }
    if (rawDimensions && dimensions?.length !== rawDimensions.length) {
      return NextResponse.json({ error: "dimensions contiene un valor no permitido." }, { status: 400 });
    }
    const analytics = await getWhatsAppAnalytics({
      config: context.config,
      kind: parsed.data.kind,
      start: parsed.data.start,
      end: parsed.data.end,
      granularity: parsed.data.granularity,
      phoneNumbers,
      countryCodes,
      conversationDirections,
      dimensions,
    });
    return NextResponse.json({ analytics });
  } catch (error) {
    const result = whatsappApiError(error, "No se pudo consultar la analítica de WhatsApp.");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export const dynamic = "force-dynamic";
