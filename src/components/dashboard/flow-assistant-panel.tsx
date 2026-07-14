"use client";

import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, X, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export interface AISuggestion {
  template?: string;
  businessType?: string;
  mainProductOrService?: string;
  welcomeMessage?: string;
  agentTone?: string;
  scheduleDays?: string;
  scheduleHours?: string;
  modules?: string[];
  paymentProvider?: string;
}

interface FlowAssistantPanelProps {
  available?: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onApply?: (suggestions: AISuggestion) => void;
  canApply?: boolean;
  currentStep?: string;
}

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
  suggestions?: AISuggestion;
}

const EXAMPLES = [
  "Tengo una clínica y quiero cobrar consultas.",
  "Tengo un restaurante y quiero recibir pedidos.",
  "Tengo un spa y quiero agendar citas con anticipo.",
  "Tengo una tienda y quiero vender por WhatsApp.",
];

const subscribeToClient = () => () => {};

export function FlowAssistantPanel({
  available = true,
  open,
  onOpen,
  onClose,
  onApply,
  canApply = false,
  currentStep,
}: FlowAssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "¡Hola! Soy el Asistente IA de PayFlow. Estoy disponible en todo el panel para ayudarte con flujos, WhatsApp, automatizaciones y pagos. ¿Qué necesitas hacer?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ provider: string; configured: boolean; model: string; mode?: string } | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!available || !open) return;

    fetch("/api/ai/status", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setAiStatus(d);
        console.log("[flow-assistant] AI status:", d);
      })
      .catch((e) => console.warn("[flow-assistant] AI status fetch failed:", e));
  }, [available, open]);

  async function retryAI() {
    setRetrying(true);
    try {
      const res = await fetch("/api/ai/test-gemini", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setQuotaExceeded(false);
        toast.success("IA avanzada disponible nuevamente.");
      } else {
        toast.info("La IA avanzada sigue sin disponible. Continúo con el asistente local.");
      }
    } catch {
      toast.error("No se pudo verificar la IA.");
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Send conversation history so the AI can maintain context
      const conversationHistory = newMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch("/api/ai/flow-assistant", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          currentStep: currentStep || "template",
          conversationHistory,
        }),
      });

      const data = await res.json();

      // Track quota status
      if (data.warnings?.includes("AI_QUOTA_EXCEEDED")) {
        setQuotaExceeded(true);
      } else if (data.source && data.source !== "fallback") {
        setQuotaExceeded(false);
      }

      // Log to history if quota exceeded
      if (data.warnings?.includes("AI_QUOTA_EXCEEDED")) {
        try {
          const hist = JSON.parse(localStorage.getItem("payflow_flow_history") || "[]");
          hist.unshift({
            id: `hist_${Date.now()}`,
            action: "ai_quota_exceeded_fallback_used",
            flowName: "Asistente PayFlow",
            flowId: "ai-assistant",
            timestamp: new Date().toISOString(),
            details: "Gemini 429 - fallback local activado",
          });
          localStorage.setItem("payflow_flow_history", JSON.stringify(hist.slice(0, 50)));
        } catch {}
      }

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.reply || "Lo siento, no pude procesar tu solicitud.",
        suggestions: data.suggestions || {},
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "No pude conectar con el asistente IA. Puedes configurar el flujo manualmente en los pasos siguientes.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function applySuggestions(suggestions: AISuggestion) {
    if (!onApply) return;
    onApply(suggestions);
    toast.success("Sugerencias aplicadas al formulario.");
    onClose();
  }

  if (!mounted || !available) return null;

  if (!open) {
    return createPortal(
      <Button
        type="button"
        onClick={onOpen}
        className="fixed bottom-5 right-5 z-[100] h-auto min-h-16 min-w-[190px] rounded-2xl border border-white/20 bg-[#071a33] px-3 py-2.5 text-white shadow-2xl shadow-slate-950/35 ring-4 ring-white/80 hover:bg-[#0b2a52]"
        aria-label="Abrir Asistente PayFlow"
        title="Abrir Asistente PayFlow"
      >
        <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#071a33] shadow-inner">
          <Bot className="size-7" strokeWidth={2.2} />
          <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-[#071a33] bg-emerald-400" />
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="text-sm font-bold">Asistente IA</span>
          <span className="mt-0.5 text-[11px] font-medium text-blue-100">PayFlow · En línea</span>
        </span>
      </Button>,
      document.body
    );
  }

  return createPortal(
    <section
      role="dialog"
      aria-modal="false"
      aria-label="Asistente PayFlow"
      className="fixed inset-x-3 bottom-3 top-3 z-[110] flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:h-[min(720px,calc(100vh-2.5rem))] sm:w-[430px]"
    >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#071a33] px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <div className="relative flex size-10 items-center justify-center rounded-xl bg-white text-[#071a33]">
              <Bot className="size-6" strokeWidth={2.2} />
              <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-[#071a33] bg-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Asistente IA PayFlow</h3>
              <div className="flex items-center gap-1.5">
                {aiStatus ? (
                  <>
                    <span className={`size-1.5 rounded-full ${aiStatus.configured && !quotaExceeded ? "bg-emerald-500" : quotaExceeded ? "bg-amber-500" : "bg-amber-500"}`} />
                    <span className="text-[10px] text-blue-100/80">
                      {aiStatus.configured && !quotaExceeded
                        ? `IA: ${aiStatus.provider === "groq" ? "Groq conectado" : aiStatus.provider === "gemini" ? "Gemini conectado" : aiStatus.provider === "nim" ? "NVIDIA NIM conectado" : aiStatus.provider}`
                        : quotaExceeded
                        ? "IA: asistente local por cuota agotada"
                        : "IA: modo local fallback"}
                    </span>
                    {quotaExceeded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-1 h-5 px-1.5 text-[9px] text-white hover:bg-white/10 hover:text-white"
                        onClick={retryAI}
                        disabled={retrying}
                      >
                        {retrying ? (
                          <Loader2 className="size-2.5 mr-0.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-2.5 mr-0.5" />
                        )}
                        Reintentar
                      </Button>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-blue-100/80">Verificando IA…</span>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-8 text-white hover:bg-white/10 hover:text-white" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Chat messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto pf-scroll p-4 space-y-3"
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-[#0b2a52] text-white"
                    : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Suggestion cards */}
                {msg.suggestions &&
                  Object.keys(msg.suggestions).length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-semibold uppercase opacity-70">
                        Sugerencias:
                      </p>
                      {msg.suggestions.template && (
                        <div className="text-[11px] bg-background/50 rounded px-2 py-1">
                          Plantilla: <strong>{msg.suggestions.template}</strong>
                        </div>
                      )}
                      {msg.suggestions.businessType && (
                        <div className="text-[11px] bg-background/50 rounded px-2 py-1">
                          Tipo: <strong>{msg.suggestions.businessType}</strong>
                        </div>
                      )}
                      {msg.suggestions.mainProductOrService && (
                        <div className="text-[11px] bg-background/50 rounded px-2 py-1">
                          Servicio: <strong>{msg.suggestions.mainProductOrService}</strong>
                        </div>
                      )}
                      {msg.suggestions.agentTone && (
                        <div className="text-[11px] bg-background/50 rounded px-2 py-1">
                          Tono: <strong>{msg.suggestions.agentTone}</strong>
                        </div>
                      )}
                      {msg.suggestions.paymentProvider && (
                        <div className="text-[11px] bg-background/50 rounded px-2 py-1">
                          Pago: <strong>{msg.suggestions.paymentProvider}</strong>
                        </div>
                      )}
                      {canApply && onApply && (
                        <Button
                          size="sm"
                          className="mt-2 h-7 w-full bg-[#0b2a52] text-xs text-white hover:bg-[#123d70]"
                          onClick={() => applySuggestions(msg.suggestions!)}
                        >
                          <Check className="mr-1 size-3" />
                          Aplicar sugerencias al flujo
                        </Button>
                      )}
                    </div>
                  )}
              </div>
            </div>
          ))}

          {/* Examples */}
          {messages.length === 1 && !loading && (
            <div className="space-y-1.5 pt-2">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase">Ejemplos:</p>
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(ex)}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Escribe tu mensaje..."
              className="text-sm"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="shrink-0 bg-[#071a33] text-white hover:bg-[#0b2a52]"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
    </section>,
    document.body
  );
}
