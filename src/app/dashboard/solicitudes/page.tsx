"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  History,
  Inbox,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ───────────────────────────────────────────────────────────────────

type SubscriptionStatus =
  | "pending_review"
  | "reviewed"
  | "activated"
  | "rejected";

type PayphoneBusinessStatus =
  | "not_configured"
  | "in_process"
  | "configured"
  | "active";

interface SubscriptionRequest {
  id: string;
  selectedPlan: string;
  selectedPlanLabel: string | null;
  selectedPlanPrice: number | null;
  fullName: string;
  email: string;
  businessName: string;
  businessType: string | null;
  country: string | null;
  city: string | null;
  paymentProvider: string | null;
  payphoneBusinessStatus: PayphoneBusinessStatus;
  payphonePreregistrationStatus: string | null;
  hasPayphoneBusiness: string | null;
  startPaymentsConfig: boolean;
  consentAccepted: boolean;
  subscriptionStatus: SubscriptionStatus;
  activatedClientId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HistoryEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  clientId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface SubscriptionHistoryPayload {
  subscription: {
    id: string;
    fullName: string;
    email: string;
    businessName: string;
    subscriptionStatus: SubscriptionStatus;
    payphoneBusinessStatus: PayphoneBusinessStatus;
    payphonePreregistrationStatus: string;
    activatedClientId: string | null;
    createdAt: string;
  } | null;
  history: HistoryEntry[];
}

// ─── Label maps (Spanish) ────────────────────────────────────────────────────

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  pending_review: "Pendiente de revisión",
  reviewed: "Revisada",
  activated: "Activada",
  rejected: "Rechazada",
};

const PAYPHONE_STATUS_LABELS: Record<PayphoneBusinessStatus, string> = {
  not_configured: "No configurado",
  in_process: "En proceso",
  configured: "Configurado",
  active: "Activo",
};

const ACTION_LABELS: Record<string, string> = {
  subscription_request_created: "Solicitud creada",
  subscription_request_reviewed: "Solicitud revisada",
  client_activated: "Cliente activado",
  payphone_config_checked: "Configuración PayPhone verificada",
  payphone_preregistration_checked: "Pre-registro PayPhone consultado",
  payphone_preregistration_sent: "Pre-registro PayPhone enviado",
  payphone_link_created: "Link PayPhone generado",
  payment_created: "Pago creado",
  payment_status_updated: "Estado de pago actualizado",
  payment_status_changed: "Estado de pago actualizado",
  workflow_created: "Flujo creado",
  workflow_activated: "Flujo activado",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

// ─── Sensitive keys filter (defense in depth) ────────────────────────────────

const SENSITIVE_KEY_FRAGMENTS = [
  "token",
  "raw_response",
  "rawresponse",
  "password",
  "passwd",
  "secret",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "authorization",
  "apikey",
  "api_key",
  "private_key",
  "privatekey",
  "credential",
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

function safeMetadataString(meta: unknown): string {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return JSON.stringify(meta ?? {}, null, 2);
  }
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (isSensitiveKey(k)) continue;
    cleaned[k] = v;
  }
  return JSON.stringify(cleaned, null, 2);
}

// ─── Date formatting ─────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-EC", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ─── Badge helpers ───────────────────────────────────────────────────────────

const STATUS_BADGE_CLS: Record<SubscriptionStatus, string> = {
  pending_review:
    "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  reviewed:
    "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  activated:
    "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected:
    "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300",
};

