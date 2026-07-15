import "server-only";

const GRAPH_API_ORIGIN = "https://graph.facebook.com";

export type WhatsAppMediaType = "image" | "video" | "audio" | "document" | "sticker";

export interface WhatsAppContactCard {
  name: {
    formattedName: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    suffix?: string;
    prefix?: string;
  };
  phones?: Array<{ phone: string; type?: string; waId?: string }>;
  emails?: Array<{ email: string; type?: string }>;
  organization?: { company?: string; department?: string; title?: string };
  urls?: Array<{ url: string; type?: string }>;
  addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    countryCode?: string;
    type?: string;
  }>;
  birthday?: string;
}

export type WhatsAppOutboundAction =
  | { type: "text"; text: string; previewUrl?: boolean; contextMessageId?: string }
  | {
      type: "template";
      name: string;
      languageCode: string;
      bodyParameters?: string[];
      headerParameters?: string[];
      contextMessageId?: string;
    }
  | {
      type: "media";
      mediaType: WhatsAppMediaType;
      mediaUrl?: string;
      mediaId?: string;
      caption?: string;
      filename?: string;
      contextMessageId?: string;
    }
  | {
      type: "buttons";
      bodyText: string;
      buttons: Array<{ id: string; title: string }>;
      headerText?: string;
      footerText?: string;
      contextMessageId?: string;
    }
  | {
      type: "list";
      bodyText: string;
      buttonText: string;
      sections: Array<{
        title?: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
      headerText?: string;
      footerText?: string;
      contextMessageId?: string;
    }
  | {
      type: "location";
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
      contextMessageId?: string;
    }
  | { type: "contacts"; contacts: WhatsAppContactCard[]; contextMessageId?: string }
  | { type: "reaction"; messageId: string; emoji: string }
  | {
      type: "flow";
      flowId: string;
      flowCta: string;
      bodyText: string;
      flowToken: string;
      flowAction?: "navigate" | "data_exchange";
      screen?: string;
      data?: Record<string, unknown>;
      headerText?: string;
      footerText?: string;
      contextMessageId?: string;
    };

export interface WhatsAppCloudConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}

export interface WhatsAppCloudResult {
  providerMessageId: string;
  rawStatus: number;
}

export interface WhatsAppTemplateSummary {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown[];
}

export class WhatsAppCloudError extends Error {
  status: number;
  providerCode: string | null;

  constructor(message: string, status: number, providerCode: string | null = null) {
    super(message);
    this.name = "WhatsAppCloudError";
    this.status = status;
    this.providerCode = providerCode;
  }
}

export function normalizeWhatsAppPhone(value: string): string {
  const normalized = value.replace(/\D/g, "");
  if (normalized.length < 8 || normalized.length > 15) {
    throw new WhatsAppCloudError("El número debe incluir código de país y tener entre 8 y 15 dígitos.", 400);
  }
  return normalized;
}

export function getWhatsAppApiVersion(): string {
  const configured = process.env.WHATSAPP_API_VERSION?.trim();
  if (configured && /^v\d+\.\d+$/.test(configured)) return configured;
  if (process.env.NODE_ENV !== "production") return "v22.0";
  throw new WhatsAppCloudError("WHATSAPP_API_VERSION no está configurada correctamente.", 503);
}

function assertNonEmpty(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new WhatsAppCloudError(`${label} es obligatorio.`, 400);
  if (normalized.length > maxLength) {
    throw new WhatsAppCloudError(`${label} supera el máximo de ${maxLength} caracteres.`, 400);
  }
  return normalized;
}

function textParameters(values: string[] | undefined) {
  return (values || []).map((value) => ({ type: "text", text: String(value).slice(0, 1024) }));
}

function withContext(payload: Record<string, unknown>, contextMessageId?: string) {
  if (!contextMessageId?.trim()) return payload;
  return { ...payload, context: { message_id: assertNonEmpty(contextMessageId, "El mensaje de referencia", 512) } };
}

