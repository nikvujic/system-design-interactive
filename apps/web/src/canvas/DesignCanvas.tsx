import type { LiveNodeMetrics } from "@sdi/engine";
import type { Design } from "@sdi/schema";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { nodeTypes } from "./nodes";
import { toFlow } from "./to-flow";

/**
 * Draws a design as boxes and arrows, with live metrics on each node. Read-only for now:
 * the view can be panned and zoomed, but nodes cannot be moved or connected.
 */
export function DesignCanvas({
  design,
  metrics,
}: {
  design: Design;
  metrics: readonly LiveNodeMetrics[] | undefined;
}) {
  const { nodes, edges } = useMemo(() => toFlow(design, metrics), [design, metrics]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
