"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ArrowRight, ArrowLeft, ShoppingCart, CreditCard, CalendarClock, ShoppingBag, CalendarCheck, Bot, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TEMPLATES = [
  { id: "venta", name: "Venta por WhatsApp", icon: "ShoppingCart" },
  { id: "cobro", name: "Cobro por WhatsApp", icon: "CreditCard" },
  { id: "agenda", name: "Agenda de citas", icon: "CalendarClock" },
  { id: "venta_cobro", name: "Venta + cobro", icon: "ShoppingBag" },
  { id: "agenda_cobro", name: "Agenda + cobro", icon: "CalendarCheck" },
  { id: "agente_completo", name: "Agente comercial completo", icon: "Bot" },
  { id: "solo_ia", name: "Solo IA (sin pagos)", icon: "MessageSquare" },
] as const;

const ICONS: Record<string, typeof ShoppingCart> = {
  ShoppingCart, CreditCard, CalendarClock, ShoppingBag, CalendarCheck, Bot, MessageSquare,
};

interface CreateFlowDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (workflowId: string, projectId: string) => void;
  projectId?: string;
}

export function CreateFlowDialog({ open, onOpenChange, onCreated, projectId }: CreateFlowDialogProps) {
  const [step, setStep] = useState<"template" | "params" | "creating">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    business_name: "",
    business_type: "",
    product_or_service: "",
    amount_mode: "fixed" as "fixed" | "variable",
    fixed_amount: 49.99,
    currency: "USD",
    welcome_message: "",
    business_hours: "",
    whatsapp_number: "",
    payment_required: true,
    payment_provider: "payphone" as "none" | "payphone" | "mock",
    agent_mode: "completo" as "vender" | "cobrar" | "agendar" | "completo",
  });

  function reset() {
    setStep("template");
    setSelectedTemplate(null);
    setForm({
      business_name: "", business_type: "", product_or_service: "",
      amount_mode: "fixed", fixed_amount: 49.99, currency: "USD",
      welcome_message: "", business_hours: "", whatsapp_number: "",
      payment_required: true, payment_provider: "payphone", agent_mode: "completo",
    });
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setSubmitting(true);
    setStep("creating");
    try {
      const res = await fetch("/api/workflows/create-from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, templateId: selectedTemplate, projectId: projectId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al crear el flujo");
        setStep("params");
        return;
      }
      toast.success(data.message || "Flujo creado");
      reset();
      onOpenChange(false);
      onCreated(data.workflow_id, data.project_id);
    } catch {
      toast.error("Error de red");
      setStep("params");
    } finally {
      setSubmitting(false);
    }
  }

  const canProceed = form.business_name.trim() && form.whatsapp_number.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto pf-scroll rounded-2xl">
        {step === "template" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-purple-500" />
                Crear flujo automático
              </DialogTitle>
            </DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3 py-2">
              {TEMPLATES.map((tpl) => {
                const Icon = ICONS[tpl.icon] || Bot;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => {
                      setSelectedTemplate(tpl.id);
                      if (tpl.id === "solo_ia") {
                        set("payment_required", false);
                        set("payment_provider", "none");
                      } else {
                        set("payment_required", true);
                        set("payment_provider", "payphone");
                      }
                      setStep("params");
                    }}
                    className={cn(
                      "text-left rounded-xl border p-4 transition-all hover:shadow-md hover:border-purple-300",
                      selectedTemplate === tpl.id ? "border-purple-500 bg-purple-50 dark:bg-purple-500/10" : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="size-10 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center shrink-0">
                        <Icon className="size-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm">{tpl.name}</h3>
                        {tpl.id === "solo_ia" && <Badge className="mt-1 text-[9px] bg-emerald-100 text-emerald-700">Sin pagos</Badge>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "params" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-purple-500" />
                Parámetros del flujo
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nombre del negocio *</Label>
                  <Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} placeholder="Mi Negocio S.A." className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de negocio</Label>
                  <Input value={form.business_type} onChange={(e) => set("business_type", e.target.value)} placeholder="Tienda, Clínica..." className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Producto o servicio</Label>
                <Input value={form.product_or_service} onChange={(e) => set("product_or_service", e.target.value)} placeholder="Consulta médica, Pedido..." className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mensaje de bienvenida</Label>
                <Textarea value={form.welcome_message} onChange={(e) => set("welcome_message", e.target.value)} placeholder={`¡Hola! 👋 Bienvenido a ${form.business_name || "tu negocio"}.`} rows={2} className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Número WhatsApp *</Label>
                  <Input value={form.whatsapp_number} onChange={(e) => set("whatsapp_number", e.target.value)} placeholder="+593987654321" className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Horario</Label>
                  <Input value={form.business_hours} onChange={(e) => set("business_hours", e.target.value)} placeholder="Lun-Vie 9-18h" className="h-9 text-sm" />
                </div>
              </div>

              {/* ─── Payment section (optional) ─────────────────────────── */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">¿Requiere cobros?</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Activa si necesitas cobrar por WhatsApp</p>
                  </div>
                  <Switch
                    checked={form.payment_required}
                    onCheckedChange={(v) => {
                      set("payment_required", v);
                      if (!v) set("payment_provider", "none");
                      else set("payment_provider", "payphone");
                    }}
                  />
                </div>

                {form.payment_required && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Proveedor de pago</Label>
                      <Select value={form.payment_provider} onValueChange={(v) => set("payment_provider", v as "payphone" | "mock")}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="payphone">PayPhone API Link</SelectItem>
                          <SelectItem value="mock">Mock (simulación)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Monto</Label>
                        <Select value={form.amount_mode} onValueChange={(v) => set("amount_mode", v as "fixed" | "variable")}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Monto fijo</SelectItem>
                            <SelectItem value="variable">Monto variable</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.amount_mode === "fixed" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Monto (USD)</Label>
                          <Input type="number" value={form.fixed_amount} onChange={(e) => set("fixed_amount", Number(e.target.value))} className="h-9 text-sm" />
                        </div>
                      )}
                    </div>
                  </>
                )}

                {!form.payment_required && (
                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                    ✓ El flujo se creará <strong>SIN nodos de pago</strong>. No se exige PayPhone, Token ni StoreID. El agente funcionará con IA, agenda, catálogo y notificación al negocio.
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Modo del agente IA</Label>
                <Select value={form.agent_mode} onValueChange={(v) => set("agent_mode", v as typeof form.agent_mode)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completo">Completo</SelectItem>
                    <SelectItem value="vender">Vender</SelectItem>
                    <SelectItem value="cobrar">Cobrar</SelectItem>
                    <SelectItem value="agendar">Agendar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep("template")}>
                <ArrowLeft className="size-4 mr-1" /> Atrás
              </Button>
              <Button onClick={submit} disabled={!canProceed || submitting} className="bg-purple-500 hover:bg-purple-600 text-white">
                {submitting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Sparkles className="size-4 mr-2" />}
                Crear flujo
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "creating" && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="size-10 animate-spin text-purple-500 mb-4" />
            <h3 className="text-lg font-semibold mb-1">Creando flujo automático…</h3>
            <p className="text-sm text-muted-foreground">Generando nodos y conexiones.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
