import type { RunResult } from "@sdi/engine";
import type { Design } from "@sdi/schema";

interface Report {
  file: string;
  design: Design;
  run: RunResult;
  seed: number;
  wallMs: number;
}

const integer = (n: number) => Math.round(n).toLocaleString("en-US");
const decimal = (n: number, digits: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const latency = (msValue: number) => `${decimal(msValue, 1)} ms`;

/** Renders a run as a plain-text report for the terminal. */
export function formatResult({ file, design, run, seed, wallMs }: Report): string {
  const lines: string[] = [];
  lines.push(`Design      ${file} (${design.nodes.length} nodes, ${design.edges.length} connections)`);
  lines.push(
    `Run         ${run.durationSeconds} s simulated, first ${run.warmupSeconds} s excluded as warm-up, ` +
      `seed ${seed}, ${integer(wallMs)} ms wall time`,
  );
  lines.push("");
  lines.push(
    `Requests    ${integer(run.requests.completed)} completed, ${integer(run.requests.rejected)} rejected ` +
      `(error rate ${decimal(run.errorRate * 100, 2)}%)`,
  );
  lines.push(`Throughput  ${decimal(run.throughputPerSecond, 1)} req/s`);
  lines.push(
    run.latency
      ? `Latency     p50 ${latency(run.latency.p50Ms)} · p95 ${latency(run.latency.p95Ms)} · ` +
          `p99 ${latency(run.latency.p99Ms)} · max ${latency(run.latency.maxMs)}`
      : "Latency     no requests completed",
  );
  lines.push("");

  const rows = [
    ["Node", "Type", "Busy", "Completed", "Rejected"],
    ...run.nodes.map((node) => [
      node.id,
      node.type,
      node.utilization === undefined ? "-" : `${Math.round(node.utilization * 100)}%`,
      node.completed === undefined ? "-" : integer(node.completed),
      node.rejected === undefined ? "-" : integer(node.rejected),
    ]),
  ];
  const widths = rows[0]!.map((_, col) => Math.max(...rows.map((row) => row[col]!.length)));
  for (const row of rows) {
    lines.push(
      row
        .map((cell, col) => (col < 2 ? cell.padEnd(widths[col]!) : cell.padStart(widths[col]!)))
        .join("  ")
        .trimEnd(),
    );
  }
  return lines.join("\n");
}
