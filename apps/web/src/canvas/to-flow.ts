import type { Design, Node as DesignNode } from "@sdi/schema";
import { type Edge, MarkerType, type Node } from "@xyflow/react";
import { layoutDesign } from "./layout";

/** What each canvas node receives: its part of the design. Live numbers come from the live store. */
export type CanvasNodeData = {
  node: DesignNode;
};

export type CanvasNode = Node<CanvasNodeData, DesignNode["type"]>;

/** What each connection receives: its index in `design.edges`, to look up its live traffic. */
export type TrafficEdgeData = {
  index: number;
};

export type CanvasEdge = Edge<TrafficEdgeData, "traffic">;

/**
 * Converts a design into the nodes and edges React Flow draws. It depends on the design only, so
 * the objects stay the same while a simulation runs and React Flow does not rebuild or re-measure them.
 * The node's `type` selects its component, so each design node type has its own look.
 */
export function toFlow(design: Design): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const positions = layoutDesign(design);
  const nodes = design.nodes.map(
    (node): CanvasNode => ({
      id: node.id,
      type: node.type,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: { node },
    }),
  );
  const edges = design.edges.map(
    (edge, index): CanvasEdge => ({
      id: `${edge.from}->${edge.to}`,
      source: edge.from,
      target: edge.to,
      type: "traffic",
      data: { index },
      markerEnd: { type: MarkerType.ArrowClosed },
    }),
  );
  return { nodes, edges };
}
