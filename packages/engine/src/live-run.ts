import type { Design, Node } from "@sdi/schema";
import { buildDesign } from "./build-design";
import { Histogram } from "./histogram";
import { type LatencySummary, summarizeLatency } from "./run-design";
import type { Server, SimRequest } from "./server";
import { Simulation } from "./simulation";
import type { PoissonSource } from "./source";
import { MICROS_PER_SECOND, type Micros, ms, seconds } from "./time";

/** Results are collected in buckets of this much simulated time. */
export const LIVE_BUCKET: Micros = ms(250);
/** The longest window `metrics()` can report on. Older buckets are discarded. */
export const LIVE_MAX_WINDOW_SECONDS = 10;
const MAX_BUCKETS = (LIVE_MAX_WINDOW_SECONDS * MICROS_PER_SECOND) / LIVE_BUCKET;

export interface LiveNodeMetrics {
  id: string;
  type: Node["type"];
  /** Clients only: the traffic they currently send, in requests per second. */
  requestsPerSecond?: number;
  /** Servers only, over the window: requests processed and rejected per second. */
  completedPerSecond?: number;
  rejectedPerSecond?: number;
  /** Servers only, over the window: average share of busy cores, from 0 to 1. */
  utilization?: number;
  /** Servers only, right now: requests on a core and requests waiting for one. */
  inService?: number;
  queueLength?: number;
}

export interface LiveMetrics {
  /** Simulated time, in seconds since the start of the run. */
  timeSeconds: number;
  /** The period the numbers cover, in seconds. Shorter than requested early in a run. */
  windowSeconds: number;
  /** Client-side view of requests that finished during the window. */
  requests: { completed: number; rejected: number };
  /** Share of finished requests that failed (rejected), from 0 to 1. */
  errorRate: number;
  throughputPerSecond: number;
  latency: LatencySummary | undefined;
  nodes: LiveNodeMetrics[];
  /** Simulation work done since the start; useful for performance reporting. */
  eventsProcessed: number;
}

/** Running totals of one server, read at the start of a bucket. */
interface ServerReading {
  completed: number;
  rejected: number;
  busyCoreMicros: number;
}

/** Client-side results of one slice of simulated time. */
interface Bucket {
  start: Micros;
  completed: number;
  rejected: number;
  latencies: Histogram;
  /** Server totals when the bucket started, by node id. */
  servers: Map<string, ServerReading>;
}

/**
 * A simulation that runs in steps for as long as it is needed, as in the interactive sandbox.
 * The caller advances simulated time in slices, may change traffic between slices, and reads
 * metrics for the most recent seconds. Results are deterministic: the same design, seed, slices
 * and traffic changes at the same simulated times give the same metrics, however the time is sliced.
 */
export class LiveRun {
  private readonly sim = new Simulation();
  private readonly servers: Map<string, Server>;
  private readonly sources: Map<string, PoissonSource>;
  private readonly buckets: Bucket[] = [];

  constructor(
    private readonly design: Design,
    options: { seed: number },
  ) {
    const built = buildDesign(this.sim, design, options.seed, (request, outcome) =>
      this.record(request, outcome),
    );
    this.servers = built.servers;
    this.sources = built.sources;
    this.startBucket();
    const tick = (sim: Simulation) => {
      this.startBucket();
      sim.schedule(LIVE_BUCKET, tick);
    };
    this.sim.schedule(LIVE_BUCKET, tick);
  }

  /** Current simulated time. */
  get now(): Micros {
    return this.sim.now;
  }

  /** Runs the simulation forward by `duration` of simulated time. */
  advance(duration: Micros): void {
    this.sim.run(this.sim.now + duration);
  }

  /** Changes the traffic a clients node sends, from the current simulated time on. */
  setRequestsPerSecond(nodeId: string, requestsPerSecond: number): void {
    const source = this.sources.get(nodeId);
    if (!source) throw new Error(`"${nodeId}" is not a clients node in this design`);
    source.setRate(requestsPerSecond);
  }

  /**
   * Metrics for the last `windowSeconds` of simulated time (default 5, at most
   * `LIVE_MAX_WINDOW_SECONDS`). The window starts on a bucket boundary, so it covers up to
   * a quarter of a second less than requested.
   */
  metrics(windowSeconds = 5): LiveMetrics {
    if (!(windowSeconds > 0 && windowSeconds <= LIVE_MAX_WINDOW_SECONDS)) {
      throw new RangeError(`windowSeconds must be above 0 and at most ${LIVE_MAX_WINDOW_SECONDS}`);
    }
    const now = this.sim.now;
    const from = now - seconds(windowSeconds);
    const inWindow = this.buckets.filter((bucket) => bucket.start >= from);
    // The current bucket always counts, even when the window is shorter than one bucket.
    const window = inWindow.length > 0 ? inWindow : this.buckets.slice(-1);
    const first = window[0]!;
    const covered = (now - first.start) / MICROS_PER_SECOND;
    const perSecond = (count: number) => (covered === 0 ? 0 : count / covered);

    const latencies = new Histogram();
    let completed = 0;
    let rejected = 0;
    for (const bucket of window) {
      completed += bucket.completed;
      rejected += bucket.rejected;
      latencies.merge(bucket.latencies);
    }
    const finished = completed + rejected;

    return {
      timeSeconds: now / MICROS_PER_SECOND,
      windowSeconds: covered,
      requests: { completed, rejected },
      errorRate: finished === 0 ? 0 : rejected / finished,
      throughputPerSecond: perSecond(completed),
      latency: summarizeLatency(latencies),
      nodes: this.design.nodes.map((node): LiveNodeMetrics => {
        if (node.type === "clients") {
          return {
            id: node.id,
            type: node.type,
            requestsPerSecond: this.sources.get(node.id)!.ratePerSecond,
          };
        }
        const server = this.servers.get(node.id);
        if (node.type !== "server" || !server) return { id: node.id, type: node.type };
        const stats = server.stats;
        const start = first.servers.get(node.id)!;
        return {
          id: node.id,
          type: node.type,
          completedPerSecond: perSecond(stats.completed - start.completed),
          rejectedPerSecond: perSecond(stats.rejected - start.rejected),
          utilization:
            covered === 0
              ? 0
              : (stats.busyCoreMicros - start.busyCoreMicros) / (now - first.start) / node.cores,
          inService: server.inService,
          queueLength: server.queueLength,
        };
      }),
      eventsProcessed: this.sim.eventsProcessed,
    };
  }

  private record(request: SimRequest, outcome: "ok" | "rejected"): void {
    const bucket = this.buckets[this.buckets.length - 1]!;
    if (outcome === "ok") {
      bucket.completed++;
      bucket.latencies.record(this.sim.now - request.createdAt);
    } else {
      bucket.rejected++;
    }
  }

  private startBucket(): void {
    const servers = new Map<string, ServerReading>();
    for (const [id, server] of this.servers) {
      const { completed, rejected, busyCoreMicros } = server.stats;
      servers.set(id, { completed, rejected, busyCoreMicros });
    }
    this.buckets.push({
      start: this.sim.now,
      completed: 0,
      rejected: 0,
      latencies: new Histogram(),
      servers,
    });
    if (this.buckets.length > MAX_BUCKETS + 1) this.buckets.shift();
  }
}
