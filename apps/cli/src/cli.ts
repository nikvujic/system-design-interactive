import { isAbsolute, join } from "node:path";
import { parseArgs } from "node:util";
import { runDesign } from "@sdi/engine";
import { parseDesign } from "@sdi/schema";
import { formatResult } from "./format";

/** Everything the CLI needs from the outside world, passed in so tests can replace it. */
export interface CliIo {
  /** Directory that relative file paths are resolved against. */
  cwd: string;
  readFile(path: string): string;
  stdout(text: string): void;
  stderr(text: string): void;
  /** Wall-clock milliseconds, used only to report how long the simulation took. */
  now(): number;
}

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

export const USAGE = `Usage: sim run <design.json> [options]

Validates a design file, simulates it and prints the results.

Options:
  --duration <seconds>  Simulated time to run (default 60)
  --warmup <seconds>    Initial time left out of the client-side results (default 5)
  --seed <integer>      Seed for the random streams; same seed, same result (default 1)
  -h, --help            Show this help`;

const parseCliArgs = (args: string[]) =>
  parseArgs({
    args,
    allowPositionals: true,
    options: {
      duration: { type: "string", default: "60" },
      warmup: { type: "string", default: "5" },
      seed: { type: "string", default: "1" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

/** Runs the CLI with the given arguments and returns the process exit code. */
export function runCli(args: string[], io: CliIo): number {
  let parsed: ReturnType<typeof parseCliArgs>;
  try {
    parsed = parseCliArgs(args);
  } catch (error) {
    return usageError(io, (error as Error).message);
  }
  const { values, positionals } = parsed;

  if (values.help) {
    io.stdout(USAGE);
    return EXIT_OK;
  }
  const [command, file, ...extra] = positionals;
  if (command !== "run") return usageError(io, command ? `Unknown command "${command}"` : "Missing command");
  if (!file) return usageError(io, "Missing design file");
  if (extra.length > 0) return usageError(io, `Unexpected argument "${extra[0]}"`);

  const durationSeconds = Number(values.duration);
  const warmupSeconds = Number(values.warmup);
  const seed = Number(values.seed);
  if (!(durationSeconds > 0) || !Number.isFinite(durationSeconds)) {
    return usageError(io, "--duration must be a positive number of seconds");
  }
  if (!(warmupSeconds >= 0 && warmupSeconds < durationSeconds)) {
    return usageError(io, "--warmup must be at least 0 and less than --duration");
  }
  if (!Number.isSafeInteger(seed)) return usageError(io, "--seed must be an integer");

  const path = isAbsolute(file) ? file : join(io.cwd, file);
  let text: string;
  try {
    text = io.readFile(path);
  } catch {
    io.stderr(`Cannot read ${file}`);
    return EXIT_FAILED;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    io.stderr(`${file} is not valid JSON: ${(error as Error).message}`);
    return EXIT_FAILED;
  }

  const result = parseDesign(json);
  if (!result.ok) {
    io.stderr(`${file} is not a valid design:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
    return EXIT_FAILED;
  }

  const start = io.now();
  const run = runDesign(result.design, { durationSeconds, warmupSeconds, seed });
  const wallMs = io.now() - start;

  io.stdout(formatResult({ file, design: result.design, run, seed, wallMs }));
  return EXIT_OK;
}

function usageError(io: CliIo, message: string): number {
  io.stderr(`${message}\n\n${USAGE}`);
  return EXIT_USAGE;
}