function buildMessagePayload(recipient: string, action: WhatsAppOutboundAction): Record<string, unknown> {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeWhatsAppPhone(recipient),
  };

  switch (action.type) {
    case "text":
      return withContext({
        ...base,
        type: "text",
        text: {
          body: assertNonEmpty(action.text, "El mensaje", 4096),
          preview_url: action.previewUrl === true,
        },
      }, action.contextMessageId);

    case "template": {
      const name = assertNonEmpty(action.name, "El nombre de plantilla", 512);
      if (!/^[a-z0-9_]+$/.test(name)) {
        throw new WhatsAppCloudError("El nombre de plantilla solo puede contener minúsculas, números y guiones bajos.", 400);
      }
      const languageCode = assertNonEmpty(action.languageCode, "El idioma de plantilla", 20);
      const components: Array<Record<string, unknown>> = [];
      if (action.headerParameters?.length) {
        components.push({ type: "header", parameters: textParameters(action.headerParameters) });
      }
      if (action.bodyParameters?.length) {
        components.push({ type: "body", parameters: textParameters(action.bodyParameters) });
      }
      return withContext({
        ...base,
        type: "template",
        template: {
          name,
          language: { code: languageCode },
          ...(components.length ? { components } : {}),
        },
      }, action.contextMessageId);
    }

    case "media": {
      if (Boolean(action.mediaUrl) === Boolean(action.mediaId)) {
        throw new WhatsAppCloudError("Indica exactamente uno: mediaUrl o mediaId.", 400);
      }
      const media: Record<string, string> = {};
      if (action.mediaUrl) {
        let mediaUrl: URL;
        try {
          mediaUrl = new URL(action.mediaUrl);
        } catch {
          throw new WhatsAppCloudError("La URL del archivo no es válida.", 400);
        }
        if (mediaUrl.protocol !== "https:") {
          throw new WhatsAppCloudError("La URL del archivo debe usar HTTPS.", 400);
        }
        media.link = mediaUrl.toString();
      } else {
        media.id = assertNonEmpty(action.mediaId || "", "El identificador del archivo", 512);
      }
      if (action.caption && ["image", "video", "document"].includes(action.mediaType)) {
        media.caption = action.caption.slice(0, 1024);
      }
      if (action.filename && action.mediaType === "document") {
        media.filename = action.filename.slice(0, 240);
      }
      return withContext(
        { ...base, type: action.mediaType, [action.mediaType]: media },
        action.contextMessageId
      );
    }

    case "buttons": {
      if (action.buttons.length < 1 || action.buttons.length > 3) {
        throw new WhatsAppCloudError("Los mensajes interactivos admiten entre 1 y 3 botones.", 400);
      }
      const ids = new Set<string>();
      const buttons = action.buttons.map((button) => {
        const id = assertNonEmpty(button.id, "El identificador del botón", 256);
        if (ids.has(id)) throw new WhatsAppCloudError("Los identificadores de botón deben ser únicos.", 400);
        ids.add(id);
        return {
          type: "reply",
          reply: { id, title: assertNonEmpty(button.title, "El texto del botón", 20) },
        };
      });
      return withContext({
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          ...(action.headerText ? { header: { type: "text", text: action.headerText.slice(0, 60) } } : {}),
          body: { text: assertNonEmpty(action.bodyText, "El texto principal", 1024) },
          ...(action.footerText ? { footer: { text: action.footerText.slice(0, 60) } } : {}),
          action: { buttons },
        },
      }, action.contextMessageId);
    }

    case "list": {
      const rows = action.sections.flatMap((section) => section.rows);
      if (!action.sections.length || action.sections.length > 10 || !rows.length || rows.length > 10) {
        throw new WhatsAppCloudError("La lista debe tener entre 1 y 10 opciones en un máximo de 10 secciones.", 400);
      }
      const rowIds = new Set<string>();
      const sections = action.sections.map((section) => ({
        ...(section.title ? { title: section.title.slice(0, 24) } : {}),
        rows: section.rows.map((row) => {
          const id = assertNonEmpty(row.id, "El identificador de opción", 200);
          if (rowIds.has(id)) throw new WhatsAppCloudError("Los identificadores de la lista deben ser únicos.", 400);
          rowIds.add(id);
          return {
            id,
            title: assertNonEmpty(row.title, "El título de opción", 24),
            ...(row.description ? { description: row.description.slice(0, 72) } : {}),
          };
        }),
      }));
      return withContext({
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          ...(action.headerText ? { header: { type: "text", text: action.headerText.slice(0, 60) } } : {}),
          body: { text: assertNonEmpty(action.bodyText, "El texto principal", 1024) },
          ...(action.footerText ? { footer: { text: action.footerText.slice(0, 60) } } : {}),
          action: {
            button: assertNonEmpty(action.buttonText, "El texto para abrir la lista", 20),
            sections,
          },
        },
      }, action.contextMessageId);
    }

    case "location":
      if (!Number.isFinite(action.latitude) || action.latitude < -90 || action.latitude > 90) {
        throw new WhatsAppCloudError("La latitud no es válida.", 400);
      }
      if (!Number.isFinite(action.longitude) || action.longitude < -180 || action.longitude > 180) {
        throw new WhatsAppCloudError("La longitud no es válida.", 400);
      }
      return withContext({
        ...base,
        type: "location",
        location: {
          latitude: action.latitude,
          longitude: action.longitude,
          ...(action.name ? { name: action.name.slice(0, 1000) } : {}),
          ...(action.address ? { address: action.address.slice(0, 1000) } : {}),
        },
      }, action.contextMessageId);

    case "contacts": {
      if (!action.contacts.length || action.contacts.length > 10) {
        throw new WhatsAppCloudError("Envía entre 1 y 10 contactos.", 400);
      }
      const contacts = action.contacts.map((contact) => ({
        name: {
          formatted_name: assertNonEmpty(contact.name.formattedName, "El nombre del contacto", 512),
          ...(contact.name.firstName ? { first_name: contact.name.firstName.slice(0, 256) } : {}),
          ...(contact.name.lastName ? { last_name: contact.name.lastName.slice(0, 256) } : {}),
          ...(contact.name.middleName ? { middle_name: contact.name.middleName.slice(0, 256) } : {}),
          ...(contact.name.suffix ? { suffix: contact.name.suffix.slice(0, 64) } : {}),
          ...(contact.name.prefix ? { prefix: contact.name.prefix.slice(0, 64) } : {}),
        },
        ...(contact.phones?.length ? {
          phones: contact.phones.slice(0, 20).map((phone) => ({
            phone: assertNonEmpty(phone.phone, "El teléfono del contacto", 32),
            ...(phone.type ? { type: phone.type.slice(0, 32) } : {}),
            ...(phone.waId ? { wa_id: normalizeWhatsAppPhone(phone.waId) } : {}),
          })),
        } : {}),
        ...(contact.emails?.length ? {
          emails: contact.emails.slice(0, 20).map((email) => ({
            email: assertNonEmpty(email.email, "El correo del contacto", 320),
            ...(email.type ? { type: email.type.slice(0, 32) } : {}),
          })),
        } : {}),
        ...(contact.organization ? {
          org: {
            ...(contact.organization.company ? { company: contact.organization.company.slice(0, 256) } : {}),
            ...(contact.organization.department ? { department: contact.organization.department.slice(0, 256) } : {}),
            ...(contact.organization.title ? { title: contact.organization.title.slice(0, 256) } : {}),
          },
        } : {}),
        ...(contact.urls?.length ? {
          urls: contact.urls.slice(0, 20).map((item) => ({
            url: assertNonEmpty(item.url, "La URL del contacto", 2048),
            ...(item.type ? { type: item.type.slice(0, 32) } : {}),
          })),
        } : {}),
        ...(contact.addresses?.length ? {
          addresses: contact.addresses.slice(0, 20).map((address) => ({
            ...(address.street ? { street: address.street.slice(0, 512) } : {}),
            ...(address.city ? { city: address.city.slice(0, 128) } : {}),
            ...(address.state ? { state: address.state.slice(0, 128) } : {}),
            ...(address.zip ? { zip: address.zip.slice(0, 32) } : {}),
            ...(address.country ? { country: address.country.slice(0, 128) } : {}),
            ...(address.countryCode ? { country_code: address.countryCode.slice(0, 8) } : {}),
            ...(address.type ? { type: address.type.slice(0, 32) } : {}),
          })),
        } : {}),
        ...(contact.birthday ? { birthday: contact.birthday.slice(0, 10) } : {}),
      }));
      return withContext({ ...base, type: "contacts", contacts }, action.contextMessageId);
    }

    case "reaction":
      return {
        ...base,
        type: "reaction",
        reaction: {
          message_id: assertNonEmpty(action.messageId, "El mensaje para reaccionar", 512),
          emoji: action.emoji.slice(0, 16),
        },
      };

    case "flow": {
      const flowAction = action.flowAction || "navigate";
      if (flowAction === "navigate" && !action.screen?.trim()) {
        throw new WhatsAppCloudError("El Flow con acción navigate requiere una pantalla inicial.", 400);
      }
      if (JSON.stringify(action.data || {}).length > 16_000) {
        throw new WhatsAppCloudError("Los datos iniciales del Flow son demasiado grandes.", 400);
      }
      return withContext({
        ...base,
        type: "interactive",
        interactive: {
          type: "flow",
          ...(action.headerText ? { header: { type: "text", text: action.headerText.slice(0, 60) } } : {}),
          body: { text: assertNonEmpty(action.bodyText, "El texto principal", 1024) },
          ...(action.footerText ? { footer: { text: action.footerText.slice(0, 60) } } : {}),
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_id: assertNonEmpty(action.flowId, "El Flow ID", 100),
              flow_token: assertNonEmpty(action.flowToken, "El token del Flow", 512),
              flow_cta: assertNonEmpty(action.flowCta, "El botón del Flow", 30),
              flow_action: flowAction,
              ...((action.screen || action.data) ? {
                flow_action_payload: {
                  ...(action.screen ? { screen: action.screen.slice(0, 100) } : {}),
                  ...(action.data ? { data: action.data } : {}),
                },
              } : {}),
            },
          },
        },
      }, action.contextMessageId);
    }
  }
}

