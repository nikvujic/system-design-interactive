import type { Design } from "@sdi/schema";
import { Background, Controls, type EdgeTypes, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useMemo } from "react";
import { type LiveStore, LiveStoreContext } from "./live-store";
import { nodeTypes } from "./nodes";
import { TrafficEdge } from "./TrafficEdge";
import { toFlow } from "./to-flow";

const edgeTypes = { traffic: TrafficEdge } satisfies EdgeTypes;

/**
 * Draws a design as boxes and connections, with live numbers on each node and moving dashes for the
 * traffic on each connection. Read-only for now: the view can be panned and zoomed, but nodes cannot
 * be moved or connected.
 *
 * Its props change only when the design changes. Live updates reach the nodes and connections through
 * the live store, so a metrics update re-renders them alone, not the canvas.
 */
export const DesignCanvas = memo(function DesignCanvas({
  design,
  live,
}: {
  design: Design;
  live: LiveStore;
}) {
  const { nodes, edges } = useMemo(() => toFlow(design), [design]);
  return (
    <LiveStoreContext value={live}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </LiveStoreContext>
  );
});
