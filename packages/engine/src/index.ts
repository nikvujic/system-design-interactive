import { DESIGN_SCHEMA_VERSION } from "@sdi/schema";

export { EventQueue } from "./event-queue";
export { Simulation, type EventHandler } from "./simulation";
export { MICROS_PER_MS, MICROS_PER_SECOND, ms, seconds, type Micros } from "./time";

/** Design format versions this engine can run. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [DESIGN_SCHEMA_VERSION];
