"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CreditCard, Zap, Link2, ShieldCheck, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PayPhoneStatus {
  configured: boolean;
  env: "sandbox" | "production";
  store_id: string;
  api_link_enabled: boolean;
  api_sale_enabled: boolean;
  user_check_enabled: boolean;
  webhook_enabled: boolean;
  credential_mode: string;
  missing_vars: string[];
}

export function PayPhoneConfigView() {
  const [status, setStatus] = useState<PayPhoneStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payphone/status");
      if (!res.ok) { toast.error("Error al cargar configuración de PayPhone"); return; }
      setStatus(await res.json());
    } catch { toast.error("Error de red"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function testCredentials() {
    setTesting(true);
    try {
      const res = await fetch("/api/payphone/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test_credentials" }) });
      const data = await res.json();
      if (data.ok) toast.success(data.message || "Credenciales válidas");
      else toast.error(data.message || "Credenciales inválidas");
      setLastTest(new Date().toISOString());
    } catch { toast.error("Error de red"); }
    finally { setTesting(false); }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex-1 overflow-y-auto pf-scroll">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><CreditCard className="size-5 text-primary" />Configuración PayPhone</h1>
          <p className="text-sm text-muted-foreground mt-1">Conexión con PayPhone Developer usando la cuenta Business propia del administrador.</p>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />Estado de la conexión</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Modo de credenciales</span><Badge variant="outline">Cuenta Business propia</Badge></div>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Ambiente actual</span><Badge className={cn("shrink-0", status?.env === "production" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" : "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400")}>{status?.env === "production" ? "Producción" : "Sandbox"}</Badge></div>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Credenciales</span>{status?.configured ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"><CheckCircle2 className="size-3 mr-1" />Configuradas</Badge> : <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"><XCircle className="size-3 mr-1" />No configuradas</Badge>}</div>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">StoreID</span><span className="text-sm font-mono">{status?.store_id || "—"}</span></div>
            {status && !status.configured && status.missing_vars.length > 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400">
                <div className="flex items-start gap-2"><AlertCircle className="size-4 shrink-0 mt-0.5" /><div><p className="font-semibold mb-1">Faltan variables de entorno:</p><ul className="list-disc list-inside space-y-0.5">{status.missing_vars.map((v) => <li key={v} className="font-mono">{v}</li>)}</ul></div></div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="size-4 text-primary" />Funciones activadas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <FeatureFlag icon={<Link2 className="size-4" />} label="API Link" description="Generar links de pago reales" enabled={status?.api_link_enabled} />
            <FeatureFlag icon={<CreditCard className="size-4" />} label="API Sale" description="Cobro directo (desactivado por ahora)" enabled={status?.api_sale_enabled} />
            <FeatureFlag icon={<ShieldCheck className="size-4" />} label="User Check" description="Verificar si un número está en PayPhone" enabled={status?.user_check_enabled} />
            <FeatureFlag icon={<Zap className="size-4" />} label="Webhook" description="Recibir notificaciones de pago" enabled={status?.webhook_enabled} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Probar conexión</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button onClick={testCredentials} disabled={testing || !status?.configured}>{testing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <ShieldCheck className="size-4 mr-2" />}Probar credenciales</Button>
            </div>
            {lastTest && <p className="text-xs text-muted-foreground">Última prueba: {new Date(lastTest).toLocaleString("es-EC")}</p>}
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-500/30">
          <CardContent className="pt-6"><div className="flex items-start gap-3 text-sm"><ShieldCheck className="size-5 text-amber-600 shrink-0 mt-0.5" /><div className="space-y-1"><p className="font-semibold text-amber-700 dark:text-amber-400">Seguridad</p><ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside"><li>Los tokens PayPhone nunca se exponen en el frontend.</li><li>No se guardan tokens en logs ni respuestas de API.</li><li>API Link se ejecuta solo desde el backend.</li><li>PayFlow SMT no almacena tarjetas ni CVV.</li><li>El pago se realiza en el link seguro de PayPhone.</li><li>No se usa NEXT_PUBLIC para tokens PayPhone.</li></ul></div></div></CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureFlag({ icon, label, description, enabled }: { icon: React.ReactNode; label: string; description: string; enabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", enabled ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-slate-100 text-slate-400 dark:bg-slate-500/15 dark:text-slate-500")}>{icon}</div>
        <div className="min-w-0"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{description}</p></div>
      </div>
      <Badge className={cn("shrink-0", enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400")}>{enabled ? "Activo" : "Inactivo"}</Badge>
    </div>
  );
}
