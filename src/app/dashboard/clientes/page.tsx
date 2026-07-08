"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type PayphoneBusinessStatus =
  | "not_configured"
  | "in_process"
  | "configured"
  | "active";

type PayphonePreregistrationStatus =
  | "not_requested"
  | "pending"
  | "sent"
  | "active"
  | "error";

type TestLinkStatus = "pending" | "generated" | "error";
type ExternalNotificationStatus = "not_active" | "active";
type ClientStatus = "active" | "suspended" | "cancelled";

interface PaymentAccount {
  id: string;
  provider: string;
  providerMode?: string;
  payphoneBusinessStatus: PayphoneBusinessStatus;
  payphonePreregistrationStatus: PayphonePreregistrationStatus;
  tokenConfigured: boolean;
  storeIdConfigured: boolean;
  storeIdLastFour: string | null;
  externalNotificationStatus: ExternalNotificationStatus;
  testLinkStatus: TestLinkStatus;
  updatedAt?: string;
}

interface Client {
  id: string;
  businessName: string;
  businessType?: string;
  ownerEmail: string;
  ownerPhone?: string;
  ownerDocument?: string;
  country?: string;
  city?: string;
  status: ClientStatus;
  paymentProvider?: string;
  createdAt?: string;
  paymentAccounts: PaymentAccount[];
}

interface PayphoneServer {
  configured: boolean;
  env: string;
  mode: string;
  tokenConfigured: boolean;
  storeIdConfigured: boolean;
  storeIdLastFour: string | null;
  storeIdMasked: string | null;
  externalNotificationEnabled: boolean;
  preregistrationEnabled: boolean;
}

interface PayphoneDetail {
  client: { id: string; businessName: string; status: ClientStatus };
  server: PayphoneServer;
  paymentAccount: PaymentAccount | null;
}

interface TestLinkResponse {
  ok: boolean;
  payment_link?: string;
  client_transaction_id?: string;
  payment_transaction_id?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  store_id_masked?: string;
  message?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getPayphoneAccount(client: Client): PaymentAccount | null {
  if (!client?.paymentAccounts?.length) return null;
  return (
    client.paymentAccounts.find((p) => p.provider === "payphone") ||
    client.paymentAccounts[0] ||
    null
  );
}

function clientStatusBadge(status: ClientStatus) {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
          Activo
        </Badge>
      );
    case "suspended":
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/15">
          Suspendido
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/15">
          Cancelado
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function businessStatusBadge(status: PayphoneBusinessStatus) {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
          Activo
        </Badge>
      );
    case "configured":
      return (
        <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 hover:bg-violet-500/15">
          Configurado
        </Badge>
      );
    case "in_process":
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/15">
          En proceso
        </Badge>
      );
    case "not_configured":
    default:
      return <Badge variant="secondary">No configurado</Badge>;
  }
}

function preregistrationLabel(
  server: PayphoneServer | null,
  pa: PaymentAccount | null
): { text: string; tone: "muted" | "warn" | "info" | "ok" | "err" } {
  if (!server?.preregistrationEnabled) {
    return { text: "no habilitado", tone: "muted" };
  }
  const s = pa?.payphonePreregistrationStatus || "not_requested";
  switch (s) {
    case "active":
      return { text: "activado", tone: "ok" };
    case "sent":
      return { text: "enviado", tone: "info" };
    case "error":
      return { text: "error", tone: "err" };
    case "pending":
      return { text: "pendiente", tone: "warn" };
    case "not_requested":
    default:
      return { text: "pendiente", tone: "warn" };
  }
}

function testLinkLabel(status: TestLinkStatus | undefined): {
  text: string;
  tone: "muted" | "warn" | "ok" | "err";
} {
  switch (status) {
    case "generated":
      return { text: "generado", tone: "ok" };
    case "error":
      return { text: "error", tone: "err" };
    case "pending":
    default:
      return { text: "pendiente", tone: "warn" };
  }
}

function externalNotifLabel(status: ExternalNotificationStatus | undefined): {
  text: string;
  tone: "muted" | "ok";
} {
  return status === "active"
    ? { text: "activa", tone: "ok" }
    : { text: "no activa", tone: "muted" };
}

function toneBadge(
  tone: "muted" | "warn" | "info" | "ok" | "err",
  text: string
) {
  switch (tone) {
    case "ok":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
          {text}
        </Badge>
      );
    case "warn":
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/15">
          {text}
        </Badge>
      );
    case "info":
      return (
        <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 hover:bg-violet-500/15">
          {text}
        </Badge>
      );
    case "err":
      return (
        <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/15">
          {text}
        </Badge>
      );
    case "muted":
    default:
      return <Badge variant="secondary">{text}</Badge>;
  }
}

