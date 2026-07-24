"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, PackageCheck, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import type { CatalogBusiness, CatalogOrder, OrderStatus, PaymentStatus } from "@/lib/catalog-types";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/catalog-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface OrdersResponse {
  orders: CatalogOrder[];
  businesses: CatalogBusiness[];
  selectedClientId: string | null;
  requiresBusinessSelection: boolean;
}

function endpoint(path: string, clientId: string | null) {
  return clientId ? `${path}?clientId=${encodeURIComponent(clientId)}` : path;
}

export function OrdersView() {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<CatalogOrder | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (clientId?: string | null) => {
    setLoading(true);
    try {
      const saved = clientId === undefined ? window.localStorage.getItem("payflow:catalog-client") : clientId;
      const response = await fetch(endpoint("/api/catalog/orders", saved || null), { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar los pedidos.");
      let next = payload as OrdersResponse;
      if (!next.selectedClientId && next.businesses.length === 1) {
        const onlyClientId = next.businesses[0].id;
        window.localStorage.setItem("payflow:catalog-client", onlyClientId);
        const selectedResponse = await fetch(endpoint("/api/catalog/orders", onlyClientId), { credentials: "include" });
        const selectedPayload = await selectedResponse.json().catch(() => ({}));
        if (!selectedResponse.ok) throw new Error(selectedPayload.error || "No se pudieron cargar los pedidos.");
        next = selectedPayload as OrdersResponse;
      }
      setData(next);
      if (next.selectedClientId) {
        setSelectedClientId(next.selectedClientId);
        window.localStorage.setItem("payflow:catalog-client", next.selectedClientId);
      } else setSelectedClientId(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudieron cargar los pedidos."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.orders || []).filter((order) => {
      const matchesStatus = filter === "all" || order.status === filter;
      const matchesQuery = !query || order.orderNumber.toLowerCase().includes(query) || order.customerName.toLowerCase().includes(query) || order.customerPhone.includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [data?.orders, filter, search]);
  const openOrders = (data?.orders || []).filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const today = new Date().toDateString();
  const todayOrders = (data?.orders || []).filter((order) => new Date(order.createdAt).toDateString() === today).length;
  const paidTotal = (data?.orders || []).filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.total, 0);

  function selectBusiness(clientId: string) {
    setSelectedClientId(clientId);
    window.localStorage.setItem("payflow:catalog-client", clientId);
    void load(clientId);
  }

  async function updateOrder(order: CatalogOrder, patch: { status?: OrderStatus; paymentStatus?: PaymentStatus }) {
    setSaving(true);
    try {
      const response = await fetch(endpoint(`/api/catalog/orders/${order.id}`, selectedClientId), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo actualizar el pedido.");
      toast.success("Pedido actualizado.");
      await load(selectedClientId);
      setSelectedOrder((current) => current ? { ...current, ...(patch.status ? { status: patch.status } : {}), ...(patch.paymentStatus ? { paymentStatus: patch.paymentStatus } : {}) } : null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo actualizar."); }
    finally { setSaving(false); }
  }

  if (loading && !data) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" />Cargando pedidos…</div>;

  return <div className="mx-auto max-w-7xl space-y-6 p-5 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight">Pedidos</h1><p className="mt-1 text-sm text-muted-foreground">Operación independiente de WhatsApp: confirma, prepara y completa ventas.</p></div>{(data?.businesses.length || 0) > 0 && <Select value={selectedClientId || undefined} onValueChange={selectBusiness}><SelectTrigger className="w-60"><SelectValue placeholder="Seleccionar negocio" /></SelectTrigger><SelectContent>{data?.businesses.map((business) => <SelectItem key={business.id} value={business.id}>{business.businessName}</SelectItem>)}</SelectContent></Select>}</div>

    {!selectedClientId ? <Card className="border-dashed"><CardContent className="py-16 text-center"><ShoppingBag className="mx-auto mb-3 size-10 text-muted-foreground" /><h2 className="font-semibold">Selecciona un negocio</h2><p className="mt-1 text-sm text-muted-foreground">Los pedidos se mantienen separados por negocio.</p></CardContent></Card> : <>
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Abiertos" value={openOrders} /><Metric label="Recibidos hoy" value={todayOrders} /><Metric label="Total pagado" value={`$${paidTotal.toFixed(2)}`} /></div>
      <div className="flex flex-wrap gap-3"><div className="relative min-w-60 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pedido, cliente o teléfono" className="pl-9" /></div><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem>{Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      {visibleOrders.length === 0 ? <Card className="border-dashed"><CardContent className="py-16 text-center"><PackageCheck className="mx-auto mb-3 size-10 text-muted-foreground" /><h2 className="font-semibold">No hay pedidos</h2><p className="mt-1 text-sm text-muted-foreground">Cuando un cliente compre en el catálogo público aparecerá aquí.</p></CardContent></Card> : <Card><CardContent className="divide-y p-0">{visibleOrders.map((order) => <button key={order.id} className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50" onClick={() => setSelectedOrder(order)}><div className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:flex"><ShoppingBag className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{order.orderNumber}</span><OrderBadge status={order.status} /><PaymentBadge status={order.paymentStatus} /></div><p className="mt-1 truncate text-sm text-muted-foreground">{order.customerName} · {order.items.length} producto(s) · {new Date(order.createdAt).toLocaleString("es-EC")}</p></div><span className="font-semibold">{order.total.toFixed(2)} {order.currency}</span><ChevronRight className="size-4 text-muted-foreground" /></button>)}</CardContent></Card>}
    </>}

    <OrderDialog order={selectedOrder} open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)} saving={saving} onUpdate={updateOrder} />
  </div>;
}

function OrderDialog({ order, open, onOpenChange, saving, onUpdate }: { order: CatalogOrder | null; open: boolean; onOpenChange: (open: boolean) => void; saving: boolean; onUpdate: (order: CatalogOrder, patch: { status?: OrderStatus; paymentStatus?: PaymentStatus }) => void }) {
  if (!order) return null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2">{order.orderNumber}<OrderBadge status={order.status} /><PaymentBadge status={order.paymentStatus} /></DialogTitle></DialogHeader><div className="space-y-5"><div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"><Info label="Cliente" value={order.customerName} /><Info label="Teléfono" value={order.customerPhone || "No indicado"} /><Info label="Correo" value={order.customerEmail || "No indicado"} /><Info label="Canal" value={order.channel} /></div><div><h3 className="mb-2 text-sm font-semibold">Productos</h3><div className="divide-y rounded-lg border">{order.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div><span className="font-medium">{item.productName}</span><p className="text-xs text-muted-foreground">{item.quantity} × {item.unitPrice.toFixed(2)} {order.currency}</p></div><span className="font-semibold">{item.lineTotal.toFixed(2)}</span></div>)}<div className="flex justify-between p-3 font-semibold"><span>Total</span><span>{order.total.toFixed(2)} {order.currency}</span></div></div></div>{order.notes && <div className="rounded-lg bg-muted p-3 text-sm"><span className="font-medium">Nota:</span> {order.notes}</div>}<div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><span className="text-sm font-medium">Estado del pedido</span><Select value={order.status} disabled={saving || order.status === "cancelled"} onValueChange={(status) => onUpdate(order, { status: status as OrderStatus })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><span className="text-sm font-medium">Estado del pago</span><Select value={order.paymentStatus} disabled={saving} onValueChange={(paymentStatus) => onUpdate(order, { paymentStatus: paymentStatus as PaymentStatus })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>{order.whatsappNotificationStatus === "sent" && <div className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="size-4" />Confirmación enviada por WhatsApp.</div>}</div></DialogContent></Dialog>;
}

function OrderBadge({ status }: { status: OrderStatus }) { const color = status === "completed" ? "bg-emerald-100 text-emerald-700" : status === "cancelled" ? "bg-red-100 text-red-700" : status === "new" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"; return <Badge className={cn("border-0", color)}>{ORDER_STATUS_LABELS[status]}</Badge>; }
function PaymentBadge({ status }: { status: PaymentStatus }) { return <Badge variant={status === "paid" ? "default" : "outline"}>{PAYMENT_STATUS_LABELS[status]}</Badge>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></CardContent></Card>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>; }
