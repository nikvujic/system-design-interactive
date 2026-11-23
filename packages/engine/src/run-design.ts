import type { Design, Node } from "@sdi/schema";
import { buildDesign } from "./build-design";
import { Histogram } from "./histogram";
import type { SimRequest } from "./server";
import { Simulation } from "./simulation";
import { MICROS_PER_MS, seconds } from "./time";

export interface RunOptions {
  /** Simulated time to run, in seconds. */
  durationSeconds: number;
  /** Seed for every random stream. Same design + options = same result. */
  seed: number;
  /**
   * Requests sent during the first `warmupSeconds` are left out of the client-side results,
   * so an empty system filling up doesn't distort them. Default 0.
   */
  warmupSeconds?: number;
}

export interface LatencySummary {
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface NodeResult {
  id: string;
  type: Node["type"];
  /** Servers only: requests processed and rejected, utilization and average requests inside. */
  completed?: number;
  rejected?: number;
  utilization?: number;
  averageInFlight?: number;
}

export interface RunResult {
  durationSeconds: number;
  warmupSeconds: number;
  /** Client-side view, for requests sent after the warm-up. Requests still in flight at the end are not counted. */
  requests: { completed: number; rejected: number };
  /** Share of finished requests that failed (rejected), from 0 to 1. */
  errorRate: number;
  /** Completed requests per second of measured time. */
  throughputPerSecond: number;
  /** End-to-end latency as clients see it, or `undefined` if no request completed. */
  latency: LatencySummary | undefined;
  /** Per-node view over the whole run, including the warm-up. */
  nodes: NodeResult[];
  /** Simulation work done; useful for performance reporting. */
  eventsProcessed: number;
}

/**
 * Builds the simulation described by a validated design, runs it and summarizes the results.
 * The design must come from `parseDesign`; graph rules (no loops, valid connections) are assumed.
 */
export function runDesign(design: Design, options: RunOptions): RunResult {
  const warmupSeconds = options.warmupSeconds ?? 0;
  if (!(options.durationSeconds > warmupSeconds && warmupSeconds >= 0)) {
    throw new RangeError("durationSeconds must be greater than warmupSeconds, and warmupSeconds >= 0");
  }
  const warmupEnd = seconds(warmupSeconds);
  const sim = new Simulation();

  const latencies = new Histogram();
  let completed = 0;
  let rejected = 0;
  const record = (request: SimRequest, outcome: "ok" | "rejected") => {
    if (request.createdAt < warmupEnd) return;
    if (outcome === "ok") {
      completed++;
      latencies.record(sim.now - request.createdAt);
    } else {
      rejected++;
    }
  };

  const { servers } = buildDesign(sim, design, options.seed, record);

  sim.run(seconds(options.durationSeconds));

  const measuredSeconds = options.durationSeconds - warmupSeconds;
  const finished = completed + rejected;
  return {
    durationSeconds: options.durationSeconds,
    warmupSeconds,
    requests: { completed, rejected },
    errorRate: finished === 0 ? 0 : rejected / finished,
    throughputPerSecond: completed / measuredSeconds,
    latency: summarizeLatency(latencies),
    nodes: design.nodes.map((node) => {
      const server = servers.get(node.id);
      if (!server) return { id: node.id, type: node.type };
      const stats = server.stats;
      return {
        id: node.id,
        type: node.type,
        completed: stats.completed,
        rejected: stats.rejected,
        utilization: stats.utilization,
        averageInFlight: stats.averageInFlight,
      };
    }),
    eventsProcessed: sim.eventsProcessed,
  };
}

/** Client-side latency percentiles in milliseconds, or `undefined` if nothing was recorded. */
export function summarizeLatency(latencies: Histogram): LatencySummary | undefined {
  if (latencies.count === 0) return undefined;
  const toMs = (micros: number) => micros / MICROS_PER_MS;
  return {
    meanMs: toMs(latencies.mean!),
    p50Ms: toMs(latencies.percentile(50)!),
    p95Ms: toMs(latencies.percentile(95)!),
    p99Ms: toMs(latencies.percentile(99)!),
    maxMs: toMs(latencies.max!),
  };
}
