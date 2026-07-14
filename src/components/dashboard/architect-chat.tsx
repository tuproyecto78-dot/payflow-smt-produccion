"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, CircleHelp, Lightbulb, Loader2, Send, ShieldCheck, User, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ApprovalStatus = "pending" | "approved" | "rejected" | "executed" | null;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  understoodRequest?: string;
  diagnostic?: string;
  actions?: string[];
  nextQuestion?: string | null;
  riskLevel?: "low" | "medium" | "high";
  changeScope?: string;
  executionAction?: "retry_clickup_events" | "queue_clickup_analysis" | "none";
  requiresApproval?: boolean;
  source?: string;
  suggestionId?: string | null;
  approvalStatus?: ApprovalStatus;
}

const QUICK_MESSAGES = [
  "Explícame qué está fallando y dime cómo arreglarlo",
  "Diseña un flujo de WhatsApp para mi negocio",
  "Revisa una integración y dime qué falta",
];

const RISK_STYLES = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  high: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

const RISK_LABELS = { low: "bajo", medium: "medio", high: "alto" };

const STATUS_LABELS: Record<string, string> = {
  pending: "Esperando tu autorización",
  approved: "Plan autorizado",
  rejected: "No autorizado",
  executed: "Ejecutado",
};

const SCOPE_LABELS: Record<string, string> = {
  analysis: "análisis",
  automation: "automatización",
  integration: "integración",
  workflow: "flujo",
  database: "base de datos",
  code: "código",
  configuration: "configuración",
};

