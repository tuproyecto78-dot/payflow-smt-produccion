"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "reactflow";
import { useAppStore, type WorkflowSummary } from "@/stores/app-store";
import { NodePalette } from "./node-palette";
import { ConfigPanel, type SelectedNode } from "./config-panel";
import { WhatsAppSimulator } from "./whatsapp-simulator";
import { ExecutionLog } from "./execution-log";
import { PayFlowNode } from "./nodes/payflow-node";
import {
  NODE_METADATA,
  type FlowEdge,
  type FlowNode,
  type LogEntry,
  type NodeType,
  type PaymentOutcome,
  type WhatsAppSimMessage,
} from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Save,
  Play,
  Loader2,
  Smartphone,
  Terminal,
  Check,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const nodeTypes = { payflow: PayFlowNode };

function toFlowNode(n: FlowNode): Node {
  return {
    id: n.id,
    type: "payflow",
    position: n.position,
    data: { ...n.data, nodeType: n.type },
  };
}

function toApiNode(n: Node): FlowNode {
  const { nodeType, ...rest } = n.data as Record<string, unknown>;
  return {
    id: n.id,
    type: (nodeType as NodeType) || "message",
    position: n.position,
    data: rest,
  };
}

function toApiEdge(e: Edge): FlowEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  };
}

function makeId() {
  return `n_${Math.random().toString(36).slice(2, 9)}`;
}

interface RunResult {
  status: string;
  entries: LogEntry[];
  variables: Record<string, unknown>;
  whatsappMessages: WhatsAppSimMessage[];
  finalNode?: string;
  error?: string;
}

