"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, Shield, CreditCard } from "lucide-react";

export type PlanType = "trimestral" | "anual" | "choose";

const PLAN_INFO = {
  trimestral: { label: "Plan Trimestral", price: 49.99, display: "Plan Trimestral — $49.99/mes" },
  anual: { label: "Plan Anual", price: 249, display: "Plan Anual — $249/año" },
};

const BUSINESS_TYPES = [
  { value: "medica", label: "Médica" },
  { value: "clinica", label: "Clínica" },
  { value: "abogado", label: "Abogado" },
  { value: "comercio", label: "Comercio" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "salon_belleza", label: "Salón de belleza" },
  { value: "spa", label: "Spa" },
  { value: "restaurante", label: "Restaurante" },
  { value: "educacion", label: "Educación" },
  { value: "servicios_profesionales", label: "Servicios profesionales" },
  { value: "otro", label: "Otro" },
];

const HAS_PAYPHONE_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Sí" },
  { value: "in_process", label: "En trámite" },
];

export function SubscriptionForm({ open, onOpenChange, plan }: { open: boolean; onOpenChange: (o: boolean) => void; plan: PlanType }) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"trimestral" | "anual">(
    plan === "choose" ? "trimestral" : (plan as "trimestral" | "anual")
  );
  const [form, setForm] = useState({
    full_name: "",
    country_code: "593",
    phone_number: "",
    email: "",
    document_id: "",
    business_name: "",
    business_type: "",
    country: "Ecuador",
    city: "",
    // PayPhone selection
    payment_provider: "payphone",
    has_payphone_business: "no",
    start_payments_config: false,
    // Optional PayPhone business data
    payphone_ruc: "",
    payphone_trade_name: "",
    payphone_admin_email: "",
    payphone_admin_phone: "",
    payphone_city: "",
    payphone_category: "",
    payphone_admin_first_name: "",
    payphone_admin_last_name: "",
    payphone_admin_document: "",
    // Consent
    terms_accepted: false,
    consent_accepted: false,
  });

  useEffect(() => {
    if (plan === "choose") setSelectedPlan("trimestral");
    else if (plan === "trimestral" || plan === "anual") setSelectedPlan(plan);
  }, [plan]);

  useEffect(() => {
    if (open) {
      setSuccess(false);
      setError(null);
    }
  }, [open]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.full_name.trim()) return "El nombre completo es obligatorio.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "El correo electrónico no es válido.";
    if (!form.phone_number.trim()) return "El número de celular es obligatorio.";
    if (!form.country_code.trim()) return "El código de país es obligatorio.";
    if (!form.document_id.trim()) return "La cédula o DNI es obligatoria.";
    if (!form.business_name.trim()) return "El nombre del negocio es obligatorio.";
    if (!form.terms_accepted) return "Debes aceptar los términos y la política de privacidad.";
    if (!form.consent_accepted) return "Debes autorizar el inicio de la configuración de pagos por WhatsApp con PayPhone Business.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null); setSubmitting(true);
    try {
      const info = PLAN_INFO[selectedPlan];
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_plan: selectedPlan,
          selected_plan_label: info.label,
          selected_plan_price: info.price,
          full_name: form.full_name,
          country_code: form.country_code,
          phone_number: form.phone_number,
          email: form.email,
          document_id: form.document_id,
          business_name: form.business_name,
          business_type: form.business_type,
          country: form.country,
          city: form.city,
          payment_provider: form.payment_provider,
          has_payphone_business: form.has_payphone_business,
          start_payments_config: form.start_payments_config,
          payphone_ruc: form.payphone_ruc,
          payphone_trade_name: form.payphone_trade_name,
          payphone_admin_email: form.payphone_admin_email,
          payphone_admin_phone: form.payphone_admin_phone,
          payphone_city: form.payphone_city,
          payphone_category: form.payphone_category,
          payphone_admin_first_name: form.payphone_admin_first_name,
          payphone_admin_last_name: form.payphone_admin_last_name,
          payphone_admin_document: form.payphone_admin_document,
          consent_accepted: form.consent_accepted,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al enviar la solicitud."); return; }
      setSuccess(true);
    } catch {
      setError("Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose(o: boolean) {
    if (!o) {
      setTimeout(() => { setSuccess(false); setError(null); }, 200);
    }
    onOpenChange(o);
  }

  const planLabel = PLAN_INFO[selectedPlan].label;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto pf-scroll">
        {success ? (
          <div className="flex flex-col items-center text-center py-8">
            <CheckCircle2 className="size-12 text-emerald-500 mb-4" />
            <h3 className="text-lg font-bold mb-2">¡Solicitud enviada!</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Gracias por suscribirte a PayFlow SMT. Hemos recibido tus datos para el {planLabel}. Tu solicitud quedó en estado <strong>pendiente de revisión</strong>. Nuestro equipo revisará tu información y activará tu cuenta junto con la configuración de pagos por WhatsApp con PayPhone Business.
            </p>
            <Button className="mt-6" onClick={() => handleClose(false)}>Entendido</Button>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-3">
              <img src="/payflow-logo.png" srcSet="/payflow-logo.png 2x" alt="PayFlow SMT" className="h-10 w-auto object-contain" draggable={false} />
            </div>
            <DialogHeader>
              <DialogTitle className="text-center">
                {plan === "choose" ? "Suscripción a PayFlow SMT" : `Suscripción al ${planLabel}`}
              </DialogTitle>
              <DialogDescription className="text-center">
                Completa tus datos. El registro es directo en PayFlow SMT. Luego el administrador configurará PayPhone Business por ti.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3">
              {/* Plan selector */}
              <div className="space-y-1.5">
                <Label className="text-xs">Plan seleccionado</Label>
                {plan === "choose" ? (
                  <Select value={selectedPlan} onValueChange={(v) => setSelectedPlan(v as "trimestral" | "anual")}>
                    <SelectTrigger className="h-9 text-sm font-semibold bg-emerald-50 dark:bg-emerald-500/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trimestral">Plan Trimestral — $25</SelectItem>
                      <SelectItem value="anual">Plan Anual — $89</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={PLAN_INFO[selectedPlan].display} disabled className="h-9 text-sm font-semibold bg-emerald-50 dark:bg-emerald-500/10" />
                )}
              </div>

              <div className="rounded-md bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 p-2.5">
                <div className="flex items-start gap-2">
                  <CreditCard className="size-4 text-violet-600 dark:text-violet-300 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-violet-700 dark:text-violet-200 leading-relaxed">
                    <strong>Proveedor de pago:</strong> PayPhone Business.
                    No necesitas tener una cuenta PayPhone para registrarte. El administrador configurará PayPhone por ti usando las credenciales seguras del servidor.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Nombres completos *</Label>
                <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Ana Pérez" className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5 col-span-1">
                  <Label className="text-xs">Código país *</Label>
                  <Input value={form.country_code} onChange={(e) => set("country_code", e.target.value)} placeholder="593" className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Número de celular *</Label>
                  <Input value={form.phone_number} onChange={(e) => set("phone_number", e.target.value)} placeholder="987654321" className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Correo electrónico *</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="tu@correo.com" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cédula o RUC *</Label>
                <Input value={form.document_id} onChange={(e) => set("document_id", e.target.value)} placeholder="1712345678" className="h-9 text-sm font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nombre del negocio *</Label>
                <Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} placeholder="Mi Negocio S.A." className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de negocio</Label>
                  <Select value={form.business_type} onValueChange={(v) => set("business_type", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">País</Label>
                  <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Ecuador" className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ciudad</Label>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Guayaquil" className="h-9 text-sm" />
              </div>

              {/* PayPhone Business section */}
              <div className="rounded-md border border-border p-3 space-y-2.5 bg-card">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="size-3.5 text-violet-500" />
                  <h4 className="text-xs font-semibold">Datos PayPhone Business (opcional)</h4>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Si ya tienes cuenta PayPhone Business o estás en trámite, indícalo. Esto acelera la activación. No pediremos tu Token ni StoreID aquí.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">¿Tienes PayPhone Business?</Label>
                  <Select value={form.has_payphone_business} onValueChange={(v) => set("has_payphone_business", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HAS_PAYPHONE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="start_payments"
                    checked={form.start_payments_config}
                    onCheckedChange={(v) => set("start_payments_config", v === true)}
                  />
                  <Label htmlFor="start_payments" className="text-[11px] text-muted-foreground leading-relaxed">
                    Acepto iniciar la configuración de pagos por WhatsApp con PayPhone Business.
                  </Label>
                </div>

                {/* Optional admin data */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">RUC del comercio</Label>
                    <Input value={form.payphone_ruc} onChange={(e) => set("payphone_ruc", e.target.value)} placeholder="099xxx..." className="h-9 text-sm font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nombre comercial</Label>
                    <Input value={form.payphone_trade_name} onChange={(e) => set("payphone_trade_name", e.target.value)} placeholder="Mi Negocio" className="h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email administrador</Label>
                    <Input type="email" value={form.payphone_admin_email} onChange={(e) => set("payphone_admin_email", e.target.value)} placeholder="admin@negocio.com" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Teléfono administrador</Label>
                    <Input value={form.payphone_admin_phone} onChange={(e) => set("payphone_admin_phone", e.target.value)} placeholder="987654321" className="h-9 text-sm font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ciudad PayPhone</Label>
                    <Input value={form.payphone_city} onChange={(e) => set("payphone_city", e.target.value)} placeholder="Guayaquil" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Categoría de negocio</Label>
                    <Input value={form.payphone_category} onChange={(e) => set("payphone_category", e.target.value)} placeholder="Retail" className="h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nombre admin</Label>
                    <Input value={form.payphone_admin_first_name} onChange={(e) => set("payphone_admin_first_name", e.target.value)} placeholder="Ana" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Apellido admin</Label>
                    <Input value={form.payphone_admin_last_name} onChange={(e) => set("payphone_admin_last_name", e.target.value)} placeholder="Pérez" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cédula admin</Label>
                    <Input value={form.payphone_admin_document} onChange={(e) => set("payphone_admin_document", e.target.value)} placeholder="171..." className="h-9 text-sm font-mono" />
                  </div>
                </div>
              </div>

              {/* Consent */}
              <div className="rounded-md border border-violet-200 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-500/5 p-2.5 space-y-2">
                <div className="flex items-start gap-2">
                  <Shield className="size-3.5 text-violet-600 dark:text-violet-300 mt-0.5 shrink-0" />
                  <Label htmlFor="consent" className="text-[11px] text-violet-800 dark:text-violet-200 leading-relaxed font-medium cursor-pointer">
                    Autorizo a PayFlow SMT a usar estos datos para iniciar la configuración de pagos por WhatsApp con PayPhone Business.
                  </Label>
                  <Checkbox
                    id="consent"
                    checked={form.consent_accepted}
                    onCheckedChange={(v) => set("consent_accepted", v === true)}
                    className="mt-0.5"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1">
                <Checkbox id="terms" checked={form.terms_accepted} onCheckedChange={(v) => set("terms_accepted", v === true)} />
                <Label htmlFor="terms" className="text-[11px] text-muted-foreground leading-relaxed">Acepto los términos y la política de privacidad de PayFlow SMT.</Label>
              </div>

              {error && <div className="rounded-md bg-destructive/10 text-destructive text-xs px-3 py-2 border border-destructive/20">{error}</div>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                Enviar solicitud
              </Button>
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                No te pediremos tu Token PayPhone ni StoreID en este formulario. Esos datos los configura el administrador de forma segura en el servidor.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
