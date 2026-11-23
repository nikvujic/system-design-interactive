import { type Design, parseDesign } from "@sdi/schema";
import { describe, expect, it } from "vitest";
import { LiveRun } from "./live-run";
import { MAX_BUFFERED_PARTICLES, type Particle, ParticleSampler } from "./particles";
import { createStream } from "./random";
import { seconds } from "./time";

function design(input: unknown): Design {
  const result = parseDesign(input);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.design;
}

const server = (id: string) => ({
  id,
  type: "server",
  cores: 4,
  queueCapacity: 100,
  serviceTime: { kind: "lognormal", medianMs: 2, p99Ms: 8 },
});

const twoServers = design({
  schemaVersion: 1,
  nodes: [
    { id: "users", type: "clients", requestsPerSecond: 2000 },
    { id: "lb", type: "load_balancer" },
    server("api-1"),
    server("api-2"),
  ],
  edges: [
    { from: "users", to: "lb" },
    { from: "lb", to: "api-1" },
    { from: "lb", to: "api-2" },
  ],
});

/** Groups particles by request, in the order they happened. */
const byRequest = (particles: Particle[]) => {
  const groups = new Map<number, Particle[]>();
  for (const p of particles) groups.set(p.id, [...(groups.get(p.id) ?? []), p]);
  return groups;
};

describe("particles", () => {
  it("are off unless asked for", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.advance(seconds(2));
    expect(run.drainParticles()).toEqual([]);
  });

  it("sample the requested number of requests per second", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.setParticlesPerSecond(100);
    run.advance(seconds(10));
    const requests = byRequest(run.drainParticles());
    // About one in every 20 requests at 2,000 per second, so about 1,000 in 10 seconds.
    expect(requests.size).toBeGreaterThan(900);
    expect(requests.size).toBeLessThan(1100);
  });

  it("follow each request from the clients to the server that handles it", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.setParticlesPerSecond(50);
    run.advance(seconds(2));
    const requests = [...byRequest(run.drainParticles()).values()];
    // The last few requests may still be in flight.
    const finished = requests.filter((events) => events.some((e) => e.kind === "done"));
    expect(finished.length).toBeGreaterThan(80);

    for (const events of finished) {
      const [first, second, last] = events;
      expect(events).toHaveLength(3);
      expect(first).toMatchObject({ kind: "hop", from: "users", to: "lb" });
      expect(second).toMatchObject({ kind: "hop", from: "lb" });
      if (second?.kind !== "hop" || last?.kind !== "done") throw new Error("unexpected order");
      expect(last).toMatchObject({ node: second.to, outcome: "ok" });
      expect(last.at).toBeGreaterThan(second.at);
    }
    // Round robin: both servers show up.
    const servers = new Set(finished.map((events) => (events[1]?.kind === "hop" ? events[1].to : "")));
    expect(servers).toEqual(new Set(["api-1", "api-2"]));
  });

  it("show rejections during an overload", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.setParticlesPerSecond(200);
    run.setRequestsPerSecond("users", 6000);
    run.advance(seconds(5));
    const outcomes = run.drainParticles().filter((p) => p.kind === "done");
    const rejected = outcomes.filter((p) => p.kind === "done" && p.outcome === "rejected");
    expect(rejected.length / outcomes.length).toBeGreaterThan(0.3);
  });

  it("never change the simulation's results", () => {
    const plain = new LiveRun(twoServers, { seed: 4 });
    plain.advance(seconds(8));

    const animated = new LiveRun(twoServers, { seed: 4 });
    animated.setParticlesPerSecond(500);
    animated.advance(seconds(4));
    animated.drainParticles();
    animated.setParticlesPerSecond(20);
    animated.advance(seconds(4));

    expect(animated.metrics()).toEqual(plain.metrics());
  });

  it("are returned once and then forgotten", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.setParticlesPerSecond(10);
    run.advance(seconds(1));
    expect(run.drainParticles().length).toBeGreaterThan(0);
    expect(run.drainParticles()).toEqual([]);
  });
});

describe("ParticleSampler", () => {
  it("samples every request from a source quieter than the target", () => {
    const sampler = new ParticleSampler(createStream(1, "#particles"));
    sampler.particlesPerSecond = 100;
    const requests = Array.from(
      { length: 10 },
      (_, id) => ({ id, createdAt: 0 }) as { id: number; createdAt: number; particleId?: number },
    );
    for (const request of requests) sampler.sample(request, 50);
    expect(requests.every((r) => r.particleId !== undefined)).toBe(true);
  });

  it("stops collecting at the buffer limit instead of growing without bound", () => {
    const sampler = new ParticleSampler(createStream(1, "#particles"));
    sampler.particlesPerSecond = 1;
    const request = { id: 0, createdAt: 0, particleId: 0 };
    for (let i = 0; i < MAX_BUFFERED_PARTICLES + 10; i++) sampler.hop(request, "a", "b", i);
    expect(sampler.drain()).toHaveLength(MAX_BUFFERED_PARTICLES);
  });

  it("refuses a negative target", () => {
    expect(() => {
      new ParticleSampler(createStream(1, "#particles")).particlesPerSecond = -1;
    }).toThrow(RangeError);
  });
});