function EditorInner({ workflow }: { workflow: WorkflowSummary }) {
  const { goDashboard } = useAppStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState(workflow.name);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [visibleEntries, setVisibleEntries] = useState<LogEntry[]>([]);
  const [visibleMessages, setVisibleMessages] = useState<WhatsAppSimMessage[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Load workflow
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workflows/${workflow.id}`);
        const data = await res.json();
        if (cancelled) return;
        const wf = data.workflow;
        setName(wf.name);
        const flowNodes: FlowNode[] = wf.nodes || [];
        // If empty, seed a Start + End node.
        if (flowNodes.length === 0) {
          const startId = makeId();
          const endId = makeId();
          const seedNodes: Node[] = [
            {
              id: startId,
              type: "payflow",
              position: { x: 80, y: 200 },
              data: { label: "Start", trigger: "manual", nodeType: "start" },
            },
            {
              id: endId,
              type: "payflow",
              position: { x: 420, y: 200 },
              data: { label: "End", message: "Done", nodeType: "end" },
            },
          ];
          const seedEdges: Edge[] = [
            {
              id: `e_${startId}_${endId}`,
              source: startId,
              target: endId,
              sourceHandle: "out",
            },
          ];
          setNodes(seedNodes);
          setEdges(seedEdges);
          setDirty(true);
        } else {
          setNodes(flowNodes.map(toFlowNode));
          setEdges(
            (wf.edges || []).map((e: FlowEdge) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle ?? undefined,
              targetHandle: e.targetHandle ?? undefined,
            }))
          );
        }
        setLoaded(true);
      } catch {
        toast.error("Failed to load workflow");
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
      if (replayTimer.current) clearTimeout(replayTimer.current);
    };
  }, [workflow.id]);

  // Fit view after first load
  useEffect(() => {
    if (loaded && nodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100);
      return () => clearTimeout(t);
    }
  }, [loaded, nodes.length, fitView]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, id: `e_${makeId()}` }, eds));
      setDirty(true);
    },
    [setEdges]
  );

  const onNodesChangeWrapped = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      if (changes.some((c) => c.type === "position" || c.type === "remove" || c.type === "add")) {
        setDirty(true);
      }
    },
    [setNodes]
  );

  const onEdgesChangeWrapped = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      if (changes.some((c) => c.type === "remove" || c.type === "add")) {
        setDirty(true);
      }
    },
    [setEdges]
  );

  const addNode = useCallback(
    (type: NodeType) => {
      const meta = NODE_METADATA[type];
      const id = makeId();
      // Place near center of current viewport with some randomness.
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const newNode: Node = {
        id,
        type: "payflow",
        position: {
          x: center.x - 90 + (Math.random() * 60 - 30),
          y: center.y - 30 + (Math.random() * 60 - 30),
        },
        data: {
          label: meta.label,
          nodeType: type,
          ...(type === "start" ? { trigger: "manual" } : {}),
          ...(type === "message" ? { message: "Hello!" } : {}),
          ...(type === "question"
            ? { question: "How can I help?", variable: "user_response", defaultResponse: "yes" }
            : {}),
          ...(type === "condition"
            ? { variable: "user_response", operator: "equals", value: "yes" }
            : {}),
          ...(type === "whatsapp"
            ? { phoneNumber: "+15551234567", message: "Hello from PayFlow SMT!" }
            : {}),
          ...(type === "payment"
            ? { amount: 49.99, currency: "USD", description: "Payment" }
            : {}),
          ...(type === "ai_agent"
            ? { systemPrompt: "You are a helpful assistant.", prompt: "Hello", outputVariable: "ai_response" }
            : {}),
          ...(type === "api" ? { method: "GET", url: "", outputVariable: "api_response" } : {}),
          ...(type === "end" ? { message: "Workflow complete" } : {}),
        },
      };
      setNodes((nds) => nds.concat(newNode));
      setSelectedId(id);
      setDirty(true);
    },
    [screenToFlowPosition, setNodes]
  );

  const selectedNode = useMemo<SelectedNode | null>(() => {
    if (!selectedId) return null;
    const n = nodes.find((x) => x.id === selectedId);
    if (!n) return null;
    return {
      id: n.id,
      type: (n.data as { nodeType: NodeType }).nodeType,
      data: n.data as Record<string, unknown>,
    };
  }, [selectedId, nodes]);

  const updateNodeData = useCallback(
    (id: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
      setDirty(true);
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
      setDirty(true);
    },
    [setNodes, setEdges]
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nodes: nodes.map(toApiNode),
          edges: edges.map(toApiEdge),
        }),
      });
      if (!res.ok) {
        toast.error("Failed to save workflow");
        return;
      }
      setDirty(false);
      toast.success("Workflow saved");
    } catch {
      toast.error("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  function resetNodeFlags() {
    setNodes((nds) =>
      nds.map((n) => {
        const d = { ...n.data };
        delete (d as Record<string, unknown>).__running;
        delete (d as Record<string, unknown>).__done;
        delete (d as Record<string, unknown>).__error;
        return { ...n, data: d };
      })
    );
  }

  function markNode(id: string, flag: "__running" | "__done" | "__error", clear = false) {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        const d = { ...n.data } as Record<string, unknown>;
        if (clear) {
          delete d.__running;
          delete d.__done;
          delete d.__error;
        }
        if (flag === "__running") d.__running = true;
        if (flag === "__done") d.__done = true;
        if (flag === "__error") d.__error = true;
        return { ...n, data: d };
      })
    );
  }

  async function run(forceOutcome?: PaymentOutcome, questionResponses?: Record<string, string>) {
    setRunOpen(false);
    setRunning(true);
    setResult(null);
    setVisibleEntries([]);
    setVisibleMessages([]);
    resetNodeFlags();
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: nodes.map(toApiNode),
          edges: edges.map(toApiEdge),
          forcePaymentOutcome: forceOutcome,
          questionResponses,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Execution failed");
        setRunning(false);
        return;
      }
      const r: RunResult = data.result;
      // Replay entries with animation.
      await replay(r);
      setResult(r);
      setSimOpen(true);
      if (r.status === "success") {
        toast.success("Workflow completed");
      } else if (r.status === "failed") {
        toast.error("Workflow failed");
      } else {
        toast.warning("Workflow stopped");
      }
    } catch {
      toast.error("Network error during execution");
    } finally {
      setRunning(false);
    }
  }

  async function replay(r: RunResult) {
    // Clear flags first
    setNodes((nds) =>
      nds.map((n) => {
        const d = { ...n.data } as Record<string, unknown>;
        delete d.__running;
        delete d.__done;
        delete d.__error;
        return { ...n, data: d };
      })
    );
    for (let i = 0; i < r.entries.length; i++) {
      const entry = r.entries[i];
      // Mark the node running when "started"
      if (entry.status === "started" && entry.nodeId !== "—") {
        markNode(entry.nodeId, "__running");
      }
      // Push to visible entries
      setVisibleEntries((prev) => [...prev, entry]);
      // Reveal WhatsApp messages whose nodeId matches up to this entry
      const upto = r.whatsappMessages.filter(
        (m) => new Date(m.timestamp).getTime() <= new Date(entry.timestamp).getTime()
      );
      setVisibleMessages(upto);
      // If next entry is for a different node (started), mark current done
      const next = r.entries[i + 1];
      if (entry.nodeId !== "—" && (!next || next.nodeId !== entry.nodeId)) {
        // finalize this node
        const finalEntry = entry.status === "error";
        if (entry.nodeId !== "—") {
          markNode(entry.nodeId, finalEntry ? "__error" : "__done", true);
        }
      }
      // Small delay for animation feel
      await new Promise((resolve) => {
        replayTimer.current = setTimeout(resolve, 280);
      });
    }
    // Reveal remaining WhatsApp messages
    setVisibleMessages(r.whatsappMessages);
  }

  const selectedNavTab = selectedNode ? "config" : "whatsapp";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <header className="h-14 shrink-0 border-b border-border bg-card flex items-center gap-3 px-3 lg:px-4">
        <Button variant="ghost" size="sm" onClick={goDashboard} className="shrink-0">
          <ArrowLeft className="size-4 mr-1" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <div className="h-6 w-px bg-border" />
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="h-8 w-40 sm:w-56 lg:w-72 text-sm font-medium border-transparent hover:border-border focus-visible:border-border"
        />
        {dirty && (
          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
            unsaved
          </Badge>
        )}
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSimOpen(true)}
          className="hidden md:inline-flex"
        >
          <Smartphone className="size-4 mr-1.5" />
          Simulator
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={save}
          disabled={saving}
          className="shrink-0"
        >
          {saving ? (
            <Loader2 className="size-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="size-4 mr-1.5" />
          )}
          Save
        </Button>
        <Button size="sm" onClick={() => setRunOpen(true)} disabled={running} className="shrink-0">
          {running ? (
            <Loader2 className="size-4 mr-1.5 animate-spin" />
          ) : (
            <Play className="size-4 mr-1.5" />
          )}
          Run
        </Button>
      </header>

      {/* Main editor area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <NodePalette onAddNode={addNode} />

        {/* Canvas */}
        <div className="flex-1 relative min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChangeWrapped}
            onEdgesChange={onEdgesChangeWrapped}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { stroke: "#94a3b8", strokeWidth: 2 },
            }}
            connectionLineType={"smoothstep" as never}
            proOptions={{ hideAttribution: true }}
            className="bg-background"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#cbd5e1" />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => {
                const t = (n.data as { nodeType?: NodeType })?.nodeType;
                return t ? NODE_METADATA[t].color : "#94a3b8";
              }}
              maskColor="rgba(0,0,0,0.05)"
              className="!bg-card"
            />
          </ReactFlow>

          {/* Floating execution status */}
          {(running || result) && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
              <StatusPill running={running} status={result?.status} />
            </div>
          )}

          {/* Floating quick tabs on mobile */}
          <div className="md:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSimOpen(true)}
              className="shadow-lg"
            >
              <Smartphone className="size-4 mr-1.5" />
              WhatsApp
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedId(selectedId ?? "")}
              className="shadow-lg"
            >
              <Terminal className="size-4 mr-1.5" />
              Logs
            </Button>
          </div>
        </div>

        {/* Right panel: config + logs/simulator */}
        <div className="w-80 shrink-0 border-l border-border bg-card/50 flex-col hidden md:flex">
          <Tabs defaultValue={selectedNavTab} value={selectedNavTab} className="flex-1 flex flex-col">
            <TabsList className="grid grid-cols-2 m-2 mb-0">
              <TabsTrigger value="config" onClick={() => {}}>
                <Terminal className="size-3.5 mr-1.5" /> Config
              </TabsTrigger>
              <TabsTrigger value="run" onClick={() => setSelectedId(null)}>
                <Play className="size-3.5 mr-1.5" /> Run
              </TabsTrigger>
            </TabsList>
            <TabsContent value="config" className="flex-1 m-0 data-[state=active]:flex flex-col">
              <ConfigPanel
                node={selectedNode}
                onChange={updateNodeData}
                onDelete={deleteNode}
              />
            </TabsContent>
            <TabsContent value="run" className="flex-1 m-0 data-[state=active]:flex flex-col overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                <ExecutionLog entries={visibleEntries} running={running} result={result} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Run dialog */}
      <RunDialog
        open={runOpen}
        onOpenChange={setRunOpen}
        onRun={(outcome, responses) => run(outcome, responses)}
        running={running}
      />

      {/* Simulator sheet (mobile + accessible) */}
      <Sheet open={simOpen} onOpenChange={setSimOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="text-sm">WhatsApp Simulator</SheetTitle>
          </SheetHeader>
          <div className="flex-1 p-3 overflow-hidden">
            <WhatsAppSimulator messages={visibleMessages} running={running} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusPill({ running, status }: { running: boolean; status?: string }) {
  if (running) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-card border border-border shadow-md px-3 py-1.5 text-xs font-medium">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        Running workflow…
      </div>
    );
  }
  if (status === "success") {
    return (
      <div className="flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-md px-3 py-1.5 text-xs font-medium">
        <Check className="size-3.5" />
        Completed successfully
      </div>
    );
  }
  if (status === "failed" || status === "stopped") {
    return (
      <div className="flex items-center gap-2 rounded-full bg-red-50 border border-red-200 text-red-700 shadow-md px-3 py-1.5 text-xs font-medium">
        <AlertTriangle className="size-3.5" />
        {status === "failed" ? "Execution failed" : "Execution stopped"}
      </div>
    );
  }
  return null;
}

function RunDialog({
  open,
  onOpenChange,
  onRun,
  running,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRun: (outcome?: PaymentOutcome, responses?: Record<string, string>) => void;
  running: boolean;
}) {
  const [outcome, setOutcome] = useState<PaymentOutcome | "random">("random");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Run workflow</DialogTitle>
          <DialogDescription>
            Execute the workflow on the canvas. Mock nodes will simulate
            WhatsApp, payments, and AI responses.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm">Payment outcome (mock)</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as PaymentOutcome | "random")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Random (weighted)</SelectItem>
                <SelectItem value="payment_success">payment_success</SelectItem>
                <SelectItem value="payment_failed">payment_failed</SelectItem>
                <SelectItem value="payment_pending">payment_pending</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Forces the payment node result. Use this to test all branches.
            </p>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            Question nodes will use their configured default response. WhatsApp
            messages and AI agent calls are simulated.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onRun(outcome === "random" ? undefined : outcome)
            }
            disabled={running}
          >
            {running ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Play className="size-4 mr-2" />
            )}
            Run now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditorView({ workflow }: { workflow: WorkflowSummary }) {
  return (
    <ReactFlowProvider>
      <EditorInner workflow={workflow} />
    </ReactFlowProvider>
  );
}
