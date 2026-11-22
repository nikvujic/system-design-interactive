import type { RandomStream } from "./random";
import type { Simulation } from "./simulation";
import type { Micros } from "./time";

/** One request travelling through the simulated system. */
export interface SimRequest {
  id: number;
  /** When the client sent it. Latency is measured from here. */
  createdAt: Micros;
}

export type Outcome = "ok" | "rejected";

export interface ServerConfig {
  /** Requests that can be worked on at the same time. */
  cores: number;
  /** Requests that can wait for a free core. Beyond this, new requests are rejected. */
  queueCapacity: number;
  /** Draws how long one request takes to process. Must return whole microseconds. */
  serviceTime: (rng: RandomStream) => Micros;
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

/**
 * A server with a fixed number of cores and a bounded waiting queue.
 * Arriving requests start on a free core, otherwise wait, otherwise are rejected.
 */
export class Server {
  private busyCores = 0;
  private readonly waiting = new Fifo<SimRequest>();

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

  receive(request: SimRequest): void {
    if (this.busyCores < this.config.cores) {
      this.start(request);
    } else if (this.waiting.length < this.config.queueCapacity) {
      this.waiting.push(request);
    } else {
      this.onDone(request, "rejected");
    }
  }

  private start(request: SimRequest): void {
    this.busyCores++;
    this.sim.schedule(this.config.serviceTime(this.rng), () => this.finish(request));
  }

  private finish(request: SimRequest): void {
    this.busyCores--;
    this.onDone(request, "ok");
    const next = this.waiting.shift();
    if (next !== undefined) this.start(next);
  }
}
