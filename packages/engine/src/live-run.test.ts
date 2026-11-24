import { type Design, parseDesign } from "@sdi/schema";
import { describe, expect, it } from "vitest";
import { LiveRun } from "./live-run";
import { ms, seconds } from "./time";

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

/**
 * Users -> load balancer -> two 4-core servers. At 2,000 requests per second each server is
 * about 60% busy; the pair can handle roughly 3,300 requests per second.
 */
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

const node = (run: LiveRun, id: string) => run.metrics().nodes.find((n) => n.id === id)!;

describe("LiveRun", () => {
  it("gives the same results however simulated time is sliced", () => {
    const oneStep = new LiveRun(twoServers, { seed: 7 });
    oneStep.advance(seconds(12));

    const manySteps = new LiveRun(twoServers, { seed: 7 });
    for (let i = 0; i < 120; i++) manySteps.advance(ms(100));

    expect(manySteps.now).toBe(oneStep.now);
    expect(manySteps.metrics()).toEqual(oneStep.metrics());
  });

  it("reports throughput, latency and utilization for the recent window", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.advance(seconds(20));
    const metrics = run.metrics(5);

    expect(metrics.timeSeconds).toBe(20);
    expect(metrics.windowSeconds).toBeGreaterThan(4.75);
    expect(metrics.windowSeconds).toBeLessThanOrEqual(5);
    expect(metrics.throughputPerSecond).toBeGreaterThan(1_900);
    expect(metrics.throughputPerSecond).toBeLessThan(2_100);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.latency!.p50Ms).toBeGreaterThan(1.5);
    expect(metrics.latency!.p99Ms).toBeLessThan(15);
    expect(node(run, "users").requestsPerSecond).toBe(2000);
    expect(node(run, "api-1").utilization).toBeGreaterThan(0.5);
    expect(node(run, "api-1").utilization).toBeLessThan(0.7);
  });

  it("covers only the time simulated so far at the start of a run", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.advance(seconds(2));
    expect(run.metrics(5).windowSeconds).toBe(2);
  });

  it("shows an overload while it happens and recovery after it ends", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.advance(seconds(10));
    expect(run.metrics().errorRate).toBe(0);

    // About twice what the servers can handle: queues fill and requests are turned away.
    run.setRequestsPerSecond("users", 6000);
    run.advance(seconds(10));
    const overloaded = run.metrics();
    expect(overloaded.errorRate).toBeGreaterThan(0.3);
    expect(overloaded.latency!.p50Ms).toBeGreaterThan(20);
    expect(node(run, "api-1").utilization).toBeGreaterThan(0.99);
    expect(node(run, "users").requestsPerSecond).toBe(6000);

    // Back to normal: the last five seconds no longer show the overload.
    run.setRequestsPerSecond("users", 2000);
    run.advance(seconds(10));
    const recovered = run.metrics();
    expect(recovered.errorRate).toBe(0);
    expect(recovered.latency!.p99Ms).toBeLessThan(15);
  });

  it("stops traffic at a rate of 0 and resumes when it is raised", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.advance(seconds(5));
    run.setRequestsPerSecond("users", 0);
    run.advance(seconds(6));
    expect(run.metrics().throughputPerSecond).toBe(0);
    expect(node(run, "api-1").inService).toBe(0);

    run.setRequestsPerSecond("users", 1000);
    run.advance(seconds(5));
    expect(run.metrics().throughputPerSecond).toBeGreaterThan(900);
  });

  it("is deterministic with traffic changes", () => {
    const script = () => {
      const run = new LiveRun(twoServers, { seed: 3 });
      run.advance(seconds(3));
      run.setRequestsPerSecond("users", 5000);
      run.advance(seconds(3));
      return run.metrics();
    };
    expect(script()).toEqual(script());
  });

  it("refuses changes that do not fit the design", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    expect(() => run.setRequestsPerSecond("api-1", 100)).toThrow(/not a clients node/);
    expect(() => run.setRequestsPerSecond("users", -1)).toThrow(RangeError);
    expect(() => run.metrics(11)).toThrow(RangeError);
  });

  it("reports the traffic on each connection", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.advance(seconds(10));
    const edges = run.metrics().edges;
    expect(edges.map((e) => `${e.from}->${e.to}`)).toEqual(["users->lb", "lb->api-1", "lb->api-2"]);
    const [toLb, toApi1, toApi2] = edges;
    expect(toLb!.requestsPerSecond).toBeGreaterThan(1_900);
    expect(toLb!.requestsPerSecond).toBeLessThan(2_100);
    // Round robin splits the load balancer's traffic in half.
    expect(toApi1!.requestsPerSecond).toBeCloseTo(toLb!.requestsPerSecond / 2, -1);
    expect(toApi2!.requestsPerSecond).toBeCloseTo(toLb!.requestsPerSecond / 2, -1);
    expect(edges.every((e) => e.rejectedPerSecond === 0)).toBe(true);
  });

  it("counts rejections on every connection the rejected requests travelled", () => {
    const run = new LiveRun(twoServers, { seed: 1 });
    run.setRequestsPerSecond("users", 6000);
    run.advance(seconds(10));
    const metrics = run.metrics();
    const [toLb, toApi1, toApi2] = metrics.edges;
    const share = (e: typeof toLb) => e!.rejectedPerSecond / e!.requestsPerSecond;
    // Each server is overloaded the same way, so each connection fails about as often as the whole.
    expect(share(toLb)).toBeCloseTo(metrics.errorRate, 1);
    expect(share(toApi1)).toBeGreaterThan(0.3);
    expect(share(toApi2)).toBeGreaterThan(0.3);
    // Rejections on the load balancer's connections add up to those on the way in.
    expect(toApi1!.rejectedPerSecond + toApi2!.rejectedPerSecond).toBeCloseTo(toLb!.rejectedPerSecond, 0);
  });
});
