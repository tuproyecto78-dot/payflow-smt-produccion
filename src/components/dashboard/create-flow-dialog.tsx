"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Info,
  Lightbulb,
  Loader2,
  MessageSquare,
  Package,
  Shield,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;
type FileStatus = "pendiente" | "cargado" | "procesando" | "listo" | "error";
type AgentTone = "amable" | "profesional" | "cercano" | "formal";
type AgentMode = "vender" | "cobrar" | "agendar" | "completo";
type PaymentProvider = "none" | "payphone" | "mock";
type AmountMode = "fixed" | "variable";
type TemplateId =
  | "solo_ia"
  | "ia_agenda"
  | "ia_catalogo"
  | "ia_payphone"
  | "ia_agenda_payphone"
  | "agente_completo";

interface DetectedProduct {
  name: string;
  price?: number;
  currency?: string;
  stock?: number;
  sku?: string;
  category?: string;
  description?: string;
  _approved?: boolean;
  _ignored?: boolean;
}

interface DetectedService {
  name: string;
  durationMinutes?: number;
  price?: number;
  currency?: string;
  category?: string;
  _approved?: boolean;
  _ignored?: boolean;
}

interface DetectedFaq {
  question: string;
  answer: string;
  _approved?: boolean;
  _ignored?: boolean;
}

interface DetectedBusinessHour {
  day: string;
  open: string;
  close: string;
  _approved?: boolean;
  _ignored?: boolean;
}

interface DetectedPolicy {
  text: string;
  _approved?: boolean;
  _ignored?: boolean;
}

interface DetectedKnowledge {
  products: DetectedProduct[];
  services: DetectedService[];
  faqs: DetectedFaq[];
  business_hours: DetectedBusinessHour[];
  policies: DetectedPolicy[];
  prices: Array<{ item: string; price: number; currency?: string }>;
  stock_items: Array<{ name: string; stock: number }>;
  address: string;
  human_handoff_rules: string[];
  payment_conditions: string[];
  appointment_conditions: string[];
  unknown: string[];
}

interface Recommendation {
  recommended_template: TemplateId;
  reason: string;
  detected_modules: string[];
  missing_data: string[];
  confidence_score: number;
  template_name: string;
  suggested_config?: {
    uses_catalog?: boolean;
    uses_agenda?: boolean;
    payment_required?: boolean;
    payment_provider?: PaymentProvider;
    agent_mode?: AgentMode;
  };
}

interface UploadedFile {
  id: string;
  file: File;
  name: string;
  type: "pdf" | "excel" | "csv" | "txt" | "unknown";
  size: number;
  status: FileStatus;
  error?: string;
}

interface CreateFlowDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (workflowId: string, projectId: string) => void;
  projectId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────

const TEMPLATES: Array<{
  id: TemplateId;
  name: string;
  icon: typeof MessageSquare;
  desc: string;
  tag: string;
  color: string;
}> = [
  { id: "solo_ia", name: "Solo IA", icon: MessageSquare, desc: "WhatsApp + IA + respuesta + humano", tag: "Sin pagos", color: "emerald" },
  { id: "ia_agenda", name: "IA + Agenda", icon: CalendarClock, desc: "WhatsApp + IA + agenda de citas", tag: "Agenda", color: "sky" },
  { id: "ia_catalogo", name: "IA + Catálogo", icon: ShoppingCart, desc: "WhatsApp + IA + productos", tag: "Catálogo", color: "amber" },
  { id: "ia_payphone", name: "IA + PayPhone", icon: CreditCard, desc: "WhatsApp + IA + cobro PayPhone", tag: "PayPhone", color: "violet" },
  { id: "ia_agenda_payphone", name: "IA + Agenda + PayPhone", icon: CalendarCheck, desc: "Citas + cobro de anticipo", tag: "Agenda + PayPhone", color: "rose" },
  { id: "agente_completo", name: "Agente completo", icon: Bot, desc: "Vende, cobra, agenda y deriva", tag: "Completo", color: "purple" },
];

const STEP_LABELS = ["Plantilla", "Negocio", "Conocimiento", "Módulos", "Resumen"] as const;

const AGENT_TONES: Array<{ value: AgentTone; label: string; desc: string }> = [
  { value: "amable", label: "Amable", desc: "Cercano y empático" },
  { value: "profesional", label: "Profesional", desc: "Formal y directo" },
  { value: "cercano", label: "Cercano", desc: "Informal y conversacional" },
  { value: "formal", label: "Formal", desc: "Serio y respetuoso" },
];

const MANUAL_FIELDS: Array<{
  key: string;
  label: string;
  placeholder: string;
  rows?: number;
  icon: typeof Info;
}> = [
  { key: "business_info", label: "Información del negocio", placeholder: "Descripción general, misión, visión...", rows: 3, icon: Building2 },
  { key: "services_text", label: "Servicios", placeholder: "Lista de servicios que ofreces...", rows: 3, icon: Package },
  { key: "faq_text", label: "Preguntas frecuentes (FAQ)", placeholder: "P: ¿...?\nR: ...", rows: 3, icon: HelpCircle },
  { key: "business_hours_info", label: "Horarios de atención", placeholder: "Lun-Vie 9-18h, Sáb 10-14h...", rows: 2, icon: Clock },
  { key: "address", label: "Dirección", placeholder: "Av. Principal 123, Ciudad", rows: 2, icon: Building2 },
  { key: "policies", label: "Políticas", placeholder: "Políticas de devolución, garantía...", rows: 2, icon: Shield },
  { key: "purchase_conditions", label: "Condiciones de compra", placeholder: "Condiciones de compra...", rows: 2, icon: ShoppingCart },
  { key: "agenda_conditions", label: "Condiciones de agenda", placeholder: "Anticipo, cancelación, no-show...", rows: 2, icon: CalendarClock },
  { key: "public_promotions", label: "Promociones públicas", placeholder: "Promociones vigentes...", rows: 2, icon: Tag },
  { key: "agent_instructions", label: "Instrucciones del agente", placeholder: "Reglas adicionales para el agente IA...", rows: 3, icon: Bot },
  { key: "human_rules", label: "Reglas para derivar a humano", placeholder: "Cuándo derivar a un humano...", rows: 2, icon: MessageSquare },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_EXTENSIONS = ".pdf,.xlsx,.xls,.csv,.txt";

const COLOR_BADGE: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400 border-sky-200 dark:border-sky-500/30",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400 border-violet-200 dark:border-violet-500/30",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border-rose-200 dark:border-rose-500/30",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400 border-purple-200 dark:border-purple-500/30",
};

