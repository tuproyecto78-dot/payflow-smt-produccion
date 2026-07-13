"use client";

import { FormEvent, useState } from "react";
import { Bot, CheckCircle2, Loader2, Send, User, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ApprovalStatus = "pending" | "approved" | "rejected" | null;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  diagnostic?: string;
  actions?: string[];
  riskLevel?: "low" | "medium" | "high";
  source?: string;
  suggestionId?: string | null;
  approvalStatus?: ApprovalStatus;
}

const QUICK_MESSAGES = [
  "Revisa la arquitectura actual y dime qué mejorar",
  "Busca riesgos en pagos y webhooks",
  "Propón una mejora para automatizar procesos",
];

const RISK_STYLES = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  high: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export function ArchitectChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Soy el Arquitecto PayFlow SMT. Indícame qué deseas revisar, corregir o implementar y prepararé un diagnóstico con acciones concretas.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

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
          history: messages.slice(-8).map((item) => ({ role: item.role, content: item.content })),
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
          diagnostic: data.diagnostic,
          actions: data.actions,
          riskLevel: data.riskLevel,
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
      setMessages((current) => current.map((item) =>
        item.id === messageId ? { ...item, approvalStatus: decision } : item
      ));
      toast.success(decision === "approved" ? "Propuesta aprobada para implementación" : "Propuesta rechazada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error de red");
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <Card className="mb-8 overflow-hidden">
      <CardHeader className="border-b bg-violet-50/60 dark:bg-violet-500/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-5 text-violet-600" /> Chat con Arquitecto IA
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Diagnósticos y propuestas con aprobación humana obligatoria.</p>
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
                {message.diagnostic && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {message.riskLevel && <Badge variant="outline" className={RISK_STYLES[message.riskLevel]}>Riesgo: {message.riskLevel}</Badge>}
                      {message.approvalStatus && <Badge variant="outline">{message.approvalStatus}</Badge>}
                    </div>
                    <p><strong>Diagnóstico:</strong> {message.diagnostic}</p>
                    {message.actions && message.actions.length > 0 && (
                      <div>
                        <p className="font-semibold mb-1">Acciones propuestas:</p>
                        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                          {message.actions.map((action, index) => <li key={index}>{action}</li>)}
                        </ol>
                      </div>
                    )}
                    {message.suggestionId && message.approvalStatus === "pending" && (
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" onClick={() => decide(message.id, message.suggestionId!, "approved")} disabled={decidingId === message.id}>
                          {decidingId === message.id ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="size-3.5 mr-1" />}
                          Aprobar propuesta
                        </Button>
                        <Button size="sm" variant="outline" className="text-rose-600" onClick={() => decide(message.id, message.suggestionId!, "rejected")} disabled={decidingId === message.id}>
                          <XCircle className="size-3.5 mr-1" /> Rechazar
                        </Button>
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
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Ej.: Revisa el webhook de pagos y propón cómo corregirlo…"
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
          <p className="text-[11px] text-muted-foreground">El chat propone y registra acciones. Ningún cambio crítico se ejecuta automáticamente.</p>
        </div>
      </CardContent>
    </Card>
  );
}
