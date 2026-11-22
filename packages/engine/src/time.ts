/**
 * Simulated time, in integer microseconds since the start of the run.
 *
 * Time is never a floating-point number: float rounding can differ between operations,
 * which would break determinism (same design + scenario + seed = identical results).
 */
export type Micros = number;

export const MICROS_PER_MS = 1_000;
export const MICROS_PER_SECOND = 1_000_000;

/** Converts milliseconds to simulated time, rounded to the nearest microsecond. */
export function ms(value: number): Micros {
  return Math.round(value * MICROS_PER_MS);
}

/** Converts seconds to simulated time, rounded to the nearest microsecond. */
export function seconds(value: number): Micros {
  return Math.round(value * MICROS_PER_SECOND);
}
