import { type Design, parseDesign } from "@sdi/schema";
import { describe, expect, it } from "vitest";
import { runDesign } from "./run-design";

function design(input: unknown): Design {
  const result = parseDesign(input);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.design;
}

const server = (id: string, cores = 4) => ({
  id,
  type: "server",
  cores,
  queueCapacity: 100,
  serviceTime: { kind: "lognormal", medianMs: 2, p99Ms: 8 },
});

/** Users -> load balancer -> two servers, at 2,000 requests per second. */
const twoServers = design({
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
});

describe("runDesign", () => {
  const result = runDesign(twoServers, { durationSeconds: 60, seed: 1 });

  it("serves all traffic when there is enough capacity", () => {
    expect(result.throughputPerSecond).toBeGreaterThan(1_950);
    expect(result.throughputPerSecond).toBeLessThan(2_050);
    expect(result.errorRate).toBe(0);
  });

  it("splits traffic evenly with round robin", () => {
    const [api1, api2] = result.nodes.filter((n) => n.type === "server");
    // Each server gets 1,000 req/s; mean service time is about 2.4 ms on 4 cores: about 60% busy.
    for (const node of [api1!, api2!]) {
      expect(node.utilization).toBeGreaterThan(0.55);
      expect(node.utilization).toBeLessThan(0.65);
    }
    expect(Math.abs(api1!.completed! - api2!.completed!)).toBeLessThanOrEqual(1);
  });

  it("reports latency percentiles in milliseconds", () => {
    const latency = result.latency!;
    expect(latency.p50Ms).toBeGreaterThan(1.5);
    expect(latency.p50Ms).toBeLessThan(3);
    expect(latency.p99Ms).toBeGreaterThan(latency.p50Ms * 2);
    expect(latency.p99Ms).toBeLessThan(latency.maxMs + 1e-9);
  });

  it("is deterministic for a seed and varies across seeds", () => {
    expect(runDesign(twoServers, { durationSeconds: 10, seed: 5 })).toEqual(
      runDesign(twoServers, { durationSeconds: 10, seed: 5 }),
    );
    expect(runDesign(twoServers, { durationSeconds: 10, seed: 5 }).latency).not.toEqual(
      runDesign(twoServers, { durationSeconds: 10, seed: 6 }).latency,
    );
  });

  it("rejects about half the traffic when demand is twice the capacity", () => {
    // One core finishing exactly 1,000 req/s, receiving 2,000 req/s, with a short queue.
    const overloaded = design({
      schemaVersion: 1,
      nodes: [
        { id: "users", type: "clients", requestsPerSecond: 2000 },
        {
          id: "api",
          type: "server",
          cores: 1,
          queueCapacity: 10,
          serviceTime: { kind: "constant", ms: 1 },
        },
      ],
      edges: [{ from: "users", to: "api" }],
    });
    const run = runDesign(overloaded, { durationSeconds: 30, seed: 1 });
    expect(run.errorRate).toBeGreaterThan(0.45);
    expect(run.errorRate).toBeLessThan(0.55);
    expect(run.throughputPerSecond).toBeGreaterThan(980);
  });

  it("leaves warm-up requests out of the client-side results", () => {
    const full = runDesign(twoServers, { durationSeconds: 60, seed: 1 });
    const warm = runDesign(twoServers, { durationSeconds: 60, seed: 1, warmupSeconds: 15 });
    const ratio = warm.requests.completed / full.requests.completed;
    expect(ratio).toBeGreaterThan(0.73);
    expect(ratio).toBeLessThan(0.77);
  });

  it("refuses a warm-up as long as the run", () => {
    expect(() => runDesign(twoServers, { durationSeconds: 10, seed: 1, warmupSeconds: 10 })).toThrow(
      RangeError,
    );
  });
});
