import { describe, expect, it } from "vitest";
import { createStream } from "./random";
import { Server, type Outcome, type ServerConfig, type SimRequest } from "./server";
import { Simulation } from "./simulation";
import { startPoissonSource } from "./source";
import { ms, seconds } from "./time";

/** Sends `count` requests at time 0 to a server and records each latency in completion order. */
function burst(config: ServerConfig, count: number) {
  const sim = new Simulation();
  const latencies: number[] = [];
  const outcomes: Outcome[] = [];
  const server = new Server(sim, config, createStream(1, "server"), (req, outcome) => {
    outcomes.push(outcome);
    if (outcome === "ok") latencies.push(sim.now - req.createdAt);
  });
  for (let id = 0; id < count; id++) server.receive({ id, createdAt: 0 });
  sim.run(seconds(10));
  return { latencies, outcomes };
}

const constant5ms = () => ms(5);

describe("Server", () => {
  it("processes a single request in its service time", () => {
    expect(burst({ cores: 1, queueCapacity: 10, serviceTime: constant5ms }, 1).latencies).toEqual([
      ms(5),
    ]);
  });

  it("queues requests while its only core is busy", () => {
    expect(burst({ cores: 1, queueCapacity: 10, serviceTime: constant5ms }, 3).latencies).toEqual([
      ms(5),
      ms(10),
      ms(15),
    ]);
  });

  it("works on as many requests at once as it has cores", () => {
    expect(burst({ cores: 2, queueCapacity: 10, serviceTime: constant5ms }, 3).latencies).toEqual([
      ms(5),
      ms(5),
      ms(10),
    ]);
  });

  it("rejects requests when the queue is full", () => {
    const { outcomes } = burst({ cores: 1, queueCapacity: 1, serviceTime: constant5ms }, 3);
    expect(outcomes.filter((o) => o === "rejected")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(2);
  });
});

/** Poisson traffic into one server with exponential service times; returns latencies. */
function runMM1(seed: number, arrivalsPerSecond: number, servicePerSecond: number) {
  const sim = new Simulation();
  const latencies: number[] = [];
  const meanService = seconds(1) / servicePerSecond;
  const server = new Server(
    sim,
    {
      cores: 1,
      queueCapacity: Number.POSITIVE_INFINITY,
      serviceTime: (rng) => Math.round(rng.exponential(meanService)),
    },
    createStream(seed, "server"),
    (req: SimRequest) => latencies.push(sim.now - req.createdAt),
  );
  startPoissonSource(sim, createStream(seed, "clients"), arrivalsPerSecond, (req) =>
    server.receive(req),
  );
  sim.run(seconds(200));
  return { latencies, events: sim.eventsProcessed };
}

describe("Server against queueing theory (M/M/1)", () => {
  it("matches the predicted mean latency at 50% utilization", () => {
    // Theory: mean time in system W = 1 / (mu - lambda) = 1 / (1000 - 500) s = 2 ms.
    const { latencies } = runMM1(1, 500, 1000);
    const mean = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;

    expect(latencies.length).toBeGreaterThan(90_000);
    expect(mean).toBeGreaterThan(ms(2) * 0.97);
    expect(mean).toBeLessThan(ms(2) * 1.03);
  });

  it("produces identical results for the same seed", () => {
    expect(runMM1(7, 500, 1000)).toEqual(runMM1(7, 500, 1000));
  });
});
