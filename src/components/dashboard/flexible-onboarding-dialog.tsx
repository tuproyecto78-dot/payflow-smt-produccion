"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageCircle,
  Package,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CreateFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (workflowId: string, projectId: string) => void;
  projectId?: string;
}

type Step = 1 | 2 | 3 | 4 | 5;
type TemplateId =
  | "solo_ia"
  | "ia_agenda"
  | "ia_catalogo"
  | "ia_payphone"
  | "ia_agenda_payphone"
  | "agente_completo";
type PaymentProvider = "none" | "payphone" | "external";
type ConfirmationMode = "provider_webhook" | "merchant_manual";
type AgentMode = "vender" | "cobrar" | "agendar" | "completo";
type FileStatus = "pendiente" | "procesando" | "listo" | "error";

interface FileEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  type: "pdf" | "excel" | "csv" | "txt";
  status: FileStatus;
  error?: string;
}

interface KnowledgeSummary {
  products: number;
  services: number;
  faqs: number;
  schedules: number;
  policies: number;
  sourceCount: number;
}

const STEP_LABELS = [
  "Objetivo",
  "Negocio y WhatsApp",
  "Catálogo",
  "Cobros y módulos",
  "Revisión",
] as const;

const TEMPLATES: Array<{
  id: TemplateId;
  title: string;
  description: string;
  badge: string;
  icon: typeof Bot;
}> = [
  {
    id: "solo_ia",
    title: "Atención con IA",
    description: "Responde consultas y deriva a una persona cuando sea necesario.",
    badge: "Sin pagos",
    icon: MessageCircle,
  },
  {
    id: "ia_agenda",
    title: "IA + Agenda",
    description: "Atiende consultas y organiza solicitudes de citas.",
    badge: "Agenda",
    icon: CalendarClock,
  },
  {
    id: "ia_catalogo",
    title: "IA + Catálogo",
    description: "Usa productos, precios, promociones y políticas del negocio.",
    badge: "Catálogo",
    icon: ShoppingCart,
  },
  {
    id: "ia_payphone",
    title: "IA + Cobros",
    description: "Comparte un enlace de pago y espera la confirmación correspondiente.",
    badge: "Cobros",
    icon: CreditCard,
  },
  {
    id: "ia_agenda_payphone",
    title: "Agenda + Cobros",
    description: "Coordina citas y comparte un enlace para anticipos o pagos.",
    badge: "Agenda y cobros",
    icon: CalendarClock,
  },
  {
    id: "agente_completo",
    title: "Agente completo",
    description: "Atiende, vende, agenda, comparte enlaces y deriva a humano.",
    badge: "Completo",
    icon: Sparkles,
  },
];

const BUSINESS_TYPES = [
  "Restaurante",
  "Comercio",
  "Ecommerce",
  "Clínica",
  "Consultorio",
  "Servicios profesionales",
  "Salón de belleza",
  "Spa",
  "Educación",
  "Bienes raíces",
  "Otro",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "xlsx", "xls", "csv", "txt"]);

function fileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileType(name: string): FileEntry["type"] | null {
  const extension = name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.has(extension)) return null;
  if (extension === "pdf") return "pdf";
  if (extension === "xlsx" || extension === "xls") return "excel";
  if (extension === "csv") return "csv";
  return "txt";
}

function validWhatsapp(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value.trim());
}

function validHttpsUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function newFileId() {
  return `knowledge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function CreateFlowDialog({
  open,
  onOpenChange,
  onCreated,
  projectId,
}: CreateFlowDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [templateId, setTemplateId] = useState<TemplateId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [business, setBusiness] = useState({
    name: "",
    type: "Restaurante",
    productOrService: "",
    whatsapp: "",
    hours: "Lun-Sáb 09h00-18h00",
    welcomeMessage: "",
    agentTone: "amable",
  });

  const [catalogNotes, setCatalogNotes] = useState("");
  const [promotions, setPromotions] = useState("");

  const [modules, setModules] = useState({
    usesAgenda: false,
    usesCatalog: false,
    paymentProvider: "none" as PaymentProvider,
    confirmationMode: "provider_webhook" as ConfirmationMode,
    externalProviderName: "",
    externalPaymentUrl: "",
    amountMode: "variable" as "fixed" | "variable",
    fixedAmount: 0,
    agentMode: "completo" as AgentMode,
  });

  const [payphoneStatus, setPayphoneStatus] = useState<{
    loading: boolean;
    checked: boolean;
    configured: boolean;
    message: string;
  }>({ loading: false, checked: false, configured: false, message: "" });

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === templateId),
    [templateId]
  );

  const reset = useCallback(() => {
    setStep(1);
    setTemplateId(null);
    setSubmitting(false);
    setProcessing(false);
    setDragging(false);
    setFiles([]);
    setKnowledge(null);
    setBusiness({
      name: "",
      type: "Restaurante",
      productOrService: "",
      whatsapp: "",
      hours: "Lun-Sáb 09h00-18h00",
      welcomeMessage: "",
      agentTone: "amable",
    });
    setCatalogNotes("");
    setPromotions("");
    setModules({
      usesAgenda: false,
      usesCatalog: false,
      paymentProvider: "none",
      confirmationMode: "provider_webhook",
      externalProviderName: "",
      externalPaymentUrl: "",
      amountMode: "variable",
      fixedAmount: 0,
      agentMode: "completo",
    });
    setPayphoneStatus({ loading: false, checked: false, configured: false, message: "" });
  }, []);

  useEffect(() => {
    if (!open) {
      const timeout = window.setTimeout(reset, 160);
      return () => window.clearTimeout(timeout);
    }
  }, [open, reset]);

  useEffect(() => {
    if (step !== 4 || modules.paymentProvider !== "payphone" || payphoneStatus.checked) {
      return;
    }

    let cancelled = false;
    setPayphoneStatus((current) => ({ ...current, loading: true }));
    fetch("/api/payphone/config/status", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (cancelled) return;
        const configured = response.ok && data.configured === true;
        setPayphoneStatus({
          loading: false,
          checked: true,
          configured,
          message: configured
            ? "PayPhone está listo para generar enlaces."
            : "PayPhone todavía necesita configuración de servidor.",
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPayphoneStatus({
          loading: false,
          checked: true,
          configured: false,
          message: "No se pudo verificar PayPhone en este momento.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [step, modules.paymentProvider, payphoneStatus.checked]);

  function chooseTemplate(id: TemplateId) {
    setTemplateId(id);
    const usesAgenda = id === "ia_agenda" || id === "ia_agenda_payphone" || id === "agente_completo";
    const usesCatalog = id === "ia_catalogo" || id === "agente_completo";
    const usesPayments = id === "ia_payphone" || id === "ia_agenda_payphone" || id === "agente_completo";
    setModules((current) => ({
      ...current,
      usesAgenda,
      usesCatalog,
      paymentProvider: usesPayments ? "payphone" : "none",
      confirmationMode: "provider_webhook",
      agentMode:
        id === "ia_agenda"
          ? "agendar"
          : id === "ia_catalogo"
          ? "vender"
          : id === "ia_payphone"
          ? "cobrar"
          : "completo",
    }));
  }

  function addFiles(fileList: FileList | File[]) {
    const next: FileEntry[] = [];
    let rejected = 0;

    for (const file of Array.from(fileList)) {
      const type = fileType(file.name);
      if (!type || file.size > MAX_FILE_SIZE) {
        rejected += 1;
        continue;
      }
      next.push({
        id: newFileId(),
        file,
        name: file.name,
        size: file.size,
        type,
        status: "pendiente",
      });
    }

    if (next.length) {
      setFiles((current) => [...current, ...next]);
      toast.success(`${next.length} archivo(s) añadido(s).`);
    }
    if (rejected) {
      toast.warning(
        `${rejected} archivo(s) no se añadieron. Usa PDF, Excel, CSV o TXT de hasta 10 MB.`
      );
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  async function processKnowledge() {
    if (!files.length && !catalogNotes.trim() && !promotions.trim()) {
      toast.info("Puedes subir archivos o continuar y completar el catálogo después.");
      return;
    }

    setProcessing(true);
    setFiles((current) =>
      current.map((entry) => ({ ...entry, status: "procesando" as FileStatus }))
    );

    try {
      const { readFileContent } = await import("@/lib/file-content-reader");
      const sources: Array<{
        source_id: string;
        type: "pdf" | "excel" | "csv" | "txt" | "manual";
        name: string;
        rawText?: string;
        rows?: Record<string, string>[];
        headers?: string[];
      }> = [];
      const updated: FileEntry[] = [];

      for (const entry of files) {
        try {
          const extracted = await readFileContent(entry.file, entry.id);
          sources.push(extracted);
          updated.push({ ...entry, status: "listo" });
        } catch (error) {
          updated.push({
            ...entry,
            status: "error",
            error: error instanceof Error ? error.message : "No se pudo leer el archivo.",
          });
        }
      }

      const manualText = [
        catalogNotes.trim() ? `CATÁLOGO Y LISTA DE PRECIOS:\n${catalogNotes.trim()}` : "",
        promotions.trim() ? `PROMOCIONES VIGENTES:\n${promotions.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      if (manualText) {
        sources.push({
          source_id: "manual_catalog",
          type: "manual",
          name: "Información escrita por el negocio",
          rawText: manualText,
        });
      }

      setFiles(updated);
      if (!sources.length) throw new Error("No se pudo leer ninguna fuente.");

      const response = await fetch("/api/knowledge/process", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.merged) {
        throw new Error(data.error || "No se pudo procesar el catálogo.");
      }

      const merged = data.merged as {
        products?: unknown[];
        services?: unknown[];
        faqs?: unknown[];
        business_hours?: unknown[];
        policies?: unknown[];
      };
      setKnowledge({
        products: merged.products?.length || 0,
        services: merged.services?.length || 0,
        faqs: merged.faqs?.length || 0,
        schedules: merged.business_hours?.length || 0,
        policies: merged.policies?.length || 0,
        sourceCount: sources.length,
      });
      setModules((current) => ({ ...current, usesCatalog: true }));
      toast.success("Catálogo procesado. Revisa el resumen antes de continuar.");
    } catch (error) {
      console.error("[flexible-onboarding] knowledge error", error);
      setFiles((current) =>
        current.map((entry) =>
          entry.status === "procesando"
            ? { ...entry, status: "error", error: "Error de procesamiento" }
            : entry
        )
      );
      toast.error(error instanceof Error ? error.message : "No se pudo procesar el catálogo.");
    } finally {
      setProcessing(false);
    }
  }

  function canAdvance() {
    if (step === 1 && !templateId) {
      toast.error("Selecciona el objetivo principal del flujo.");
      return false;
    }
    if (step === 2) {
      if (!business.name.trim()) {
        toast.error("Ingresa el nombre del negocio.");
        return false;
      }
      if (!validWhatsapp(business.whatsapp)) {
        toast.error("Ingresa WhatsApp con código de país, por ejemplo +593987654321.");
        return false;
      }
    }
    if (step === 4 && modules.paymentProvider === "external") {
      if (!modules.externalProviderName.trim()) {
        toast.error("Indica el nombre del proveedor de pago del negocio.");
        return false;
      }
      if (!validHttpsUrl(modules.externalPaymentUrl)) {
        toast.error("Ingresa un enlace de pago válido que empiece con https://");
        return false;
      }
    }
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    setStep((current) => Math.min(5, current + 1) as Step);
  }

  function back() {
    setStep((current) => Math.max(1, current - 1) as Step);
  }

  async function submit() {
    if (!canAdvance() || !templateId) return;
    setSubmitting(true);

    try {
      const knowledgeSummary = knowledge
        ? `${knowledge.products} productos, ${knowledge.services} servicios, ${knowledge.faqs} preguntas frecuentes y ${knowledge.sourceCount} fuentes procesadas`
        : [catalogNotes.trim(), promotions.trim()].filter(Boolean).join(" · ").slice(0, 1000);

      const response = await fetch("/api/workflows/create-flexible-onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          templateId,
          businessName: business.name,
          businessType: business.type,
          productOrService: business.productOrService,
          welcomeMessage:
            business.welcomeMessage ||
            `¡Hola! 👋 Bienvenido a ${business.name}. ¿Cómo podemos ayudarte?`,
          whatsappNumber: business.whatsapp,
          businessHours: business.hours,
          agentTone: business.agentTone,
          agentMode: modules.agentMode,
          usesAgenda: modules.usesAgenda,
          usesCatalog: modules.usesCatalog,
          paymentProvider: modules.paymentProvider,
          confirmationMode: modules.confirmationMode,
          externalProviderName: modules.externalProviderName,
          externalPaymentUrl: modules.externalPaymentUrl,
          amountMode: modules.amountMode,
          fixedAmount: modules.fixedAmount,
          knowledgeSummary,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "No se pudo crear el flujo.");
      }

      toast.success(data.message || "Flujo creado correctamente.");
      onCreated(data.workflow_id, data.project_id);
      onOpenChange(false);
    } catch (error) {
      console.error("[flexible-onboarding] submit error", error);
      toast.error(error instanceof Error ? error.message : "No se pudo crear el flujo.");
    } finally {
      setSubmitting(false);
    }
  }

  const paymentLabel =
    modules.paymentProvider === "none"
      ? "Sin pagos en el flujo"
      : modules.paymentProvider === "payphone"
      ? "PayPhone"
      : modules.externalProviderName || "Proveedor propio";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] max-h-[900px] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 sm:px-7 pt-5 pb-4 border-b bg-gradient-to-r from-purple-50/80 via-background to-sky-50/60 dark:from-purple-950/30 dark:to-sky-950/20">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Configura tu automatización</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cinco pasos claros. Nada técnico que el negocio no necesite ver.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5 mt-4">
            {STEP_LABELS.map((label, index) => {
              const number = index + 1;
              const completed = number < step;
              const active = number === step;
              return (
                <div key={label} className="min-w-0">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-colors",
                      completed || active ? "bg-purple-500" : "bg-muted"
                    )}
                  />
                  <p
                    className={cn(
                      "text-[10px] mt-1.5 truncate",
                      active ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {number}. {label}
                  </p>
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">¿Qué quieres automatizar primero?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Esto prepara una configuración inicial; podrás ajustarla en los pasos siguientes.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {TEMPLATES.map((template) => {
                  const Icon = template.icon;
                  const selected = templateId === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => chooseTemplate(template.id)}
                      className={cn(
                        "text-left rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm",
                        selected
                          ? "border-purple-400 bg-purple-50 dark:bg-purple-500/10 ring-2 ring-purple-200 dark:ring-purple-500/20"
                          : "border-border bg-card hover:border-purple-300"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="size-9 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center">
                          <Icon className="size-4.5 text-purple-600 dark:text-purple-300" />
                        </div>
                        {selected && (
                          <div className="size-6 rounded-full bg-purple-500 text-white flex items-center justify-center">
                            <Check className="size-3.5" />
                          </div>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm mt-3">{template.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {template.description}
                      </p>
                      <Badge variant="secondary" className="mt-3 text-[10px]">
                        {template.badge}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold">Datos esenciales del negocio</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Pedimos solo lo necesario para que el agente se presente y atienda correctamente.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nombre del negocio *</Label>
                  <Input
                    value={business.name}
                    onChange={(event) =>
                      setBusiness((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Ej: Sabor Cuencano"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de negocio</Label>
                  <Select
                    value={business.type}
                    onValueChange={(value) =>
                      setBusiness((current) => ({ ...current, type: value }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Producto o servicio principal</Label>
                  <Input
                    value={business.productOrService}
                    onChange={(event) =>
                      setBusiness((current) => ({
                        ...current,
                        productOrService: event.target.value,
                      }))
                    }
                    placeholder="Ej: Pedidos de comida y promociones"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>WhatsApp del negocio *</Label>
                  <Input
                    value={business.whatsapp}
                    onChange={(event) =>
                      setBusiness((current) => ({ ...current, whatsapp: event.target.value }))
                    }
                    placeholder="+593987654321"
                    className={cn(
                      "font-mono",
                      business.whatsapp && !validWhatsapp(business.whatsapp) && "border-rose-400"
                    )}
                  />
                  <p className="text-[10px] text-muted-foreground">Incluye el código de país.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Horario mostrado al cliente</Label>
                  <Input
                    value={business.hours}
                    onChange={(event) =>
                      setBusiness((current) => ({ ...current, hours: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tono del agente</Label>
                  <Select
                    value={business.agentTone}
                    onValueChange={(value) =>
                      setBusiness((current) => ({ ...current, agentTone: value }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amable">Amable</SelectItem>
                      <SelectItem value="profesional">Profesional</SelectItem>
                      <SelectItem value="cercano">Cercano</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="comercial">Comercial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Mensaje de bienvenida</Label>
                <Textarea
                  value={business.welcomeMessage}
                  onChange={(event) =>
                    setBusiness((current) => ({
                      ...current,
                      welcomeMessage: event.target.value,
                    }))
                  }
                  placeholder={`¡Hola! 👋 Bienvenido a ${business.name || "nuestro negocio"}. ¿Cómo podemos ayudarte?`}
                  rows={3}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Carga tu catálogo e información</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Puedes subir listas de precios, menús, promociones y políticas. Este paso es opcional.
                  </p>
                </div>
                <Badge variant="outline">Puedes hacerlo después</Badge>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
                }}
                onDrop={onDrop}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragging(false);
                }}
                className={cn(
                  "rounded-2xl border-2 border-dashed p-7 text-center cursor-pointer transition-colors",
                  dragging
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-500/10"
                    : "border-border hover:border-purple-300 hover:bg-muted/30"
                )}
              >
                <Upload className="size-8 mx-auto text-purple-500" />
                <p className="text-sm font-medium mt-3">Arrastra archivos o selecciónalos</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, Excel, CSV y TXT · máximo 10 MB por archivo
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((entry) => (
                    <div key={entry.id} className="rounded-xl border bg-card px-3 py-2.5 flex items-center gap-3">
                      <div className="size-9 rounded-lg bg-muted flex items-center justify-center">
                        {entry.type === "excel" || entry.type === "csv" ? (
                          <FileSpreadsheet className="size-4" />
                        ) : (
                          <FileText className="size-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{entry.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {entry.type.toUpperCase()} · {fileSize(entry.size)}
                          {entry.error ? ` · ${entry.error}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px]",
                          entry.status === "listo" && "bg-emerald-100 text-emerald-700",
                          entry.status === "error" && "bg-rose-100 text-rose-700"
                        )}
                      >
                        {entry.status === "procesando" && <Loader2 className="size-3 mr-1 animate-spin" />}
                        {entry.status}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setFiles((current) => current.filter((file) => file.id !== entry.id))}
                        aria-label="Eliminar archivo"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Lista de precios o información adicional</Label>
                  <Textarea
                    value={catalogNotes}
                    onChange={(event) => setCatalogNotes(event.target.value)}
                    placeholder="Producto, descripción, precio, disponibilidad..."
                    rows={5}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Promociones vigentes</Label>
                  <Textarea
                    value={promotions}
                    onChange={(event) => setPromotions(event.target.value)}
                    placeholder="Ej: 2x1 los martes, envío gratis desde $20..."
                    rows={5}
                  />
                </div>
              </div>

              <Button
                type="button"
                onClick={processKnowledge}
                disabled={processing}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white"
              >
                {processing ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="size-4 mr-2" />
                )}
                Procesar y revisar información
              </Button>

              {knowledge && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-emerald-600" />
                    <p className="text-sm font-semibold">Información detectada</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                    {[
                      ["Productos", knowledge.products],
                      ["Servicios", knowledge.services],
                      ["FAQs", knowledge.faqs],
                      ["Horarios", knowledge.schedules],
                      ["Políticas", knowledge.policies],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg bg-background/70 border px-2 py-2 text-center">
                        <p className="font-semibold">{value}</p>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50/60 dark:bg-purple-500/10 p-4">
                <h2 className="text-sm font-semibold">PayFlow automatiza; el proveedor confirma</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  PayFlow comparte el enlace y registra la señal recibida. No recibe, custodia ni aprueba el dinero del comercio.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <ModuleToggle
                  icon={CalendarClock}
                  title="Agenda"
                  description="Permite coordinar solicitudes de citas."
                  checked={modules.usesAgenda}
                  onCheckedChange={(checked) =>
                    setModules((current) => ({ ...current, usesAgenda: checked }))
                  }
                />
                <ModuleToggle
                  icon={Package}
                  title="Catálogo"
                  description="Usa productos, precios y promociones cargados."
                  checked={modules.usesCatalog}
                  onCheckedChange={(checked) =>
                    setModules((current) => ({ ...current, usesCatalog: checked }))
                  }
                />
              </div>

              <div>
                <Label className="text-sm font-semibold">¿Cómo cobra este negocio?</Label>
                <div className="grid sm:grid-cols-3 gap-3 mt-2">
                  <PaymentOption
                    title="Sin pagos"
                    description="El flujo atiende y toma pedidos sin enviar un enlace."
                    selected={modules.paymentProvider === "none"}
                    onClick={() =>
                      setModules((current) => ({ ...current, paymentProvider: "none" }))
                    }
                  />
                  <PaymentOption
                    title="PayPhone"
                    description="PayFlow genera el enlace mediante la integración existente."
                    selected={modules.paymentProvider === "payphone"}
                    onClick={() =>
                      setModules((current) => ({
                        ...current,
                        paymentProvider: "payphone",
                        confirmationMode: "provider_webhook",
                      }))
                    }
                  />
                  <PaymentOption
                    title="Proveedor propio"
                    description="El negocio usa su enlace de pago actual."
                    selected={modules.paymentProvider === "external"}
                    onClick={() =>
                      setModules((current) => ({ ...current, paymentProvider: "external" }))
                    }
                  />
                </div>
              </div>

              {modules.paymentProvider === "payphone" && (
                <div
                  className={cn(
                    "rounded-xl border p-4 flex items-start gap-3",
                    payphoneStatus.configured
                      ? "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-500/10"
                      : "border-amber-200 bg-amber-50/60 dark:bg-amber-500/10"
                  )}
                >
                  {payphoneStatus.loading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : payphoneStatus.configured ? (
                    <ShieldCheck className="size-5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="size-5 text-amber-600" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">Estado de PayPhone</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {payphoneStatus.loading ? "Verificando configuración..." : payphoneStatus.message}
                    </p>
                  </div>
                </div>
              )}

              {modules.paymentProvider === "external" && (
                <div className="rounded-xl border border-sky-200 dark:border-sky-500/30 bg-sky-50/50 dark:bg-sky-500/10 p-4 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Nombre del proveedor *</Label>
                      <Input
                        value={modules.externalProviderName}
                        onChange={(event) =>
                          setModules((current) => ({
                            ...current,
                            externalProviderName: event.target.value,
                          }))
                        }
                        placeholder="Ej: Datafast, Kushki o banco"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Enlace de pago del negocio *</Label>
                      <Input
                        type="url"
                        value={modules.externalPaymentUrl}
                        onChange={(event) =>
                          setModules((current) => ({
                            ...current,
                            externalPaymentUrl: event.target.value,
                          }))
                        }
                        placeholder="https://..."
                        className={cn(
                          "font-mono",
                          modules.externalPaymentUrl &&
                            !validHttpsUrl(modules.externalPaymentUrl) &&
                            "border-rose-400"
                        )}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-sky-800 dark:text-sky-200">
                    No ingreses tokens, claves ni credenciales. Las conexiones API se configuran únicamente en el servidor.
                  </p>
                </div>
              )}

              {modules.paymentProvider !== "none" && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>¿Quién confirma el pago?</Label>
                    <Select
                      value={modules.confirmationMode}
                      onValueChange={(value) =>
                        setModules((current) => ({
                          ...current,
                          confirmationMode: value as ConfirmationMode,
                        }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="provider_webhook">Proveedor mediante API/webhook</SelectItem>
                        <SelectItem value="merchant_manual">Usuario autorizado del comercio</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Sin esta señal, el pedido permanece pendiente.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Monto</Label>
                    <Select
                      value={modules.amountMode}
                      onValueChange={(value) =>
                        setModules((current) => ({
                          ...current,
                          amountMode: value as "fixed" | "variable",
                        }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="variable">Se calcula según el pedido</SelectItem>
                        <SelectItem value="fixed">Monto fijo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {modules.amountMode === "fixed" && (
                    <div className="space-y-1.5">
                      <Label>Monto fijo en USD</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={modules.fixedAmount}
                        onChange={(event) =>
                          setModules((current) => ({
                            ...current,
                            fixedAmount: Number(event.target.value),
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              )}

              {modules.paymentProvider === "external" &&
                modules.confirmationMode === "provider_webhook" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      La confirmación automática quedará pendiente hasta conectar y probar la API o webhook de ese proveedor. El flujo no simulará una aprobación.
                    </p>
                  </div>
                )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">Revisa antes de crear el flujo</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Todo lo que puede afectar la operación queda visible en un solo lugar.
                </p>
              </div>

              <ReviewCard
                icon={Sparkles}
                title="Objetivo"
                value={selectedTemplate?.title || "Sin seleccionar"}
                details={[selectedTemplate?.description || ""]}
              />
              <ReviewCard
                icon={Building2}
                title="Negocio"
                value={business.name || "—"}
                details={[
                  business.type,
                  `WhatsApp: ${business.whatsapp || "—"}`,
                  `Horario: ${business.hours || "—"}`,
                ]}
              />
              <ReviewCard
                icon={Package}
                title="Catálogo"
                value={
                  knowledge
                    ? `${knowledge.sourceCount} fuente(s) procesada(s)`
                    : files.length
                    ? `${files.length} archivo(s) pendientes de revisión`
                    : "Se completará después"
                }
                details={
                  knowledge
                    ? [
                        `${knowledge.products} productos`,
                        `${knowledge.services} servicios`,
                        `${knowledge.faqs} preguntas frecuentes`,
                      ]
                    : []
                }
              />
              <ReviewCard
                icon={CreditCard}
                title="Cobros"
                value={paymentLabel}
                details={
                  modules.paymentProvider === "none"
                    ? ["PayFlow no enviará enlaces de pago."]
                    : [
                        modules.confirmationMode === "provider_webhook"
                          ? "Confirmación: API/webhook del proveedor"
                          : "Confirmación: usuario autorizado del comercio",
                        modules.paymentProvider === "external"
                          ? `Enlace: ${modules.externalPaymentUrl}`
                          : "Integración PayPhone del servidor",
                        "Sin confirmación válida, el pedido permanece pendiente.",
                      ]
                }
              />

              <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="size-5 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Responsabilidades separadas</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      PayFlow automatiza la atención, distribuye el enlace y registra la señal. El proveedor o el comercio confirma el pago; PayFlow no recibe ni custodia fondos.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator />
        <DialogFooter className="px-5 sm:px-7 py-3 gap-2">
          <Button type="button" variant="outline" onClick={back} disabled={step === 1 || submitting}>
            <ArrowLeft className="size-4 mr-1" /> Atrás
          </Button>
          <span className="hidden sm:block text-[11px] text-muted-foreground mx-auto self-center">
            Paso {step} de 5
          </span>
          {step < 5 ? (
            <Button type="button" onClick={next} className="bg-purple-500 hover:bg-purple-600 text-white">
              Siguiente <ArrowRight className="size-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="bg-purple-500 hover:bg-purple-600 text-white"
            >
              {submitting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Sparkles className="size-4 mr-2" />}
              Crear flujo
            </Button>
          )}
        </DialogFooter>

        {submitting && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
            <Loader2 className="size-9 animate-spin text-purple-500" />
            <p className="font-semibold mt-3">Creando tu automatización…</p>
            <p className="text-xs text-muted-foreground mt-1">Validando nodos y responsabilidades.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModuleToggle({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className={cn("rounded-xl border p-3 flex items-center gap-3", checked && "border-purple-300 bg-purple-50/60 dark:bg-purple-500/10")}>
      <div className="size-9 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center">
        <Icon className="size-4 text-purple-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PaymentOption({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-purple-400 bg-purple-50 dark:bg-purple-500/10"
          : "border-border bg-card hover:border-purple-300"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <div className={cn("size-5 rounded-full border flex items-center justify-center", selected && "border-purple-500 bg-purple-500 text-white")}>
          {selected && <Check className="size-3" />}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
    </button>
  );
}

function ReviewCard({
  icon: Icon,
  title,
  value,
  details,
}: {
  icon: typeof Bot;
  title: string;
  value: string;
  details: string[];
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
      <div className="size-10 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center">
        <Icon className="size-4.5 text-purple-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-sm font-semibold mt-0.5 break-words">{value}</p>
        {details.filter(Boolean).length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {details.filter(Boolean).map((detail) => (
              <li key={detail} className="text-[11px] text-muted-foreground break-words">· {detail}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