const COLOR_ICON_BG: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
};

const STATUS_BADGE: Record<FileStatus, { label: string; class: string }> = {
  pendiente: { label: "Pendiente", class: "bg-muted text-muted-foreground" },
  cargado: { label: "Cargado", class: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" },
  procesando: { label: "Procesando", class: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  listo: { label: "Listo", class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  error: { label: "Error", class: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400" },
};

// ─── Helpers ──────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function detectFileType(name: string): UploadedFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "pdf";
  if (ext === "xlsx" || ext === "xls") return "excel";
  if (ext === "csv") return "csv";
  if (ext === "txt") return "txt";
  return "unknown";
}

function fileIcon(type: UploadedFile["type"]) {
  if (type === "pdf" || type === "txt") return FileText;
  return FileSpreadsheet;
}

function genId(): string {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const EMPTY_MANUAL: Record<string, string> = {
  business_info: "",
  services_text: "",
  faq_text: "",
  business_hours_info: "",
  address: "",
  policies: "",
  purchase_conditions: "",
  agenda_conditions: "",
  public_promotions: "",
  agent_instructions: "",
  human_rules: "",
};

// ─── Sub-component: StepIndicator ─────────────────────────────────────

function StepIndicator({ step, completed }: { step: Step; completed: number[] }) {
  return (
    <div className="flex items-center justify-between w-full py-1 select-none">
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as Step;
        const isCurrent = step === n;
        const isPast = n < step;
        const isCompleted = completed.includes(n);
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 min-w-[58px] sm:min-w-[80px]">
              <div
                className={cn(
                  "size-8 sm:size-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all",
                  isCurrent &&
                    "bg-purple-500 border-purple-500 text-white shadow-md shadow-purple-500/30 scale-110",
                  isPast &&
                    "bg-purple-100 dark:bg-purple-500/20 border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-300",
                  !isCurrent &&
                    !isPast &&
                    "bg-card border-border text-muted-foreground"
                )}
              >
                {isCompleted || isPast ? <Check className="size-4" /> : n}
              </div>
              <span
                className={cn(
                  "text-[10px] sm:text-xs font-medium text-center leading-tight",
                  isCurrent
                    ? "text-purple-600 dark:text-purple-400"
                    : isPast
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-1 sm:mx-2 transition-all rounded-full -mt-5",
                  n < step ? "bg-purple-400 dark:bg-purple-500/50" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-component: ImportPreviewModal ────────────────────────────────

interface ImportPreviewModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detected: DetectedKnowledge | null;
  onConfirm: (approved: DetectedKnowledge) => Promise<void> | void;
  onIgnore: () => void;
  importing: boolean;
}

function ImportPreviewModal({
  open,
  onOpenChange,
  detected,
  onConfirm,
  onIgnore,
  importing,
}: ImportPreviewModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [local, setLocal] = useState<DetectedKnowledge | null>(null);
  // Track which detected object we've already initialized from (avoids setState-in-effect)
  const [initializedFrom, setInitializedFrom] = useState<DetectedKnowledge | null>(null);

  // Adjust state during render when modal opens with new detected data
  // (canonical "store info from previous render" pattern — see React docs)
  if (open && detected && detected !== initializedFrom) {
    setInitializedFrom(detected);
    const initApproved = <T extends { _approved?: boolean; _ignored?: boolean }>(
      arr: T[]
    ): T[] => arr.map((item) => ({ ...item, _approved: true, _ignored: false }));
    setLocal({
      ...detected,
      products: initApproved(detected.products),
      services: initApproved(detected.services),
      business_hours: initApproved(detected.business_hours),
      faqs: initApproved(detected.faqs),
      policies: initApproved(detected.policies),
    });
    setEditMode(false);
  }

  if (!open || !local) return null;

  function toggleItem(
    category: "products" | "services" | "business_hours" | "faqs" | "policies",
    idx: number
  ) {
    if (!local) return;
    const arr = [...local[category]];
    const item = arr[idx];
    const newIgnored = !item._ignored;
    arr[idx] = { ...item, _ignored: newIgnored, _approved: !newIgnored };
    setLocal({ ...local, [category]: arr });
  }

  function setAll(
    category: "products" | "services" | "business_hours" | "faqs" | "policies",
    approve: boolean
  ) {
    if (!local) return;
    setLocal({
      ...local,
      [category]: local[category].map((item) => ({
        ...item,
        _ignored: !approve,
        _approved: approve,
      })),
    });
  }

  const counts = {
    products: local.products.filter((p) => !p._ignored).length,
    services: local.services.filter((s) => !s._ignored).length,
    hours: local.business_hours.filter((h) => !h._ignored).length,
    faqs: local.faqs.filter((f) => !f._ignored).length,
    policies: local.policies.filter((p) => !p._ignored).length,
  };
  const totalApproved =
    counts.products + counts.services + counts.hours + counts.faqs + counts.policies;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="size-5 text-purple-500" />
            Vista previa de conocimiento detectado
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Revisa lo que detectamos en tus archivos. Puedes editar, ignorar o confirmar la importación.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pf-scroll pr-1 -mr-1 space-y-3">
          <DetectedSection
            title="Productos"
            icon={Package}
            color="amber"
            count={local.products.length}
            approvedCount={counts.products}
            editMode={editMode}
            onApproveAll={() => setAll("products", true)}
            onIgnoreAll={() => setAll("products", false)}
            emptyText="No se detectaron productos."
          >
            {local.products.map((p, i) => (
              <DetectedItem
                key={`p-${i}`}
                editMode={editMode}
                ignored={!!p._ignored}
                onToggle={() => toggleItem("products", i)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground mt-0.5">
                    {p.price !== undefined && (
                      <span>
                        ${p.price}
                        {p.currency ? ` ${p.currency}` : ""}
                      </span>
                    )}
                    {p.stock !== undefined && <span>Stock: {p.stock}</span>}
                    {p.sku && <span>SKU: {p.sku}</span>}
                    {p.category && <span>{p.category}</span>}
                  </div>
                </div>
              </DetectedItem>
            ))}
          </DetectedSection>

          <DetectedSection
            title="Servicios"
            icon={CalendarClock}
            color="sky"
            count={local.services.length}
            approvedCount={counts.services}
            editMode={editMode}
            onApproveAll={() => setAll("services", true)}
            onIgnoreAll={() => setAll("services", false)}
            emptyText="No se detectaron servicios."
          >
            {local.services.map((s, i) => (
              <DetectedItem
                key={`s-${i}`}
                editMode={editMode}
                ignored={!!s._ignored}
                onToggle={() => toggleItem("services", i)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{s.name}</p>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground mt-0.5">
                    {s.durationMinutes && <span>{s.durationMinutes} min</span>}
                    {s.price !== undefined && <span>${s.price}</span>}
                    {s.category && <span>{s.category}</span>}
                  </div>
                </div>
              </DetectedItem>
            ))}
          </DetectedSection>

          <DetectedSection
            title="Horarios"
            icon={Clock}
            color="emerald"
            count={local.business_hours.length}
            approvedCount={counts.hours}
            editMode={editMode}
            onApproveAll={() => setAll("business_hours", true)}
            onIgnoreAll={() => setAll("business_hours", false)}
            emptyText="No se detectaron horarios."
          >
            {local.business_hours.map((h, i) => (
              <DetectedItem
                key={`h-${i}`}
                editMode={editMode}
                ignored={!!h._ignored}
                onToggle={() => toggleItem("business_hours", i)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm capitalize">{h.day}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {h.open} - {h.close}
                  </p>
                </div>
              </DetectedItem>
            ))}
          </DetectedSection>

          <DetectedSection
            title="Preguntas frecuentes"
            icon={HelpCircle}
            color="violet"
            count={local.faqs.length}
            approvedCount={counts.faqs}
            editMode={editMode}
            onApproveAll={() => setAll("faqs", true)}
            onIgnoreAll={() => setAll("faqs", false)}
            emptyText="No se detectaron FAQs."
          >
            {local.faqs.map((f, i) => (
              <DetectedItem
                key={`f-${i}`}
                editMode={editMode}
                ignored={!!f._ignored}
                onToggle={() => toggleItem("faqs", i)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">P: {f.question}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">R: {f.answer}</p>
                </div>
              </DetectedItem>
            ))}
          </DetectedSection>

          <DetectedSection
            title="Políticas"
            icon={Shield}
            color="rose"
            count={local.policies.length}
            approvedCount={counts.policies}
            editMode={editMode}
            onApproveAll={() => setAll("policies", true)}
            onIgnoreAll={() => setAll("policies", false)}
            emptyText="No se detectaron políticas."
          >
            {local.policies.map((p, i) => (
              <DetectedItem
                key={`po-${i}`}
                editMode={editMode}
                ignored={!!p._ignored}
                onToggle={() => toggleItem("policies", i)}
              >
                <p className="flex-1 min-w-0 text-sm">{p.text}</p>
              </DetectedItem>
            ))}
          </DetectedSection>
        </div>

        <DialogFooter className="gap-2 flex-wrap sm:flex-nowrap border-t pt-4">
          <div className="text-xs text-muted-foreground mr-auto flex items-center gap-1.5">
            <Info className="size-3.5" />
            <span>{totalApproved} elemento(s) serán importados</span>
          </div>
          <Button variant="outline" size="sm" onClick={onIgnore} disabled={importing}>
            Ignorar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditMode((m) => !m)}
            disabled={importing}
          >
            <Edit3 className="size-4 mr-1.5" />
            {editMode ? "Guardar cambios" : "Editar"}
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(local)}
            disabled={importing || totalApproved === 0}
            className="bg-purple-500 hover:bg-purple-600 text-white"
          >
            {importing ? (
              <Loader2 className="size-4 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4 mr-1.5" />
            )}
            Confirmar importación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetectedSection({
  title,
  icon: Icon,
  color,
  count,
  approvedCount,
  editMode,
  onApproveAll,
  onIgnoreAll,
  emptyText,
  children,
}: {
  title: string;
  icon: typeof Info;
  color: string;
  count: number;
  approvedCount: number;
  editMode: boolean;
  onApproveAll: () => void;
  onIgnoreAll: () => void;
  emptyText: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "size-6 rounded-md flex items-center justify-center",
              COLOR_ICON_BG[color]
            )}
          >
            <Icon className="size-3.5" />
          </div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <Badge variant="secondary" className="text-[10px] h-5">
            {approvedCount}/{count}
          </Badge>
        </div>
        {editMode && count > 0 && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] px-2"
              onClick={onApproveAll}
            >
              Aprobar todos
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] px-2"
              onClick={onIgnoreAll}
            >
              Ignorar todos
            </Button>
          </div>
        )}
      </div>
      <div className="p-2 space-y-1.5 max-h-72 overflow-y-auto pf-scroll">
        {count === 0 ? (
          <p className="text-xs text-muted-foreground italic px-2 py-3 text-center">
            {emptyText}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function DetectedItem({
  editMode,
  ignored,
  onToggle,
  children,
}: {
  editMode: boolean;
  ignored: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-all",
        ignored
          ? "border-border/50 bg-muted/20 opacity-50"
          : "border-border bg-background hover:bg-muted/30"
      )}
    >
      {editMode && (
        <button
          onClick={onToggle}
          className={cn(
            "mt-0.5 size-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
            !ignored
              ? "bg-purple-500 border-purple-500 text-white"
              : "bg-card border-border"
          )}
          aria-label={ignored ? "Aprobar" : "Ignorar"}
          type="button"
        >
          {!ignored && <Check className="size-3" />}
        </button>
      )}
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────

export function CreateFlowDialog({
  open,
  onOpenChange,
  onCreated,
  projectId,
}: CreateFlowDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);

  // Step 2: Business form
  const [form, setForm] = useState({
    business_name: "",
    business_type: "",
    product_or_service: "",
    welcome_message: "",
    whatsapp_number: "",
    business_hours: "",
    agent_tone: "amable" as AgentTone,
  });

  // Step 3: Knowledge
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [detected, setDetected] = useState<DetectedKnowledge | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>({ ...EMPTY_MANUAL });
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recommendationDismissed, setRecommendationDismissed] = useState(false);

  // Step 4: Modules
  const [modules, setModules] = useState({
    uses_agenda: false,
    uses_catalog: false,
    uses_payphone: false,
    payment_provider: "payphone" as PaymentProvider,
    amount_mode: "fixed" as AmountMode,
    fixed_amount: 49.99,
    agent_mode: "completo" as AgentMode,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // ─── Reset ──────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep(1);
    setSelectedTemplate(null);
    setSubmitting(false);
    setCreating(false);
    setForm({
      business_name: "",
      business_type: "",
      product_or_service: "",
      welcome_message: "",
      whatsapp_number: "",
      business_hours: "",
      agent_tone: "amable",
    });
    setFiles([]);
    setProcessing(false);
    setImporting(false);
    setDetected(null);
    setShowPreview(false);
    setManual({ ...EMPTY_MANUAL });
    setRecommendation(null);
    setRecommendationDismissed(false);
    setModules({
      uses_agenda: false,
      uses_catalog: false,
      uses_payphone: false,
      payment_provider: "payphone",
      amount_mode: "fixed",
      fixed_amount: 49.99,
      agent_mode: "completo",
    });
  }, []);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      // small delay to allow close animation
      const t = setTimeout(() => reset(), 150);
      return () => clearTimeout(t);
    }
  }, [open, reset]);

  // ─── Template selection ─────────────────────────────────────────────

  function applyTemplate(id: TemplateId) {
    setSelectedTemplate(id);
    switch (id) {
      case "solo_ia":
        setModules((m) => ({
          ...m,
          uses_agenda: false,
          uses_catalog: false,
          uses_payphone: false,
          payment_provider: "none",
          agent_mode: "completo",
        }));
        break;
      case "ia_agenda":
        setModules((m) => ({
          ...m,
          uses_agenda: true,
          uses_catalog: false,
          uses_payphone: false,
          payment_provider: "none",
          agent_mode: "agendar",
        }));
        break;
      case "ia_catalogo":
        setModules((m) => ({
          ...m,
          uses_agenda: false,
          uses_catalog: true,
          uses_payphone: false,
          payment_provider: "none",
          agent_mode: "vender",
        }));
        break;
      case "ia_payphone":
        setModules((m) => ({
          ...m,
          uses_agenda: false,
          uses_catalog: false,
          uses_payphone: true,
          payment_provider: "payphone",
          agent_mode: "cobrar",
        }));
        break;
      case "ia_agenda_payphone":
        setModules((m) => ({
          ...m,
          uses_agenda: true,
          uses_catalog: false,
          uses_payphone: true,
          payment_provider: "payphone",
          agent_mode: "agendar",
        }));
        break;
      case "agente_completo":
        setModules((m) => ({
          ...m,
          uses_agenda: true,
          uses_catalog: true,
          uses_payphone: true,
          payment_provider: "payphone",
          agent_mode: "completo",
        }));
        break;
    }
    setStep(2);
  }

  // ─── File handlers ──────────────────────────────────────────────────

  function addFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    const newFiles: UploadedFile[] = [];
    let rejected = 0;
    for (const f of arr) {
      const type = detectFileType(f.name);
      if (type === "unknown") {
        rejected++;
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`"${f.name}" supera el límite de 10MB`);
        continue;
      }
      newFiles.push({
        id: genId(),
        file: f,
        name: f.name,
        type,
        size: f.size,
        status: "cargado",
      });
    }
    if (rejected > 0) {
      toast.warning(
        `${rejected} archivo(s) con tipo no soportado. Solo PDF, Excel, CSV, TXT.`
      );
    }
    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      toast.success(`${newFiles.length} archivo(s) añadido(s)`);
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
  }

  // ─── Process knowledge ──────────────────────────────────────────────

  async function processKnowledge() {
    if (files.length === 0) {
      toast.error("Sube al menos un archivo para procesar.");
      return;
    }
    setProcessing(true);
    setFiles((prev) => prev.map((f) => ({ ...f, status: "procesando" as FileStatus })));

    try {
      // Dynamic import to avoid loading xlsx until needed
      const { readFileContent } = await import("@/lib/file-content-reader");

      const sources: Array<{
        source_id: string;
        type: "pdf" | "excel" | "csv" | "txt" | "manual";
        name: string;
        rawText?: string;
        rows?: Record<string, string>[];
        headers?: string[];
      }> = [];

      const updatedFiles: UploadedFile[] = [];
      for (const f of files) {
        try {
          const extracted = await readFileContent(f.file, f.id);
          sources.push({
            source_id: extracted.source_id,
            type: extracted.type,
            name: extracted.name,
            rawText: extracted.rawText,
            rows: extracted.rows,
            headers: extracted.headers,
          });
          updatedFiles.push({ ...f, status: "listo" });
        } catch (err) {
          console.error(`[processKnowledge] error reading ${f.name}:`, err);
          updatedFiles.push({
            ...f,
            status: "error",
            error: err instanceof Error ? err.message : "Error leyendo archivo",
          });
        }
      }
      setFiles(updatedFiles);

      // Build manual text source from the 11 manual fields
      const manualParts: string[] = [];
      const fieldLabels: Record<string, string> = {
        business_info: "INFORMACIÓN DEL NEGOCIO",
        services_text: "SERVICIOS",
        faq_text: "FAQ",
        business_hours_info: "HORARIOS",
        address: "DIRECCIÓN",
        policies: "POLÍTICAS",
        purchase_conditions: "CONDICIONES DE COMPRA",
        agenda_conditions: "CONDICIONES DE AGENDA",
        public_promotions: "PROMOCIONES",
        agent_instructions: "INSTRUCCIONES DEL AGENTE",
        human_rules: "REGLAS PARA DERIVAR A HUMANO",
      };
      for (const [key, label] of Object.entries(fieldLabels)) {
        const v = manual[key];
        if (v && v.trim()) manualParts.push(`${label}:\n${v.trim()}`);
      }
      const manualText = manualParts.join("\n\n");
      if (manualText.trim()) {
        sources.push({
          source_id: "manual_input",
          type: "manual",
          name: "Texto manual",
          rawText: manualText,
        });
      }

      if (sources.length === 0) {
        toast.error("No se pudo leer ningún archivo. Verifica el formato.");
        setProcessing(false);
        return;
      }

      // Send to /api/knowledge/process
      const res = await fetch("/api/knowledge/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Error al procesar conocimiento");
      }

      const merged: DetectedKnowledge = data.merged;
      setDetected(merged);
      setShowPreview(true);
      toast.success(
        `Conocimiento procesado: ${merged.products.length} productos, ${merged.services.length} servicios, ${merged.faqs.length} FAQs`
      );
    } catch (err) {
      console.error("[processKnowledge] error:", err);
      toast.error(
        err instanceof Error ? err.message : "Error al procesar el conocimiento"
      );
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "procesando"
            ? { ...f, status: "error", error: "Error" }
            : f
        )
      );
    } finally {
      setProcessing(false);
    }
  }

  // ─── Confirm import ─────────────────────────────────────────────────

  async function confirmImport(approved: DetectedKnowledge) {
    setImporting(true);
    try {
      // Call /api/knowledge/import (best-effort)
      try {
        const importPayload = {
          knowledgeOnly: true,
          products: approved.products
            .filter((p) => !p._ignored)
            .map(({ _approved, _ignored, ...rest }) => ({ ...rest, _approved: true })),
          services: approved.services
            .filter((s) => !s._ignored)
            .map(({ _approved, _ignored, ...rest }) => ({ ...rest, _approved: true })),
          business_hours: approved.business_hours
            .filter((h) => !h._ignored)
            .map(({ _approved, _ignored, ...rest }) => ({ ...rest, _approved: true })),
          faqs: approved.faqs
            .filter((f) => !f._ignored)
            .map(({ _approved, _ignored, ...rest }) => ({ ...rest, _approved: true })),
          policies: approved.policies
            .filter((p) => !p._ignored)
            .map(({ _approved, _ignored, ...rest }) => ({ ...rest, _approved: true })),
        };

        const importRes = await fetch("/api/knowledge/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(importPayload),
        });
        if (importRes.ok) {
          const importData = await importRes.json();
          if (importData.ok) {
            toast.success(
              `Conocimiento importado: ${importData.summary?.faq_chunks_created || 0} chunk(s) guardados`
            );
          }
        } else {
          toast.warning(
            "No se pudo importar a la base de datos, pero se usará para el flujo."
          );
        }
      } catch (importErr) {
        console.warn("[confirmImport] import error (non-fatal):", importErr);
        toast.warning(
          "No se pudo importar a la base de datos, pero se usará para el flujo."
        );
      }

      // Call /api/knowledge/recommend (best-effort)
      try {
        const recRes = await fetch("/api/knowledge/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            detected: approved,
            paymentRequired: modules.uses_payphone,
          }),
        });
        if (recRes.ok) {
          const recData = await recRes.json();
          setRecommendation(recData);
          setRecommendationDismissed(false);
        }
      } catch (recErr) {
        console.warn("[confirmImport] recommend error (non-fatal):", recErr);
      }

      setShowPreview(false);
      setDetected(approved);
      toast.success("Conocimiento confirmado.");
    } catch (err) {
      console.error("[confirmImport] error:", err);
      toast.error("Error al confirmar la importación");
    } finally {
      setImporting(false);
    }
  }

  function ignoreImport() {
    setShowPreview(false);
    toast.info(
      "Importación ignorada. El conocimiento detectado se mantendrá para el flujo."
    );
  }

  function applyRecommendation() {
    if (!recommendation) return;
    applyTemplate(recommendation.recommended_template);
    setRecommendationDismissed(true);
    toast.success(`Plantilla recomendada aplicada: ${recommendation.template_name}`);
  }

  // ─── Submit ─────────────────────────────────────────────────────────

  async function submit() {
    if (!selectedTemplate) {
      toast.error("Selecciona una plantilla");
      setStep(1);
      return;
    }
    if (!form.business_name.trim() || !form.whatsapp_number.trim()) {
      toast.error("Faltan datos del negocio (nombre y WhatsApp)");
      setStep(2);
      return;
    }
    setSubmitting(true);
    setCreating(true);

    try {
      const payload = {
        templateId: selectedTemplate,
        projectId: projectId || undefined,
        // Business fields
        business_name: form.business_name,
        business_type: form.business_type,
        product_or_service: form.product_or_service,
        welcome_message: form.welcome_message,
        whatsapp_number: form.whatsapp_number,
        business_hours: form.business_hours,
        agent_tone: form.agent_tone,
        // Knowledge manual fields
        ...manual,
        // Knowledge files (metadata only — content was extracted client-side)
        knowledge_files: files.map((f) => ({
          source_id: f.id,
          name: f.name,
          type: f.type,
          size: f.size,
          status: f.status,
        })),
        // Detected knowledge
        detected_knowledge: detected,
        // Modules / payment
        payment_required: modules.uses_payphone,
        payment_provider: modules.uses_payphone ? modules.payment_provider : "none",
        amount_mode: modules.amount_mode,
        fixed_amount: modules.fixed_amount,
        currency: "USD",
        agent_mode: modules.agent_mode,
      };

      const res = await fetch("/api/workflows/create-from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al crear el flujo");
      }
      toast.success(data.message || "Flujo creado");
      const wid = data.workflow_id;
      const pid = data.project_id;
      onOpenChange(false);
      onCreated(wid, pid);
    } catch (err) {
      console.error("[submit] error:", err);
      toast.error(err instanceof Error ? err.message : "Error al crear el flujo");
    } finally {
      setSubmitting(false);
      setCreating(false);
    }
  }

  // ─── Step navigation ────────────────────────────────────────────────

  const completedSteps: number[] = [];
  if (selectedTemplate) completedSteps.push(1);
  if (form.business_name.trim() && form.whatsapp_number.trim()) completedSteps.push(2);
  if (files.length > 0 || Object.values(manual).some((v) => v.trim())) completedSteps.push(3);
  if (selectedTemplate) completedSteps.push(4);

  function next() {
    if (step === 1 && !selectedTemplate) {
      toast.error("Selecciona una plantilla");
      return;
    }
    if (step === 2 && (!form.business_name.trim() || !form.whatsapp_number.trim())) {
      toast.error("Completa los campos obligatorios (*): nombre y WhatsApp");
      return;
    }
    setStep((s) => Math.min(5, s + 1) as Step);
  }

  function back() {
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!submitting) onOpenChange(o);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[92vh] flex flex-col rounded-2xl gap-0 p-0">
          {/* Header with title + step indicator */}
          <div className="px-4 sm:px-6 pt-5 pb-3 shrink-0">
            <DialogHeader className="space-y-0">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg mb-3">
                <Sparkles className="size-5 text-purple-500" />
                Crear flujo automático
              </DialogTitle>
            </DialogHeader>
            <StepIndicator step={step} completed={completedSteps} />
          </div>

          <Separator />

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto pf-scroll px-4 sm:px-6 py-4">
            {/* ─── Step 1: Plantilla ──────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-3">
                {/* Recommendation banner */}
                {recommendation && !recommendationDismissed && (
                  <div className="rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <div className="size-9 rounded-lg bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center shrink-0">
                        <Lightbulb className="size-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                            Recomendación basada en tu conocimiento
                          </h4>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-300"
                            )}
                          >
                            {Math.round(recommendation.confidence_score * 100)}% confianza
                          </Badge>
                        </div>
                        <p className="text-xs text-purple-800 dark:text-purple-300 mt-1 leading-relaxed">
                          {recommendation.reason}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={applyRecommendation}
                            className="h-7 text-xs bg-purple-500 hover:bg-purple-600 text-white"
                          >
                            <Wand2 className="size-3.5 mr-1" />
                            Aplicar: {recommendation.template_name}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRecommendationDismissed(true)}
                            className="h-7 text-xs text-purple-700 dark:text-purple-300"
                          >
                            Elegir manualmente
                          </Button>
                        </div>
                        {recommendation.missing_data.length > 0 && (
                          <div className="mt-2 text-[11px] text-purple-700/80 dark:text-purple-300/80">
                            <span className="font-medium">Datos faltantes:</span>{" "}
                            {recommendation.missing_data.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Elige una plantilla para empezar. Cada una preconfigura los módulos necesarios.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {TEMPLATES.map((tpl) => {
                    const Icon = tpl.icon;
                    const isSelected = selectedTemplate === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => applyTemplate(tpl.id)}
                        className={cn(
                          "text-left rounded-xl border p-4 transition-all hover:shadow-md hover:border-purple-300 dark:hover:border-purple-500/40",
                          isSelected
                            ? "border-purple-500 bg-purple-50 dark:bg-purple-500/10 ring-2 ring-purple-500/20"
                            : "border-border bg-card"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "size-10 rounded-lg flex items-center justify-center shrink-0",
                              COLOR_ICON_BG[tpl.color]
                            )}
                          >
                            <Icon className="size-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="font-semibold text-sm">{tpl.name}</h3>
                              {isSelected && (
                                <Check className="size-4 text-purple-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                              {tpl.desc}
                            </p>
                            <Badge
                              variant="outline"
                              className={cn(
                                "mt-2 text-[10px] border",
                                COLOR_BADGE[tpl.color]
                              )}
                            >
                              {tpl.tag}
                            </Badge>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── Step 2: Negocio ────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Nombre del negocio <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      value={form.business_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, business_name: e.target.value }))
                      }
                      placeholder="Mi Negocio S.A."
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de negocio</Label>
                    <Input
                      value={form.business_type}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, business_type: e.target.value }))
                      }
                      placeholder="Tienda, Clínica, Restaurante..."
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Producto o servicio principal</Label>
                  <Input
                    value={form.product_or_service}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, product_or_service: e.target.value }))
                    }
                    placeholder="Consulta médica, Pedido de comida..."
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Mensaje de bienvenida</Label>
                  <Textarea
                    value={form.welcome_message}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, welcome_message: e.target.value }))
                    }
                    placeholder={`¡Hola! 👋 Bienvenido a ${
                      form.business_name || "tu negocio"
                    }.`}
                    rows={2}
                    className="text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Número WhatsApp <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      value={form.whatsapp_number}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, whatsapp_number: e.target.value }))
                      }
                      placeholder="+593987654321"
                      className="h-9 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Horario</Label>
                    <Input
                      value={form.business_hours}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, business_hours: e.target.value }))
                      }
                      placeholder="Lun-Vie 9-18h"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Tono del agente</Label>
                  <Select
                    value={form.agent_tone}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, agent_tone: v as AgentTone }))
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENT_TONES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex flex-col">
                            <span>{t.label}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {t.desc}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* ─── Step 3: Conocimiento ───────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-5">
                {/* Section 1: File upload */}
                <section className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Upload className="size-4 text-purple-500" />
                    <h3 className="text-sm font-semibold">1. Cargar archivos</h3>
                  </div>
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={cn(
                      "rounded-xl border-2 border-dashed p-5 sm:p-6 text-center transition-all cursor-pointer",
                      dragging
                        ? "border-purple-400 bg-purple-50 dark:bg-purple-500/10"
                        : "border-border hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-muted/30"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    <Upload className="size-7 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">
                      Arrastra archivos aquí o{" "}
                      <span className="text-purple-600 dark:text-purple-400 underline">
                        selecciónalos
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      PDF, Excel (.xlsx), CSV, TXT — máx 10MB c/u
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ACCEPTED_EXTENSIONS}
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {files.length > 0 && (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pf-scroll pr-1 -mr-1">
                      {files.map((f) => {
                        const Icon = fileIcon(f.type);
                        const statusInfo = STATUS_BADGE[f.status];
                        return (
                          <div
                            key={f.id}
                            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
                          >
                            <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Icon className="size-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{f.name}</p>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="uppercase">{f.type}</span>
                                <span>·</span>
                                <span>{formatBytes(f.size)}</span>
                                {f.error && (
                                  <>
                                    <span>·</span>
                                    <span className="text-rose-500 truncate">{f.error}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <Badge
                              variant="secondary"
                              className={cn("text-[10px] h-5", statusInfo.class)}
                            >
                              {f.status === "procesando" && (
                                <Loader2 className="size-3 mr-1 animate-spin" />
                              )}
                              {statusInfo.label}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-500"
                              onClick={() => removeFile(f.id)}
                              disabled={processing}
                              aria-label="Eliminar archivo"
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {files.length > 0 && (
                    <Button
                      onClick={processKnowledge}
                      disabled={processing}
                      className="w-full bg-purple-500 hover:bg-purple-600 text-white"
                    >
                      {processing ? (
                        <>
                          <Loader2 className="size-4 mr-2 animate-spin" />
                          Procesando conocimiento...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4 mr-2" />
                          Procesar conocimiento
                        </>
                      )}
                    </Button>
                  )}
                </section>

                <Separator />

                {/* Section 2: Manual info */}
                <section className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Edit3 className="size-4 text-purple-500" />
                    <h3 className="text-sm font-semibold">2. Información manual</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Completa lo que no esté en tus archivos. Se combinará con el contenido detectado.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {MANUAL_FIELDS.map((field) => {
                      const Icon = field.icon;
                      return (
                        <div
                          key={field.key}
                          className={cn(
                            "space-y-1.5",
                            field.rows && field.rows >= 3 ? "sm:col-span-2" : ""
                          )}
                        >
                          <Label className="text-xs flex items-center gap-1.5">
                            <Icon className="size-3 text-muted-foreground" />
                            {field.label}
                          </Label>
                          <Textarea
                            value={manual[field.key]}
                            onChange={(e) =>
                              setManual((m) => ({ ...m, [field.key]: e.target.value }))
                            }
                            placeholder={field.placeholder}
                            rows={field.rows || 2}
                            className="text-sm resize-y"
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>

                <Separator />

                {/* Section 3: Preview of detected knowledge */}
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-purple-500" />
                      <h3 className="text-sm font-semibold">3. Vista previa</h3>
                    </div>
                    {detected && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowPreview(true)}
                        className="h-7 text-xs"
                      >
                        <Edit3 className="size-3 mr-1" />
                        Revisar detalle
                      </Button>
                    )}
                  </div>

                  {!detected ? (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center">
                      <Info className="size-6 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Sube archivos y haz clic en{" "}
                        <span className="font-medium">“Procesar conocimiento”</span> para
                        ver lo que detectamos.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <PreviewStat
                          icon={Package}
                          color="amber"
                          label="Productos"
                          value={detected.products.length}
                        />
                        <PreviewStat
                          icon={CalendarClock}
                          color="sky"
                          label="Servicios"
                          value={detected.services.length}
                        />
                        <PreviewStat
                          icon={Clock}
                          color="emerald"
                          label="Horarios"
                          value={detected.business_hours.length}
                        />
                        <PreviewStat
                          icon={HelpCircle}
                          color="violet"
                          label="FAQs"
                          value={detected.faqs.length}
                        />
                        <PreviewStat
                          icon={Shield}
                          color="rose"
                          label="Políticas"
                          value={detected.policies.length}
                        />
                      </div>

                      {detected.products.length > 0 && (
                        <DetectedCard
                          title="Productos detectados"
                          icon={Package}
                          color="amber"
                          items={detected.products.slice(0, 4).map(
                            (p) =>
                              `${p.name}${p.price !== undefined ? ` — $${p.price}` : ""}`
                          )}
                          extra={
                            detected.products.length > 4
                              ? `+${detected.products.length - 4} más`
                              : undefined
                          }
                        />
                      )}
                      {detected.services.length > 0 && (
                        <DetectedCard
                          title="Servicios detectados"
                          icon={CalendarClock}
                          color="sky"
                          items={detected.services.slice(0, 4).map(
                            (s) =>
                              `${s.name}${s.durationMinutes ? ` (${s.durationMinutes} min)` : ""}`
                          )}
                          extra={
                            detected.services.length > 4
                              ? `+${detected.services.length - 4} más`
                              : undefined
                          }
                        />
                      )}
                      {detected.faqs.length > 0 && (
                        <DetectedCard
                          title="FAQs detectadas"
                          icon={HelpCircle}
                          color="violet"
                          items={detected.faqs.slice(0, 3).map((f) => `P: ${f.question}`)}
                          extra={
                            detected.faqs.length > 3
                              ? `+${detected.faqs.length - 3} más`
                              : undefined
                          }
                        />
                      )}

                      {/* Missing data warning */}
                      {(() => {
                        const missing: string[] = [];
                        if (detected.products.length === 0 && detected.services.length === 0)
                          missing.push("productos o servicios");
                        if (detected.business_hours.length === 0) missing.push("horarios");
                        if (detected.faqs.length === 0) missing.push("FAQs");
                        if (detected.policies.length === 0) missing.push("políticas");
                        if (missing.length === 0) return null;
                        return (
                          <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                                  Datos faltantes para un flujo óptimo
                                </p>
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                                  No se detectaron: {missing.join(", ")}. Puedes
                                  completarlos manualmente arriba o subir más archivos.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ─── Step 4: Módulos ────────────────────────────────────── */}
            {step === 4 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Configura los módulos del flujo. La plantilla preconfiguró estos valores; ajústalos si lo necesitas.
                </p>

                <div className="space-y-2">
                  <ModuleSwitch
                    icon={CalendarClock}
                    color="sky"
                    label="Agenda"
                    desc="Permite agendar citas automáticamente"
                    checked={modules.uses_agenda}
                    onCheckedChange={(v) =>
                      setModules((m) => ({ ...m, uses_agenda: v }))
                    }
                  />
                  <ModuleSwitch
                    icon={ShoppingCart}
                    color="amber"
                    label="Catálogo"
                    desc="Habilita la búsqueda de productos"
                    checked={modules.uses_catalog}
                    onCheckedChange={(v) =>
                      setModules((m) => ({ ...m, uses_catalog: v }))
                    }
                  />
                  <ModuleSwitch
                    icon={CreditCard}
                    color="violet"
                    label="PayPhone"
                    desc="Cobros por WhatsApp vía PayPhone API Link"
                    checked={modules.uses_payphone}
                    onCheckedChange={(v) =>
                      setModules((m) => ({
                        ...m,
                        uses_payphone: v,
                        payment_provider: v ? "payphone" : "none",
                      }))
                    }
                    badge={
                      <Badge
                        variant="outline"
                        className="text-[9px] border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-300"
                      >
                        API Link
                      </Badge>
                    }
                  />
                </div>

                {modules.uses_payphone && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <CreditCard className="size-4 text-violet-500" />
                      Configuración de pago
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Proveedor de pago</Label>
                        <Select
                          value={modules.payment_provider}
                          onValueChange={(v) =>
                            setModules((m) => ({
                              ...m,
                              payment_provider: v as PaymentProvider,
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="payphone">PayPhone API Link</SelectItem>
                            <SelectItem value="mock">Mock (simulación)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Monto</Label>
                        <Select
                          value={modules.amount_mode}
                          onValueChange={(v) =>
                            setModules((m) => ({
                              ...m,
                              amount_mode: v as AmountMode,
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Monto fijo</SelectItem>
                            <SelectItem value="variable">Monto variable</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {modules.amount_mode === "fixed" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Monto (USD)</Label>
                        <Input
                          type="number"
                          value={modules.fixed_amount}
                          onChange={(e) =>
                            setModules((m) => ({
                              ...m,
                              fixed_amount: Number(e.target.value),
                            }))
                          }
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Bot className="size-4 text-purple-500" />
                    Modo del agente IA
                  </h4>
                  <Select
                    value={modules.agent_mode}
                    onValueChange={(v) =>
                      setModules((m) => ({ ...m, agent_mode: v as AgentMode }))
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completo">Completo (vender + cobrar + agendar)</SelectItem>
                      <SelectItem value="vender">Solo vender</SelectItem>
                      <SelectItem value="cobrar">Solo cobrar</SelectItem>
                      <SelectItem value="agendar">Solo agendar</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    El modo determina el comportamiento principal del agente en sus respuestas.
                  </p>
                </div>
              </div>
            )}

            {/* ─── Step 5: Resumen ────────────────────────────────────── */}
            {step === 5 && (
              <div className="space-y-3">
                <SummaryRow
                  icon={Sparkles}
                  title="Plantilla"
                  value={
                    TEMPLATES.find((t) => t.id === selectedTemplate)?.name ||
                    "No seleccionada"
                  }
                />
                <SummaryRow
                  icon={Building2}
                  title="Negocio"
                  value={form.business_name || "—"}
                  sub={[
                    form.business_type && `Tipo: ${form.business_type}`,
                    form.whatsapp_number && `WhatsApp: ${form.whatsapp_number}`,
                    form.business_hours && `Horario: ${form.business_hours}`,
                    `Tono: ${form.agent_tone}`,
                  ].filter((x): x is string => Boolean(x))}
                />
                <SummaryRow
                  icon={Upload}
                  title="Conocimiento"
                  value={
                    files.length > 0
                      ? `${files.length} archivo(s) · ${files.filter((f) => f.status === "listo").length} procesado(s)`
                      : "Sin archivos"
                  }
                  sub={[
                    detected
                      ? `Detectado: ${detected.products.length} productos, ${detected.services.length} servicios, ${detected.faqs.length} FAQs`
                      : null,
                    Object.values(manual).some((v) => v.trim())
                      ? "Incluye información manual"
                      : null,
                  ].filter((x): x is string => Boolean(x))}
                />
                <SummaryRow
                  icon={Bot}
                  title="Módulos"
                  value={`Agente IA (${modules.agent_mode})`}
                  sub={[
                    modules.uses_agenda && "Agenda",
                    modules.uses_catalog && "Catálogo",
                    modules.uses_payphone &&
                      `PayPhone (${modules.payment_provider}${
                        modules.amount_mode === "fixed"
                          ? ` · $${modules.fixed_amount}`
                          : " · monto variable"
                      })`,
                    !modules.uses_agenda &&
                      !modules.uses_catalog &&
                      !modules.uses_payphone &&
                      "Solo IA (sin módulos adicionales)",
                  ].filter((x): x is string => Boolean(x))}
                />

                <div className="rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="size-4 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-purple-800 dark:text-purple-300 leading-relaxed">
                      Estás listo para crear el flujo. Se generarán los nodos y conexiones
                      automáticamente. Podrás editarlos después en el editor visual.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Footer with navigation */}
          <DialogFooter className="px-4 sm:px-6 py-3 shrink-0 gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={back}
              disabled={step === 1 || submitting}
              className="order-1 sm:order-1"
            >
              <ArrowLeft className="size-4 mr-1" />
              Atrás
            </Button>
            <div className="text-[11px] text-muted-foreground hidden sm:block mx-auto order-2">
              Paso {step} de 5
            </div>
            {step < 5 ? (
              <Button
                onClick={next}
                disabled={submitting}
                className="bg-purple-500 hover:bg-purple-600 text-white order-3 sm:order-3"
              >
                Siguiente
                <ArrowRight className="size-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={submit}
                disabled={submitting}
                className="bg-purple-500 hover:bg-purple-600 text-white order-3 sm:order-3"
              >
                {submitting ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="size-4 mr-2" />
                )}
                Crear flujo
              </Button>
            )}
          </DialogFooter>

          {/* Creating overlay */}
          {creating && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-2xl">
              <Loader2 className="size-10 animate-spin text-purple-500 mb-3" />
              <h3 className="text-base font-semibold mb-1">Creando flujo automático…</h3>
              <p className="text-sm text-muted-foreground">
                Generando nodos y conexiones.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Preview Modal */}
      <ImportPreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        detected={detected}
        onConfirm={confirmImport}
        onIgnore={ignoreImport}
        importing={importing}
      />
    </>
  );
}

// ─── Small helper components ───────────────────────────────────────────

function PreviewStat({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof Info;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-center">
      <div
        className={cn(
          "size-7 rounded-md mx-auto flex items-center justify-center mb-1",
          COLOR_ICON_BG[color]
        )}
      >
        <Icon className="size-3.5" />
      </div>
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function DetectedCard({
  title,
  icon: Icon,
  color,
  items,
  extra,
}: {
  title: string;
  icon: typeof Info;
  color: string;
  items: string[];
  extra?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border">
        <div
          className={cn(
            "size-5 rounded-md flex items-center justify-center",
            COLOR_ICON_BG[color]
          )}
        >
          <Icon className="size-3" />
        </div>
        <h4 className="text-xs font-semibold">{title}</h4>
      </div>
      <ul className="p-2 space-y-1">
        {items.map((it, i) => (
          <li
            key={i}
            className="text-[11px] text-foreground/80 truncate px-1.5 py-0.5"
          >
            · {it}
          </li>
        ))}
        {extra && (
          <li className="text-[11px] text-muted-foreground italic px-1.5">{extra}</li>
        )}
      </ul>
    </div>
  );
}

function ModuleSwitch({
  icon: Icon,
  color,
  label,
  desc,
  checked,
  onCheckedChange,
  badge,
}: {
  icon: typeof Info;
  color: string;
  label: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  badge?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex items-center gap-3 transition-all",
        checked
          ? "border-purple-300 dark:border-purple-500/40 bg-purple-50/50 dark:bg-purple-500/5"
          : "border-border bg-card"
      )}
    >
      <div
        className={cn(
          "size-9 rounded-lg flex items-center justify-center shrink-0",
          COLOR_ICON_BG[color]
        )}
      >
        <Icon className="size-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">{label}</h4>
          {badge}
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: typeof Info;
  title: string;
  value: string;
  sub?: string[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-start gap-3">
      <div className="size-9 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center shrink-0">
        <Icon className="size-4.5 text-purple-600 dark:text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{title}</p>
        <p className="text-sm font-medium mt-0.5">{value}</p>
        {sub && sub.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {sub.map((s, i) => (
              <li key={i} className="text-[11px] text-muted-foreground">
                · {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
