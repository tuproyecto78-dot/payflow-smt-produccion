"use client";

import { useEffect, useRef, useState } from "react";
import {
  Signal,
  Wifi,
  BatteryFull,
  ChevronLeft,
  Phone,
  Video,
  MoreVertical,
  CheckCheck,
  MessageCircle,
  Camera,
  Mic,
  Plus,
  Smile,
  X,
  Send,
  AlertTriangle,
} from "lucide-react";
import type { WhatsAppSimMessage } from "@/lib/workflow-types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function WhatsAppSimulator({
  messages,
  running,
  compact = false,
  onSendMessage,
  error,
}: {
  messages: WhatsAppSimMessage[];
  running: boolean;
  compact?: boolean;
  /** Called when the client types a message and presses Send / Enter. */
  onSendMessage?: (text: string) => void;
  /** Optional error message to display inside the chat (e.g. AI failure). */
  error?: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, error, running]);

  const phone =
    messages.length > 0
      ? messages[messages.length - 1].phone
      : "+1 555 123 4567";

  function handleSend() {
    const text = draft.trim();
    if (!text || running || !onSendMessage) return;
    setDraft("");
    onSendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Agrupar mensajes por día para el separador de WhatsApp
  const grouped = groupByDay(messages);

  return (
    <div className="w-full h-full flex items-center justify-center">
      {/* Marco del iPhone — sin contenedor gris, solo el móvil */}
      <div
        className={cn(
          "relative bg-black rounded-[2.8rem] shadow-2xl border-[2px] border-slate-700",
          compact ? "w-[200px] h-[400px]" : "w-[230px] h-[460px]"
        )}
      >
        {/* Botones laterales físicos */}
        <div className="absolute -left-[3px] top-16 w-[3px] h-6 bg-slate-700 rounded-l" />
        <div className="absolute -left-[3px] top-24 w-[3px] h-8 bg-slate-700 rounded-l" />
        <div className="absolute -left-[3px] top-36 w-[3px] h-8 bg-slate-700 rounded-l" />
        <div className="absolute -right-[3px] top-28 w-[3px] h-10 bg-slate-700 rounded-r" />

        {/* Pantalla */}
        <div className="relative w-full h-full rounded-[2.2rem] overflow-hidden bg-[#e5ddd5]">
          {/* Notch / Dynamic Island */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-18 h-4 bg-black rounded-full z-30" style={{width:'4.5rem'}} />

          {/* Barra de estado del iPhone */}
          <div className="absolute top-0 left-0 right-0 h-7 z-20 flex items-center justify-between px-6 pt-1 text-[10px] font-semibold text-black bg-[#075e54]">
            <span className="tracking-tight">
              {format(new Date(), "HH:mm")}
            </span>
            <div className="flex items-center gap-1">
              <Signal className="size-2.5" />
              <Wifi className="size-2.5" />
              <BatteryFull className="size-3" />
            </div>
          </div>

          {/* Header de WhatsApp */}
          <div className="absolute top-7 left-0 right-0 z-20 bg-[#075e54] text-white px-2 py-1.5 flex items-center gap-2 shadow-sm">
            <ChevronLeft className="size-4 shrink-0" />
            <div className="size-7 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-[10px] font-bold">
              PF
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate leading-tight">
                {phone}
              </div>
              <div className="text-[9px] text-emerald-100/80 leading-tight">
                {running ? "escribiendo…" : "en línea"}
              </div>
            </div>
            <Video className="size-4 shrink-0 opacity-90" />
            <Phone className="size-3.5 shrink-0 opacity-90" />
            <MoreVertical className="size-4 shrink-0 opacity-90" />
          </div>

          {/* Área de mensajes (chat de WhatsApp) */}
          <div
            ref={scrollRef}
            data-no-drag
            className="absolute top-[68px] bottom-10 left-0 right-0 overflow-y-auto pf-scroll px-2 py-2 space-y-1"
            style={{
              backgroundColor: "#e5ddd5",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d4cab6' fill-opacity='0.25'%3E%3Cpath d='M20 20.5V18H0v-2h20V14h2v2h18v2H22v2.5a2 2 0 1 1-2 0z'/%3E%3C/g%3E%3C/svg%3E")`,
            }}
          >
            {messages.length === 0 && !error ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-3">
                <div className="bg-[#fff3d0] text-[#5a4a1a] text-[10px] px-3 py-1 rounded-md shadow-sm mb-3">
                  Hoy
                </div>
                <div className="bg-white/70 backdrop-blur-sm rounded-lg px-3 py-2 text-center max-w-[200px] shadow-sm">
                  <MessageCircle className="size-5 mx-auto mb-1 text-emerald-600" />
                  <p className="text-[10px] font-medium text-emerald-900">
                    Simulador de WhatsApp
                  </p>
                  <p className="text-[9px] text-emerald-700/70 mt-0.5">
                    {onSendMessage
                      ? "Escribe un mensaje abajo como si fueras el cliente para probar el flujo."
                      : "Ejecuta el flujo para ver la conversación de WhatsApp."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {grouped.map((group) => (
                  <div key={group.day} className="space-y-1">
                    <div className="flex justify-center my-2">
                      <span className="bg-[#fff3d0] text-[#5a4a1a] text-[9px] font-medium px-2 py-0.5 rounded-md shadow-sm">
                        {group.dayLabel}
                      </span>
                    </div>
                    {group.messages.map((msg) => (
                      <Bubble key={msg.id} msg={msg} />
                    ))}
                  </div>
                ))}
                {error && (
                  <div className="flex justify-center my-2">
                    <div className="bg-red-50 border border-red-200 text-red-700 text-[9px] rounded-md px-2 py-1.5 shadow-sm flex items-start gap-1 max-w-[90%]">
                      <AlertTriangle className="size-2.5 shrink-0 mt-0.5" />
                      <span className="leading-tight">{error}</span>
                    </div>
                  </div>
                )}
                {running && (
                  <div className="flex justify-start">
                    <div className="bg-white rounded-lg rounded-tl-none px-2.5 py-2 shadow-sm flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="size-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="size-1.5 rounded-full bg-gray-400 animate-bounce" />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Barra de entrada de mensaje — funcional cuando onSendMessage está definido */}
          <div className="absolute bottom-0 left-0 right-0 h-10 z-20 bg-[#f0f0f0] flex items-center gap-1 px-1.5 py-1">
            {onSendMessage ? (
              <>
                <div className="flex-1 bg-white rounded-full px-2.5 py-1 flex items-center gap-1.5 min-w-0">
                  <Smile className="size-3.5 text-gray-500 shrink-0" />
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={running}
                    placeholder={running ? "Procesando…" : "Mensaje"}
                    data-no-drag
                    className="flex-1 min-w-0 bg-transparent text-[10px] text-gray-800 placeholder:text-gray-400 outline-none disabled:opacity-50"
                    aria-label="Escribe un mensaje como cliente"
                  />
                  <Camera className="size-3.5 text-gray-500 shrink-0" />
                  <Plus className="size-3.5 text-gray-500 shrink-0" />
                </div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={running || !draft.trim()}
                  data-no-drag
                  aria-label="Enviar mensaje"
                  className="size-8 rounded-full bg-[#075e54] flex items-center justify-center shrink-0 transition-colors hover:bg-[#054c44] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {draft.trim() && !running ? (
                    <Send className="size-3.5 text-white" />
                  ) : (
                    <Mic className="size-3.5 text-white" />
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="flex-1 bg-white rounded-full px-3 py-1.5 flex items-center gap-2">
                  <Smile className="size-4 text-gray-500 shrink-0" />
                  <span className="text-[10px] text-gray-400 flex-1">
                    Mensaje
                  </span>
                  <Camera className="size-4 text-gray-500 shrink-0" />
                  <Plus className="size-4 text-gray-500 shrink-0" />
                </div>
                <div className="size-8 rounded-full bg-[#075e54] flex items-center justify-center shrink-0">
                  <Mic className="size-4 text-white" />
                </div>
              </>
            )}
          </div>

          {/* Indicador "en vivo" flotante */}
          {running && (
            <div className="absolute top-9 right-2 z-30 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-white animate-pulse" />
              EN VIVO
            </div>
          )}

          {/* Home indicator del iPhone */}
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-16 h-1 bg-black/30 rounded-full z-30" />
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: WhatsAppSimMessage }) {
  const isOutbound = msg.direction === "outbound";
  return (
    <div
      className={cn(
        "pf-bubble flex",
        isOutbound ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-2.5 py-1.5 text-[11px] shadow-sm relative",
          isOutbound
            ? "bg-[#dcf8c6] text-emerald-950 rounded-tr-none"
            : "bg-white text-gray-800 rounded-tl-none"
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-snug pr-10">
          {msg.text}
        </p>
        <div className="absolute bottom-1 right-1.5 flex items-center gap-0.5">
          <span className="text-[8px] text-gray-500">
            {format(new Date(msg.timestamp), "HH:mm")}
          </span>
          {isOutbound && (
            <CheckCheck className="size-2.5 text-sky-500" />
          )}
        </div>
      </div>
    </div>
  );
}

interface DayGroup {
  day: string;
  dayLabel: string;
  messages: WhatsAppSimMessage[];
}

function groupByDay(messages: WhatsAppSimMessage[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const msg of messages) {
    const date = new Date(msg.timestamp);
    const dayKey = format(date, "yyyy-MM-dd");
    let dayLabel: string;
    const today = new Date();
    const isToday = format(today, "yyyy-MM-dd") === dayKey;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = format(yesterday, "yyyy-MM-dd") === dayKey;
    if (isToday) dayLabel = "Hoy";
    else if (isYesterday) dayLabel = "Ayer";
    else dayLabel = format(date, "d 'de' MMMM", { locale: es });

    let group = groups.find((g) => g.day === dayKey);
    if (!group) {
      group = { day: dayKey, dayLabel, messages: [] };
      groups.push(group);
    }
    group.messages.push(msg);
  }
  return groups;
}
