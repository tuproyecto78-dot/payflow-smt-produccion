import "server-only";

import { whatsappGraphRequest } from "@/lib/whatsapp/cloud-api";

export interface WhatsAppManagementConfig {
  accessToken: string;
  apiVersion: string;
  phoneNumberId: string;
  businessAccountId: string | null;
}

function requireWaba(config: WhatsAppManagementConfig): string {
  if (!config.businessAccountId) throw new Error("WHATSAPP_WABA_REQUIRED");
  return config.businessAccountId;
}

function rows(data: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(data.data) ? data.data as Array<Record<string, unknown>> : [];
}

export async function markWhatsAppMessageRead(config: WhatsAppManagementConfig, messageId: string) {
  return whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: `${config.phoneNumberId}/messages`,
    method: "POST",
    body: { messaging_product: "whatsapp", status: "read", message_id: messageId },
  });
}

export async function uploadWhatsAppMedia(input: {
  config: WhatsAppManagementConfig;
  file: Blob;
  fileName: string;
  mimeType: string;
}) {
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", input.mimeType);
  form.set("file", input.file, input.fileName);
  const response = await whatsappGraphRequest({
    accessToken: input.config.accessToken,
    apiVersion: input.config.apiVersion,
    path: `${input.config.phoneNumberId}/media`,
    method: "POST",
    formData: form,
  });
  return { id: String(response.data.id || ""), status: response.status };
}

export async function getWhatsAppMedia(config: WhatsAppManagementConfig, mediaId: string) {
  return (await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: mediaId,
  })).data;
}

export async function deleteWhatsAppMedia(config: WhatsAppManagementConfig, mediaId: string) {
  return (await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: mediaId,
    method: "DELETE",
  })).data;
}

export async function createWhatsAppTemplate(input: {
  config: WhatsAppManagementConfig;
  name: string;
  language: string;
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  components: unknown[];
  allowCategoryChange?: boolean;
}) {
  return (await whatsappGraphRequest({
    accessToken: input.config.accessToken,
    apiVersion: input.config.apiVersion,
    path: `${requireWaba(input.config)}/message_templates`,
    method: "POST",
    body: {
      name: input.name,
      language: input.language,
      category: input.category,
      components: input.components,
      ...(input.allowCategoryChange ? { allow_category_change: true } : {}),
    },
  })).data;
}

export async function deleteWhatsAppTemplate(config: WhatsAppManagementConfig, name: string, templateId?: string) {
  return (await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: `${requireWaba(config)}/message_templates`,
    method: "DELETE",
    searchParams: new URLSearchParams({ name, ...(templateId ? { hsm_id: templateId } : {}) }),
  })).data;
}

export async function updateWhatsAppTemplate(input: {
  config: WhatsAppManagementConfig;
  templateId: string;
  category?: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  components?: unknown[];
}) {
  return (await whatsappGraphRequest({
    accessToken: input.config.accessToken,
    apiVersion: input.config.apiVersion,
    path: input.templateId,
    method: "POST",
    body: {
      ...(input.category ? { category: input.category } : {}),
      ...(input.components ? { components: input.components } : {}),
    },
  })).data;
}

const PROFILE_FIELDS = "about,address,description,email,profile_picture_url,websites,vertical";

export async function getWhatsAppBusinessProfile(config: WhatsAppManagementConfig) {
  const response = await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: `${config.phoneNumberId}/whatsapp_business_profile`,
    searchParams: new URLSearchParams({ fields: PROFILE_FIELDS }),
  });
  return rows(response.data)[0] || null;
}

export async function updateWhatsAppBusinessProfile(
  config: WhatsAppManagementConfig,
  profile: Record<string, unknown>
) {
  return (await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: `${config.phoneNumberId}/whatsapp_business_profile`,
    method: "POST",
    body: { messaging_product: "whatsapp", ...profile },
  })).data;
}

export async function listWhatsAppPhoneNumbers(config: WhatsAppManagementConfig) {
  const response = await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: `${requireWaba(config)}/phone_numbers`,
    searchParams: new URLSearchParams({
      fields: "id,verified_name,display_phone_number,quality_rating,platform_type,throughput,webhook_configuration,name_status,new_name_status",
      limit: "100",
    }),
  });
  return rows(response.data);
}

