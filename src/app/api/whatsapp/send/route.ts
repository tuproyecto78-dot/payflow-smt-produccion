import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth/require-session";
import { isAdmin } from "@/lib/roles";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-message";
import type { WhatsAppOutboundAction } from "@/lib/whatsapp/cloud-api";
import { getClientIP, rateLimit, RATE_LIMIT_ERROR } from "@/lib/security";

const common = {
  client_id: z.string().trim().min(1).max(100).optional(),
  phone_number: z.string().trim().min(8).max(32),
  conversation_id: z.string().trim().max(100).optional(),
  contact_id: z.string().trim().max(100).optional(),
  context_message_id: z.string().trim().min(1).max(512).optional(),
};

const contactSchema = z.object({
  name: z.object({
    formatted_name: z.string().trim().min(1).max(512),
    first_name: z.string().max(256).optional(),
    last_name: z.string().max(256).optional(),
    middle_name: z.string().max(256).optional(),
    suffix: z.string().max(64).optional(),
    prefix: z.string().max(64).optional(),
  }),
  phones: z.array(z.object({
    phone: z.string().trim().min(1).max(32),
    type: z.string().max(32).optional(),
    wa_id: z.string().max(32).optional(),
  })).max(20).optional(),
  emails: z.array(z.object({
    email: z.string().email().max(320),
    type: z.string().max(32).optional(),
  })).max(20).optional(),
  organization: z.object({
    company: z.string().max(256).optional(),
    department: z.string().max(256).optional(),
    title: z.string().max(256).optional(),
  }).optional(),
  urls: z.array(z.object({ url: z.string().url().max(2048), type: z.string().max(32).optional() })).max(20).optional(),
  addresses: z.array(z.object({
    street: z.string().max(512).optional(),
    city: z.string().max(128).optional(),
    state: z.string().max(128).optional(),
    zip: z.string().max(32).optional(),
    country: z.string().max(128).optional(),
    country_code: z.string().max(8).optional(),
    type: z.string().max(32).optional(),
  })).max(20).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const sendSchema = z.discriminatedUnion("type", [
  z.object({
    ...common,
    type: z.literal("text"),
    message_text: z.string().trim().min(1).max(4096),
    preview_url: z.boolean().optional(),
  }),
  z.object({
    ...common,
    type: z.literal("template"),
    template_name: z.string().trim().min(1).max(512),
    language_code: z.string().trim().min(2).max(20).default("es"),
    body_parameters: z.array(z.string().max(1024)).max(20).optional(),
    header_parameters: z.array(z.string().max(1024)).max(10).optional(),
  }),
  z.object({
    ...common,
    type: z.literal("media"),
    media_type: z.enum(["image", "video", "audio", "document", "sticker"]),
    media_url: z.string().trim().url().max(2048).optional(),
    media_id: z.string().trim().min(1).max(512).optional(),
    caption: z.string().max(1024).optional(),
    filename: z.string().max(240).optional(),
  }),
  z.object({
    ...common,
    type: z.literal("buttons"),
    body_text: z.string().trim().min(1).max(1024),
    header_text: z.string().max(60).optional(),
    footer_text: z.string().max(60).optional(),
    buttons: z.array(z.object({
      id: z.string().trim().min(1).max(256),
      title: z.string().trim().min(1).max(20),
    })).min(1).max(3),
  }),
  z.object({
    ...common,
    type: z.literal("list"),
    body_text: z.string().trim().min(1).max(1024),
    button_text: z.string().trim().min(1).max(20),
    header_text: z.string().max(60).optional(),
    footer_text: z.string().max(60).optional(),
    sections: z.array(z.object({
      title: z.string().max(24).optional(),
      rows: z.array(z.object({
        id: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(24),
        description: z.string().max(72).optional(),
      })).min(1).max(10),
    })).min(1).max(10),
  }),
  z.object({
    ...common,
    type: z.literal("location"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().max(1000).optional(),
    address: z.string().max(1000).optional(),
  }),
  z.object({
    ...common,
    type: z.literal("contacts"),
    contacts: z.array(contactSchema).min(1).max(10),
  }),
  z.object({
    ...common,
    type: z.literal("reaction"),
    message_id: z.string().trim().min(1).max(512),
    emoji: z.string().max(16),
  }),
  z.object({
    ...common,
    type: z.literal("flow"),
    flow_id: z.string().trim().min(1).max(100),
    flow_cta: z.string().trim().min(1).max(30),
    body_text: z.string().trim().min(1).max(1024),
    flow_token: z.string().trim().min(1).max(512),
    flow_action: z.enum(["navigate", "data_exchange"]).optional(),
    screen: z.string().trim().min(1).max(100).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    header_text: z.string().max(60).optional(),
    footer_text: z.string().max(60).optional(),
  }),
]);

type SendInput = z.infer<typeof sendSchema>;

function toAction(input: SendInput): WhatsAppOutboundAction {
  switch (input.type) {
    case "text":
      return {
        type: "text",
        text: input.message_text,
        previewUrl: input.preview_url,
        contextMessageId: input.context_message_id,
      };
    case "template":
      return {
        type: "template",
        name: input.template_name,
        languageCode: input.language_code,
        bodyParameters: input.body_parameters,
        headerParameters: input.header_parameters,
        contextMessageId: input.context_message_id,
      };
    case "media":
      return {
        type: "media",
        mediaType: input.media_type,
        mediaUrl: input.media_url,
        mediaId: input.media_id,
        caption: input.caption,
        filename: input.filename,
        contextMessageId: input.context_message_id,
      };
    case "buttons":
      return {
        type: "buttons",
        bodyText: input.body_text,
        headerText: input.header_text,
        footerText: input.footer_text,
        buttons: input.buttons,
        contextMessageId: input.context_message_id,
      };
    case "list":
      return {
        type: "list",
        bodyText: input.body_text,
        buttonText: input.button_text,
        headerText: input.header_text,
        footerText: input.footer_text,
        sections: input.sections,
        contextMessageId: input.context_message_id,
      };
    case "location":
      return {
        type: "location",
        latitude: input.latitude,
        longitude: input.longitude,
        name: input.name,
        address: input.address,
        contextMessageId: input.context_message_id,
      };
    case "contacts":
      return {
        type: "contacts",
        contextMessageId: input.context_message_id,
        contacts: input.contacts.map((contact) => ({
          name: {
            formattedName: contact.name.formatted_name,
            firstName: contact.name.first_name,
            lastName: contact.name.last_name,
            middleName: contact.name.middle_name,
            suffix: contact.name.suffix,
            prefix: contact.name.prefix,
          },
          phones: contact.phones?.map((phone) => ({ phone: phone.phone, type: phone.type, waId: phone.wa_id })),
          emails: contact.emails,
          organization: contact.organization,
          urls: contact.urls,
          addresses: contact.addresses?.map((address) => ({
            ...address,
            countryCode: address.country_code,
          })),
          birthday: contact.birthday,
        })),
      };
    case "reaction":
      return { type: "reaction", messageId: input.message_id, emoji: input.emoji };
    case "flow":
      return {
        type: "flow",
        flowId: input.flow_id,
        flowCta: input.flow_cta,
        bodyText: input.body_text,
        flowToken: input.flow_token,
        flowAction: input.flow_action,
        screen: input.screen,
        data: input.data,
        headerText: input.header_text,
        footerText: input.footer_text,
        contextMessageId: input.context_message_id,
      };
  }
}

export async function POST(req: Request) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const normalized = {
    ...raw,
    type: raw.type || (raw.template_name ? "template" : "text"),
  };
  const parsed = sendSchema.safeParse(normalized);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos de WhatsApp inválidos." },
      { status: 400 }
    );
  }
  if (
    parsed.data.type === "media" &&
    Boolean(parsed.data.media_url) === Boolean(parsed.data.media_id)
  ) {
    return NextResponse.json({ error: "Indica exactamente uno: media_url o media_id." }, { status: 400 });
  }
  if (parsed.data.type === "flow") {
    if ((parsed.data.flow_action || "navigate") === "navigate" && !parsed.data.screen) {
      return NextResponse.json({ error: "screen es obligatorio para flow_action=navigate." }, { status: 400 });
    }
    if (JSON.stringify(parsed.data.data || {}).length > 16_000) {
      return NextResponse.json({ error: "data supera el tamaño permitido." }, { status: 400 });
    }
  }

  if (!rateLimit(`whatsapp-send:${session.userId}:${getClientIP(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }

  if (session.clientId && parsed.data.client_id && parsed.data.client_id !== session.clientId) {
    return NextResponse.json({ error: "No puedes enviar mensajes para otro negocio." }, { status: 403 });
  }
  const clientId = session.clientId || (
    isAdmin(session)
      ? parsed.data.client_id || process.env.WHATSAPP_CLIENT_ID?.trim()
      : null
  );
  if (!clientId) {
    return NextResponse.json({ error: "Selecciona un negocio con WhatsApp configurado." }, { status: 409 });
  }

  const result = await sendWhatsAppMessage({
    clientId,
    phoneNumber: parsed.data.phone_number,
    conversationId: parsed.data.conversation_id || null,
    contactId: parsed.data.contact_id || null,
    action: toAction(parsed.data),
  });
  return NextResponse.json(
    {
      ok: result.status === "sent",
      message_id: result.id,
      provider_message_id: result.providerMessageId,
      status: result.status,
      ...(result.providerError ? { error: result.providerError } : {}),
    },
    { status: result.status === "sent" ? 200 : 502 }
  );
}

export const dynamic = "force-dynamic";
