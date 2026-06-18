"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Smartphone, CheckCheck, MessageCircle } from "lucide-react";
import type { WhatsAppSimMessage } from "@/lib/workflow-types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export function WhatsAppSimulator({
  messages,
  running,
}: {
  messages: WhatsAppSimMessage[];
  running: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const phone =
    messages.length > 0
      ? messages[messages.length - 1].phone
      : "+15551234567";

  return (
    <Card className="h-full flex flex-col overflow-hidden border-border/60">
      <CardHeader className="pb-2 px-3 py-2.5 bg-emerald-600 text-white rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-full bg-white/20 flex items-center justify-center">
            <Smartphone className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold truncate">
              WhatsApp Simulator
            </CardTitle>
            <p className="text-[10px] text-white/80 truncate font-mono">{phone}</p>
          </div>
          <Badge className="bg-white/20 text-white border-0 hover:bg-white/20">
            <span
              className={cn(
                "size-1.5 rounded-full mr-1",
                running ? "bg-white animate-pulse" : "bg-white/60"
              )}
            />
            {running ? "live" : "idle"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto pf-scroll p-3 space-y-2"
          style={{
            backgroundColor: "#e5ddd5",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-emerald-900/50 px-4">
              <MessageCircle className="size-8 mb-2" />
              <p className="text-xs font-medium">No messages yet</p>
              <p className="text-[10px] mt-0.5">
                Run the workflow to see WhatsApp messages appear here.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "pf-bubble flex",
                  msg.direction === "outbound" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs shadow-sm",
                    msg.direction === "outbound"
                      ? "bg-[#dcf8c6] text-emerald-950 rounded-tr-none"
                      : "bg-white text-gray-800 rounded-tl-none"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="text-[9px] text-gray-500">
                      {format(new Date(msg.timestamp), "HH:mm")}
                    </span>
                    {msg.direction === "outbound" && (
                      <CheckCheck className="size-3 text-sky-500" />
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