export async function getWhatsAppPhoneNumber(config: WhatsAppManagementConfig, phoneNumberId: string) {
  return (await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: phoneNumberId,
    searchParams: new URLSearchParams({
      fields: "id,verified_name,display_phone_number,quality_rating,platform_type,throughput,webhook_configuration,name_status,new_name_status",
    }),
  })).data;
}

export async function manageWhatsAppPhoneNumber(input: {
  config: WhatsAppManagementConfig;
  phoneNumberId: string;
  action: "register" | "deregister" | "request_code" | "verify_code" | "set_pin";
  pin?: string;
  code?: string;
  codeMethod?: "SMS" | "VOICE";
  language?: string;
}) {
  const base = {
    accessToken: input.config.accessToken,
    apiVersion: input.config.apiVersion,
    method: "POST" as const,
  };
  if (input.action === "register") {
    return (await whatsappGraphRequest({ ...base, path: `${input.phoneNumberId}/register`, body: {
      messaging_product: "whatsapp", pin: input.pin,
    } })).data;
  }
  if (input.action === "deregister") {
    return (await whatsappGraphRequest({ ...base, path: `${input.phoneNumberId}/deregister`, body: {
      messaging_product: "whatsapp",
    } })).data;
  }
  if (input.action === "request_code") {
    return (await whatsappGraphRequest({ ...base, path: `${input.phoneNumberId}/request_code`, body: {
      code_method: input.codeMethod, locale: input.language,
    } })).data;
  }
  if (input.action === "verify_code") {
    return (await whatsappGraphRequest({ ...base, path: `${input.phoneNumberId}/verify_code`, body: {
      code: input.code,
    } })).data;
  }
  return (await whatsappGraphRequest({ ...base, path: input.phoneNumberId, body: { pin: input.pin } })).data;
}

export async function listWhatsAppFlows(config: WhatsAppManagementConfig) {
  const response = await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: `${requireWaba(config)}/flows`,
    searchParams: new URLSearchParams({
      fields: "id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,preview",
      limit: "100",
    }),
  });
  return rows(response.data);
}

export async function createWhatsAppFlow(input: {
  config: WhatsAppManagementConfig;
  name: string;
  categories: string[];
  endpointUri?: string;
  cloneFlowId?: string;
}) {
  return (await whatsappGraphRequest({
    accessToken: input.config.accessToken,
    apiVersion: input.config.apiVersion,
    path: `${requireWaba(input.config)}/flows`,
    method: "POST",
    body: {
      name: input.name,
      categories: input.categories,
      ...(input.endpointUri ? { endpoint_uri: input.endpointUri } : {}),
      ...(input.cloneFlowId ? { clone_flow_id: input.cloneFlowId } : {}),
    },
  })).data;
}

export async function getWhatsAppFlow(config: WhatsAppManagementConfig, flowId: string) {
  return (await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: flowId,
    searchParams: new URLSearchParams({
      fields: "id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,preview",
    }),
  })).data;
}

export async function updateWhatsAppFlow(
  config: WhatsAppManagementConfig,
  flowId: string,
  changes: Record<string, unknown>
) {
  return (await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: flowId,
    method: "POST",
    body: changes,
  })).data;
}

export async function performWhatsAppFlowAction(input: {
  config: WhatsAppManagementConfig;
  flowId: string;
  action: "publish" | "delete";
}) {
  return (await whatsappGraphRequest({
    accessToken: input.config.accessToken,
    apiVersion: input.config.apiVersion,
    path: input.action === "publish" ? `${input.flowId}/publish` : input.flowId,
    method: input.action === "delete" ? "DELETE" : "POST",
  })).data;
}

export async function uploadWhatsAppFlowJson(input: {
  config: WhatsAppManagementConfig;
  flowId: string;
  json: string;
}) {
  const form = new FormData();
  form.set("name", "flow.json");
  form.set("asset_type", "FLOW_JSON");
  form.set("file", new Blob([input.json], { type: "application/json" }), "flow.json");
  return (await whatsappGraphRequest({
    accessToken: input.config.accessToken,
    apiVersion: input.config.apiVersion,
    path: `${input.flowId}/assets`,
    method: "POST",
    formData: form,
  })).data;
}

