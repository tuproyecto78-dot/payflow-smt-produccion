"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

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
    const pendingId = crypto.randomUUID();
    const history = [...messages, userMessage];
    setMessages([...history, {
      id: pendingId,
      role: "assistant",
      content: "Se está realizando. Lo estamos revisando, ya te doy el informe.",
    }]);
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
            ].join("\n"),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo consultar a Arquitecto Hermes");

      setMessages((current) => current.map((item) =>
        item.id === pendingId ? { ...item, content: data.reply } : item
      ));
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== pendingId));
      toast.error(error instanceof Error ? error.message : "Error de red");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <Card id="architect-chat" className="mb-8 overflow-hidden">
      <CardHeader className="border-b bg-violet-50/60 dark:bg-violet-500/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-5 text-violet-600" /> Chat con Arquitecto Hermes
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Te escucha, entiende tu objetivo y convierte la idea en una solución segura.</p>
          </div>
          <span className="text-xs text-emerald-700">Asistente activo</span>
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
              </div>
              {message.role === "user" && (
                <div className="size-8 shrink-0 rounded-full bg-emerald-100 flex items-center justify-center">
                  <User className="size-4 text-emerald-700" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t p-4">
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
        </div>
      </CardContent>
    </Card>
  );
}
