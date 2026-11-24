import { DESIGN_SCHEMA_VERSION } from "@sdi/schema";

export { type BuildObservers, type BuiltDesign, buildDesign } from "./build-design";
export { EventQueue } from "./event-queue";
export { Histogram } from "./histogram";
export {
  LIVE_BUCKET,
  LIVE_MAX_WINDOW_SECONDS,
  type LiveEdgeMetrics,
  type LiveMetrics,
  type LiveNodeMetrics,
  LiveRun,
} from "./live-run";
export { MAX_BUFFERED_PARTICLES, type Particle, ParticleSampler } from "./particles";
export { createStream, RandomStream } from "./random";
export {
  type LatencySummary,
  type NodeResult,
  type RunOptions,
  type RunResult,
  runDesign,
  summarizeLatency,
} from "./run-design";
export { type Outcome, Server, type ServerConfig, type ServerStats, type SimRequest } from "./server";
export {
  constantServiceTime,
  exponentialServiceTime,
  lognormalServiceTime,
  type ServiceTime,
} from "./service-time";
export { type EventHandler, Simulation } from "./simulation";
export { type PoissonSource, startPoissonSource } from "./source";
export { MICROS_PER_MS, MICROS_PER_SECOND, type Micros, ms, seconds } from "./time";

/** Design format versions this engine can run. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [DESIGN_SCHEMA_VERSION];
