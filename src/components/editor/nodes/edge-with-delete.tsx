"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  useReactFlow,
} from "reactflow";
import { X } from "lucide-react";

/**
 * Custom edge with a delete button shown when the edge is selected.
 *
 * Usage: register as `edgeTypes.edgeWithDelete` in the ReactFlow component.
 */
export function EdgeWithDelete({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  function handleDelete() {
    setEdges((eds) => eds.filter((e) => e.id !== id));
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          stroke: selected ? "#8b5cf6" : (style?.stroke as string) || "#94a3b8",
        }}
      />
      <EdgeLabelRenderer>
        {selected && (
          <button
            onClick={handleDelete}
            className="absolute flex items-center justify-center size-5 rounded-full bg-rose-500 text-white shadow-md hover:bg-rose-600 transition-colors pointer-events-auto nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            title="Eliminar conexión"
          >
            <X className="size-3" />
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
