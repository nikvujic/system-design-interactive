import type { RandomStream } from "./random";
import type { ServiceTime } from "./service-time";
import type { Simulation } from "./simulation";
import type { Micros } from "./time";

/** One request travelling through the simulated system. */
export interface SimRequest {
  id: number;
  /** When the client sent it. Latency is measured from here. */
  createdAt: Micros;
  /** Set when the request was sampled for animation (see `ParticleSampler`). */
  particleId?: number;
  /** Live runs only: indexes of the connections the request travelled, in order. */
  route?: number[];
}

export type Outcome = "ok" | "rejected";

export interface ServerConfig {
  /** Requests that can be worked on at the same time. */
  cores: number;
  /** Requests that can wait for a free core. Beyond this, new requests are rejected. */
  queueCapacity: number;
  /** Draws how long one request takes to process. */
  serviceTime: ServiceTime;
}

/** First-in, first-out queue. Avoids `Array.shift()`, which copies the whole array each time. */
class Fifo<T> {
  private items: T[] = [];
  private head = 0;

  get length(): number {
    return this.items.length - this.head;
  }

  push(item: T): void {
    this.items.push(item);
  }

  shift(): T | undefined {
    if (this.head >= this.items.length) return undefined;
    const item = this.items[this.head++];
    // Drop the consumed prefix now and then so memory doesn't grow without bound.
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return item;
  }
}

/** Counters a server keeps about everything it has done so far. */
export interface ServerStats {
  /** Requests that finished processing. */
  completed: number;
  /** Requests turned away because the queue was full. */
  rejected: number;
  /** Requests that found every core busy and had to wait. */
  waited: number;
  /** Average number of requests inside the server (waiting or in service) since time 0. */
  averageInFlight: number;
  /** Average share of cores that were busy since time 0, from 0 to 1. */
  utilization: number;
  /**
   * Running totals behind the averages: core-microseconds spent busy, and request-microseconds
   * spent inside the server. Differences between two readings give averages over any period.
   */
  busyCoreMicros: number;
  inFlightMicros: number;
}

/**
 * A server with a fixed number of cores and a bounded waiting queue.
 * Arriving requests start on a free core, otherwise wait, otherwise are rejected.
 */
export class Server {
  private busyCores = 0;
  private readonly waiting = new Fifo<SimRequest>();

  private completed = 0;
  private rejected = 0;
  private waited = 0;
  // Time-weighted totals: "requests inside x how long they were inside", summed over time.
  private inFlightArea = 0;
  private busyCoreArea = 0;
  private lastChange = 0;

  constructor(
    private readonly sim: Simulation,
    private readonly config: ServerConfig,
    private readonly rng: RandomStream,
    private readonly onDone: (request: SimRequest, outcome: Outcome) => void,
  ) {
    if (!Number.isInteger(config.cores) || config.cores < 1) {
      throw new RangeError(`cores must be a positive integer, got ${config.cores}`);
    }
  }

  /** Requests currently being processed. */
  get inService(): number {
    return this.busyCores;
  }

  /** Requests currently waiting for a core. */
  get queueLength(): number {
    return this.waiting.length;
  }

  get stats(): ServerStats {
    const now = this.sim.now;
    const elapsed = now - this.lastChange;
    const inFlightArea = this.inFlightArea + (this.busyCores + this.waiting.length) * elapsed;
    const busyCoreArea = this.busyCoreArea + this.busyCores * elapsed;
    return {
      completed: this.completed,
      rejected: this.rejected,
      waited: this.waited,
      averageInFlight: now === 0 ? 0 : inFlightArea / now,
      utilization: now === 0 ? 0 : busyCoreArea / now / this.config.cores,
      busyCoreMicros: busyCoreArea,
      inFlightMicros: inFlightArea,
    };
  }

  receive(request: SimRequest): void {
    this.accumulate();
    if (this.busyCores < this.config.cores) {
      this.start(request);
    } else if (this.waiting.length < this.config.queueCapacity) {
      this.waited++;
      this.waiting.push(request);
    } else {
      this.rejected++;
      this.onDone(request, "rejected");
    }
  }

  private start(request: SimRequest): void {
    this.busyCores++;
    this.sim.schedule(this.config.serviceTime(this.rng), () => this.finish(request));
  }

  private finish(request: SimRequest): void {
    this.accumulate();
    this.busyCores--;
    this.completed++;
    this.onDone(request, "ok");
    const next = this.waiting.shift();
    if (next !== undefined) this.start(next);
  }

  /** Adds the time since the last change to the time-weighted totals. Call before any change. */
  private accumulate(): void {
    const now = this.sim.now;
    const elapsed = now - this.lastChange;
    this.inFlightArea += (this.busyCores + this.waiting.length) * elapsed;
    this.busyCoreArea += this.busyCores * elapsed;
    this.lastChange = now;
  }
}
