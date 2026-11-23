import type { RandomStream } from "./random";
import type { Outcome, SimRequest } from "./server";
import type { Micros } from "./time";

/**
 * A sampled moment in a request's life, for animation. The engine only reports what happened and
 * when; how it is drawn is up to the UI. Every particle of one request shares its `id`.
 */
export type Particle =
  /** The request moved along a connection. Hops take no simulated time until links have latency. */
  | { kind: "hop"; id: number; from: string; to: string; at: Micros }
  /** The request finished at `node`: processed (`ok`) or turned away (`rejected`). */
  | { kind: "done"; id: number; node: string; outcome: Outcome; at: Micros };

/** Particles kept between two drains at most. Beyond this, new ones are dropped. */
export const MAX_BUFFERED_PARTICLES = 20_000;

/**
 * Picks which requests become particles and collects their events.
 *
 * Sampling is random, from the sampler's own random stream, so it never takes numbers from the
 * nodes' streams: turning particles on or off does not change the simulation itself. It is not
 * evenly spaced on purpose. Picking every n-th request would line up with regular patterns in the
 * design, such as round robin alternating servers, and show particles on only some connections.
 * Each traffic source is sampled on its own, so a quiet source still shows particles next to a busy one.
 */
export class ParticleSampler {
  private target = 0;
  private nextId = 0;
  private buffer: Particle[] = [];

  constructor(private readonly rng: RandomStream) {}

  /** Sampled requests per simulated second for each traffic source; 0 turns particles off. */
  get particlesPerSecond(): number {
    return this.target;
  }

  set particlesPerSecond(value: number) {
    if (!(value >= 0 && Number.isFinite(value))) {
      throw new RangeError(`particlesPerSecond must be zero or a positive number, got ${value}`);
    }
    this.target = value;
  }

  /** Decides whether a new request from a source now sending `sourceRate` per second is sampled. */
  sample(request: SimRequest, sourceRate: number): void {
    if (this.target === 0 || sourceRate === 0) return;
    if (this.rng.next() < this.target / sourceRate) request.particleId = this.nextId++;
  }

  hop(request: SimRequest, from: string, to: string, at: Micros): void {
    if (request.particleId === undefined) return;
    this.push({ kind: "hop", id: request.particleId, from, to, at });
  }

  done(request: SimRequest, node: string, outcome: Outcome, at: Micros): void {
    if (request.particleId === undefined) return;
    this.push({ kind: "done", id: request.particleId, node, outcome, at });
  }

  /** Returns the particles collected since the last drain, oldest first, and forgets them. */
  drain(): Particle[] {
    const particles = this.buffer;
    this.buffer = [];
    return particles;
  }

  private push(particle: Particle): void {
    if (this.buffer.length < MAX_BUFFERED_PARTICLES) this.buffer.push(particle);
  }
}