function yesNoBadge(value: boolean) {
  return value ? (
    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
      Sí
    </Badge>
  ) : (
    <Badge variant="secondary">No</Badge>
  );
}

function maskedStoreId(
  server: PayphoneServer | null,
  pa: PaymentAccount | null
): string {
  if (server?.storeIdMasked) return server.storeIdMasked;
  const last4 =
    server?.storeIdLastFour || pa?.storeIdLastFour || null;
  return last4 ? `****${last4}` : "—";
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [detail, setDetail] = useState<PayphoneDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Action state
  const [markingActive, setMarkingActive] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [testLink, setTestLink] = useState<TestLinkResponse | null>(null);
  const [testLinkError, setTestLinkError] = useState<string | null>(null);

  const loadClients = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch("/api/admin/clients", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudieron cargar los clientes.");
      }
      const data = await res.json();
      setClients(Array.isArray(data.clients) ? data.clients : []);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error desconocido al cargar.";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const fetchDetail = useCallback(async (clientId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/payphone`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || "No se pudo obtener la configuración PayPhone."
        );
      }
      const data = await res.json();
      setDetail(data as PayphoneDetail);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error desconocido.";
      setDetailError(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openPayphoneDialog = useCallback(
    async (client: Client) => {
      setActiveClient(client);
      setDialogOpen(true);
      setDetail(null);
      setDetailError(null);
      setTestLink(null);
      setTestLinkError(null);
      await fetchDetail(client.id);
    },
    [fetchDetail]
  );

  const handleVerify = useCallback(async () => {
    if (!activeClient) return;
    await fetchDetail(activeClient.id);
  }, [activeClient, fetchDetail]);

  const handleMarkActive = useCallback(async () => {
    if (!activeClient) return;
    setMarkingActive(true);
    try {
      const res = await fetch(
        `/api/admin/clients/${activeClient.id}/payphone`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markActive: true }),
          credentials: "include",
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || "No se pudo marcar PayPhone Business como activo."
        );
      }
      await fetchDetail(activeClient.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      setDetailError(msg);
    } finally {
      setMarkingActive(false);
    }
  }, [activeClient, fetchDetail]);

  const handleGenerateLink = useCallback(async () => {
    if (!activeClient) return;
    setGeneratingLink(true);
    setTestLink(null);
    setTestLinkError(null);
    try {
      const res = await fetch(
        `/api/admin/clients/${activeClient.id}/test-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        }
      );
      const data = (await res.json().catch(() => ({}))) as TestLinkResponse;
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error || data.message || "No se pudo generar el link de prueba."
        );
      }
      setTestLink(data);
      // Refresh detail so testLinkStatus badge updates
      await fetchDetail(activeClient.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      setTestLinkError(msg);
    } finally {
      setGeneratingLink(false);
    }
  }, [activeClient, fetchDetail]);

  const filtered = clients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.businessName?.toLowerCase().includes(q) ||
      c.ownerEmail?.toLowerCase().includes(q) ||
      c.ownerPhone?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.country?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <header className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300 flex items-center justify-center">
              <Users className="size-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Clientes activados
            </h1>
          </div>
          <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">
            Gestión de clientes y configuración PayPhone.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => loadClients({ silent: true })}
          disabled={refreshing || loading}
          className="shrink-0"
        >
          {refreshing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Actualizar
        </Button>
      </header>

      {/* Toolbar */}
      <Card className="p-4 sm:p-5 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por negocio, email, teléfono, ciudad…"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring transition-colors"
              aria-label="Buscar clientes"
            />
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground">
            {loading
              ? "Cargando…"
              : `${filtered.length} cliente${filtered.length === 1 ? "" : "s"}`}
          </div>
        </div>
      </Card>

      {/* States */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadClients()} />
      ) : filtered.length === 0 ? (
        <EmptyState hasSearch={!!search.trim()} />
      ) : (
        <ClientsTable
          clients={filtered}
          onOpenPayphone={openPayphoneDialog}
        />
      )}

      {/* PayPhone Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-300 flex items-center justify-center">
                <CreditCard className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg">
                  Configuración PayPhone
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  {activeClient?.businessName || "Cliente"}
                  {activeClient?.ownerEmail
                    ? ` · ${activeClient.ownerEmail}`
                    : ""}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Detail loading */}
          {detailLoading && !detail && (
            <div className="flex items-center justify-center py-10 gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando configuración PayPhone…
            </div>
          )}

          {/* Detail error */}
          {detailError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 sm:p-4 flex items-start gap-2.5">
              <AlertCircle className="size-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-rose-700 dark:text-rose-300">
                  No se pudo cargar la configuración
                </div>
                <div className="text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                  {detailError}
                </div>
              </div>
            </div>
          )}

          {/* Detail body */}
          {detail && (
            <PayphoneDetailBody
              detail={detail}
              activeClient={activeClient}
            />
          )}

          {/* Test link result */}
          {testLinkError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 sm:p-4 flex items-start gap-2.5">
              <AlertCircle className="size-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-rose-700 dark:text-rose-300">
                  No se pudo generar el link de prueba
                </div>
                <div className="text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                  {testLinkError}
                </div>
              </div>
            </div>
          )}

          {testLink && testLink.payment_link && (
            <TestLinkSuccessBox testLink={testLink} />
          )}

          <Separator />

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                onClick={handleVerify}
                disabled={detailLoading}
                className="w-full"
              >
                {detailLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Verificar configuración
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerateLink}
                disabled={generatingLink}
                className="w-full border-violet-500/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
              >
                {generatingLink ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Generar link de prueba
              </Button>
              <Button
                onClick={handleMarkActive}
                disabled={markingActive}
                className="w-full bg-violet-600 hover:bg-violet-600/90 text-white"
              >
                {markingActive ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Marcar Business activo
              </Button>
            </div>
          </div>

          <DialogFooter className="pt-2 sm:pt-0">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function LoadingState() {
  return (
    <Card className="p-8 sm:p-12">
      <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-violet-500" />
        <p className="text-sm">Cargando clientes…</p>
      </div>
    </Card>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <div className="size-10 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300 flex items-center justify-center">
          <AlertCircle className="size-5" />
        </div>
        <div>
          <p className="font-medium text-foreground">Error al cargar</p>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        </div>
        <Button variant="outline" onClick={onRetry} className="mt-1">
          <RefreshCw className="size-4" />
          Reintentar
        </Button>
      </div>
    </Card>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <Card className="p-8 sm:p-12">
      <div className="flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center">
          <Users className="size-5" />
        </div>
        <div>
          <p className="font-medium text-foreground">
            {hasSearch ? "Sin resultados" : "Aún no hay clientes"}
          </p>
          <p className="text-sm mt-1">
            {hasSearch
              ? "No se encontraron clientes con ese criterio. Prueba con otro término."
              : "Cuando un administrador active una cuenta de cliente, aparecerá aquí."}
          </p>
        </div>
      </div>
    </Card>
  );
}

function ClientsTable({
  clients,
  onOpenPayphone,
}: {
  clients: Client[];
  onOpenPayphone: (c: Client) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Negocio</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Ciudad</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const pa = getPayphoneAccount(c);
              return (
                <tr
                  key={c.id}
                  className="border-t border-border/60 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {c.businessName || "—"}
                    </div>
                    {c.businessType ? (
                      <div className="text-xs text-muted-foreground">
                        {c.businessType}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.ownerEmail || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.ownerPhone || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.city || c.country || "—"}
                  </td>
                  <td className="px-4 py-3">{clientStatusBadge(c.status)}</td>
                  <td className="px-4 py-3">
                    {pa?.provider === "payphone" ? (
                      <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 hover:bg-violet-500/15">
                        payphone
                      </Badge>
                    ) : pa?.provider ? (
                      <Badge variant="secondary">{pa.provider}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenPayphone(c)}
                      className="border-violet-500/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
                    >
                      <CreditCard className="size-3.5" />
                      Ver PayPhone
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-border/60">
        {clients.map((c) => {
          const pa = getPayphoneAccount(c);
          return (
            <div key={c.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">
                    {c.businessName || "—"}
                  </div>
                  {c.businessType ? (
                    <div className="text-xs text-muted-foreground truncate">
                      {c.businessType}
                    </div>
                  ) : null}
                </div>
                {clientStatusBadge(c.status)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Email</div>
                  <div className="text-foreground truncate">
                    {c.ownerEmail || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Teléfono</div>
                  <div className="text-foreground">
                    {c.ownerPhone || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Ciudad</div>
                  <div className="text-foreground">
                    {c.city || c.country || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Proveedor</div>
                  <div>
                    {pa?.provider === "payphone" ? (
                      <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 hover:bg-violet-500/15">
                        payphone
                      </Badge>
                    ) : pa?.provider ? (
                      <Badge variant="secondary">{pa.provider}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenPayphone(c)}
                className="w-full border-violet-500/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
              >
                <CreditCard className="size-3.5" />
                Ver PayPhone
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DetailRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint ? (
          <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PayphoneDetailBody({
  detail,
  activeClient,
}: {
  detail: PayphoneDetail;
  activeClient: Client | null;
}) {
  const { server, paymentAccount } = detail;
  // Prefer the freshly-fetched paymentAccount; fall back to the row in the list.
  const pa = paymentAccount || (activeClient ? getPayphoneAccount(activeClient) : null);
  const pre = preregistrationLabel(server, pa);
  const tl = testLinkLabel(pa?.testLinkStatus);
  const ext = externalNotifLabel(pa?.externalNotificationStatus);

  return (
    <div className="flex flex-col gap-3">
      {/* Estado PayPhone Business */}
      <div className="rounded-lg border border-border/70 bg-muted/30 p-3 sm:p-4">
        <DetailRow
          label="Estado PayPhone Business"
          hint="Estado del negocio en PayPhone para este cliente"
        >
          {businessStatusBadge(
            pa?.payphoneBusinessStatus || "not_configured"
          )}
        </DetailRow>
        <Separator className="my-1" />
        <DetailRow label="Token configurado" hint="Variable de servidor">
          {yesNoBadge(server?.tokenConfigured ?? pa?.tokenConfigured ?? false)}
        </DetailRow>
        <Separator className="my-1" />
        <DetailRow label="StoreID configurado" hint="Variable de servidor">
          {yesNoBadge(
            server?.storeIdConfigured ?? pa?.storeIdConfigured ?? false
          )}
        </DetailRow>
        <Separator className="my-1" />
        <DetailRow
          label="StoreID últimos 4"
          hint="Identificador de tienda enmascarado"
        >
          <code className="rounded bg-muted px-2 py-1 text-xs font-mono">
            {maskedStoreId(server, pa)}
          </code>
        </DetailRow>
      </div>

      {/* Estado de procesos */}
      <div className="rounded-lg border border-border/70 bg-muted/30 p-3 sm:p-4">
        <DetailRow
          label="Pre-registro"
          hint={
            server?.preregistrationEnabled
              ? "Proceso de pre-registro habilitado"
              : "El pre-registro no está habilitado en el servidor"
          }
        >
          {toneBadge(pre.tone, pre.text)}
        </DetailRow>
        <Separator className="my-1" />
        <DetailRow
          label="Link de prueba"
          hint="Estado del último link de prueba generado"
        >
          {toneBadge(tl.tone, tl.text)}
        </DetailRow>
        <Separator className="my-1" />
        <DetailRow
          label="Notificación externa"
          hint="Webhook de confirmación externa"
        >
          {toneBadge(ext.tone, ext.text)}
        </DetailRow>
      </div>

      {/* Server env info (safe to show) */}
      <div className="rounded-lg border border-border/70 p-3 sm:p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Entorno</div>
            <div className="font-medium text-foreground capitalize">
              {server?.env || "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Modo</div>
            <div className="font-medium text-foreground capitalize">
              {server?.mode || pa?.providerMode || "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Configurado</div>
            <div className="font-medium text-foreground">
              {server?.configured ? "Sí" : "No"}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <ShieldCheck className="size-3.5 mt-0.5 shrink-0" />
        Por seguridad, los tokens y StoreID completos no se muestran. Solo se
        muestran los últimos 4 dígitos del StoreID.
      </p>
    </div>
  );
}

function TestLinkSuccessBox({ testLink }: { testLink: TestLinkResponse }) {
  const link = testLink.payment_link || "";
  const whatsappMsg =
    "Te comparto tu link seguro de pago PayPhone. Cuando completes el pago, confirmaremos tu transacción.";

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium text-sm">
        <CheckCircle2 className="size-4" />
        Link de prueba generado
      </div>

      {testLink.message ? (
        <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
          {testLink.message}
        </p>
      ) : null}

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">
          Enlace de pago
        </div>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 dark:text-violet-300 hover:underline break-all"
        >
          {link}
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      </div>

      {(testLink.amount !== undefined || testLink.currency || testLink.reference) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {testLink.amount !== undefined ? (
            <div>
              <div className="text-muted-foreground">Monto</div>
              <div className="font-medium text-foreground">
                {testLink.amount.toFixed(2)} {testLink.currency || ""}
              </div>
            </div>
          ) : null}
          {testLink.reference ? (
            <div>
              <div className="text-muted-foreground">Referencia</div>
              <div className="font-medium text-foreground truncate">
                {testLink.reference}
              </div>
            </div>
          ) : null}
          {testLink.store_id_masked ? (
            <div>
              <div className="text-muted-foreground">StoreID</div>
              <div className="font-mono font-medium text-foreground">
                {testLink.store_id_masked}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <Separator className="my-1" />

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
          <Send className="size-3" />
          Mensaje sugerido para WhatsApp
        </div>
        <p className="text-sm text-foreground italic bg-background/60 rounded-md p-2.5 border border-border/60">
          &ldquo;{whatsappMsg}&rdquo;
        </p>
      </div>
    </div>
  );
}
