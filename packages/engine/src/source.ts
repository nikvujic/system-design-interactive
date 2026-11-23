import type { RandomStream } from "./random";
import type { SimRequest } from "./server";
import type { Simulation } from "./simulation";
import { MICROS_PER_SECOND } from "./time";

/** A running traffic source. Its rate can change while the simulation runs. */
export interface PoissonSource {
  /** Current average rate, in requests per second. */
  readonly ratePerSecond: number;
  /**
   * Changes the rate from the current simulated time on. A rate of 0 stops traffic until the
   * rate is raised again. Calling this at the same simulated times gives the same results.
   */
  setRate(ratePerSecond: number): void;
}

function checkRate(ratePerSecond: number): void {
  if (!(ratePerSecond >= 0 && Number.isFinite(ratePerSecond))) {
    throw new RangeError(`ratePerSecond must be zero or a positive number, got ${ratePerSecond}`);
  }
}

/**
 * Starts a Poisson traffic source: many independent clients, `ratePerSecond` requests per
 * second on average, with exponentially distributed gaps between requests. The first request
 * arrives after one random gap, not at time 0.
 */
export function startPoissonSource(
  sim: Simulation,
  rng: RandomStream,
  ratePerSecond: number,
  send: (request: SimRequest) => void,
): PoissonSource {
  if (!(ratePerSecond > 0)) {
    throw new RangeError(`ratePerSecond must be positive, got ${ratePerSecond}`);
  }
  let rate = ratePerSecond;
  let nextId = 0;
  // Each rate change starts a new generation; an arrival scheduled under an older rate is ignored.
  let generation = 0;

  const scheduleNext = (s: Simulation) => {
    if (rate === 0) return;
    const scheduledIn = generation;
    s.schedule(Math.round(rng.exponential(MICROS_PER_SECOND / rate)), (at) => {
      if (scheduledIn !== generation) return;
      send({ id: nextId++, createdAt: at.now });
      scheduleNext(at);
    });
  };
  scheduleNext(sim);

  return {
    get ratePerSecond() {
      return rate;
    },
    setRate(newRate) {
      checkRate(newRate);
      if (newRate === rate) return;
      rate = newRate;
      generation++;
      // Gaps between Poisson arrivals are memoryless, so drawing a fresh gap from "now" at the
      // new rate gives exactly the arrivals a source with the new rate would produce.
      scheduleNext(sim);
    },
  };
}
