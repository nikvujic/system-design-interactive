import type { RandomStream } from "./random";
import type { Micros } from "./time";

/** Draws how long one piece of work takes, in whole microseconds. */
export type ServiceTime = (rng: RandomStream) => Micros;

/** Always the same duration. Useful for tests and hand-checkable examples, not for realism. */
export function constantServiceTime(duration: Micros): ServiceTime {
  return () => duration;
}

/** Exponentially distributed durations. Used where results are compared with queueing theory. */
export function exponentialServiceTime(mean: Micros): ServiceTime {
  return (rng) => Math.round(rng.exponential(mean));
}

/**
 * Lognormal durations, configured by median and p99: the realistic default for compute and
 * database work, where most requests are fast and a few are much slower.
 */
export function lognormalServiceTime(median: Micros, p99: Micros): ServiceTime {
  if (!(median > 0 && p99 >= median)) {
    throw new RangeError(`lognormal needs 0 < median <= p99, got median ${median}, p99 ${p99}`);
  }
  return (rng) => Math.round(rng.lognormal(median, p99));
}