export async function getWhatsAppAnalytics(input: {
  config: WhatsAppManagementConfig;
  kind: "account" | "conversation" | "phone";
  start: number;
  end: number;
  granularity: "HALF_HOUR" | "DAY" | "MONTHLY";
  phoneNumbers?: string[];
  countryCodes?: string[];
  conversationDirections?: Array<"business_initiated" | "user_initiated">;
  dimensions?: Array<"conversation_type" | "conversation_direction" | "country" | "phone">;
}) {
  if (input.kind === "phone") {
    return (await whatsappGraphRequest({
      accessToken: input.config.accessToken,
      apiVersion: input.config.apiVersion,
      path: input.config.phoneNumberId,
      searchParams: new URLSearchParams({
        fields: "id,quality_rating,throughput,account_mode,code_verification_status,name_status",
      }),
    })).data;
  }
  const base = `${input.kind === "conversation" ? "conversation_analytics" : "analytics"}.start(${input.start}).end(${input.end}).granularity(${input.granularity})`;
  const fields = input.kind === "conversation"
    ? `${base}${input.conversationDirections?.length ? `.conversation_directions(${JSON.stringify(input.conversationDirections)})` : ""}${input.dimensions?.length ? `.dimensions(${JSON.stringify(input.dimensions)})` : ""}`
    : `${base}${input.phoneNumbers ? `.phone_numbers(${JSON.stringify(input.phoneNumbers)})` : ""}${input.countryCodes ? `.country_codes(${JSON.stringify(input.countryCodes)})` : ""}`;
  return (await whatsappGraphRequest({
    accessToken: input.config.accessToken,
    apiVersion: input.config.apiVersion,
    path: requireWaba(input.config),
    searchParams: new URLSearchParams({ fields }),
  })).data;
}

export async function listWhatsAppWebhookSubscriptions(config: WhatsAppManagementConfig) {
  const response = await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: `${requireWaba(config)}/subscribed_apps`,
  });
  return rows(response.data);
}

export async function setWhatsAppWebhookSubscription(
  config: WhatsAppManagementConfig,
  subscribed: boolean,
  override?: { callbackUri: string; verifyToken: string }
) {
  return (await whatsappGraphRequest({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    path: `${requireWaba(config)}/subscribed_apps`,
    method: subscribed ? "POST" : "DELETE",
    ...(subscribed && override ? {
      body: { override_callback_uri: override.callbackUri, verify_token: override.verifyToken },
    } : {}),
  })).data;
}

export async function listWhatsAppBusinessAccounts(input: {
  accessToken: string;
  apiVersion: string;
  businessPortfolioId: string;
  relation: "owned" | "shared";
}) {
  const response = await whatsappGraphRequest({
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    path: `${input.businessPortfolioId}/${input.relation === "owned" ? "owned" : "client"}_whatsapp_business_accounts`,
    searchParams: new URLSearchParams({ fields: "id,name,currency,timezone_id,message_template_namespace", limit: "100" }),
  });
  return rows(response.data);
}

export async function createWhatsAppBusinessAccount(input: {
  accessToken: string;
  apiVersion: string;
  businessPortfolioId: string;
  name: string;
  currency: string;
  timezoneId: string;
}) {
  return (await whatsappGraphRequest({
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    path: `${input.businessPortfolioId}/owned_whatsapp_business_accounts`,
    method: "POST",
    body: { name: input.name, currency: input.currency, timezone_id: input.timezoneId },
  })).data;
}

export async function mutateWhatsAppBusinessAccount(input: {
  accessToken: string;
  apiVersion: string;
  businessAccountId: string;
  action: "update" | "delete";
  changes?: Record<string, unknown>;
}) {
  return (await whatsappGraphRequest({
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
    path: input.businessAccountId,
    method: input.action === "delete" ? "DELETE" : "POST",
    ...(input.action === "update" ? { body: input.changes || {} } : {}),
  })).data;
}
