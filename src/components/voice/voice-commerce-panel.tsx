"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  VoiceCommerceDashboard,
  VoicePaymentMethod,
  VoicePaymentStatus,
} from "@/lib/voice/commerce-types";
import type { VoiceBusiness, VoiceDashboardData } from "@/lib/voice/types";

const methodLabels: Record<VoicePaymentMethod, string> = {
  payment_link: "Enlace de pago existente",
  bank_transfer: "Transferencia bancaria",
  cash: "Efectivo",
  cash_on_delivery: "Pago contra entrega",
};

const statusLabels: Record<VoicePaymentStatus, string> = {
  pending: "Pendiente",
  proof_received: "Comprobante recibido",
  paid: "Pagado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const duration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
};

type FormState = {
  label: string;
  method: VoicePaymentMethod;
  providerLabel: string;
  paymentUrl: string;
  bankName: string;
  accountHolder: string;
  accountType: string;
  accountReferenceMasked: string;
  instructions: string;
  isDefault: boolean;
};

const emptyForm: FormState = {
  label: "Cobro principal",
  method: "payment_link",
  providerLabel: "",
  paymentUrl: "",
  bankName: "",
  accountHolder: "",
  accountType: "",
  accountReferenceMasked: "",
  instructions: "",
  isDefault: true,
};

