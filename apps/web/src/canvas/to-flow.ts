import type { LiveNodeMetrics } from "@sdi/engine";
import type { Design, Node as DesignNode } from "@sdi/schema";
import { type Edge, MarkerType, type Node } from "@xyflow/react";
import { layoutDesign } from "./layout";

/** What each canvas node receives: its part of the design, and its latest metrics if running. */
export type CanvasNodeData = {
  node: DesignNode;
  metrics: LiveNodeMetrics | undefined;
};

export type CanvasNode = Node<CanvasNodeData, DesignNode["type"]>;

/**
 * Converts a design and its latest metrics into the nodes and edges React Flow draws.
 * The node's `type` selects its component, so each design node type has its own look.
 */
export function toFlow(
  design: Design,
  metrics: readonly LiveNodeMetrics[] = [],
): { nodes: CanvasNode[]; edges: Edge[] } {
  const positions = layoutDesign(design);
  const metricsById = new Map(metrics.map((m) => [m.id, m]));

  const nodes = design.nodes.map(
    (node): CanvasNode => ({
      id: node.id,
      type: node.type,
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: { node, metrics: metricsById.get(node.id) },
    }),
  );
  const edges = design.edges.map(
    (edge): Edge => ({
      id: `${edge.from}->${edge.to}`,
      source: edge.from,
      target: edge.to,
      markerEnd: { type: MarkerType.ArrowClosed },
    }),
  );
  return { nodes, edges };
}
