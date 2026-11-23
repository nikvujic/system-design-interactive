import type { LiveMetrics } from "@sdi/engine";
import type { Design } from "@sdi/schema";

/**
 * Messages between the page and the simulation worker. Every message that crosses between the
 * two threads is listed here, so both sides agree on the shapes.
 */

/** Page -> worker. */
export type ToWorker =
  /** Start a new run of a validated design. Replaces any current run; starts paused. */
  | { type: "load"; design: Design; seed: number }
  | { type: "play" }
  | { type: "pause" }
  /** Simulated seconds per wall-clock second: 1 is real time, 10 is ten times faster. */
  | { type: "setSpeed"; speed: number }
  | { type: "setRequestsPerSecond"; nodeId: string; requestsPerSecond: number };

/** Worker -> page. */
export type FromWorker =
  | { type: "metrics"; playing: boolean; metrics: LiveMetrics }
  | { type: "error"; message: string };