const PAYPHONE_BADGE_CLS: Record<PayphoneBusinessStatus, string> = {
  not_configured:
    "border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-300",
  in_process:
    "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  configured:
    "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  active:
    "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <Badge variant="outline" className={STATUS_BADGE_CLS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function PayphoneStatusBadge({ status }: { status: PayphoneBusinessStatus }) {
  return (
    <Badge variant="outline" className={PAYPHONE_BADGE_CLS[status]}>
      {PAYPHONE_STATUS_LABELS[status]}
    </Badge>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SolicitudesPage() {
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History dialog state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<SubscriptionHistoryPayload | null>(null);
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);

  // Activation state
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", { credentials: "include" });
      if (res.status === 401) {
        setError("Tu sesión expiró. Inicia sesión nuevamente.");
        setTimeout(() => { window.location.href = "/login?next=/dashboard/solicitudes"; }, 2000);
        return;
      }
      if (res.status === 403) {
        setError("No tienes permisos para esta acción.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data && typeof data === "object" && "error" in data && String((data as { error?: unknown }).error)) ||
            "No se pudieron cargar las solicitudes."
        );
      }
      const data = (await res.json()) as { requests?: SubscriptionRequest[] };
      setRequests(Array.isArray(data?.requests) ? data.requests : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const openHistory = useCallback(async (id: string) => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryData(null);
    setHistoryTargetId(id);
    try {
      const res = await fetch(
        `/api/admin/subscriptions/${encodeURIComponent(id)}/history`,
        { credentials: "include" }
      );
      const data = (await res.json().catch(() => ({}))) as SubscriptionHistoryPayload & { error?: string };
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo cargar el historial.");
      }
      setHistoryData(data);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const onActivate = useCallback(
    async (id: string) => {
      setActivatingId(id);
      try {
        const res = await fetch(
          `/api/admin/subscriptions/${encodeURIComponent(id)}/activate`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data?.error || "No se pudo activar la solicitud.");
        }
        toast.success(data?.message || "Cliente activado correctamente.");
        void load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error desconocido.");
      } finally {
        setActivatingId(null);
      }
    },
    [load]
  );

  const hasRows = requests.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Solicitudes
          </h1>
          <p className="text-muted-foreground mt-1">
            Solicitudes de suscripción pendientes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing || loading}
        >
          {refreshing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Actualizar
        </Button>
      </div>

      {/* Error banner */}
      {error && !loading && (
        <Card className="mb-6 border-red-500/40 bg-red-500/5 py-0">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="size-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                No se pudieron cargar las solicitudes
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-words">
                {error}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" />
            <p className="text-sm">Cargando solicitudes…</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && !hasRows && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No hay solicitudes registradas</p>
              <p className="text-xs text-muted-foreground mt-1">
                Las nuevas solicitudes de suscripción aparecerán aquí.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {!loading && !error && hasRows && (
        <>
          {/* Desktop table (md+) */}
          <Card className="hidden md:block py-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Fecha</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Negocio</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>PayPhone Business</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => {
                  const isPending = r.subscriptionStatus === "pending_review";
                  const isActivating = activatingId === r.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(r.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.fullName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.businessName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {r.selectedPlanLabel || r.selectedPlan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.subscriptionStatus} />
                      </TableCell>
                      <TableCell>
                        <PayphoneStatusBadge
                          status={r.payphoneBusinessStatus}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openHistory(r.id)}
                          >
                            <History className="size-4" />
                            Ver historial
                          </Button>
                          {isPending && (
                            <Button
                              size="sm"
                              onClick={() => void onActivate(r.id)}
                              disabled={isActivating}
                            >
                              {isActivating ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="size-4" />
                              )}
                              Activar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards (below md) */}
          <div className="md:hidden space-y-3">
            {requests.map((r) => {
              const isPending = r.subscriptionStatus === "pending_review";
              const isActivating = activatingId === r.id;
              return (
                <Card key={r.id}>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{r.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.email}
                        </p>
                      </div>
                      <StatusBadge status={r.subscriptionStatus} />
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-muted-foreground">Negocio</p>
                        <p className="font-medium truncate">{r.businessName}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Plan</p>
                        <p className="font-medium">
                          {r.selectedPlanLabel || r.selectedPlan}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">PayPhone</p>
                        <div className="pt-0.5">
                          <PayphoneStatusBadge
                            status={r.payphoneBusinessStatus}
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fecha</p>
                        <p className="font-medium">
                          {formatDate(r.createdAt)}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => void openHistory(r.id)}
                      >
                        <History className="size-4" />
                        Ver historial
                      </Button>
                      {isPending && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => void onActivate(r.id)}
                          disabled={isActivating}
                        >
                          {isActivating ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="size-4" />
                          )}
                          Activar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historial de la solicitud</DialogTitle>
            <DialogDescription className="truncate">
              {historyData?.subscription
                ? `${historyData.subscription.fullName} · ${historyData.subscription.email}`
                : historyTargetId
                ? "Cargando historial de auditoría…"
                : "Selecciona una solicitud para ver su historial."}
            </DialogDescription>
          </DialogHeader>

          {historyLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                <span className="text-sm">Cargando historial…</span>
              </div>
            </div>
          )}

          {!historyLoading && historyError && (
            <div className="flex items-start gap-3 rounded-md border border-red-500/40 bg-red-500/5 p-4">
              <AlertCircle className="size-5 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  No se pudo cargar el historial
                </p>
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  {historyError}
                </p>
              </div>
            </div>
          )}

          {!historyLoading && !historyError && historyData && (
            <>
              {historyData.history.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No hay eventos registrados para esta solicitud.
                </div>
              ) : (
                <ScrollArea className="max-h-[60vh]">
                  <div className="space-y-3 pr-2">
                    {historyData.history.map((h) => {
                      const metaStr = safeMetadataString(h.metadata);
                      const hasMeta =
                        !!h.metadata &&
                        typeof h.metadata === "object" &&
                        !Array.isArray(h.metadata) &&
                        Object.keys(h.metadata as Record<string, unknown>)
                          .length > 0;
                      return (
                        <div
                          key={h.id}
                          className="rounded-md border bg-card p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              {actionLabel(h.action)}
                            </p>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {formatDate(h.createdAt)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>IP: {h.ipAddress || "—"}</span>
                            <span className="opacity-60">·</span>
                            <span>Tipo: {h.entityType || "—"}</span>
                          </div>
                          {hasMeta && (
                            <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/60 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono">
                              {metaStr}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
