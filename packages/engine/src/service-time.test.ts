import { describe, expect, it } from "vitest";
import { Histogram } from "./histogram";
import { createStream, RandomStream } from "./random";
import { Server } from "./server";
import {
  constantServiceTime,
  exponentialServiceTime,
  lognormalServiceTime,
  type ServiceTime,
} from "./service-time";
import { Simulation } from "./simulation";
import { startPoissonSource } from "./source";
import { ms, seconds } from "./time";

function sample(serviceTime: ServiceTime, count: number, seed = 5): Histogram {
  const rng = new RandomStream(seed);
  const histogram = new Histogram();
  for (let i = 0; i < count; i++) histogram.record(serviceTime(rng));
  return histogram;
}

describe("RandomStream.normal", () => {
  it("has mean 0 and standard deviation 1", () => {
    const rng = new RandomStream(4);
    const values = Array.from({ length: 100_000 }, () => rng.normal());
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.01);
  });
});

describe("service times", () => {
  it("constant: always the same value", () => {
    const h = sample(constantServiceTime(ms(3)), 100);
    expect(h.min).toBe(ms(3));
    expect(h.max).toBe(ms(3));
  });

  it("exponential: has the requested mean", () => {
    const mean = sample(exponentialServiceTime(ms(2)), 100_000).mean!;
    expect(Math.abs(mean - ms(2)) / ms(2)).toBeLessThan(0.02);
  });

  it("lognormal: has the requested median and p99", () => {
    const h = sample(lognormalServiceTime(ms(2), ms(8)), 200_000);
    expect(Math.abs(h.percentile(50)! - ms(2)) / ms(2)).toBeLessThan(0.02);
    expect(Math.abs(h.percentile(99)! - ms(8)) / ms(8)).toBeLessThan(0.03);
  });

  it("rejects an invalid lognormal configuration", () => {
    expect(() => lognormalServiceTime(0, ms(8))).toThrow(RangeError);
    expect(() => lognormalServiceTime(ms(8), ms(2))).toThrow(RangeError);
  });
});

describe("tail latency", () => {
  /** p50 and p99 client latency for one 2-core server receiving `ratePerSecond` requests. */
  function latencyProfile(serviceTime: ServiceTime, ratePerSecond: number) {
    const sim = new Simulation();
    const latencies = new Histogram();
    const server = new Server(
      sim,
      { cores: 2, queueCapacity: Number.POSITIVE_INFINITY, serviceTime },
      createStream(1, "server"),
      (request) => latencies.record(sim.now - request.createdAt),
    );
    startPoissonSource(sim, createStream(1, "clients"), ratePerSecond, (request) => server.receive(request));
    sim.run(seconds(100));
    return { p50: latencies.percentile(50)!, p99: latencies.percentile(99)! };
  }

  // Both have a mean of about 2.4 ms, so they put the same load on the server.
  const steady = constantServiceTime(ms(2.4));
  const skewed = lognormalServiceTime(ms(2), ms(8));

  it("comes from slow work: at light load, only skewed service times have a long tail", () => {
    const steadyProfile = latencyProfile(steady, 100); // about 12% busy
    const skewedProfile = latencyProfile(skewed, 100);
    expect(steadyProfile.p99 / steadyProfile.p50).toBeLessThan(2);
    expect(skewedProfile.p99 / skewedProfile.p50).toBeGreaterThan(3);
  });

  it("also comes from waiting: at moderate load, even identical service times have a tail", () => {
    const steadyProfile = latencyProfile(steady, 500); // about 60% busy
    const skewedProfile = latencyProfile(skewed, 500);
    expect(steadyProfile.p99 / steadyProfile.p50).toBeGreaterThan(2.5);
    // Skewed work on top of queueing makes the slow end worse still.
    expect(skewedProfile.p99).toBeGreaterThan(steadyProfile.p99 * 1.3);
  });
});
