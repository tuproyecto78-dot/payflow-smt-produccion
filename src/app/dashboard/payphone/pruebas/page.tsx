"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2, Copy, Check, AlertCircle, FlaskConical } from "lucide-react";
import { toast } from "sonner";

interface PayPhoneStatus {
  configured: boolean;
  env: string;
  mode: string;
  tokenConfigured: boolean;
  storeIdConfigured: boolean;
  storeIdLastFour: string | null;
  apiLinkEnabled: boolean;
  apiSaleEnabled: boolean;
  externalNotificationEnabled: boolean;
}

export default function PayPhonePruebasPage() {
  const [status, setStatus] = useState<PayPhoneStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    amount: "1.00",
    description: "Prueba PayFlow SMT",
    customerName: "Cliente de prueba",
    customerPhone: "+593987654321",
    customerEmail: "",
  });

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/payphone/config/status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingStatus(false);
    }
  }

  async function generateLink() {
    setGenerating(true);
    setLink(null);
    setCopied(false);
    try {
      const res = await fetch("/api/payphone/create-link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          currency: "USD",
          reference: form.description,
          clientId: "test-admin",
          workflowId: "test-channel",
        }),
      });

      const data = await res.json();

      if (res.ok && data.payment_link) {
        setLink(data.payment_link);
        toast.success("Link PayPhone generado correctamente. Estado inicial: payment_pending.");

        // Log to history
        try {
          const hist = JSON.parse(localStorage.getItem("payflow_flow_history") || "[]");
          hist.unshift({
            id: `hist_${Date.now()}`,
            action: "payphone_test_link_created",
            flowName: "SMT pruebas de API",
            flowId: "test-channel",
            timestamp: new Date().toISOString(),
            details: `Monto: $${form.amount} USD · Estado: payment_pending`,
          });
          localStorage.setItem("payflow_flow_history", JSON.stringify(hist.slice(0, 50)));
        } catch {}
      } else if (res.status === 503) {
        toast.error("PayPhone no está configurado. Verifica PAYPHONE_TOKEN y PAYPHONE_STORE_ID en Vercel.");
      } else if (res.status === 401) {
        toast.error("Tu sesión expiró. Inicia sesión nuevamente.");
      } else {
        toast.error(data.error || "No se pudo generar el link PayPhone. Revisa configuración o logs de Vercel.");
      }
    } catch {
      toast.error("No se pudo generar el link PayPhone. Revisa configuración o logs de Vercel.");
    } finally {
      setGenerating(false);
    }
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copiado al portapapeles.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-10">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="size-10 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
            <FlaskConical className="size-5 text-violet-600 dark:text-violet-300" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">SMT pruebas de API</h1>
            <p className="text-muted-foreground mt-0.5">
              Canal interno para probar generación de links PayPhone API Link con las credenciales de Vercel.
            </p>
          </div>
        </div>
      </div>

      {/* PayPhone config status */}
      <div className="rounded-xl border bg-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <CreditCard className="size-4 text-violet-500" />
          Configuración PayPhone
        </h2>
        {loadingStatus ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Verificando configuración…
          </div>
        ) : status ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">Ambiente</span>
              <span className={`font-medium ${status.env === "production" ? "text-emerald-600 dark:text-emerald-400" : status.env === "disabled" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                {status.env === "production" ? "Producción" : status.env === "sandbox" ? "Pruebas" : status.env === "disabled" ? "Desactivado" : "No configurado"}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Modo</span>
              <span className="font-medium">{status.mode === "link" ? "API Link" : status.mode}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Token configurado</span>
              <span className={`font-medium ${status.tokenConfigured ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {status.tokenConfigured ? "Sí" : "No"}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">StoreID configurado</span>
              <span className={`font-medium ${status.storeIdConfigured ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {status.storeIdConfigured ? "Sí" : "No"}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">StoreID</span>
              <span className="font-mono text-sm">****{status.storeIdLastFour || "—"}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Notificación externa</span>
              <span className={`font-medium ${status.externalNotificationEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {status.externalNotificationEnabled ? "Activa" : "No activa"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No se pudo verificar la configuración.</p>
        )}
        {status?.configured && (
          <div className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            ✓ PayPhone está configurado correctamente para generar links de pago.
          </div>
        )}
        {status && !status.configured && (
          <div className="mt-3 text-sm text-amber-600 dark:text-amber-400 font-medium">
            ⚠ PayPhone no está configurado. Puedes usar Mock para pruebas.
          </div>
        )}
      </div>

      {/* Test link form */}
      <div className="rounded-xl border bg-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4">Generar link de prueba</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Monto (USD)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente</Label>
              <Input
                value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teléfono</Label>
              <Input
                value={form.customerPhone}
                onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <Button
            onClick={generateLink}
            disabled={generating || !status?.configured}
            className="w-full bg-violet-500 hover:bg-violet-600 text-white"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Generando link…
              </>
            ) : (
              <>
                <CreditCard className="size-4 mr-2" />
                Generar link de prueba
              </>
            )}
          </Button>
          {!status?.configured && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              PayPhone no está configurado. Verifica las variables en Vercel.
            </p>
          )}
        </div>
      </div>

      {/* Generated link */}
      {link && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Check className="size-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Link PayPhone generado
            </h2>
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300 ml-auto">
              payment_pending
            </Badge>
          </div>
          <div className="bg-background rounded-lg p-3 border border-border/60 break-all text-sm font-mono text-muted-foreground mb-3">
            {link}
          </div>
          <Button variant="outline" size="sm" onClick={copyLink} className="w-full">
            {copied ? (
              <>
                <Check className="size-3.5 mr-1.5" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="size-3.5 mr-1.5" />
                Copiar link
              </>
            )}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-3 text-center">
            Estado inicial: payment_pending. Solo PayPhone Business, Notificación Externa o revisión admin auditada puede cambiar a payment_success.
          </p>
        </div>
      )}
    </div>
  );
}
