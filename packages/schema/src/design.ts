import { z } from "zod";

/** Version of the saved design format. Bumped when the format changes, with a migration. */
export const DESIGN_SCHEMA_VERSION = 1;

/**
 * Node ids appear in links, error messages and random-stream names, so they are kept simple:
 * lower-case letters, digits and dashes, starting with a letter or digit.
 */
const NodeId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Use lower-case letters, digits and dashes (max 64)");

const Position = z.object({ x: z.number(), y: z.number() });

/** How long one request takes on a server. Durations are in milliseconds. */
export const ServiceTimeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("constant"), ms: z.number().positive() }),
  z.object({ kind: z.literal("exponential"), meanMs: z.number().positive() }),
  z
    .object({
      kind: z.literal("lognormal"),
      medianMs: z.number().positive(),
      p99Ms: z.number().positive(),
    })
    .refine((t) => t.p99Ms >= t.medianMs, {
      message: "p99Ms must be at least medianMs",
      path: ["p99Ms"],
    }),
]);

const NodeBase = { id: NodeId, position: Position.optional() };

export const ClientsNodeSchema = z.object({
  ...NodeBase,
  type: z.literal("clients"),
  /** Average request rate, with random (Poisson) arrivals. */
  requestsPerSecond: z.number().positive().max(1_000_000),
});

export const LoadBalancerNodeSchema = z.object({
  ...NodeBase,
  type: z.literal("load_balancer"),
  algorithm: z.literal("round_robin").default("round_robin"),
});

export const ServerNodeSchema = z.object({
  ...NodeBase,
  type: z.literal("server"),
  cores: z.number().int().min(1).max(256),
  /** Requests that can wait for a free core; beyond this, new requests are rejected. */
  queueCapacity: z.number().int().min(0).max(1_000_000),
  serviceTime: ServiceTimeSchema,
});

export const NodeSchema = z.discriminatedUnion("type", [
  ClientsNodeSchema,
  LoadBalancerNodeSchema,
  ServerNodeSchema,
]);

export const EdgeSchema = z.object({ from: NodeId, to: NodeId });

/**
 * A saved design: components and the connections between them.
 *
 * Besides each field's own rules, the design as a whole must make sense as a graph (checked in
 * `superRefine` below). The rules reflect what the engine can run today: clients send to exactly
 * one node, load balancers spread traffic over one or more nodes, and servers are endpoints.
 */
export const DesignSchema = z
  .object({
    schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
    nodes: z.array(NodeSchema).min(1),
    edges: z.array(EdgeSchema),
  })
  .superRefine((design, ctx) => {
    const byId = new Map<string, Node>();
    design.nodes.forEach((node, index) => {
      if (byId.has(node.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate node id "${node.id}"`,
          path: ["nodes", index, "id"],
        });
      }
      byId.set(node.id, node);
    });

    const outgoing = new Map<string, number>();
    const seenEdges = new Set<string>();
    design.edges.forEach((edge, index) => {
      const path = ["edges", index];
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from)
        ctx.addIssue({ code: "custom", message: `Unknown node "${edge.from}"`, path: [...path, "from"] });
      if (!to) ctx.addIssue({ code: "custom", message: `Unknown node "${edge.to}"`, path: [...path, "to"] });
      if (edge.from === edge.to)
        ctx.addIssue({ code: "custom", message: "A node cannot connect to itself", path });
      const key = `${edge.from}->${edge.to}`;
      if (seenEdges.has(key)) ctx.addIssue({ code: "custom", message: `Duplicate connection ${key}`, path });
      seenEdges.add(key);
      if (to?.type === "clients") {
        ctx.addIssue({
          code: "custom",
          message: "Clients only send traffic; nothing can connect to them",
          path,
        });
      }
      outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    });

    if (!design.nodes.some((node) => node.type === "clients")) {
      ctx.addIssue({ code: "custom", message: "A design needs at least one clients node", path: ["nodes"] });
    }
    design.nodes.forEach((node, index) => {
      const count = outgoing.get(node.id) ?? 0;
      const path = ["nodes", index];
      if (node.type === "clients" && count !== 1) {
        ctx.addIssue({
          code: "custom",
          message: `Clients "${node.id}" must connect to exactly one node`,
          path,
        });
      }
      if (node.type === "load_balancer" && count === 0) {
        ctx.addIssue({
          code: "custom",
          message: `Load balancer "${node.id}" must connect to at least one node`,
          path,
        });
      }
      if (node.type === "server" && count > 0) {
        ctx.addIssue({ code: "custom", message: `Server "${node.id}" cannot connect onward yet`, path });
      }
    });

    const cycle = findCycle(design.nodes, design.edges);
    if (cycle) {
      ctx.addIssue({
        code: "custom",
        message: `Connections form a loop (${cycle.join(" -> ")}); requests would circle forever`,
        path: ["edges"],
      });
    }
  });

/** Returns the node ids of one loop in the graph, or `undefined` if there is none. */
function findCycle(
  nodes: ReadonlyArray<{ id: string }>,
  edges: ReadonlyArray<{ from: string; to: string }>,
): string[] | undefined {
  const next = new Map<string, string[]>();
  for (const edge of edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);

  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string): string[] | undefined => {
    if (state.get(id) === "done") return undefined;
    if (state.get(id) === "visiting") return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, "visiting");
    stack.push(id);
    for (const target of next.get(id) ?? []) {
      const found = visit(target);
      if (found) return found;
    }
    stack.pop();
    state.set(id, "done");
    return undefined;
  };
  for (const node of nodes) {
    const found = visit(node.id);
    if (found) return found;
  }
  return undefined;
}

export type ServiceTimeSpec = z.infer<typeof ServiceTimeSchema>;
export type ClientsNode = z.infer<typeof ClientsNodeSchema>;
export type LoadBalancerNode = z.infer<typeof LoadBalancerNodeSchema>;
export type ServerNode = z.infer<typeof ServerNodeSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type Design = z.infer<typeof DesignSchema>;

export type ParseResult = { ok: true; design: Design } | { ok: false; errors: string[] };

/**
 * Validates untrusted input (a loaded file, an import, a pasted link) as a design.
 * Errors are readable one-liners with the location, e.g. `nodes[2].cores: Too small: ...`.
 * Every field-level problem is reported at once. Graph rules (connections, loops) are checked only
 * once every field is valid, so a design with both kinds of problems reports them in two rounds.
 */
export function parseDesign(input: unknown): ParseResult {
  const result = DesignSchema.safeParse(input);
  if (result.success) return { ok: true, design: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`),
  };
}

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(design)";
  return path
    .map((part, i) => (typeof part === "number" ? `[${part}]` : `${i === 0 ? "" : "."}${String(part)}`))
    .join("");
}
