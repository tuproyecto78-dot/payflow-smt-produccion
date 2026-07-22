"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bot,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  ExternalLink,
  Headphones,
  Loader2,
  MessageCircle,
  Package,
  PhoneCall,
  PhoneForwarded,
  Save,
  Settings2,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  VoiceAgent,
  VoiceBusiness,
  VoiceCall,
  VoiceDashboardData,
  VoiceModuleSettings,
} from "@/lib/voice/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const DEFAULT_SETTINGS: Omit<VoiceModuleSettings, "clientId"> = {
  activationStatus: "not_enabled",
  provider: "twilio",
  businessPhone: "",
  routingPhone: "",
  providerPhoneId: "",
  sipDomain: "",
  timezone: "America/Guayaquil",
  defaultPaymentProvider: "none",
  whatsappConfirmationsEnabled: true,
  humanTransferEnabled: false,
  humanTransferPhone: "",
  recordingEnabled: false,
  retentionDays: 30,
};

function endpoint(path: string, clientId: string | null) {
  return clientId ? `${path}?clientId=${encodeURIComponent(clientId)}` : path;
}

export function VoiceAiView() {
  const [data, setData] = useState<VoiceDashboardData | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [agent, setAgent] = useState<VoiceAgent | null>(null);
  const [selectedCall, setSelectedCall] = useState<VoiceCall | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async (requested?: string | null) => {
    setLoading(true);
    setLoadError("");
    try {
      const saved = requested === undefined
        ? window.localStorage.getItem("payflow:voice-client") || window.localStorage.getItem("payflow:catalog-client")
        : requested;
      const response = await fetch(endpoint("/api/voice", saved || null), { credentials: "include", cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo cargar Llamadas IA.");
      let next = payload as VoiceDashboardData;
      if (!next.selectedClientId && next.businesses.length === 1) {
        const only = next.businesses[0].id;
        window.localStorage.setItem("payflow:voice-client", only);
        const selectedResponse = await fetch(endpoint("/api/voice", only), { credentials: "include", cache: "no-store" });
        const selectedPayload = await selectedResponse.json().catch(() => ({}));
        if (!selectedResponse.ok) throw new Error(selectedPayload.error || "No se pudo cargar el negocio.");
        next = selectedPayload as VoiceDashboardData;
      }
      setData(next);
      setSelectedClientId(next.selectedClientId);
      if (next.selectedClientId) window.localStorage.setItem("payflow:voice-client", next.selectedClientId);
      setSettings(next.settings ? { ...next.settings } : { ...DEFAULT_SETTINGS });
      setAgent({ ...next.agent });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudo cargar Llamadas IA.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function selectBusiness(clientId: string) {
    window.localStorage.setItem("payflow:voice-client", clientId);
    setSelectedClientId(clientId);
    void load(clientId);
  }

  async function requestActivation() {
    if (!selectedClientId) return;
    setRequesting(true);
    try {
      const response = await fetch(endpoint("/api/voice/activation", selectedClientId), {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo registrar la solicitud.");
      toast.success("Solicitud de Llamadas IA registrada.");
      await load(selectedClientId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo registrar la solicitud."); }
    finally { setRequesting(false); }
  }

  async function save() {
    if (!selectedClientId || !agent) return;
    setSaving(true);
    try {
      const response = await fetch(endpoint("/api/voice/settings", selectedClientId), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          agent: {
            name: agent.name,
            language: agent.language,
            voiceId: agent.voiceId,
            greeting: agent.greeting,
            instructions: agent.instructions,
            useCatalog: agent.useCatalog,
            canCreateOrders: agent.canCreateOrders,
            canCreateReservations: agent.canCreateReservations,
            canCreatePaymentLinks: agent.canCreatePaymentLinks,
            canAnswerFaq: agent.canAnswerFaq,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar la configuración.");
      toast.success("Configuración guardada.");
      await load(selectedClientId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  }

  async function provision() {
    if (!selectedClientId) return;
    setProvisioning(true);
    try {
      const response = await fetch("/api/admin/voice/activation", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          activationStatus: settings.activationStatus === "not_enabled" ? "requested" : settings.activationStatus,
          provider: settings.provider,
          businessPhone: settings.businessPhone,
          routingPhone: settings.routingPhone,
          providerPhoneId: settings.providerPhoneId,
          sipDomain: settings.sipDomain,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo cambiar el estado del módulo.");
      toast.success("Aprovisionamiento actualizado.");
      await load(selectedClientId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo aprovisionar."); }
    finally { setProvisioning(false); }
  }

  const currentBusiness = data?.businesses.find((business) => business.id === selectedClientId);
  const status = data?.settings?.activationStatus || "not_enabled";
  const active = status === "active";
  const activationPending = status === "requested" || status === "provisioning";

  if (loading && !data) return <Centered><Loader2 className="mr-2 size-5 animate-spin" />Cargando llamadas y voz IA…</Centered>;
  if (loadError) return <Centered><div className="max-w-lg text-center"><CircleAlert className="mx-auto mb-3 size-10 text-amber-500" /><h1 className="text-lg font-semibold">No pudimos abrir llamadas y voz IA</h1><p className="mt-2 text-sm text-muted-foreground">{loadError}</p><Button className="mt-5" onClick={() => void load(selectedClientId)}>Reintentar</Button></div></Centered>;

  return <div className="mx-auto max-w-7xl space-y-6 p-5 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Llamadas y voz IA</h1>
          <StatusBadge status={status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Telefonía entrante con Twilio o Telnyx y un canal independiente para Llamadas por WhatsApp.</p>
      </div>
      <div className="flex items-center gap-2">
        {(data?.businesses.length || 0) > 0 && <Select value={selectedClientId || undefined} onValueChange={selectBusiness}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Seleccionar negocio" /></SelectTrigger>
          <SelectContent>{data?.businesses.map((business) => <SelectItem key={business.id} value={business.id}>{business.businessName}</SelectItem>)}</SelectContent>
        </Select>}
        {selectedClientId && <Button onClick={save} disabled={saving}><Save className="mr-2 size-4" />{saving ? "Guardando…" : "Guardar"}</Button>}
      </div>
    </div>

    {!selectedClientId ? <NoBusiness businesses={data?.businesses || []} onSelect={selectBusiness} /> : <>
      {!active && <ActivationCard business={currentBusiness} provisioning={activationPending} requesting={requesting} onRequest={requestActivation} />}

      <Tabs defaultValue="resumen" className="space-y-5">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="llamadas">Llamadas</TabsTrigger>
          <TabsTrigger value="agente">Agente IA</TabsTrigger>
          <TabsTrigger value="operacion">Pedidos y reservas</TabsTrigger>
          <TabsTrigger value="numero">Telefonía</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric title="Llamadas hoy" value={data?.metrics.callsToday || 0} icon={PhoneCall} />
            <Metric title="Minutos este mes" value={data?.metrics.minutesThisMonth || 0} icon={Clock3} />
            <Metric title="Atendidas" value={data?.metrics.completedCalls || 0} icon={Headphones} />
            <Metric title="Conversiones" value={data?.metrics.convertedCalls || 0} icon={Sparkles} />
          </div>
          <CallChannels
            active={active}
            provider={settings.provider}
            whatsappMessagingReady={data?.integrations.whatsapp || false}
          />
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <LiveCallCard active={active} businessPhone={settings.businessPhone} />
            <Card><CardHeader><CardTitle className="text-base">Integraciones del negocio</CardTitle></CardHeader><CardContent className="space-y-3">
              <Integration label="Catálogo y precios" ready={data?.integrations.catalog || false} icon={Package} />
              <Integration label="WhatsApp Cloud API (mensajes)" ready={data?.integrations.whatsapp || false} icon={MessageCircle} />
              <Integration label="PayPhone" ready={data?.integrations.payphone || false} icon={CreditCard} />
              <Integration label="Stripe" ready={data?.integrations.stripe || false} icon={CreditCard} />
            </CardContent></Card>
          </div>
          <RecentCalls calls={data?.calls.slice(0, 5) || []} onOpen={setSelectedCall} />
        </TabsContent>

        <TabsContent value="llamadas"><CallsPanel calls={data?.calls || []} onOpen={setSelectedCall} /></TabsContent>
        <TabsContent value="agente">{agent && <AgentPanel agent={agent} onChange={setAgent} />}</TabsContent>
        <TabsContent value="operacion"><OperationPanel data={data} /></TabsContent>
        <TabsContent value="numero"><NumberPanel settings={settings} canProvision={data?.canProvision || false} provisioning={provisioning} onChange={setSettings} onProvision={provision} /></TabsContent>
        <TabsContent value="configuracion"><SettingsPanel settings={settings} onChange={setSettings} /></TabsContent>
      </Tabs>
    </>}

    <CallDialog call={selectedCall} onClose={() => setSelectedCall(null)} />
  </div>;
}

function ActivationCard({ business, provisioning, requesting, onRequest }: { business?: VoiceBusiness; provisioning: boolean; requesting: boolean; onRequest: () => void }) {
  return <Card className="overflow-hidden border-violet-200 bg-gradient-to-br from-violet-50 via-background to-emerald-50 dark:border-violet-500/30 dark:from-violet-500/10 dark:to-emerald-500/10"><CardContent className="grid gap-6 p-6 lg:grid-cols-[1.4fr_1fr] lg:p-8"><div><Badge className="mb-3 border-0 bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">Módulo opcional</Badge><h2 className="text-xl font-bold">Activa el agente telefónico de {business?.businessName || "este negocio"}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Tus clientes llaman al número conocido del negocio. La IA conversa en español natural, consulta el catálogo, crea el pedido o la reserva y envía el cobro por PayPhone o Stripe.</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm"><Feature text="Número propio" /><Feature text="Multiempresa" /><Feature text="Pedidos y reservas" /><Feature text="Transferencia humana" /></div></div><div className="flex flex-col items-start justify-center rounded-xl border bg-background/80 p-5"><p className="text-sm font-semibold">{provisioning ? "Solicitud en proceso" : "Configuración asistida"}</p><p className="mt-1 text-xs text-muted-foreground">{provisioning ? "PayFlow debe asignar la ruta telefónica y el runtime de voz antes de activarlo." : "Solicita el módulo. La activación no cambia ni instala WhatsApp en el número del negocio."}</p><Button className="mt-4" onClick={onRequest} disabled={provisioning || requesting}>{requesting && <Loader2 className="mr-2 size-4 animate-spin" />}{provisioning ? "Solicitud registrada" : "Solicitar activación"}</Button></div></CardContent></Card>;
}

function LiveCallCard({ active, businessPhone }: { active: boolean; businessPhone: string }) {
  const bars = [3,5,8,12,7,16,10,6,14,18,9,5,12,15,8,4,10,6,3,2];
  return <Card className="overflow-hidden border-slate-800 bg-slate-950 text-white"><CardContent className="p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">En vivo</p><h3 className="mt-2 text-xl font-semibold">{active ? "Esperando la próxima llamada" : "Agente aún no activo"}</h3><p className="mt-1 text-sm text-slate-400">{businessPhone || "Configura el número del negocio"}</p></div><div className={cn("size-3 rounded-full", active ? "animate-pulse bg-emerald-400" : "bg-slate-600")} /></div><div className="mt-8 flex h-24 items-center justify-center gap-1 rounded-xl bg-white/5 px-4">{bars.map((height, index) => <span key={index} className={cn("w-1.5 rounded-full", active ? "bg-emerald-400" : "bg-slate-700")} style={{ height: `${height * 3}px` }} />)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-white/10 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Cliente</p><p className="mt-1 text-sm text-slate-300">La transcripción aparecerá aquí.</p></div><div className="rounded-lg border border-white/10 p-3"><p className="text-[10px] uppercase tracking-wide text-emerald-500">Agente PayFlow</p><p className="mt-1 text-sm text-slate-300">Escucha, valida y ejecuta acciones seguras.</p></div></div></CardContent></Card>;
}

function AgentPanel({ agent, onChange }: { agent: VoiceAgent; onChange: (agent: VoiceAgent) => void }) {
  const set = <K extends keyof VoiceAgent>(key: K, value: VoiceAgent[K]) => onChange({ ...agent, [key]: value });
  return <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="size-5 text-violet-500" />Personalidad y conversación</CardTitle></CardHeader><CardContent className="space-y-4"><Field label="Nombre del agente"><Input value={agent.name} onChange={(event) => set("name", event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Idioma"><Select value={agent.language} onValueChange={(value) => set("language", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="es-EC">Español · Ecuador</SelectItem><SelectItem value="es-MX">Español · Latino</SelectItem><SelectItem value="en-US">English · US</SelectItem></SelectContent></Select></Field><Field label="Voz"><Select value={agent.voiceId} onValueChange={(value) => set("voiceId", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="neutral-female-1">Natural femenina</SelectItem><SelectItem value="neutral-male-1">Natural masculina</SelectItem><SelectItem value="warm-female-1">Cálida femenina</SelectItem></SelectContent></Select></Field></div><Field label="Saludo inicial"><Textarea rows={3} value={agent.greeting} onChange={(event) => set("greeting", event.target.value)} /></Field><Field label="Instrucciones del negocio"><Textarea rows={7} value={agent.instructions} onChange={(event) => set("instructions", event.target.value)} placeholder="Horarios, políticas, tono, cuándo transferir…" /></Field></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Acciones permitidas</CardTitle></CardHeader><CardContent className="space-y-4"><Toggle label="Consultar catálogo y precios reales" checked={agent.useCatalog} onChange={(value) => set("useCatalog", value)} /><Toggle label="Crear pedidos" checked={agent.canCreateOrders} onChange={(value) => set("canCreateOrders", value)} /><Toggle label="Crear reservas" checked={agent.canCreateReservations} onChange={(value) => set("canCreateReservations", value)} /><Toggle label="Generar enlaces de pago" checked={agent.canCreatePaymentLinks} onChange={(value) => set("canCreatePaymentLinks", value)} /><Toggle label="Responder preguntas frecuentes" checked={agent.canAnswerFaq} onChange={(value) => set("canAnswerFaq", value)} /><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">La IA nunca inventa precios ni confirma un pago por conversación. Usa el catálogo y los webhooks oficiales de cada proveedor.</div></CardContent></Card></div>;
}

function NumberPanel({ settings, canProvision, provisioning, onChange, onProvision }: { settings: Omit<VoiceModuleSettings, "clientId">; canProvision: boolean; provisioning: boolean; onChange: (value: Omit<VoiceModuleSettings, "clientId">) => void; onProvision: () => void }) {
  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => onChange({ ...settings, [key]: value });
  return <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><PhoneForwarded className="size-5 text-emerald-500" />Número telefónico del negocio</CardTitle></CardHeader><CardContent className="space-y-4"><Field label="Número que ya conocen tus clientes"><Input value={settings.businessPhone} onChange={(event) => set("businessPhone", event.target.value)} placeholder="+593…" /></Field>{canProvision ? <><div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">Zona de aprovisionamiento para administradores. El cliente no puede modificar el destino técnico ni activar el runtime.</div><Field label="Estado del módulo"><Select value={settings.activationStatus === "not_enabled" ? "requested" : settings.activationStatus} onValueChange={(value) => set("activationStatus", value as typeof settings.activationStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="requested">Solicitado</SelectItem><SelectItem value="provisioning">Configurando</SelectItem><SelectItem value="active">Activo</SelectItem><SelectItem value="suspended">Suspendido</SelectItem></SelectContent></Select></Field><Field label="Proveedor de telefonía"><Select value={settings.provider} onValueChange={(value) => set("provider", value as typeof settings.provider)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="twilio">Twilio Voice</SelectItem><SelectItem value="telnyx">Telnyx Voice</SelectItem><SelectItem value="fonoster">Fonoster</SelectItem><SelectItem value="sip">Troncal SIP</SelectItem><SelectItem value="custom">Proveedor personalizado</SelectItem></SelectContent></Select></Field><Field label="Número o destino de desvío"><Input value={settings.routingPhone} onChange={(event) => set("routingPhone", event.target.value)} placeholder="Asignado por PayFlow" /></Field><Field label="ID del número en el proveedor"><Input value={settings.providerPhoneId} onChange={(event) => set("providerPhoneId", event.target.value)} placeholder="No pegues tokens ni claves" /></Field>{settings.provider === "sip" && <Field label="Dominio SIP"><Input value={settings.sipDomain} onChange={(event) => set("sipDomain", event.target.value)} placeholder="sip.negocio.example" /></Field>}<Button onClick={onProvision} disabled={provisioning}>{provisioning && <Loader2 className="mr-2 size-4 animate-spin" />}Actualizar aprovisionamiento</Button></> : <div className="rounded-lg border bg-muted/40 p-4 text-sm"><p className="font-medium">Ruta administrada por PayFlow</p><p className="mt-1 text-xs text-muted-foreground">Después de solicitar el módulo, el equipo configura el proveedor y te entrega el destino para activar el desvío con tu operador.</p></div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Cómo se conecta la telefonía</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><Step number="1" title="Conserva el número actual" text="El cliente mantiene el número que sus compradores conocen; este proceso corresponde a telefonía tradicional." /><Step number="2" title="Desvía las llamadas" text="Claro, Movistar, CNT o la central SIP envían las llamadas al destino asignado por PayFlow." /><Step number="3" title="PayFlow identifica el negocio" text="El número de destino carga el catálogo, agente, pagos y reglas correctas de ese cliente." /><Step number="4" title="La IA atiende y confirma" text="El pedido o reserva queda en PayFlow; el cobro y la confirmación llegan por WhatsApp." /><div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200"><strong>Llamadas por WhatsApp es otro canal.</strong> Se habilita por separado en Meta y no utiliza el desvío configurado con Twilio, Telnyx o SIP.</div></CardContent></Card></div>;
}

function SettingsPanel({ settings, onChange }: { settings: Omit<VoiceModuleSettings, "clientId">; onChange: (value: Omit<VoiceModuleSettings, "clientId">) => void }) {
  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => onChange({ ...settings, [key]: value });
  return <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="size-5 text-blue-500" />Cobros y confirmaciones</CardTitle></CardHeader><CardContent className="space-y-4"><Field label="Proveedor de pago predeterminado"><Select value={settings.defaultPaymentProvider} onValueChange={(value) => set("defaultPaymentProvider", value as typeof settings.defaultPaymentProvider)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin cobro automático</SelectItem><SelectItem value="payphone">PayPhone</SelectItem><SelectItem value="stripe">Stripe</SelectItem></SelectContent></Select></Field><Toggle label="Enviar confirmación por WhatsApp" checked={settings.whatsappConfirmationsEnabled} onChange={(value) => set("whatsappConfirmationsEnabled", value)} /><p className="text-xs text-muted-foreground">Las credenciales de Stripe y PayPhone no se guardan aquí. Se administran como secretos cifrados del servidor o cuentas conectadas.</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="size-5" />Seguridad y operación</CardTitle></CardHeader><CardContent className="space-y-4"><Field label="Zona horaria"><Input value={settings.timezone} onChange={(event) => set("timezone", event.target.value)} /></Field><Toggle label="Permitir transferencia a una persona" checked={settings.humanTransferEnabled} onChange={(value) => set("humanTransferEnabled", value)} />{settings.humanTransferEnabled && <Field label="Número de transferencia"><Input value={settings.humanTransferPhone} onChange={(event) => set("humanTransferPhone", event.target.value)} placeholder="+593…" /></Field>}<Toggle label="Grabar llamadas con consentimiento" checked={settings.recordingEnabled} onChange={(value) => set("recordingEnabled", value)} /><Field label="Retención de datos (días)"><Input type="number" min={1} max={365} value={settings.retentionDays} onChange={(event) => set("retentionDays", Number(event.target.value))} /></Field></CardContent></Card></div>;
}

function OperationPanel({ data }: { data: VoiceDashboardData | null }) {
  return <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShoppingBag className="size-5 text-emerald-500" />Pedidos por voz</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">La IA solo usa productos activos, valida stock y deja el pedido en la operación normal de PayFlow.</p><Link href="/dashboard/pedidos"><Button variant="outline" className="mt-4">Abrir pedidos <ChevronRight className="ml-2 size-4" /></Button></Link></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="size-5 text-violet-500" />Reservas por voz</CardTitle></CardHeader><CardContent>{(data?.reservations.length || 0) === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay reservas tomadas por llamadas.</p> : <div className="space-y-2">{data?.reservations.slice(0, 8).map((reservation) => <div key={reservation.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">{reservation.customerName}</p><p className="text-xs text-muted-foreground">{reservation.serviceName || "Reserva"} · {new Date(reservation.scheduledAt).toLocaleString("es-EC")}</p></div><Badge variant="outline">{reservation.status}</Badge></div>)}</div>}</CardContent></Card></div>;
}

function CallsPanel({ calls, onOpen }: { calls: VoiceCall[]; onOpen: (call: VoiceCall) => void }) { return <RecentCalls calls={calls} onOpen={onOpen} title="Historial de llamadas" />; }
function RecentCalls({ calls, onOpen, title = "Llamadas recientes" }: { calls: VoiceCall[]; onOpen: (call: VoiceCall) => void; title?: string }) { return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="p-0">{calls.length === 0 ? <div className="py-14 text-center"><PhoneCall className="mx-auto mb-3 size-9 text-muted-foreground/50" /><p className="text-sm font-medium">No hay llamadas registradas</p><p className="mt-1 text-xs text-muted-foreground">Cuando el runtime de voz atienda una llamada aparecerá aquí.</p></div> : <div className="divide-y">{calls.map((call) => <button key={call.id} onClick={() => onOpen(call)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50"><div className="flex size-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><PhoneCall className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{call.callerPhone}</p><p className="truncate text-xs text-muted-foreground">{call.summary || call.outcome} · {formatDuration(call.durationSeconds)}</p></div><Badge variant="outline">{call.status}</Badge><ChevronRight className="size-4 text-muted-foreground" /></button>)}</div>}</CardContent></Card>; }

function CallDialog({ call, onClose }: { call: VoiceCall | null; onClose: () => void }) { return <Dialog open={Boolean(call)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Llamada {call?.callerPhone}</DialogTitle></DialogHeader>{call && <div className="space-y-5"><div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3"><Info label="Estado" value={call.status} /><Info label="Resultado" value={call.outcome} /><Info label="Duración" value={formatDuration(call.durationSeconds)} /></div>{call.summary && <div><h3 className="text-sm font-semibold">Resumen</h3><p className="mt-1 text-sm text-muted-foreground">{call.summary}</p></div>}<div><h3 className="mb-2 text-sm font-semibold">Transcripción</h3>{call.transcript.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay transcripción guardada.</div> : <div className="space-y-2">{call.transcript.map((line, index) => <div key={index} className={cn("max-w-[90%] rounded-xl p-3 text-sm", line.speaker === "agent" ? "ml-auto bg-emerald-50 dark:bg-emerald-500/10" : "bg-muted")}><p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">{line.speaker === "agent" ? "Agente" : "Cliente"}</p>{line.text}</div>)}</div>}</div>{call.orderId && <Link href="/dashboard/pedidos"><Button variant="outline"><ShoppingBag className="mr-2 size-4" />Ver pedido creado</Button></Link>}</div>}</DialogContent></Dialog>; }

function NoBusiness({ businesses, onSelect }: { businesses: VoiceBusiness[]; onSelect: (id: string) => void }) { return <Card className="border-dashed"><CardContent className="py-16 text-center"><PhoneCall className="mx-auto mb-3 size-10 text-muted-foreground" /><h2 className="font-semibold">Selecciona un negocio</h2><p className="mt-1 text-sm text-muted-foreground">Cada número, agente y llamada se mantiene separado por negocio.</p>{businesses.length > 0 && <Button className="mt-4" onClick={() => onSelect(businesses[0].id)}>Seleccionar {businesses[0].businessName}</Button>}</CardContent></Card>; }
function CallChannels({ active, provider, whatsappMessagingReady }: { active: boolean; provider: VoiceModuleSettings["provider"]; whatsappMessagingReady: boolean }) {
  const providerNames: Record<VoiceModuleSettings["provider"], string> = {
    telnyx: "Telnyx",
    twilio: "Twilio",
    fonoster: "Fonoster",
    sip: "Troncal SIP",
    custom: "Proveedor personalizado",
  };

  return <Card>
    <CardHeader>
      <CardTitle className="text-base">Canales de llamadas</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-3 md:grid-cols-2">
      <div className="flex items-start gap-3 rounded-xl border p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><PhoneCall className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Línea telefónica del negocio</p><Badge variant={active ? "default" : "outline"}>{active ? "Activa" : "Pendiente"}</Badge></div>
          <p className="mt-1 text-xs text-muted-foreground">Llamadas entrantes atendidas por la IA mediante {providerNames[provider]}.</p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50/50 p-4 dark:border-green-500/25 dark:bg-green-500/5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"><MessageCircle className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Llamadas por WhatsApp</p><Badge variant="outline">Por configurar</Badge></div>
          <p className="mt-1 text-xs text-muted-foreground">{whatsappMessagingReady ? "La mensajería de WhatsApp ya está lista. Las llamadas son otro canal de Meta y requieren habilitación y conexión propias." : "Primero conecta WhatsApp Cloud API; luego habilita Calling API para el número del negocio."}</p>
          <a href="https://developers.facebook.com/documentation/business-messaging/whatsapp/calling" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:underline dark:text-green-300">Ver configuración oficial de Meta <ExternalLink className="size-3" /></a>
        </div>
      </div>
    </CardContent>
  </Card>;
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof PhoneCall }) { return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div></CardContent></Card>; }
function Integration({ label, ready, icon: Icon }: { label: string; ready: boolean; icon: typeof Package }) { return <div className="flex items-center gap-3 rounded-lg border p-3"><Icon className="size-4 text-muted-foreground" /><span className="flex-1 text-sm font-medium">{label}</span>{ready ? <Badge className="border-0 bg-emerald-100 text-emerald-700"><Check className="mr-1 size-3" />Listo</Badge> : <Badge variant="outline"><X className="mr-1 size-3" />Pendiente</Badge>}</div>; }
function StatusBadge({ status }: { status: string }) { const map: Record<string, string> = { not_enabled: "No contratado", requested: "Solicitado", provisioning: "Configurando", active: "Activo", suspended: "Suspendido" }; return <Badge variant={status === "active" ? "default" : "outline"}>{map[status] || status}</Badge>; }
function Feature({ text }: { text: string }) { return <span className="flex items-center gap-1.5"><Check className="size-4 text-emerald-600" />{text}</span>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><Label className="cursor-pointer text-sm">{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Step({ number, title, text }: { number: string; title: string; text: string }) { return <div className="flex gap-3"><div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{number}</div><div><p className="font-medium">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{text}</p></div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>; }
function Centered({ children }: { children: React.ReactNode }) { return <div className="flex min-h-[65vh] items-center justify-center p-8 text-sm text-muted-foreground">{children}</div>; }
function formatDuration(seconds: number) { const minutes = Math.floor(seconds / 60); const rest = seconds % 60; return `${minutes}:${String(rest).padStart(2, "0")}`; }
