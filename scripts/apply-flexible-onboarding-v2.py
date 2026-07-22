from pathlib import Path
import re
import textwrap


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: se esperó 1 coincidencia y se encontraron {count}")
    return content.replace(old, new, 1)


def regex_once(content: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    result, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: se esperó 1 coincidencia y se encontraron {count}")
    return result


# -----------------------------------------------------------------------------
# Onboarding UI
# -----------------------------------------------------------------------------
dialog_path = "src/components/dashboard/create-flow-dialog.tsx"
dialog = read(dialog_path)

if 'type PaymentProvider = "none" | "payphone" | "external" | "mock";' in dialog:
    raise RuntimeError("El onboarding flexible ya parece estar aplicado")
if "uses_payphone" not in dialog:
    raise RuntimeError("No se encontró la estructura esperada de PayPhone")

dialog = dialog.replace("uses_payphone", "uses_payments")

dialog = replace_once(
    dialog,
    'type PaymentProvider = "none" | "payphone" | "mock";\ntype AmountMode = "fixed" | "variable";',
    'type PaymentProvider = "none" | "payphone" | "external" | "mock";\n'
    'type PaymentConfirmationMode = "provider_webhook" | "merchant_manual";\n'
    'type AmountMode = "fixed" | "variable";',
    "tipos de pago",
)

dialog = replace_once(
    dialog,
    'const STEP_LABELS = ["Plantilla", "Negocio", "Conocimiento", "Módulos", "Resumen"] as const;',
    'const STEP_LABELS = ["Objetivo", "Negocio y WhatsApp", "Catálogo", "Cobros y módulos", "Revisión"] as const;',
    "etiquetas de pasos",
)

dialog = replace_once(
    dialog,
    '  { id: "ia_payphone", name: "IA + PayPhone Business", icon: CreditCard, desc: "WhatsApp + IA + Link de Pago PayPhone", tag: "PayPhone", color: "violet" },\n'
    '  { id: "ia_agenda_payphone", name: "IA + Agenda + PayPhone", icon: CalendarCheck, desc: "Citas + cobro de anticipo", tag: "Agenda + PayPhone", color: "rose" },\n'
    '  { id: "agente_completo", name: "Agente completo", icon: Bot, desc: "Vende, cobra, agenda y deriva", tag: "Completo", color: "purple" },',
    '  { id: "ia_payphone", name: "IA + Cobros", icon: CreditCard, desc: "WhatsApp + IA + enlace de pago del negocio", tag: "Cobros", color: "violet" },\n'
    '  { id: "ia_agenda_payphone", name: "IA + Agenda + Cobros", icon: CalendarCheck, desc: "Citas + enlace para anticipo o pago", tag: "Agenda + Cobros", color: "rose" },\n'
    '  { id: "agente_completo", name: "Agente completo", icon: Bot, desc: "Vende, comparte el enlace, agenda y deriva", tag: "Completo", color: "purple" },',
    "nombres de plantillas",
)

dialog = replace_once(
    dialog,
    'function genId(): string {\n  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;\n}\n',
    'function genId(): string {\n  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;\n}\n\n'
    'function isValidHttpsUrl(value: string): boolean {\n'
    '  try {\n'
    '    const parsed = new URL(value);\n'
    '    return parsed.protocol === "https:" && Boolean(parsed.hostname);\n'
    '  } catch {\n'
    '    return false;\n'
    '  }\n'
    '}\n',
    "validador de URL",
)

dialog = replace_once(
    dialog,
    '  const [modules, setModules] = useState({\n'
    '    uses_agenda: false,\n'
    '    uses_catalog: false,\n'
    '    uses_payments: false,\n'
    '    payment_provider: "payphone" as PaymentProvider,\n'
    '    amount_mode: "fixed" as AmountMode,\n'
    '    fixed_amount: 49.99,\n'
    '    agent_mode: "completo" as AgentMode,\n'
    '  });',
    '  const [modules, setModules] = useState({\n'
    '    uses_agenda: false,\n'
    '    uses_catalog: false,\n'
    '    uses_payments: false,\n'
    '    payment_provider: "none" as PaymentProvider,\n'
    '    payment_confirmation_mode: "provider_webhook" as PaymentConfirmationMode,\n'
    '    external_provider_name: "",\n'
    '    external_payment_url: "",\n'
    '    amount_mode: "fixed" as AmountMode,\n'
    '    fixed_amount: 49.99,\n'
    '    agent_mode: "completo" as AgentMode,\n'
    '  });',
    "estado de módulos",
)

dialog = replace_once(
    dialog,
    '    if (step === 4 && modules.uses_payments && !payphoneConfig && !payphoneVerifying) {',
    '    if (\n'
    '      step === 4 &&\n'
    '      modules.uses_payments &&\n'
    '      modules.payment_provider === "payphone" &&\n'
    '      !payphoneConfig &&\n'
    '      !payphoneVerifying\n'
    '    ) {',
    "condición de verificación PayPhone",
)

dialog = replace_once(
    dialog,
    '  }, [step, modules.uses_payments, payphoneConfig, payphoneVerifying]);',
    '  }, [step, modules.uses_payments, modules.payment_provider, payphoneConfig, payphoneVerifying]);',
    "dependencias de verificación PayPhone",
)

dialog = replace_once(
    dialog,
    '    setModules({\n'
    '      uses_agenda: false,\n'
    '      uses_catalog: false,\n'
    '      uses_payments: false,\n'
    '      payment_provider: "payphone",\n'
    '      amount_mode: "fixed",\n'
    '      fixed_amount: 49.99,\n'
    '      agent_mode: "completo",\n'
    '    });',
    '    setModules({\n'
    '      uses_agenda: false,\n'
    '      uses_catalog: false,\n'
    '      uses_payments: false,\n'
    '      payment_provider: "none",\n'
    '      payment_confirmation_mode: "provider_webhook",\n'
    '      external_provider_name: "",\n'
    '      external_payment_url: "",\n'
    '      amount_mode: "fixed",\n'
    '      fixed_amount: 49.99,\n'
    '      agent_mode: "completo",\n'
    '    });',
    "reinicio de módulos",
)

dialog = replace_once(
    dialog,
    '    if (suggestions.paymentProvider) {\n'
    '      const usesPayphone = suggestions.paymentProvider === "payphone_api_link";\n'
    '      setModules((current) => ({\n'
    '        ...current,\n'
    '        uses_payments: usesPayphone,\n'
    '        payment_provider: usesPayphone ? "payphone" : "none",\n'
    '      }));\n'
    '    }',
    '    if (suggestions.paymentProvider) {\n'
    '      const provider: PaymentProvider =\n'
    '        suggestions.paymentProvider === "payphone_api_link"\n'
    '          ? "payphone"\n'
    '          : suggestions.paymentProvider === "external_link"\n'
    '          ? "external"\n'
    '          : "none";\n'
    '      setModules((current) => ({\n'
    '        ...current,\n'
    '        uses_payments: provider !== "none",\n'
    '        payment_provider: provider,\n'
    '      }));\n'
    '    }',
    "sugerencias de proveedor",
)

# Generalized payment switch
dialog = replace_once(
    dialog,
    '                  <ModuleSwitch\n'
    '                    icon={CreditCard}\n'
    '                    color="violet"\n'
    '                    label="PayPhone"\n'
    '                    desc="Cobros por WhatsApp vía PayPhone API Link"\n'
    '                    checked={modules.uses_payments}\n'
    '                    onCheckedChange={(v) =>\n'
    '                      setModules((m) => ({\n'
    '                        ...m,\n'
    '                        uses_payments: v,\n'
    '                        payment_provider: v ? "payphone" : "none",\n'
    '                      }))\n'
    '                    }\n'
    '                    badge={\n'
    '                      <Badge\n'
    '                        variant="outline"\n'
    '                        className="text-[9px] border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-300"\n'
    '                      >\n'
    '                        API Link\n'
    '                      </Badge>\n'
    '                    }\n'
    '                  />',
    '                  <ModuleSwitch\n'
    '                    icon={CreditCard}\n'
    '                    color="violet"\n'
    '                    label="Cobros por enlace"\n'
    '                    desc="Comparte el enlace del comercio sin que PayFlow reciba ni custodie el dinero"\n'
    '                    checked={modules.uses_payments}\n'
    '                    onCheckedChange={(v) =>\n'
    '                      setModules((m) => ({\n'
    '                        ...m,\n'
    '                        uses_payments: v,\n'
    '                        payment_provider: v\n'
    '                          ? m.payment_provider === "none"\n'
    '                            ? "payphone"\n'
    '                            : m.payment_provider\n'
    '                          : "none",\n'
    '                      }))\n'
    '                    }\n'
    '                    badge={\n'
    '                      <Badge\n'
    '                        variant="outline"\n'
    '                        className="text-[9px] border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-300"\n'
    '                      >\n'
    '                        Opcional\n'
    '                      </Badge>\n'
    '                    }\n'
    '                  />',
    "interruptor de cobros",
)

dialog = replace_once(
    dialog,
    '                <p className="text-xs text-muted-foreground">\n'
    '                  Configura los módulos del flujo. La plantilla preconfiguró estos valores; ajústalos si lo necesitas.\n'
    '                </p>',
    '                <div className="rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50/60 dark:bg-purple-500/10 p-3">\n'
    '                  <p className="text-xs font-medium text-purple-900 dark:text-purple-200">\n'
    '                    Elige solo lo que necesita tu negocio\n'
    '                  </p>\n'
    '                  <p className="text-[11px] text-purple-700 dark:text-purple-300 mt-1">\n'
    '                    PayFlow automatiza el envío del enlace y registra la confirmación recibida. El dinero lo procesa y confirma el proveedor del comercio.\n'
    '                  </p>\n'
    '                </div>',
    "explicación de rol",
)

# Extend provider choices and add external/confirmation fields inside existing payment card
dialog = replace_once(
    dialog,
    '                            <SelectItem value="payphone">PayPhone API Link</SelectItem>\n'
    '                            <SelectItem value="mock">Mock (simulación)</SelectItem>',
    '                            <SelectItem value="payphone">PayPhone</SelectItem>\n'
    '                            <SelectItem value="external">Enlace o proveedor propio</SelectItem>',
    "opciones de proveedor",
)

amount_grid_end = '''                    </div>
                    {modules.amount_mode === "fixed" && ('''
insert_payment_fields = '''                    </div>

                    {modules.payment_provider === "external" && (
                      <div className="rounded-lg border border-sky-200 dark:border-sky-500/30 bg-sky-50/60 dark:bg-sky-500/10 p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Nombre del proveedor</Label>
                            <Input
                              value={modules.external_provider_name}
                              onChange={(e) =>
                                setModules((m) => ({
                                  ...m,
                                  external_provider_name: e.target.value,
                                }))
                              }
                              placeholder="Ej: Datafast, Kushki o banco del negocio"
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Enlace de pago del negocio</Label>
                            <Input
                              type="url"
                              value={modules.external_payment_url}
                              onChange={(e) =>
                                setModules((m) => ({
                                  ...m,
                                  external_payment_url: e.target.value,
                                }))
                              }
                              placeholder="https://..."
                              className={cn(
                                "h-9 text-sm font-mono",
                                modules.external_payment_url &&
                                  !isValidHttpsUrl(modules.external_payment_url) &&
                                  "border-rose-400"
                              )}
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-sky-700 dark:text-sky-300">
                          No ingreses claves, tokens ni credenciales aquí. Los secretos de una API se configuran únicamente en el servidor.
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs">¿Quién confirma que el pago fue aprobado?</Label>
                      <Select
                        value={modules.payment_confirmation_mode}
                        onValueChange={(v) =>
                          setModules((m) => ({
                            ...m,
                            payment_confirmation_mode: v as PaymentConfirmationMode,
                          }))
                        }
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="provider_webhook">
                            Confirmación automática del proveedor (API/webhook)
                          </SelectItem>
                          <SelectItem value="merchant_manual">
                            Confirmación manual por el comercio
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">
                        PayFlow no decide si el dinero llegó. Solo registra la señal del proveedor o la acción del usuario autorizado del comercio.
                      </p>
                    </div>

                    {modules.payment_confirmation_mode === "provider_webhook" &&
                      modules.payment_provider === "external" && (
                        <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
                          <p className="text-[11px] text-amber-800 dark:text-amber-300">
                            La confirmación automática quedará pendiente hasta conectar y probar la API o webhook del proveedor. El flujo no marcará el pago como aprobado sin esa señal.
                          </p>
                        </div>
                      )}

                    {modules.amount_mode === "fixed" && ('''
dialog = replace_once(dialog, amount_grid_end, insert_payment_fields, "campos externos y confirmación")

# Only show technical PayPhone status for PayPhone
dialog = replace_once(
    dialog,
    '                {modules.uses_payments && (\n'
    '                  <div className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50/40 dark:bg-violet-500/5 p-4 space-y-3">',
    '                {modules.uses_payments && modules.payment_provider === "payphone" && (\n'
    '                  <div className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50/40 dark:bg-violet-500/5 p-4 space-y-3">',
    "panel técnico PayPhone",
)

# Validation and payload
dialog = replace_once(
    dialog,
    '    if (!form.business_name.trim() || !form.whatsapp_number.trim()) {\n'
    '      toast.error("Faltan datos del negocio (nombre y WhatsApp)");\n'
    '      setStep(2);\n'
    '      return;\n'
    '    }\n'
    '    setSubmitting(true);',
    '    if (!form.business_name.trim() || !form.whatsapp_number.trim()) {\n'
    '      toast.error("Faltan datos del negocio (nombre y WhatsApp)");\n'
    '      setStep(2);\n'
    '      return;\n'
    '    }\n'
    '    if (\n'
    '      modules.uses_payments &&\n'
    '      modules.payment_provider === "external" &&\n'
    '      !isValidHttpsUrl(modules.external_payment_url.trim())\n'
    '    ) {\n'
    '      toast.error("Ingresa un enlace de pago externo válido que empiece con https://");\n'
    '      setStep(4);\n'
    '      return;\n'
    '    }\n'
    '    setSubmitting(true);',
    "validación al crear",
)

dialog = replace_once(
    dialog,
    '        payment_required: modules.uses_payments,\n'
    '        payment_provider: modules.uses_payments ? modules.payment_provider : "none",\n'
    '        amount_mode: modules.amount_mode,',
    '        payment_required: modules.uses_payments,\n'
    '        payment_provider: modules.uses_payments ? modules.payment_provider : "none",\n'
    '        payment_confirmation_mode: modules.uses_payments\n'
    '          ? modules.payment_confirmation_mode\n'
    '          : "merchant_manual",\n'
    '        external_provider_name:\n'
    '          modules.payment_provider === "external" ? modules.external_provider_name.trim() : "",\n'
    '        external_payment_url:\n'
    '          modules.payment_provider === "external" ? modules.external_payment_url.trim() : "",\n'
    '        amount_mode: modules.amount_mode,',
    "payload de cobros",
)

dialog = replace_once(
    dialog,
    '    if (step === 2 && (!form.business_name.trim() || !form.whatsapp_number.trim())) {\n'
    '      toast.error("Completa los campos obligatorios (*): nombre y WhatsApp");\n'
    '      return;\n'
    '    }\n'
    '    setStep((s) => Math.min(5, s + 1) as Step);',
    '    if (step === 2 && (!form.business_name.trim() || !form.whatsapp_number.trim())) {\n'
    '      toast.error("Completa los campos obligatorios (*): nombre y WhatsApp");\n'
    '      return;\n'
    '    }\n'
    '    if (\n'
    '      step === 4 &&\n'
    '      modules.uses_payments &&\n'
    '      modules.payment_provider === "external" &&\n'
    '      !isValidHttpsUrl(modules.external_payment_url.trim())\n'
    '    ) {\n'
    '      toast.error("Ingresa un enlace de pago externo válido que empiece con https://");\n'
    '      return;\n'
    '    }\n'
    '    setStep((s) => Math.min(5, s + 1) as Step);',
    "validación al avanzar",
)

# Generic summary
dialog = regex_once(
    dialog,
    r'''                <SummaryRow\n                  icon=\{Bot\}\n                  title="Módulos"\n                  value=\{`Agente IA \(\$\{modules\.agent_mode\}\)`\}\n                  sub=\{\[.*?                  \]\.filter\(\(x\): x is string => Boolean\(x\)\)\}\n                />''',
    textwrap.dedent('''
                <SummaryRow
                  icon={Bot}
                  title="Módulos y cobros"
                  value={`Agente IA (${modules.agent_mode})`}
                  sub={[
                    modules.uses_agenda && "Agenda",
                    modules.uses_catalog && "Catálogo",
                    modules.uses_payments &&
                      (modules.payment_provider === "payphone"
                        ? "Cobros: PayPhone"
                        : `Cobros: ${modules.external_provider_name.trim() || "proveedor propio"}`),
                    modules.uses_payments &&
                      (modules.payment_confirmation_mode === "provider_webhook"
                        ? "Confirmación: proveedor mediante API/webhook"
                        : "Confirmación: usuario autorizado del comercio"),
                    modules.payment_provider === "external" &&
                      modules.external_payment_url &&
                      `Enlace: ${modules.external_payment_url}`,
                    modules.uses_payments &&
                      (modules.amount_mode === "fixed"
                        ? `Monto: $${modules.fixed_amount}`
                        : "Monto: calculado según el pedido"),
                    !modules.uses_agenda &&
                      !modules.uses_catalog &&
                      !modules.uses_payments &&
                      "Solo IA (sin módulos adicionales)",
                  ].filter((x): x is string => Boolean(x))}
                />''').strip(),
    "resumen de módulos",
    flags=re.S,
)

dialog = replace_once(
    dialog,
    '                      Estás listo para crear el flujo. Se generarán los nodos y conexiones\n'
    '                      automáticamente. Podrás editarlos después en el editor visual.',
    '                      Revisa los datos antes de crear el flujo. PayFlow automatizará la atención y el envío del enlace; la aprobación del pago seguirá perteneciendo al proveedor o al comercio, según la opción elegida.',
    "mensaje de revisión",
)

write(dialog_path, dialog)

# -----------------------------------------------------------------------------
# API validation
# -----------------------------------------------------------------------------
route_path = "src/app/api/workflows/create-from-template/route.ts"
route = read(route_path)
route = replace_once(
    route,
    'export const dynamic = "force-dynamic";\n',
    'export const dynamic = "force-dynamic";\n\n'
    'function isSafeExternalPaymentUrl(value: string): boolean {\n'
    '  try {\n'
    '    const url = new URL(value);\n'
    '    if (url.protocol !== "https:" || url.username || url.password) return false;\n'
    '    const hostname = url.hostname.toLowerCase();\n'
    '    return !["localhost", "127.0.0.1", "::1"].includes(hostname);\n'
    '  } catch {\n'
    '    return false;\n'
    '  }\n'
    '}\n',
    "validador de URL en API",
)
route = replace_once(
    route,
    '      payment_provider: body.payment_provider === "none" ? "none" : body.payment_provider === "mock" ? "mock" : "payphone",\n'
    '      payment_required: body.payment_required !== false,',
    '      payment_provider:\n'
    '        body.payment_provider === "none"\n'
    '          ? "none"\n'
    '          : body.payment_provider === "external"\n'
    '          ? "external"\n'
    '          : body.payment_provider === "mock"\n'
    '          ? "mock"\n'
    '          : "payphone",\n'
    '      payment_confirmation_mode:\n'
    '        body.payment_confirmation_mode === "merchant_manual"\n'
    '          ? "merchant_manual"\n'
    '          : "provider_webhook",\n'
    '      external_provider_name: sanitizeText(body.external_provider_name || "").slice(0, 120),\n'
    '      external_payment_url:\n'
    '        typeof body.external_payment_url === "string"\n'
    '          ? body.external_payment_url.trim().slice(0, 2048)\n'
    '          : "",\n'
    '      payment_required: body.payment_required !== false,',
    "parámetros externos",
)
route = replace_once(
    route,
    '    if (!params.business_name) return NextResponse.json({ error: "business_name es obligatorio." }, { status: 400 });\n'
    '    if (!params.whatsapp_number) return NextResponse.json({ error: "whatsapp_number es obligatorio." }, { status: 400 });\n',
    '    if (!params.business_name) return NextResponse.json({ error: "business_name es obligatorio." }, { status: 400 });\n'
    '    if (!params.whatsapp_number) return NextResponse.json({ error: "whatsapp_number es obligatorio." }, { status: 400 });\n'
    '    if (\n'
    '      params.payment_required &&\n'
    '      params.payment_provider === "external" &&\n'
    '      !isSafeExternalPaymentUrl(params.external_payment_url || "")\n'
    '    ) {\n'
    '      return NextResponse.json(\n'
    '        { error: "El enlace de pago externo debe ser una URL HTTPS válida." },\n'
    '        { status: 400 }\n'
    '      );\n'
    '    }\n',
    "validación externa",
)
write(route_path, route)

# -----------------------------------------------------------------------------
# Flow generator
# -----------------------------------------------------------------------------
templates_path = "src/lib/flow-templates.ts"
templates = read(templates_path)
templates = replace_once(
    templates,
    '  payment_provider: "none" | "payphone" | "mock";\n  payment_required: boolean;',
    '  payment_provider: "none" | "payphone" | "external" | "mock";\n'
    '  payment_confirmation_mode?: "provider_webhook" | "merchant_manual";\n'
    '  external_provider_name?: string;\n'
    '  external_payment_url?: string;\n'
    '  payment_required: boolean;',
    "tipos del generador",
)
templates = replace_once(
    templates,
    '  { id: "ia_payphone", name: "4. IA + PayPhone", description: "WhatsApp + Agente IA + Crear pago PayPhone API Link." },\n'
    '  { id: "ia_agenda_payphone", name: "5. IA + Agenda + PayPhone", description: "WhatsApp + Agente IA + agenda + cobro con PayPhone." },\n'
    '  { id: "agente_completo", name: "6. Agente comercial completo", description: "Responde, vende, agenda, cobra y deriva a humano." },',
    '  { id: "ia_payphone", name: "4. IA + Cobros", description: "WhatsApp + Agente IA + enlace de pago del negocio." },\n'
    '  { id: "ia_agenda_payphone", name: "5. IA + Agenda + Cobros", description: "WhatsApp + Agente IA + agenda + enlace de anticipo o pago." },\n'
    '  { id: "agente_completo", name: "6. Agente comercial completo", description: "Responde, vende, agenda, comparte el enlace y deriva a humano." },',
    "nombres del generador",
)

external_sequence = r'''
function externalPaymentSequence(
  params: FlowTemplateParams,
  sourceId: string,
  x: number,
  y: number,
  successMessage = "✅ Pago confirmado por el proveedor. ¡Gracias!"
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const step = 280;
  const providerName = params.external_provider_name?.trim() || "el proveedor del comercio";
  const paymentUrl = params.external_payment_url?.trim() || "{{external_payment_url}}";
  const confirmationMode = params.payment_confirmation_mode || "merchant_manual";
  const waLink = waNode(
    "WhatsApp enlace del comercio",
    `💳 Completa el pago con ${providerName}: ${paymentUrl}`,
    params.whatsapp_number,
    x,
    y
  );
  const wait: FlowNode = {
    id: nid(),
    type: "wait_confirmation",
    position: { x: x + step, y },
    data: {
      label:
        confirmationMode === "provider_webhook"
          ? `Esperar confirmación de ${providerName}`
          : "Esperar confirmación del comercio",
      timeout: 900,
      confirmationMode,
      paymentProvider: "external",
      paymentUrl,
    },
  };

  if (confirmationMode === "merchant_manual") {
    const pending = waNode(
      "WhatsApp pago pendiente",
      "⏳ Tu pedido fue recibido y queda pendiente de confirmación por el comercio.",
      params.whatsapp_number,
      x + step * 2,
      y
    );
    const notifyMerchant = waNode(
      "Aviso al comercio",
      `Nuevo pedido pendiente de confirmación. Revisa ${providerName} antes de avanzar el pedido.`,
      params.whatsapp_number,
      x + step * 3,
      y
    );
    const end = endNode(x + step * 4, y);
    return {
      nodes: [waLink, wait, pending, notifyMerchant, end],
      edges: [
        edge(sourceId, waLink.id),
        edge(waLink.id, wait.id),
        edge(wait.id, pending.id),
        edge(pending.id, notifyMerchant.id),
        edge(notifyMerchant.id, end.id),
      ],
    };
  }

  const verify: FlowNode = {
    id: nid(),
    type: "verify_payment",
    position: { x: x + step * 2, y },
    data: {
      label: `Validar señal de ${providerName}`,
      orderId: "{{payment_order_id}}",
      outputVariable: "payment_status",
      provider: "API externa",
      confirmationMode: "provider_webhook",
      integrationStatus: "requires_provider_adapter",
    },
  };
  const success = waNode("WhatsApp confirmado por proveedor", successMessage, params.whatsapp_number, x + step * 3, y - 180);
  const failed = waNode("WhatsApp rechazado por proveedor", `❌ ${providerName} informó que el pago fue rechazado.`, params.whatsapp_number, x + step * 3, y - 60);
  const pending = waNode("WhatsApp pendiente de proveedor", `⏳ ${providerName} todavía no confirma el pago.`, params.whatsapp_number, x + step * 3, y + 60);
  const error = waNode("WhatsApp sin confirmación válida", `⚠️ No recibimos una confirmación válida de ${providerName}. El comercio revisará el caso.`, params.whatsapp_number, x + step * 3, y + 180);
  const end = endNode(x + step * 4, y);

  return {
    nodes: [waLink, wait, verify, success, failed, pending, error, end],
    edges: [
      edge(sourceId, waLink.id),
      edge(waLink.id, wait.id),
      edge(wait.id, verify.id),
      edge(verify.id, success.id, "payment_success"),
      edge(verify.id, failed.id, "payment_failed"),
      edge(verify.id, pending.id, "payment_pending"),
      edge(verify.id, error.id, "error"),
      edge(success.id, end.id),
      edge(failed.id, end.id),
      edge(pending.id, end.id),
      edge(error.id, end.id),
    ],
  };
}

'''
templates = replace_once(
    templates,
    'function paymentSequence(\n  params: FlowTemplateParams,',
    external_sequence + 'function paymentSequence(\n  params: FlowTemplateParams,',
    "secuencia externa",
)
templates = replace_once(
    templates,
    '): { nodes: FlowNode[]; edges: FlowEdge[] } {\n  const step = 280;\n  const pay = createPaymentNode(params, x, y)!;',
    '): { nodes: FlowNode[]; edges: FlowEdge[] } {\n'
    '  if (params.payment_provider === "external") {\n'
    '    return externalPaymentSequence(params, sourceId, x, y, successMessage);\n'
    '  }\n'
    '  const step = 280;\n'
    '  const pay = createPaymentNode(params, x, y)!;',
    "selección de secuencia externa",
)
write(templates_path, templates)

# -----------------------------------------------------------------------------
# Flows page wording
# -----------------------------------------------------------------------------
flows_path = "src/app/dashboard/flujos/page.tsx"
flows = read(flows_path)
flows = replace_once(
    flows,
    '    if (lower === "payphone") return "PayPhone API Link";\n'
    '    if (lower === "mock") return "Mock (simulación)";',
    '    if (lower === "payphone") return "PayPhone";\n'
    '    if (lower === "external" || lower === "api externa") return "Enlace del comercio";\n'
    '    if (lower === "mock") return "Mock (simulación)";',
    "etiqueta externa",
)
flows = replace_once(
    flows,
    '          <p className="text-muted-foreground mt-1">Canales de pago automatizados por WhatsApp</p>',
    '          <p className="text-muted-foreground mt-1">Automatiza atención, pedidos y enlaces de pago por WhatsApp</p>',
    "descripción de Flujos",
)
write(flows_path, flows)

print("Onboarding flexible aplicado correctamente")
