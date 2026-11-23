import type { Design } from "@sdi/schema";

export interface Point {
  x: number;
  y: number;
}

export const COLUMN_WIDTH = 280;
export const ROW_HEIGHT = 150;

/**
 * Positions for every node of a design. Nodes with a saved position keep it. The others are
 * placed in columns by how many connections they are away from the traffic source: clients on
 * the left, then whatever they call, and so on, with each column centered vertically.
 * Designs are loop-free (checked by the schema), so every node gets a column.
 */
export function layoutDesign(design: Design): Map<string, Point> {
  const depth = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const edge of design.edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);

  // Longest distance from a clients node, so a node always sits right of everything that calls it.
  const visit = (id: string, level: number) => {
    if ((depth.get(id) ?? -1) >= level) return;
    depth.set(id, level);
    for (const target of next.get(id) ?? []) visit(target, level + 1);
  };
  for (const node of design.nodes) if (node.type === "clients") visit(node.id, 0);

  const columns = new Map<number, string[]>();
  for (const node of design.nodes) {
    const column = depth.get(node.id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), node.id]);
  }

  const positions = new Map<string, Point>();
  for (const [column, ids] of columns) {
    ids.forEach((id, row) => {
      positions.set(id, { x: column * COLUMN_WIDTH, y: (row - (ids.length - 1) / 2) * ROW_HEIGHT });
    });
  }
  for (const node of design.nodes) if (node.position) positions.set(node.id, node.position);
  return positions;
}
