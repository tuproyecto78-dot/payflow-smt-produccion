"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Copy, ExternalLink, Brain, RefreshCw, Play, Link2 } from "lucide-react";
import { toast } from "sonner";

interface ArchitectStatus {
  enabled: boolean;
  approvalRequired: boolean;
  clickupEnabled: boolean;
  clickupConfigured: boolean;
  eventsCount: number;
  pendingProposals: number;
  approvedProposals: number;
  executedActions: number;
  failedActions: number;
}

interface Proposal {
  id: string;
  eventId: string;
  diagnosis: string;
  recommendedAction: string;
  actionSteps: string[];
  riskLevel: string;
  zaiPrompt: string;
  requiresApproval: boolean;
  approvalStatus: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface EventItem {
  id: string;
  eventType: string;
  source: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  low: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
};

const STATUS_COLORS: Record<string, string> = {
  detected: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  analyzed: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  executed: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export default function ArquitectoPage() {
  const [status, setStatus] = useState<ArchitectStatus | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [connectingClickUp, setConnectingClickUp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes] = await Promise.all([
        fetch("/api/admin/architect/status", { credentials: "include", cache: "no-store" }).then(r => r.json()),
      ]);
      setStatus(statusRes);

      // For now, we'll get events from the analyze endpoint (which seeds demo data)
      // In a real system, there would be a GET /api/admin/architect/events endpoint
      if (statusRes.eventsCount > 0) {
        // Create demo events list from status
        setEvents([
          { id: "evt_1", eventType: "payphone_not_configured", source: "system", severity: "high", title: "PayPhone no configurado", description: "Credenciales faltantes", status: "detected", createdAt: new Date().toISOString() },
          { id: "evt_2", eventType: "payment_pending_24h", source: "payment", severity: "medium", title: "Pago pendiente 24h+", description: "Transacción sin confirmación", status: "detected", createdAt: new Date().toISOString() },
          { id: "evt_3", eventType: "chatbot_error", source: "ai_assistant", severity: "medium", title: "Chatbot fallando", description: "3 errores consecutivos", status: "detected", createdAt: new Date().toISOString() },
          { id: "evt_4", eventType: "client_requests_human", source: "whatsapp", severity: "low", title: "Cliente pide humano", description: "Cliente solicita atención", status: "detected", createdAt: new Date().toISOString() },
        ]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/admin/architect/analyze", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`${data.count || 0} propuestas generadas`);
        if (data.proposals) setProposals(data.proposals);
        await load();
      } else {
        toast.error(data.error || "Error al analizar");
      }
    } catch { toast.error("Error de red"); }
    finally { setAnalyzing(false); }
  }

  async function handleConnectClickUp() {
    setConnectingClickUp(true);
    try {
      const res = await fetch("/api/clickup/connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(
          data.already_connected
            ? `ClickUp ya estaba conectado a ${data.workspace?.name || "tu Workspace"}`
            : `ClickUp conectado a ${data.workspace?.name || "tu Workspace"}`
        );
      } else {
        toast.error(data.error || "No se pudo conectar ClickUp");
      }
    } catch {
      toast.error("Error de red al conectar ClickUp");
    } finally {
      setConnectingClickUp(false);
    }
  }

