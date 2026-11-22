import type { RandomStream } from "./random";
import type { SimRequest } from "./server";
import type { Simulation } from "./simulation";
import { MICROS_PER_SECOND } from "./time";

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
): void {
  if (!(ratePerSecond > 0)) {
    throw new RangeError(`ratePerSecond must be positive, got ${ratePerSecond}`);
  }
  const meanGap = MICROS_PER_SECOND / ratePerSecond;
  let nextId = 0;

  const arrive = (s: Simulation) => {
    send({ id: nextId++, createdAt: s.now });
    s.schedule(Math.round(rng.exponential(meanGap)), arrive);
  };
  sim.schedule(Math.round(rng.exponential(meanGap)), arrive);
}
