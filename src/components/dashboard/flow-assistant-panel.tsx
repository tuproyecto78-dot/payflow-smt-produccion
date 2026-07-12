"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, X, Sparkles, Check, RefreshCw } from "lucide-react";
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
  open: boolean;
  onClose: () => void;
  onApply: (suggestions: AISuggestion) => void;
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

export function FlowAssistantPanel({
  open,
  onClose,
  onApply,
  currentStep,
}: FlowAssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "¡Hola! Soy el Asistente PayFlow. Te ayudaré a crear un flujo de WhatsApp paso a paso. Primero dime: ¿qué tipo de negocio tienes y qué quieres automatizar?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ provider: string; configured: boolean; model: string; mode?: string } | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ai/status", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setAiStatus(d);
        console.log("[flow-assistant] AI status:", d);
      })
      .catch((e) => console.warn("[flow-assistant] AI status fetch failed:", e));
  }, [open]);

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
    onApply(suggestions);
    toast.success("Sugerencias aplicadas al formulario.");
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md h-full bg-card border-l border-border flex flex-col shadow-xl">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
              <Bot className="size-5 text-purple-600 dark:text-purple-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Asistente PayFlow</h3>
              <div className="flex items-center gap-1.5">
                {aiStatus ? (
                  <>
                    <span className={`size-1.5 rounded-full ${aiStatus.configured && !quotaExceeded ? "bg-emerald-500" : quotaExceeded ? "bg-amber-500" : "bg-amber-500"}`} />
                    <span className="text-[10px] text-muted-foreground">
                      {aiStatus.configured && !quotaExceeded
                        ? `IA: ${aiStatus.provider === "gemini" ? "Gemini conectado" : aiStatus.provider}`
                        : quotaExceeded
                        ? "IA: asistente local por cuota agotada"
                        : "IA: modo local fallback"}
                    </span>
                    {quotaExceeded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[9px] px-1.5 ml-1 text-purple-600"
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
                  <span className="text-[10px] text-muted-foreground">Verificando IA…</span>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
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
                    ? "bg-purple-500 text-white"
                    : "bg-muted text-foreground"
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
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs mt-2 bg-emerald-500 hover:bg-emerald-600 text-white"
                        onClick={() => applySuggestions(msg.suggestions!)}
                      >
                        <Check className="size-3 mr-1" />
                        Aplicar sugerencias
                      </Button>
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
              className="bg-purple-500 hover:bg-purple-600 text-white shrink-0"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
