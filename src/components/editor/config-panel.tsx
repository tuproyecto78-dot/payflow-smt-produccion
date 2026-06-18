"use client";

import { NODE_METADATA, type NodeType } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Trash2,
  Play,
  MessageSquare,
  HelpCircle,
  GitBranch,
  MessageCircle,
  CreditCard,
  Bot,
  Webhook,
  Square,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ICONS: Record<string, LucideIcon> = {
  Play,
  MessageSquare,
  HelpCircle,
  GitBranch,
  MessageCircle,
  CreditCard,
  Bot,
  Webhook,
  Square,
};

export interface SelectedNode {
  id: string;
  type: NodeType;
  data: Record<string, unknown>;
}

export function ConfigPanel({
  node,
  onChange,
  onDelete,
}: {
  node: SelectedNode | null;
  onChange: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  if (!node) {
    return (
      <div className="w-80 shrink-0 border-l border-border bg-card/50 flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Configuration</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-muted-foreground">
          <Settings2 className="size-8 mb-3 opacity-40" />
          <p className="text-sm font-medium">No node selected</p>
          <p className="text-xs mt-1">
            Click a node on the canvas to edit its settings.
          </p>
        </div>
      </div>
    );
  }

  const meta = NODE_METADATA[node.type];
  const Icon = ICONS[meta.icon] || Square;
  const data = node.data;

  const set = (key: string, value: unknown) => {
    onChange(node.id, { ...data, [key]: value });
  };

  return (
    <div className="w-80 shrink-0 border-l border-border bg-card/50 flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div
            className="size-8 rounded-md flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: meta.color }}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">
              {String(data.label || meta.label)}
            </h3>
            <p className="text-[11px] text-muted-foreground">{meta.description}</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="node-label" className="text-xs">Node label</Label>
            <Input
              id="node-label"
              value={String(data.label || "")}
              onChange={(e) => set("label", e.target.value)}
              placeholder={meta.label}
              className="h-8 text-sm"
            />
          </div>

          <Separator />

          {node.type === "start" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Trigger type</Label>
              <Select
                value={String(data.trigger || "manual")}
                onValueChange={(v) => set("trigger", v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="schedule">Schedule</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                How this workflow is started.
              </p>
            </div>
          )}

          {node.type === "message" && (
            <Field
              label="Message"
              hint="Static text sent in the flow. Use {{variable}} to interpolate."
            >
              <Textarea
                value={String(data.message || "")}
                onChange={(e) => set("message", e.target.value)}
                placeholder="Hi {{name}}, your order is confirmed!"
                rows={4}
                className="text-sm"
              />
            </Field>
          )}

          {node.type === "question" && (
            <>
              <Field label="Question" hint="Text shown to the user.">
                <Textarea
                  value={String(data.question || "")}
                  onChange={(e) => set("question", e.target.value)}
                  placeholder="What size would you like?"
                  rows={3}
                  className="text-sm"
                />
              </Field>
              <Field label="Variable name" hint="Where the reply is stored.">
                <Input
                  value={String(data.variable || "")}
                  onChange={(e) => set("variable", e.target.value)}
                  placeholder="size"
                  className="h-8 text-sm"
                />
              </Field>
              <Field
                label="Default response"
                hint="Mock reply used during execution."
              >
                <Input
                  value={String(data.defaultResponse || "")}
                  onChange={(e) => set("defaultResponse", e.target.value)}
                  placeholder="medium"
                  className="h-8 text-sm"
                />
              </Field>
            </>
          )}

          {node.type === "condition" && (
            <>
              <Field label="Variable" hint="Variable to evaluate.">
                <Input
                  value={String(data.variable || "")}
                  onChange={(e) => set("variable", e.target.value)}
                  placeholder="payment_outcome"
                  className="h-8 text-sm font-mono"
                />
              </Field>
              <Field label="Operator">
                <Select
                  value={String(data.operator || "equals")}
                  onValueChange={(v) => set("operator", v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">equals (=)</SelectItem>
                    <SelectItem value="not_equals">not equals (≠)</SelectItem>
                    <SelectItem value="contains">contains</SelectItem>
                    <SelectItem value="greater_than">greater than (&gt;)</SelectItem>
                    <SelectItem value="less_than">less than (&lt;)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Value">
                <Input
                  value={String(data.value ?? "")}
                  onChange={(e) => set("value", e.target.value)}
                  placeholder="payment_success"
                  className="h-8 text-sm font-mono"
                />
              </Field>
              <div className="flex gap-2">
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                  True →
                </Badge>
                <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                  False →
                </Badge>
              </div>
            </>
          )}

          {node.type === "whatsapp" && (
            <>
              <Field label="Phone number" hint="E.164 format recommended.">
                <Input
                  value={String(data.phoneNumber || "")}
                  onChange={(e) => set("phoneNumber", e.target.value)}
                  placeholder="+15551234567"
                  className="h-8 text-sm"
                />
              </Field>
              <Field label="Message" hint="Supports {{variable}} interpolation.">
                <Textarea
                  value={String(data.message || "")}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Hello! Your code is {{code}}"
                  rows={4}
                  className="text-sm"
                />
              </Field>
              <Field label="Template name (optional)">
                <Input
                  value={String(data.templateName || "")}
                  onChange={(e) => set("templateName", e.target.value)}
                  placeholder="order_confirmation"
                  className="h-8 text-sm"
                />
              </Field>
            </>
          )}

          {node.type === "payment" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount">
                  <Input
                    type="number"
                    value={String(data.amount ?? "")}
                    onChange={(e) =>
                      set("amount", e.target.value ? Number(e.target.value) : 0)
                    }
                    placeholder="49.99"
                    className="h-8 text-sm"
                  />
                </Field>
                <Field label="Currency">
                  <Select
                    value={String(data.currency || "USD")}
                    onValueChange={(v) => set("currency", v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["USD", "EUR", "GBP", "INR", "BRL", "JPY"].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Description">
                <Input
                  value={String(data.description || "")}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Pro plan subscription"
                  className="h-8 text-sm"
                />
              </Field>
              <Field label="Merchant name (optional)">
                <Input
                  value={String(data.merchantName || "")}
                  onChange={(e) => set("merchantName", e.target.value)}
                  placeholder="PayFlow Store"
                  className="h-8 text-sm"
                />
              </Field>
              <div>
                <Label className="text-xs mb-1.5 block">Possible outputs</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {meta.outputs.map((o) => (
                    <Badge
                      key={o.id}
                      variant="outline"
                      className="justify-center text-[10px]"
                    >
                      {o.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {node.type === "ai_agent" && (
            <>
              <Field label="System prompt">
                <Textarea
                  value={String(data.systemPrompt || "")}
                  onChange={(e) => set("systemPrompt", e.target.value)}
                  placeholder="You are a helpful sales assistant."
                  rows={3}
                  className="text-sm"
                />
              </Field>
              <Field label="User prompt" hint="Supports {{variable}} interpolation.">
                <Textarea
                  value={String(data.prompt || "")}
                  onChange={(e) => set("prompt", e.target.value)}
                  placeholder="Suggest a product for a customer who said: {{user_response}}"
                  rows={3}
                  className="text-sm"
                />
              </Field>
              <Field label="Input variable (optional)">
                <Input
                  value={String(data.inputVariable || "")}
                  onChange={(e) => set("inputVariable", e.target.value)}
                  placeholder="user_response"
                  className="h-8 text-sm font-mono"
                />
              </Field>
              <Field label="Output variable">
                <Input
                  value={String(data.outputVariable || "")}
                  onChange={(e) => set("outputVariable", e.target.value)}
                  placeholder="ai_response"
                  className="h-8 text-sm font-mono"
                />
              </Field>
            </>
          )}

          {node.type === "api" && (
            <>
              <Field label="Method">
                <Select
                  value={String(data.method || "GET")}
                  onValueChange={(v) => set("method", v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="URL" hint="Supports {{variable}} interpolation.">
                <Input
                  value={String(data.url || "")}
                  onChange={(e) => set("url", e.target.value)}
                  placeholder="https://api.example.com/orders"
                  className="h-8 text-sm font-mono"
                />
              </Field>
              <Field label="Headers (JSON)">
                <Textarea
                  value={String(data.headers || "")}
                  onChange={(e) => set("headers", e.target.value)}
                  placeholder={'{"Authorization": "Bearer xxx"}'}
                  rows={3}
                  className="text-xs font-mono"
                />
              </Field>
              <Field label="Body (optional)">
                <Textarea
                  value={String(data.body || "")}
                  onChange={(e) => set("body", e.target.value)}
                  placeholder='{"product": "pro"}'
                  rows={3}
                  className="text-xs font-mono"
                />
              </Field>
              <Field label="Output variable">
                <Input
                  value={String(data.outputVariable || "")}
                  onChange={(e) => set("outputVariable", e.target.value)}
                  placeholder="api_response"
                  className="h-8 text-sm font-mono"
                />
              </Field>
            </>
          )}

          {node.type === "end" && (
            <Field label="End message (optional)">
              <Input
                value={String(data.message || "")}
                onChange={(e) => set("message", e.target.value)}
                placeholder="Workflow complete"
                className="h-8 text-sm"
              />
            </Field>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/5"
          onClick={() => onDelete(node.id)}
        >
          <Trash2 className="size-4 mr-2" />
          Delete node
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
