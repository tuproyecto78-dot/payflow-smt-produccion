import type { RuntimeConfig } from "./config.js";
import type { VoiceContext } from "./payflow.js";

type Message = Record<string, unknown> & { role: string };

interface ToolExecution {
  value: Record<string, unknown>;
  transferPhone?: string;
}

export interface AgentTurnResult {
  text: string;
  transferPhone?: string;
}

function availableTools(context: VoiceContext) {
  const tools: Array<Record<string, unknown>> = [];
  if (context.agent.actions.orders && context.catalog) {
    tools.push({
      type: "function",
      function: {
        name: "create_order",
        description: "Crea el pedido únicamente después de que el cliente confirme productos, cantidades, nombre y modalidad.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["customerName", "items"],
          properties: {
            customerName: { type: "string" },
            customerPhone: { type: "string" },
            notes: { type: "string" },
            items: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["productId", "quantity"],
                properties: {
                  productId: { type: "string", description: "UUID exacto recibido en el catálogo" },
                  quantity: { type: "integer", minimum: 1, maximum: 99 },
                },
              },
            },
          },
        },
      },
    });
  }
  if (context.agent.actions.reservations) {
    tools.push({
      type: "function",
      function: {
        name: "create_reservation",
        description: "Crea una reserva después de confirmar nombre, fecha, hora y cantidad de personas.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["customerName", "scheduledAt"],
          properties: {
            customerName: { type: "string" },
            customerPhone: { type: "string" },
            serviceName: { type: "string" },
            partySize: { type: "integer", minimum: 1, maximum: 100 },
            scheduledAt: { type: "string", description: "Fecha ISO 8601 con zona horaria" },
            notes: { type: "string" },
          },
        },
      },
    });
  }
  if (context.agent.actions.humanTransfer && context.operation.humanTransferPhone) {
    tools.push({
      type: "function",
      function: {
        name: "transfer_to_human",
        description: "Transfiere a una persona cuando el cliente lo pide o la solicitud no puede resolverse con seguridad.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: { reason: { type: "string" } },
        },
      },
    });
  }
  return tools;
}

function systemPrompt(context: VoiceContext) {
  const products = context.catalog?.products
    .filter((product) => product.available)
    .slice(0, 250)
    .map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description || "",
      price: product.price,
      currency: product.currency || context.catalog?.currency,
    })) || [];
  return [
    `Eres ${context.agent.name}, agente telefónico de ${context.business.name}.`,
    `Habla en español natural, cálido y conciso. Zona horaria: ${context.business.timezone}.`,
    context.agent.instructions,
    "Una llamada es una conversación: haz una sola pregunta a la vez y permite que el cliente interrumpa.",
    "Nunca inventes productos, precios, disponibilidad, reservas, pedidos ni pagos.",
    "Antes de ejecutar una acción confirma verbalmente los datos relevantes.",
    "Para pedidos usa solamente productId exactos del catálogo. PayFlow calcula precios e inventario; tú no envías montos.",
    "Nunca solicites datos de tarjeta, claves, PIN, contraseñas ni tokens por teléfono.",
    "Nunca digas que un pago está aprobado. Los webhooks oficiales de Stripe o PayPhone son la única autoridad.",
    context.agent.actions.payments
      ? `Si se crea un pedido y el proveedor es ${context.operation.defaultPaymentProvider}, indica que PayFlow podrá enviar el cobro por WhatsApp cuando la integración del negocio esté habilitada.`
      : "No ofrezcas cobro automático.",
    `Catálogo disponible (JSON): ${JSON.stringify(products)}`,
    `Fecha y hora UTC actual: ${new Date().toISOString()}`,
  ].filter(Boolean).join("\n");
}

export class VoiceAgent {
  private readonly history: Message[];

  constructor(
    private readonly config: RuntimeConfig,
    private readonly context: VoiceContext,
    private readonly executeTool: (name: string, args: Record<string, unknown>, toolCallId: string) => Promise<ToolExecution>,
  ) {
    this.history = [{ role: "system", content: systemPrompt(context) }];
  }

  async reply(userText: string): Promise<AgentTurnResult> {
    this.history.push({ role: "user", content: userText });
    if (this.history.length > 42) this.history.splice(1, this.history.length - 42);
    return this.complete(0);
  }

  private async complete(depth: number): Promise<AgentTurnResult> {
    if (depth > 3) return { text: "Necesito verificar esa solicitud. ¿Deseas que te comunique con una persona?" };
    const tools = availableTools(this.context);
    const response = await fetch(`${this.config.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.LLM_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.LLM_MODEL,
        messages: this.history,
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? "auto" : undefined,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) throw new Error(`LLM_${response.status}: ${String(payload.error?.message || "Error del modelo")}`);
    const message = payload.choices?.[0]?.message as Message | undefined;
    if (!message) throw new Error("LLM_EMPTY_RESPONSE");
    this.history.push(message);

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls as Array<Record<string, any>> : [];
    let transferPhone: string | undefined;
    for (const toolCall of toolCalls) {
      const name = String(toolCall.function?.name || "");
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(String(toolCall.function?.arguments || "{}")); }
      catch { args = {}; }
      const executed = await this.executeTool(name, args, String(toolCall.id || `${name}-${Date.now()}`));
      transferPhone ||= executed.transferPhone;
      this.history.push({
        role: "tool",
        tool_call_id: String(toolCall.id || "tool"),
        content: JSON.stringify(executed.value),
      });
    }
    if (toolCalls.length) {
      const result = await this.complete(depth + 1);
      return { text: result.text, transferPhone: transferPhone || result.transferPhone };
    }
    const text = String(message.content || "").trim();
    return { text: text || "¿Puedes repetirlo, por favor?" };
  }
}
