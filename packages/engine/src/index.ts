import { DESIGN_SCHEMA_VERSION } from "@sdi/schema";

export { EventQueue } from "./event-queue";
export { Histogram } from "./histogram";
export { createStream, RandomStream } from "./random";
export { Server, type Outcome, type ServerConfig, type SimRequest } from "./server";
export { Simulation, type EventHandler } from "./simulation";
export { startPoissonSource } from "./source";
export { MICROS_PER_MS, MICROS_PER_SECOND, ms, seconds, type Micros } from "./time";

/** Design format versions this engine can run. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [DESIGN_SCHEMA_VERSION];
