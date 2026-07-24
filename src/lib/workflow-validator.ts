import type { FlowEdge, FlowNode } from "@/lib/workflow-types";

export type WorkflowValidationSeverity = "error" | "warning";
export interface WorkflowValidationIssue {
  code: string;
  severity: WorkflowValidationSeverity;
  message: string;
  nodeId?: string;
  edgeId?: string;
}
const PAYMENT_RESULTS = ["payment_success", "payment_failed", "payment_pending", "error"];

export function validateWorkflow(nodes: FlowNode[], edges: FlowEdge[]) {
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({ code: "DUPLICATE_NODE_ID", severity: "error", message: `El ID de nodo ${node.id} está duplicado.`, nodeId: node.id });
    }
    nodeIds.add(node.id);
  }

  const starts = nodes.filter((node) => node.type === "start");
  const ends = nodes.filter((node) => node.type === "end");
  if (starts.length !== 1) {
    issues.push({ code: "START_COUNT", severity: "error", message: `El flujo debe tener exactamente un Inicio; tiene ${starts.length}.` });
  }
  if (ends.length === 0) {
    issues.push({ code: "END_REQUIRED", severity: "error", message: "El flujo debe tener al menos un nodo Fin." });
  }

  const edgeKeys = new Set<string>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: "DANGLING_EDGE", severity: "error", message: `La conexión ${edge.id} apunta a un nodo inexistente.`, edgeId: edge.id });
    }
    const handle = edge.sourceHandle || "out";
    const key = `${edge.source}:${handle}`;
    if (edgeKeys.has(key)) {
      issues.push({
        code: "AMBIGUOUS_BRANCH",
        severity: "error",
        message: `El nodo ${edge.source} tiene más de una salida para "${handle}". El motor ejecuta una sola ruta.`,
        nodeId: edge.source,
      });
    }
    edgeKeys.add(key);
  }

  const outgoing = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.source) || [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  for (const node of nodes) {
    if (node.type === "end") continue;
    const nodeEdges = outgoing.get(node.id) || [];
    const handles = new Set(nodeEdges.map((edge) => edge.sourceHandle || "out"));
    if (nodeEdges.length === 0) {
      issues.push({ code: "DEAD_END", severity: "error", message: `El nodo "${String(node.data?.label || node.id)}" no tiene salida.`, nodeId: node.id });
      continue;
    }

    if (node.type === "condition") {
      const variable = String(node.data?.variable || "");
      const required = variable === "payment_status" || variable === "payment_outcome"
        ? PAYMENT_RESULTS
        : ["true", "false"];
      for (const handle of required) {
        if (!handles.has(handle)) {
          issues.push({ code: "MISSING_BRANCH", severity: "error", message: `La condición "${String(node.data?.label || node.id)}" no conecta la salida "${handle}".`, nodeId: node.id });
        }
      }
    } else if (node.type === "verify_payment") {
      for (const handle of PAYMENT_RESULTS) {
        if (!handles.has(handle)) {
          issues.push({ code: "MISSING_PAYMENT_BRANCH", severity: "error", message: `La verificación de pago no conecta "${handle}".`, nodeId: node.id });
        }
      }
    } else if (node.type === "create_payment" || node.type === "payment") {
      const hasLinearPath = handles.has("out");
      const hasAllResultPaths = PAYMENT_RESULTS.every((handle) => handles.has(handle));
      if (!hasLinearPath && !hasAllResultPaths) {
        issues.push({
          code: "INCOMPLETE_PAYMENT_PATH",
          severity: "error",
          message: "Crear pago debe continuar por 'out' hacia Esperar/Verificar o conectar los cuatro resultados.",
          nodeId: node.id,
        });
      }
    } else if (node.type === "catalog_search") {
      for (const handle of ["found", "not_found", "error"]) {
        if (!handles.has(handle)) {
          issues.push({ code: "MISSING_CATALOG_BRANCH", severity: "error", message: `Buscar en catálogo no conecta “${handle}”.`, nodeId: node.id });
        }
      }
    } else if (node.type === "update_order") {
      for (const handle of ["out", "error"]) {
        if (!handles.has(handle)) {
          issues.push({ code: "MISSING_ORDER_BRANCH", severity: "error", message: `Actualizar pedido no conecta “${handle}”.`, nodeId: node.id });
        }
      }
    } else if (!handles.has("out")) {
      issues.push({ code: "MISSING_OUT", severity: "error", message: `El nodo "${String(node.data?.label || node.id)}" no conecta su salida principal.`, nodeId: node.id });
    }
  }

  if (starts.length === 1) {
    const reachable = new Set<string>();
    const queue = [starts[0].id];
    while (queue.length) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const edge of outgoing.get(current) || []) queue.push(edge.target);
    }
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        issues.push({ code: "UNREACHABLE_NODE", severity: "error", message: `El nodo "${String(node.data?.label || node.id)}" no es alcanzable desde Inicio.`, nodeId: node.id });
      }
    }
    if (!ends.some((node) => reachable.has(node.id))) {
      issues.push({ code: "END_UNREACHABLE", severity: "error", message: "Ningún nodo Fin es alcanzable desde Inicio." });
    }
  }

  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}
