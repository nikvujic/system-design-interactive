import { type RunResult, runDesign } from "@sdi/engine";
import { parseDesign } from "@sdi/schema";
import twoServers from "../../../examples/two-servers.json";

export interface ExampleRun {
  run: RunResult;
  wallMs: number;
}

/**
 * Validates and simulates the two-servers example on the main thread.
 * A first check that the engine runs in the browser; the live simulation will run in a Web Worker.
 */
export function runTwoServersExample(now: () => number): ExampleRun {
  const parsed = parseDesign(twoServers);
  if (!parsed.ok) throw new Error(`examples/two-servers.json is invalid:\n${parsed.errors.join("\n")}`);
  const start = now();
  const run = runDesign(parsed.design, { durationSeconds: 60, warmupSeconds: 5, seed: 1 });
  return { run, wallMs: now() - start };
}