  async function handleApprove(proposalId: string) {
    try {
      const res = await fetch("/api/admin/architect/approve", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Propuesta aprobada");
        setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, approvalStatus: "approved" } : p));
      } else { toast.error(data.error || "Error"); }
    } catch { toast.error("Error de red"); }
  }

  async function handleReject(proposalId: string) {
    try {
      const res = await fetch("/api/admin/architect/reject", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Propuesta rechazada");
        setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, approvalStatus: "rejected" } : p));
      } else { toast.error(data.error || "Error"); }
    } catch { toast.error("Error de red"); }
  }

  async function handleExecute(proposalId: string) {
    try {
      const res = await fetch("/api/admin/architect/execute", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Acción ejecutada");
        setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, approvalStatus: "executed" } : p));
      } else { toast.error(data.error || "Error"); }
    } catch { toast.error("Error de red"); }
  }

  async function handleClickUp(proposalId: string) {
    try {
      const res = await fetch("/api/admin/architect/create-clickup-task", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const data = await res.json();
      if (data.ok && data.taskUrl) {
        toast.success("Tarea creada en ClickUp");
        window.open(data.taskUrl, "_blank");
      } else {
        toast.error(data.error || "No se pudo crear tarea en ClickUp");
      }
    } catch { toast.error("Error de red"); }
  }

  function copyPrompt(prompt: string) {
    navigator.clipboard.writeText(prompt);
    toast.success("Prompt copiado");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin mr-2" /> Cargando Arquitecto IA…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-10">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
            <Brain className="size-5 text-violet-600 dark:text-violet-300" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Arquitecto IA</h1>
            <p className="text-muted-foreground mt-0.5">Centro de control con aprobación humana obligatoria</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleConnectClickUp} disabled={connectingClickUp}>
            {connectingClickUp ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Link2 className="size-4 mr-2" />}
            Conectar ClickUp
          </Button>
          <Button onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
            Analizar eventos
          </Button>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5 mb-8">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Eventos detectados</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{status?.eventsCount || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pendientes</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{status?.pendingProposals || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Aprobadas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600">{status?.approvedProposals || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Ejecutadas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-violet-600">{status?.executedActions || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Fallidas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{status?.failedActions || 0}</div></CardContent>
        </Card>
      </div>

      {/* Events */}
      {events.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold mb-3">Eventos detectados</h2>
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
                <AlertTriangle className={`size-4 shrink-0 ${e.severity === "high" ? "text-orange-500" : e.severity === "medium" ? "text-amber-500" : "text-sky-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{e.description}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[e.severity] || ""}`}>{e.severity}</Badge>
                <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[e.status] || ""}`}>{e.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proposals */}
      {proposals.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3">Propuestas del Arquitecto IA</h2>
          <div className="space-y-3">
            {proposals.map((p) => (
              <div key={p.id} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[p.approvalStatus] || ""}`}>{p.approvalStatus}</Badge>
                      <Badge variant="outline" className={`text-[10px] ${p.riskLevel === "high" ? "bg-orange-100 text-orange-700" : p.riskLevel === "medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>Riesgo: {p.riskLevel}</Badge>
                    </div>
                    <p className="text-sm"><strong>Diagnóstico:</strong> {p.diagnosis}</p>
                    <p className="text-sm mt-1"><strong>Decisión:</strong> {p.recommendedAction}</p>
                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs font-semibold text-muted-foreground">Acción:</p>
                      {p.actionSteps.map((s, i) => (
                        <p key={i} className="text-xs text-muted-foreground pl-3">{i + 1}. {s}</p>
                      ))}
                    </div>
                    <div className="mt-2 rounded-md bg-muted/50 p-2">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Prompt Z.ai:</p>
                      <p className="text-xs font-mono">{p.zaiPrompt}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {p.approvalStatus === "pending_approval" && (
                    <>
                      <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => handleApprove(p.id)}>
                        <CheckCircle2 className="size-3.5 mr-1" /> Aprobar
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs text-rose-600" onClick={() => handleReject(p.id)}>
                        <XCircle className="size-3.5 mr-1" /> Rechazar
                      </Button>
                    </>
                  )}
                  {p.approvalStatus === "approved" && (
                    <Button size="sm" className="h-8 text-xs bg-violet-500 hover:bg-violet-600 text-white" onClick={() => handleExecute(p.id)}>
                      <Play className="size-3.5 mr-1" /> Ejecutar
                    </Button>
                  )}
                  {p.approvalStatus === "approved" && status?.clickupConfigured && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleClickUp(p.id)}>
                      <ExternalLink className="size-3.5 mr-1" /> Crear tarea ClickUp
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => copyPrompt(p.zaiPrompt)}>
                    <Copy className="size-3.5 mr-1" /> Copiar prompt
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {events.length === 0 && proposals.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Brain className="size-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No hay eventos detectados</h3>
          <p className="text-muted-foreground text-sm mb-4">El Arquitecto IA monitorea el sistema en busca de problemas.</p>
          <Button onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
            Analizar ahora
          </Button>
        </div>
      )}
    </div>
  );
}