export async function whatsappGraphRequest(input: {
  accessToken: string;
  apiVersion: string;
  path: string;
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  formData?: FormData;
  searchParams?: URLSearchParams;
}): Promise<{ data: Record<string, unknown>; status: number }> {
  const url = new URL(`${GRAPH_API_ORIGIN}/${input.apiVersion}/${input.path.replace(/^\/+/, "")}`);
  if (input.searchParams) url.search = input.searchParams.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      method: input.method || "GET",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : input.formData ? { body: input.formData } : {}),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const provider = data.error as { code?: number | string } | undefined;
      throw new WhatsAppCloudError(
        `Meta rechazó la operación (HTTP ${response.status}).`,
        response.status,
        provider?.code == null ? null : String(provider.code)
      );
    }
    return { data, status: response.status };
  } catch (error) {
    if (error instanceof WhatsAppCloudError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new WhatsAppCloudError("Meta no respondió dentro del tiempo permitido.", 504);
    }
    throw new WhatsAppCloudError("No se pudo conectar con la API de WhatsApp.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendWhatsAppCloudAction(
  config: WhatsAppCloudConfig,
  recipient: string,
  action: WhatsAppOutboundAction
): Promise<WhatsAppCloudResult> {
  const response = await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: `${config.phoneNumberId}/messages`,
    method: "POST",
    body: buildMessagePayload(recipient, action),
  });
  const messages = response.data.messages as Array<{ id?: string }> | undefined;
  const providerMessageId = messages?.[0]?.id;
  if (!providerMessageId) {
    throw new WhatsAppCloudError("Meta aceptó la solicitud sin devolver un identificador de mensaje.", 502);
  }
  return { providerMessageId: String(providerMessageId), rawStatus: response.status };
}