export function ArchitectChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hola. Soy tu Arquitecto PayFlow SMT. Cuéntame con tus propias palabras qué quieres lograr o qué no está funcionando; no necesitas usar términos técnicos. Voy a entender la idea, revisar el estado real del sistema y explicarte la mejor solución paso a paso.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const prompt = (event as CustomEvent<string>).detail;
      if (prompt) setInput(prompt);
    };
    window.addEventListener("architect:prompt", handler);
    return () => window.removeEventListener("architect:prompt", handler);
  }, []);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/admin/architect/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: messages.slice(-8).map((item) => ({
            role: item.role,
            content: [
              item.content,
              item.understoodRequest ? `Solicitud entendida: ${item.understoodRequest}` : "",
              item.diagnostic ? `Observación: ${item.diagnostic}` : "",
              item.nextQuestion ? `Pregunta pendiente: ${item.nextQuestion}` : "",
            ].filter(Boolean).join("\n"),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo consultar al Arquitecto IA");

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply,
          understoodRequest: data.understoodRequest,
          diagnostic: data.diagnostic,
          actions: data.actions,
          nextQuestion: data.nextQuestion,
          riskLevel: data.riskLevel,
          changeScope: data.changeScope,
          executionAction: data.executionAction,
          requiresApproval: data.requiresApproval,
          source: data.source,
          suggestionId: data.suggestionId,
          approvalStatus: data.approvalStatus,
        },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error de red");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  async function decide(messageId: string, suggestionId: string, decision: "approved" | "rejected") {
    setDecidingId(messageId);
    try {
      const res = await fetch("/api/admin/architect/suggestions/decision", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo registrar la decisión");
      const nextStatus = data.suggestion?.approval_status || decision;
      setMessages((current) => current.map((item) =>
        item.id === messageId ? { ...item, approvalStatus: nextStatus } : item
      ));
      toast.success(decision === "approved" ? data.execution?.message || "Plan autorizado" : "Plan no autorizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error de red");
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <Card id="architect-chat" className="mb-8 overflow-hidden">
      <CardHeader className="border-b bg-violet-50/60 dark:bg-violet-500/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-5 text-violet-600" /> Chat con Arquitecto IA
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Te escucha, entiende tu objetivo y convierte la idea en una solución segura.</p>
          </div>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700">Asistente activo</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[460px] overflow-y-auto p-4 space-y-4 bg-muted/15">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && (
                <div className="size-8 shrink-0 rounded-full bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
                  <Bot className="size-4 text-violet-600" />
                </div>
              )}
              <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                message.role === "user"
                  ? "bg-emerald-600 text-white rounded-br-md"
                  : "bg-card border shadow-sm rounded-bl-md"
              }`}>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                {message.understoodRequest && (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sky-950 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100">
                    <p className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide">
                      <CheckCircle2 className="size-3.5" /> Entendí esto
                    </p>
                    <p className="mt-1 leading-relaxed">{message.understoodRequest}</p>
                  </div>
                )}
                {message.diagnostic && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {message.riskLevel && <Badge variant="outline" className={RISK_STYLES[message.riskLevel]}>Riesgo: {RISK_LABELS[message.riskLevel]}</Badge>}
                      {message.changeScope && <Badge variant="outline">Área: {SCOPE_LABELS[message.changeScope] || message.changeScope}</Badge>}
                      {message.approvalStatus && <Badge variant="outline">{STATUS_LABELS[message.approvalStatus] || message.approvalStatus}</Badge>}
                    </div>
                    <p><strong>Lo que veo:</strong> {message.diagnostic}</p>
                    {message.actions && message.actions.length > 0 && (
                      <div>
                        <p className="font-semibold mb-1 flex items-center gap-1.5"><Lightbulb className="size-4 text-amber-500" /> Plan recomendado:</p>
                        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                          {message.actions.map((action, index) => <li key={index}>{action}</li>)}
                        </ol>
                      </div>
                    )}
                    {message.nextQuestion && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-500/25 dark:bg-blue-500/10">
                        <p className="flex items-center gap-1.5 font-semibold text-blue-900 dark:text-blue-100">
                          <CircleHelp className="size-4" /> Solo necesito confirmar
                        </p>
                        <p className="mt-1 text-blue-950 dark:text-blue-50">{message.nextQuestion}</p>
                        <Button type="button" size="sm" variant="outline" className="mt-2 h-7 bg-white/80 text-xs dark:bg-background/80" onClick={() => inputRef.current?.focus()}>
                          Responder abajo
                        </Button>
                        {message.requiresApproval && !message.suggestionId && (
                          <p className="mt-2 text-xs text-blue-800 dark:text-blue-200">Cuando respondas, prepararé el plan final para que puedas autorizarlo.</p>
                        )}
                      </div>
                    )}
                    {message.suggestionId && message.approvalStatus === "pending" && (
                      <div className="pt-2 space-y-2">
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
                          {message.executionAction && message.executionAction !== "none"
                            ? "Esta acción puede ejecutarse de forma controlada después de tu autorización."
                            : "Autorizar registra tu decisión y deja el plan listo. El sistema no dirá que modificó código o configuración hasta comprobar la implementación."}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" onClick={() => decide(message.id, message.suggestionId!, "approved")} disabled={decidingId === message.id}>
                            {decidingId === message.id ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="size-3.5 mr-1" />}
                            {message.executionAction && message.executionAction !== "none" ? "Autorizar y ejecutar" : "Autorizar plan"}
                          </Button>
                          <Button size="sm" variant="outline" className="text-rose-600" onClick={() => decide(message.id, message.suggestionId!, "rejected")} disabled={decidingId === message.id}>
                            <XCircle className="size-3.5 mr-1" /> No autorizar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {message.role === "user" && (
                <div className="size-8 shrink-0 rounded-full bg-emerald-100 flex items-center justify-center">
                  <User className="size-4 text-emerald-700" />
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Arquitecto analizando…
            </div>
          )}
        </div>

        <div className="border-t p-4 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {QUICK_MESSAGES.map((message) => (
              <Button key={message} type="button" size="sm" variant="outline" className="shrink-0 text-xs" onClick={() => void sendMessage(message)} disabled={sending}>
                {message}
              </Button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Escríbeme como hablas. Ej.: quiero cobrar por WhatsApp y no sé qué me falta…"
              rows={2}
              maxLength={3000}
              disabled={sending}
              className="min-h-[72px]"
            />
            <Button type="submit" disabled={sending || !input.trim()} className="h-[72px] px-5">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              <span className="sr-only">Enviar</span>
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground">Puedes hablarle con palabras sencillas. Analiza y propone de inmediato; cualquier cambio de código, datos o configuración necesita tu autorización y evidencia de ejecución.</p>
        </div>
      </CardContent>
    </Card>
  );
}
