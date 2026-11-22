import { describe, expect, it } from "vitest";
import { parseDesign } from "./design";

const server = (id: string) => ({
  id,
  type: "server",
  cores: 4,
  queueCapacity: 100,
  serviceTime: { kind: "lognormal", medianMs: 2, p99Ms: 8 },
});

/** Users -> load balancer -> two servers: the example from the docs. */
function validDesign() {
  return {
    schemaVersion: 1,
    nodes: [
      { id: "users", type: "clients", requestsPerSecond: 2000 },
      { id: "lb", type: "load_balancer" },
      server("api-1"),
      server("api-2"),
    ],
    edges: [
      { from: "users", to: "lb" },
      { from: "lb", to: "api-1" },
      { from: "lb", to: "api-2" },
    ],
  };
}

function errorsOf(input: unknown): string[] {
  const result = parseDesign(input);
  if (result.ok) throw new Error("expected the design to be rejected");
  return result.errors;
}

describe("parseDesign", () => {
  it("accepts a valid design and fills in defaults", () => {
    const result = parseDesign(validDesign());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lb = result.design.nodes.find((n) => n.id === "lb");
    expect(lb).toEqual({ id: "lb", type: "load_balancer", algorithm: "round_robin" });
  });

  it("points at the exact field when a value has the wrong type", () => {
    const design = validDesign();
    (design.nodes[2] as Record<string, unknown>).cores = "four";
    const errors = errorsOf(design);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^nodes\[2\]\.cores: /);
  });

  it("rejects an unknown component type", () => {
    const design = validDesign();
    design.nodes.push({ id: "q", type: "queue" } as never);
    expect(errorsOf(design)[0]).toMatch(/^nodes\[4\]\.type: /);
  });

  it("rejects a file from a different schema version", () => {
    expect(errorsOf({ ...validDesign(), schemaVersion: 2 })[0]).toMatch(/^schemaVersion: /);
  });

  it("rejects a lognormal service time whose p99 is below its median", () => {
    const design = validDesign();
    design.nodes[2] = { ...server("api-1"), serviceTime: { kind: "lognormal", medianMs: 8, p99Ms: 2 } };
    expect(errorsOf(design)).toEqual(["nodes[2].serviceTime.p99Ms: p99Ms must be at least medianMs"]);
  });

  describe("graph rules", () => {
    it("rejects connections to nodes that don't exist", () => {
      const design = validDesign();
      design.edges.push({ from: "lb", to: "api-3" });
      expect(errorsOf(design)).toContain('edges[3].to: Unknown node "api-3"');
    });

    it("rejects duplicate node ids", () => {
      const design = validDesign();
      design.nodes.push(server("api-1"));
      expect(errorsOf(design)).toContain('nodes[4].id: Duplicate node id "api-1"');
    });

    it("requires clients to send to exactly one node", () => {
      const design = validDesign();
      design.edges.push({ from: "users", to: "api-1" });
      expect(errorsOf(design)).toContain('nodes[0]: Clients "users" must connect to exactly one node');
    });

    it("rejects a load balancer with nowhere to send traffic", () => {
      const design = validDesign();
      design.edges = [{ from: "users", to: "lb" }];
      expect(errorsOf(design)).toContain('nodes[1]: Load balancer "lb" must connect to at least one node');
    });

    it("rejects servers connecting onward, which the engine can't run yet", () => {
      const design = validDesign();
      design.edges.push({ from: "api-1", to: "api-2" });
      expect(errorsOf(design)).toContain('nodes[2]: Server "api-1" cannot connect onward yet');
    });

    it("reports every problem at once, not just the first", () => {
      const design = validDesign();
      design.edges.push({ from: "lb", to: "ghost" }, { from: "api-1", to: "users" });
      expect(errorsOf(design).length).toBeGreaterThanOrEqual(3);
    });
  });
});
