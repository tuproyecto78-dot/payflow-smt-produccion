"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2 } from "lucide-react";

export function SubscriptionForm({ open, onOpenChange, plan }: { open: boolean; onOpenChange: (o: boolean) => void; plan: "trimestral" | "anual" }) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    selected_plan: plan as string, full_name: "", country_code: "593", phone_number: "",
    email: "", document_id: "", business_name: "", business_type: "", country: "Ecuador", terms_accepted: false,
  });

  if (form.selected_plan !== plan) setForm({ ...form, selected_plan: plan });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm((f) => ({ ...f, [key]: value })); }

  function validate(): string | null {
    if (!form.full_name.trim()) return "El nombre completo es obligatorio.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "El correo electrónico no es válido.";
    if (!form.phone_number.trim()) return "El número de celular es obligatorio.";
    if (!form.country_code.trim()) return "El código de país es obligatorio.";
    if (!form.document_id.trim()) return "La cédula o DNI es obligatoria.";
    if (!form.terms_accepted) return "Debes aceptar los términos y la política de privacidad.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null); setSubmitting(true);
    try {
      const res = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al enviar la solicitud."); return; }
      setSuccess(true);
    } catch { setError("Error de red."); } finally { setSubmitting(false); }
  }

  function handleClose(o: boolean) { if (!o) setTimeout(() => { setSuccess(false); setError(null); }, 200); onOpenChange(o); }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto pf-scroll">
        {success ? (
          <div className="flex flex-col items-center text-center py-8">
            <CheckCircle2 className="size-12 text-emerald-500 mb-4" />
            <h3 className="text-lg font-bold mb-2">¡Solicitud enviada!</h3>
            <p className="text-sm text-muted-foreground max-w-xs">Gracias por suscribirte a PayFlow SMT. Hemos recibido tus datos y nos pondremos en contacto contigo para activar tu flujo de pagos por WhatsApp.</p>
            <Button className="mt-6" onClick={() => handleClose(false)}>Entendido</Button>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-3"><img src="/payflow-logo.png" srcSet="/payflow-logo.png 2x" alt="PayFlow SMT" className="h-10 w-auto object-contain" draggable={false} /></div>
            <DialogHeader>
              <DialogTitle className="text-center">Suscripción al Plan {plan === "anual" ? "Anual" : "Trimestral"}</DialogTitle>
              <DialogDescription className="text-center">Completa tus datos y te contactaremos para activar tu flujo de pagos por WhatsApp.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1.5"><Label className="text-xs">Plan seleccionado</Label><Input value={plan === "anual" ? "Plan Anual — $89" : "Plan Trimestral — $25"} disabled className="h-8 text-sm font-semibold bg-emerald-50 dark:bg-emerald-500/10" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Nombres completos *</Label><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Ana Pérez" className="h-8 text-sm" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5 col-span-1"><Label className="text-xs">Código país *</Label><Input value={form.country_code} onChange={(e) => set("country_code", e.target.value)} placeholder="593" className="h-8 text-sm font-mono" /></div>
                <div className="space-y-1.5 col-span-2"><Label className="text-xs">Número de celular *</Label><Input value={form.phone_number} onChange={(e) => set("phone_number", e.target.value)} placeholder="987654321" className="h-8 text-sm" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Correo electrónico *</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="tu@correo.com" className="h-8 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Cédula o DNI *</Label><Input value={form.document_id} onChange={(e) => set("document_id", e.target.value)} placeholder="1712345678" className="h-8 text-sm font-mono" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Nombre del negocio</Label><Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} placeholder="Mi Negocio S.A." className="h-8 text-sm" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label className="text-xs">Tipo de negocio</Label><Select value={form.business_type} onValueChange={(v) => set("business_type", v)}><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger><SelectContent><SelectItem value="tienda">Tienda</SelectItem><SelectItem value="servicios">Servicios</SelectItem><SelectItem value="restaurante">Restaurante</SelectItem><SelectItem value="ecommerce">E-commerce</SelectItem><SelectItem value="profesional">Profesional</SelectItem><SelectItem value="otro">Otro</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs">País</Label><Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Ecuador" className="h-8 text-sm" /></div>
              </div>
              <div className="flex items-start gap-2 pt-1"><Checkbox id="terms" checked={form.terms_accepted} onCheckedChange={(v) => set("terms_accepted", v === true)} /><Label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed">Acepto los términos y la política de privacidad de PayFlow SMT.</Label></div>
              {error && <div className="rounded-md bg-destructive/10 text-destructive text-xs px-3 py-2 border border-destructive/20">{error}</div>}
              <Button type="submit" className="w-full" disabled={submitting}>{submitting && <Loader2 className="size-4 mr-2 animate-spin" />}Enviar solicitud</Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
