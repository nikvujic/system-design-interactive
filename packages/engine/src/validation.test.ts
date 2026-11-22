/**
 * Validation suite: compares simulation results with results from queueing theory for models
 * where the exact answer is known (docs/02-simulation-engine.md §2.10). These checks validate
 * specific cases; they do not prove the engine correct for every topology or workload.
 */
import { describe, expect, it } from "vitest";
import { createStream } from "./random";
import { Server } from "./server";
import { Simulation } from "./simulation";
import { startPoissonSource } from "./source";
import { seconds } from "./time";

interface QueueModel {
  seed: number;
  cores: number;
  arrivalsPerSecond: number;
  /** Requests one core finishes per second, on average (exponential service times). */
  servicePerCorePerSecond: number;
  durationSeconds: number;
}

function runQueue(model: QueueModel) {
  const sim = new Simulation();
  let latencySum = 0;
  let latencyCount = 0;
  const meanService = seconds(1) / model.servicePerCorePerSecond;
  const server = new Server(
    sim,
    {
      cores: model.cores,
      queueCapacity: Number.POSITIVE_INFINITY,
      serviceTime: (rng) => Math.round(rng.exponential(meanService)),
    },
    createStream(model.seed, "server"),
    (request) => {
      latencySum += sim.now - request.createdAt;
      latencyCount++;
    },
  );
  let arrivals = 0;
  startPoissonSource(sim, createStream(model.seed, "clients"), model.arrivalsPerSecond, (request) => {
    arrivals++;
    server.receive(request);
  });
  sim.run(seconds(model.durationSeconds));

  return {
    stats: server.stats,
    arrivals,
    /** Mean latency in seconds. */
    meanLatency: latencySum / latencyCount / seconds(1),
  };
}

/**
 * Erlang C: the probability that an arriving request finds all `cores` busy, for an M/M/c queue
 * with offered load `load` = arrival rate / service rate per core.
 */
function erlangC(cores: number, load: number): number {
  let term = 1;
  let sumBelow = 1; // sum of load^k / k! for k = 0 .. cores - 1
  for (let k = 1; k < cores; k++) {
    term *= load / k;
    sumBelow += term;
  }
  const top = ((term * load) / cores) * (cores / (cores - load));
  return top / (sumBelow + top);
}

describe("M/M/c: several cores, Poisson arrivals, exponential service", () => {
  const model: QueueModel = {
    seed: 11,
    cores: 4,
    arrivalsPerSecond: 3_200,
    servicePerCorePerSecond: 1_000,
    durationSeconds: 200,
  };
  const lambda = model.arrivalsPerSecond;
  const mu = model.servicePerCorePerSecond;
  const pWait = erlangC(model.cores, lambda / mu);
  const expectedLatency = pWait / (model.cores * mu - lambda) + 1 / mu;
  const result = runQueue(model);

  it("keeps the cores busy for the expected share of time (80%)", () => {
    expect(result.stats.utilization).toBeGreaterThan(0.8 * 0.99);
    expect(result.stats.utilization).toBeLessThan(0.8 * 1.01);
  });

  it("makes the expected share of requests wait for a free core", () => {
    const measured = result.stats.waited / result.arrivals;
    expect(Math.abs(measured - pWait)).toBeLessThan(0.02);
  });

  it("matches the predicted mean latency", () => {
    expect(result.meanLatency).toBeGreaterThan(expectedLatency * 0.97);
    expect(result.meanLatency).toBeLessThan(expectedLatency * 1.03);
  });
});

describe("Little's Law: requests inside = arrival rate x time inside", () => {
  const cases: QueueModel[] = [
    { seed: 21, cores: 1, arrivalsPerSecond: 500, servicePerCorePerSecond: 1_000, durationSeconds: 200 },
    { seed: 22, cores: 1, arrivalsPerSecond: 900, servicePerCorePerSecond: 1_000, durationSeconds: 200 },
    { seed: 23, cores: 8, arrivalsPerSecond: 7_000, servicePerCorePerSecond: 1_000, durationSeconds: 100 },
  ];

  for (const model of cases) {
    const busy = Math.round((model.arrivalsPerSecond / (model.cores * model.servicePerCorePerSecond)) * 100);
    it(`holds for ${model.cores} core(s) at ${busy}% busy`, () => {
      const { stats, meanLatency } = runQueue(model);
      const throughput = stats.completed / model.durationSeconds;
      const predictedInFlight = throughput * meanLatency;
      expect(Math.abs(stats.averageInFlight - predictedInFlight) / predictedInFlight).toBeLessThan(0.01);
    });
  }
});
