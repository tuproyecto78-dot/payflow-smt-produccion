"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { maskDocument } from "@/lib/security";
import { Inbox, Loader2, Mail, Phone, Calendar, Building2, User } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SubscriptionItem {
  id: string; selectedPlan: string; fullName: string; countryCode: string; phoneNumber: string;
  email: string; documentId: string; businessName: string | null; businessType: string | null;
  country: string | null; subscriptionStatus: string; createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending_review: { label: "Pendiente", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  contacted: { label: "Contactado", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" },
  active: { label: "Activo", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  rejected: { label: "Rechazado", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
};

export function SubscriptionsView() {
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscriptions");
      if (!res.ok) { toast.error("Error al cargar solicitudes"); return; }
      const data = await res.json();
      setItems(data.requests || []);
    } catch { toast.error("Error de red"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(id: string, status: string) {
    setUpdating(id);
    try {
      const res = await fetch(`/api/subscriptions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) { toast.error("Error al actualizar estado"); return; }
      toast.success("Estado actualizado");
      setItems((prev) => prev.map((it) => it.id === id ? { ...it, subscriptionStatus: status } : it));
    } catch { toast.error("Error de red"); } finally { setUpdating(null); }
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="p-5 border-b border-border shrink-0">
        <h1 className="text-xl font-bold flex items-center gap-2"><Inbox className="size-5 text-primary" />Solicitudes de suscripción</h1>
        <p className="text-sm text-muted-foreground mt-1">Lista simple de solicitudes recibidas desde la landing page.</p>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3 max-w-4xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin mr-2" />Cargando…</div>
          ) : items.length === 0 ? (
            <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center text-center py-16"><Inbox className="size-10 mb-3 opacity-40 text-muted-foreground" /><p className="text-sm font-medium text-muted-foreground">Aún no hay solicitudes</p><p className="text-xs text-muted-foreground mt-1">Las solicitudes de suscripción desde la landing page aparecerán aquí.</p></CardContent></Card>
          ) : (
            items.map((item) => {
              const sc = STATUS_CONFIG[item.subscriptionStatus] || { label: item.subscriptionStatus, cls: "bg-muted text-muted-foreground" };
              return (
                <Card key={item.id} className="overflow-hidden">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <CardTitle className="text-sm flex items-center gap-2"><User className="size-3.5 text-primary" />{item.fullName}</CardTitle>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                          <span><Badge variant="outline" className="text-[10px]">{item.selectedPlan === "anual" ? "Anual $89" : "Trimestral $25"}</Badge></span>

                          <span className="flex items-center gap-1"><Mail className="size-3" />{item.email}</span>
                          <span className="flex items-center gap-1"><Phone className="size-3" />+{item.countryCode} {item.phoneNumber}</span>
                          {item.businessName && <span className="flex items-center gap-1"><Building2 className="size-3" />{item.businessName}</span>}
                          <span className="flex items-center gap-1"><Calendar className="size-3" />{format(new Date(item.createdAt), "d MMM yyyy, HH:mm", { locale: es })}</span>
                        </div>
                      </div>
                      <Badge className={cn("shrink-0", sc.cls)}>{sc.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-1">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-2">
                      <span>Cédula/DNI: <strong className="text-foreground font-mono">{maskDocument(item.documentId)}</strong></span>
                      {item.businessType && <span>Tipo: <strong className="text-foreground">{item.businessType}</strong></span>}
                      {item.country && <span>País: <strong className="text-foreground">{item.country}</strong></span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Cambiar estado:</span>
                      <Select value={item.subscriptionStatus} onValueChange={(v) => changeStatus(item.id, v)} disabled={updating === item.id}>
                        <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="pending_review">Pendiente</SelectItem><SelectItem value="contacted">Contactado</SelectItem><SelectItem value="active">Activo</SelectItem><SelectItem value="rejected">Rechazado</SelectItem></SelectContent>
                      </Select>
                      {updating === item.id && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
