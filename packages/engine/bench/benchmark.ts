/**
 * Engine benchmark: how fast does the engine simulate a realistic topology on this machine?
 *
 * Run with `pnpm bench` from the repository root. Results vary between machines and runs;
 * they are measurements, not test assertions.
 *
 * Phase 0 exit criterion (docs/07-roadmap.md): 60 s of simulated time at 5,000 requests/second
 * in under 2 s of wall-clock time.
 */
import { performance } from "node:perf_hooks";
import {
  createStream,
  lognormalServiceTime,
  ms,
  Server,
  Simulation,
  seconds,
  startPoissonSource,
} from "../src/index";

interface Scenario {
  name: string;
  requestsPerSecond: number;
  durationSeconds: number;
  servers: number;
  coresPerServer: number;
}

const SCENARIOS: Scenario[] = [
  // Exit criterion. 3 servers x 8 cores at about 50% utilization.
  { name: "5k req/s, 60 s", requestsPerSecond: 5_000, durationSeconds: 60, servers: 3, coresPerServer: 8 },
  // Headroom: ten times the traffic.
  { name: "50k req/s, 60 s", requestsPerSecond: 50_000, durationSeconds: 60, servers: 8, coresPerServer: 32 },
];

const EXIT_CRITERION_MS = 2_000;
const REPEATS = 3;

/** Clients -> round-robin dispatch -> N servers with realistic (lognormal) service times. */
function runScenario(scenario: Scenario) {
  const sim = new Simulation();
  let completed = 0;
  const servers = Array.from(
    { length: scenario.servers },
    (_, i) =>
      new Server(
        sim,
        {
          cores: scenario.coresPerServer,
          queueCapacity: 1_000,
          serviceTime: lognormalServiceTime(ms(2), ms(8)),
        },
        createStream(1, `server-${i}`),
        () => completed++,
      ),
  );
  let next = 0;
  startPoissonSource(sim, createStream(1, "clients"), scenario.requestsPerSecond, (request) => {
    servers[next]!.receive(request);
    next = (next + 1) % servers.length;
  });

  const start = performance.now();
  sim.run(seconds(scenario.durationSeconds));
  const wallMs = performance.now() - start;

  const utilization = servers.reduce((sum, server) => sum + server.stats.utilization, 0) / servers.length;
  return { wallMs, events: sim.eventsProcessed, completed, utilization };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

const format = (n: number) => Math.round(n).toLocaleString("en-US");

// Warm-up: let the JavaScript engine optimize the hot code before measuring.
runScenario({ ...SCENARIOS[0]!, durationSeconds: 10 });

console.log(`Engine benchmark (median of ${REPEATS} runs, Node ${process.version})\n`);
const rows = SCENARIOS.map((scenario) => {
  const runs = Array.from({ length: REPEATS }, () => runScenario(scenario));
  const wallMs = median(runs.map((r) => r.wallMs));
  const { events, completed, utilization } = runs[0]!;
  return {
    scenario: scenario.name,
    events: format(events),
    requests: format(completed),
    "server busy": `${Math.round(utilization * 100)}%`,
    "wall time": `${format(wallMs)} ms`,
    "events/sec": format(events / (wallMs / 1_000)),
    "vs real time": `${format((scenario.durationSeconds * 1_000) / wallMs)}x faster`,
    wallMs,
  };
});
console.table(rows.map(({ wallMs: _wallMs, ...row }) => row));

const exitRun = rows[0]!;
const passed = exitRun.wallMs < EXIT_CRITERION_MS;
console.log(
  `\nPhase 0 exit criterion (${exitRun.scenario} in < ${format(EXIT_CRITERION_MS)} ms): ` +
    `${passed ? "PASS" : "FAIL"} (${format(exitRun.wallMs)} ms)`,
);
