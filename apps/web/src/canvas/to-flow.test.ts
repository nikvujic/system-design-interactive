import { parseDesign } from "@sdi/schema";
import { describe, expect, it } from "vitest";
import { twoServers } from "../examples";
import { COLUMN_WIDTH, layoutDesign } from "./layout";
import { heat } from "./nodes";
import { toFlow } from "./to-flow";

describe("layoutDesign", () => {
  it("places nodes in columns by distance from the clients", () => {
    const positions = layoutDesign(twoServers);
    expect(positions.get("users")).toEqual({ x: 0, y: 0 });
    expect(positions.get("lb")).toEqual({ x: COLUMN_WIDTH, y: 0 });
    const api1 = positions.get("api-1")!;
    const api2 = positions.get("api-2")!;
    expect(api1.x).toBe(2 * COLUMN_WIDTH);
    expect(api2.x).toBe(2 * COLUMN_WIDTH);
    // The two servers are stacked, centered on the row of the load balancer.
    expect(api1.y).toBe(-api2.y);
    expect(api1.y).not.toBe(0);
  });

  it("keeps saved positions", () => {
    const parsed = parseDesign({
      ...twoServers,
      nodes: twoServers.nodes.map((node) =>
        node.id === "lb" ? { ...node, position: { x: 5, y: 7 } } : node,
      ),
    });
    if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
    expect(layoutDesign(parsed.design).get("lb")).toEqual({ x: 5, y: 7 });
  });
});

describe("toFlow", () => {
  it("turns design nodes and connections into canvas nodes and edges", () => {
    const { nodes, edges } = toFlow(twoServers);
    expect(nodes.map((n) => [n.id, n.type])).toEqual([
      ["users", "clients"],
      ["lb", "load_balancer"],
      ["api-1", "server"],
      ["api-2", "server"],
    ]);
    expect(edges.map((e) => e.id)).toEqual(["users->lb", "lb->api-1", "lb->api-2"]);
  });

  it("attaches each node's live metrics", () => {
    const { nodes } = toFlow(twoServers, [{ id: "api-1", type: "server", utilization: 0.6 }]);
    expect(nodes.find((n) => n.id === "api-1")!.data.metrics?.utilization).toBe(0.6);
    expect(nodes.find((n) => n.id === "api-2")!.data.metrics).toBeUndefined();
  });
});

describe("heat", () => {
  it("grades utilization", () => {
    expect(heat(undefined)).toBe("idle");
    expect(heat(0.6)).toBe("ok");
    expect(heat(0.75)).toBe("busy");
    expect(heat(1)).toBe("saturated");
  });
});
