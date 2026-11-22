import type { Design, Node, ServiceTimeSpec } from "@sdi/schema";
import { Histogram } from "./histogram";
import { createStream } from "./random";
import { Server, type SimRequest } from "./server";
import {
  constantServiceTime,
  exponentialServiceTime,
  lognormalServiceTime,
  type ServiceTime,
} from "./service-time";
import { Simulation } from "./simulation";
import { startPoissonSource } from "./source";
import { MICROS_PER_MS, ms, seconds } from "./time";

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

type Receiver = (request: SimRequest) => void;

function toServiceTime(spec: ServiceTimeSpec): ServiceTime {
  switch (spec.kind) {
    case "constant":
      return constantServiceTime(ms(spec.ms));
    case "exponential":
      return exponentialServiceTime(ms(spec.meanMs));
    case "lognormal":
      return lognormalServiceTime(ms(spec.medianMs), ms(spec.p99Ms));
  }
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

  const targetsOf = (id: string) => design.edges.filter((e) => e.from === id).map((e) => e.to);
  // Receivers are looked up when a request is delivered, so nodes can be built in any order.
  const receivers = new Map<string, Receiver>();
  const deliver = (id: string, request: SimRequest) => receivers.get(id)!(request);
  const servers = new Map<string, Server>();

  for (const node of design.nodes) {
    switch (node.type) {
      case "server": {
        const server = new Server(
          sim,
          {
            cores: node.cores,
            queueCapacity: node.queueCapacity,
            serviceTime: toServiceTime(node.serviceTime),
          },
          createStream(options.seed, node.id),
          record,
        );
        servers.set(node.id, server);
        receivers.set(node.id, (request) => server.receive(request));
        break;
      }
      case "load_balancer": {
        const targets = targetsOf(node.id);
        let next = 0;
        receivers.set(node.id, (request) => {
          const target = targets[next]!;
          next = (next + 1) % targets.length;
          deliver(target, request);
        });
        break;
      }
      case "clients": {
        const target = targetsOf(node.id)[0]!;
        startPoissonSource(sim, createStream(options.seed, node.id), node.requestsPerSecond, (request) =>
          deliver(target, request),
        );
        break;
      }
    }
  }

  sim.run(seconds(options.durationSeconds));

  const measuredSeconds = options.durationSeconds - warmupSeconds;
  const toMs = (micros: number) => micros / MICROS_PER_MS;
  const finished = completed + rejected;
  return {
    durationSeconds: options.durationSeconds,
    warmupSeconds,
    requests: { completed, rejected },
    errorRate: finished === 0 ? 0 : rejected / finished,
    throughputPerSecond: completed / measuredSeconds,
    latency:
      latencies.count === 0
        ? undefined
        : {
            meanMs: toMs(latencies.mean!),
            p50Ms: toMs(latencies.percentile(50)!),
            p95Ms: toMs(latencies.percentile(95)!),
            p99Ms: toMs(latencies.percentile(99)!),
            maxMs: toMs(latencies.max!),
          },
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