export function VoiceCommercePanel() {
  const [voice, setVoice] = useState<VoiceDashboardData | null>(null);
  const [clientId, setClientId] = useState("");
  const [data, setData] = useState<VoiceCommerceDashboard | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const loadCommerce = useCallback(async (selectedClientId: string) => {
    if (!selectedClientId) return;
    setLoading(true);
    const response = await fetch(
      `/api/voice/commerce?clientId=${encodeURIComponent(selectedClientId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar la operación.");
    setData(payload);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/voice", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar Llamadas IA.");
        setVoice(payload);
        const initialClientId =
          payload.selectedClientId ?? payload.businesses?.[0]?.id ?? "";
        setClientId(initialClientId);
        if (initialClientId) await loadCommerce(initialClientId);
        else setLoading(false);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Error al cargar.");
        setLoading(false);
      }
    })();
  }, [loadCommerce]);

  const businesses = voice?.businesses ?? [];
  const selectedBusiness = useMemo(
    () => businesses.find((business: VoiceBusiness) => business.id === clientId),
    [businesses, clientId],
  );

  async function saveProfile() {
    if (!clientId) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/voice/commerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, active: true, ...form }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");
      setNotice("Forma de cobro guardada para este negocio.");
      setForm({ ...emptyForm, isDefault: false });
      await loadCommerce(clientId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(referenceId: string, status: VoicePaymentStatus) {
    setNotice("");
    const response = await fetch("/api/voice/commerce", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, referenceId, status }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error ?? "No se pudo actualizar el pago.");
      return;
    }
    setNotice("Estado de pago actualizado.");
    await loadCommerce(clientId);
  }

  const kpis = data?.kpis;
  const cards = kpis
    ? [
        ["Llamadas", String(kpis.totalCalls), `${kpis.answeredCalls} atendidas · ${kpis.missedCalls} perdidas`],
        ["Conversión", `${kpis.conversionRate}%`, `${kpis.orders} pedidos · ${kpis.reservations} reservas`],
        ["Ventas atribuibles", money(kpis.attributableSales, kpis.currency), `Ticket medio ${money(kpis.averageTicket, kpis.currency)}`],
        ["Por confirmar", money(kpis.pendingAmount, kpis.currency), `${kpis.paidPayments} pagos confirmados`],
        ["Uso", `${kpis.minutes} min`, `Promedio ${duration(kpis.averageDurationSeconds)}`],
        ["Costo estimado", money(kpis.telephonyCost + kpis.aiCost, kpis.currency), `Telefonía + IA · pico ${kpis.peakHour ?? "—"}`],
      ]
    : [];

  return (
    <section className="space-y-6 border-t bg-slate-50/70 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Operación, cobros y KPIs</h2>
            <p className="text-sm text-muted-foreground">
              Trazabilidad llamada → pedido o reserva → referencia de pago → WhatsApp.
              PayFlow registra la referencia; el dinero permanece en la cuenta del negocio.
            </p>
          </div>
          {businesses.length > 1 ? (
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                void loadCommerce(event.target.value);
              }}
            >
              {businesses.map((business: VoiceBusiness) => (
                <option key={business.id} value={business.id}>
                  {business.businessName}
                </option>
              ))}
            </select>
          ) : (
            <Badge variant="outline">{selectedBusiness?.businessName ?? "Mi negocio"}</Badge>
          )}
        </div>
        {notice ? <p className="rounded-md bg-white p-3 text-sm shadow-sm">{notice}</p> : null}
      </div>

      <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="h-28 animate-pulse bg-white" />
            ))
          : cards.map(([label, value, detail]) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Formas de cobro del negocio</CardTitle>
            <p className="text-sm text-muted-foreground">
              Usa el enlace o la cuenta que el restaurante ya posee. Solo guardamos datos
              operativos y una referencia bancaria enmascarada.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.profiles?.length ? (
              <div className="space-y-2">
                {data.profiles.map((profile) => (
                  <div key={profile.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <strong>{profile.label}</strong>
                      {profile.isDefault ? <Badge>Predeterminado</Badge> : null}
                    </div>
                    <p className="text-muted-foreground">{methodLabels[profile.method]}</p>
                    <p>{profile.providerLabel ?? profile.bankName ?? profile.paymentUrl ?? "Sin referencia pública"}</p>
                    {profile.accountReferenceMasked ? <p>Cuenta {profile.accountReferenceMasked}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Nombre interno</Label>
                <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Método</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.method}
                  onChange={(event) =>
                    setForm({ ...form, method: event.target.value as VoicePaymentMethod })
                  }
                >
                  {Object.entries(methodLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Proveedor o banco</Label>
                <Input
                  placeholder="Stripe, PayPhone, Banco…"
                  value={form.providerLabel}
                  onChange={(event) => setForm({ ...form, providerLabel: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Enlace existente</Label>
                <Input
                  placeholder="https://..."
                  value={form.paymentUrl}
                  onChange={(event) => setForm({ ...form, paymentUrl: event.target.value })}
                />
              </div>
              {form.method === "bank_transfer" ? (
                <>
                  <div className="space-y-1">
                    <Label>Titular</Label>
                    <Input value={form.accountHolder} onChange={(event) => setForm({ ...form, accountHolder: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Últimos 4 dígitos de cuenta</Label>
                    <Input
                      maxLength={20}
                      value={form.accountReferenceMasked}
                      onChange={(event) => setForm({ ...form, accountReferenceMasked: event.target.value })}
                    />
                  </div>
                </>
              ) : null}
              <div className="space-y-1 sm:col-span-2">
                <Label>Instrucciones para el agente</Label>
                <Input
                  placeholder="Envía el enlace por WhatsApp y solicita confirmación."
                  value={form.instructions}
                  onChange={(event) => setForm({ ...form, instructions: event.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
              />
              Usar como forma de cobro predeterminada
            </label>
            <Button onClick={() => void saveProfile()} disabled={saving || !form.label.trim()}>
              {saving ? "Guardando…" : "Guardar forma de cobro"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial trazable</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cada registro pertenece exclusivamente al negocio seleccionado.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-3">Fecha / cliente</th>
                    <th className="px-2 py-3">Llamada</th>
                    <th className="px-2 py-3">Resultado</th>
                    <th className="px-2 py-3">Pago</th>
                    <th className="px-2 py-3">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.traces?.map((trace) => (
                    <tr key={trace.callId} className="border-b align-top">
                      <td className="px-2 py-3">
                        <strong>{new Date(trace.startedAt).toLocaleString("es-EC")}</strong>
                        <p className="text-xs text-muted-foreground">
                          {trace.customerName ?? trace.customerPhone ?? "Cliente no identificado"}
                        </p>
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant="outline">{trace.callStatus}</Badge>
                        <p className="mt-1 text-xs">{duration(trace.durationSeconds)}</p>
                        {trace.transferredToHuman ? <p className="text-xs">Transferida a persona</p> : null}
                      </td>
                      <td className="px-2 py-3">
                        <p>{trace.orderId ? "Pedido" : trace.reservationId ? "Reserva" : trace.outcome ?? "Sin conversión"}</p>
                        <p className="max-w-56 truncate text-xs text-muted-foreground">{trace.summary ?? "Sin resumen"}</p>
                      </td>
                      <td className="px-2 py-3">
                        {trace.paymentReferenceId && trace.paymentStatus ? (
                          <div className="space-y-1">
                            <p>
                              {trace.paymentAmount === null
                                ? "Monto pendiente"
                                : money(trace.paymentAmount, trace.currency)}
                            </p>
                            <select
                              className="h-8 rounded-md border bg-background px-2 text-xs"
                              value={trace.paymentStatus}
                              onChange={(event) =>
                                void changeStatus(
                                  trace.paymentReferenceId!,
                                  event.target.value as VoicePaymentStatus,
                                )
                              }
                            >
                              {Object.entries(statusLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Sin referencia</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <Badge variant={trace.whatsappStatus === "sent" ? "default" : "outline"}>
                          {trace.whatsappStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!loading && !data?.traces?.length ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-muted-foreground">
                        Las próximas llamadas aparecerán aquí con su pedido, pago y confirmación.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
