"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, MessageCircle, CreditCard, CalendarClock, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CommercialAgentView() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ conversations: 0, payments: 0, appointments: 0, human: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Try loading conversations from the commercial-agent API
      const res = await fetch("/api/commercial-agent/conversations").catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        const convs = data.conversations || [];
        setStats({
          conversations: convs.filter((c: any) => c.status === "active").length,
          payments: convs.filter((c: any) => c.nextAction === "create_payment").length,
          appointments: convs.filter((c: any) => c.nextAction === "schedule_meeting").length,
          human: convs.filter((c: any) => c.status === "needs_human").length,
        });
      }
    } catch { toast.error("Error al cargar datos del agente"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="p-5 border-b border-border shrink-0">
        <h1 className="text-xl font-bold flex items-center gap-2"><Bot className="size-5 text-purple-500" />Agente Comercial IA</h1>
        <p className="text-sm text-muted-foreground mt-1">Conversaciones activas, pagos generados, citas agendadas y clientes que requieren atención humana.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <StatCard icon={<MessageCircle className="size-4" />} label="Conversaciones activas" value={stats.conversations} color="text-sky-600" />
          <StatCard icon={<CreditCard className="size-4" />} label="Pagos generados" value={stats.payments} color="text-emerald-600" />
          <StatCard icon={<CalendarClock className="size-4" />} label="Citas agendadas" value={stats.appointments} color="text-purple-600" />
          <StatCard icon={<UserCheck className="size-4" />} label="Requieren humano" value={stats.human} color="text-amber-600" />
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 max-w-4xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin mr-2" />Cargando…</div>
          ) : (
            <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center text-center py-16"><Bot className="size-10 mb-3 opacity-40 text-muted-foreground" /><p className="text-sm font-medium text-muted-foreground">Las conversaciones del agente aparecerán aquí cuando se ejecuten flujos con el nodo Agente Comercial IA.</p></CardContent></Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={cn("flex items-center gap-1.5 mb-1", color)}>{icon}<span className="text-[10px] font-medium uppercase tracking-wider opacity-80">{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