export async function listWhatsAppTemplates(input: {
  accessToken: string;
  apiVersion: string;
  businessAccountId: string;
}): Promise<WhatsAppTemplateSummary[]> {
  const params = new URLSearchParams({
    fields: "id,name,language,category,status,components",
    limit: "100",
  });
  const response = await whatsappGraphRequest({
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    path: `${input.businessAccountId}/message_templates`,
    searchParams: params,
  });
  const rows = Array.isArray(response.data.data) ? response.data.data : [];
  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: String(item.id || ""),
      name: String(item.name || ""),
      language: String(item.language || ""),
      category: String(item.category || ""),
      status: String(item.status || ""),
      components: Array.isArray(item.components) ? item.components : [],
    };
  });
}

export function whatsappActionPreview(action: WhatsAppOutboundAction): string {
  switch (action.type) {
    case "text": return action.text;
    case "template": return `[plantilla:${action.name}] ${(action.bodyParameters || []).join(" · ")}`;
    case "media": return `[${action.mediaType}] ${action.caption || action.filename || action.mediaUrl || action.mediaId}`;
    case "buttons": return `[botones] ${action.bodyText}`;
    case "list": return `[lista] ${action.bodyText}`;
    case "location": return `[ubicación] ${action.name || `${action.latitude},${action.longitude}`}`;
    case "contacts": return `[contactos] ${action.contacts.map((item) => item.name.formattedName).join(", ")}`;
    case "reaction": return `[reacción] ${action.emoji}`;
    case "flow": return `[flow:${action.flowId}] ${action.bodyText}`;
  }
}
