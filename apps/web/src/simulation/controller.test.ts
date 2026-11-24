import { describe, expect, it } from "vitest";
import { twoServers } from "../examples";
import { MAX_TICK_GAP_MS, SimController } from "./controller";
import type { FromWorker } from "./protocol";

/** A controller driven by a fake clock, recording everything it posts. */
function setup() {
  let clock = 0;
  const posted: FromWorker[] = [];
  const controller = new SimController(
    () => clock,
    (message) => posted.push(message),
  );
  const wait = (wallMs: number, tickEveryMs = 16) => {
    for (let elapsed = 0; elapsed < wallMs; elapsed += tickEveryMs) {
      clock += tickEveryMs;
      controller.tick();
    }
  };
  const last = () => {
    const message = posted[posted.length - 1];
    if (message?.type !== "metrics") throw new Error(`Expected metrics, got ${JSON.stringify(message)}`);
    return message;
  };
  return { controller, posted, wait, last };
}

describe("SimController", () => {
  it("runs simulated time in step with the wall clock while playing", () => {
    const { controller, wait, last } = setup();
    controller.handle({ type: "load", design: twoServers, seed: 1 });
    expect(last().playing).toBe(false);

    controller.handle({ type: "play" });
    wait(2_000);
    expect(last().playing).toBe(true);
    // Metrics are posted once a second; pausing posts the current numbers.
    controller.handle({ type: "pause" });
    expect(last().metrics.timeSeconds).toBeCloseTo(2, 1);
    expect(last().metrics.throughputPerSecond).toBeGreaterThan(1_500);
  });

  it("posts metrics once a second, not on every tick", () => {
    const { controller, posted, wait } = setup();
    controller.handle({ type: "load", design: twoServers, seed: 1 });
    controller.handle({ type: "play" });
    const before = posted.length;
    wait(5_000);
    expect(posted.length - before).toBeGreaterThanOrEqual(4);
    expect(posted.length - before).toBeLessThanOrEqual(6);
  });

  it("stops advancing while paused", () => {
    const { controller, wait, last } = setup();
    controller.handle({ type: "load", design: twoServers, seed: 1 });
    controller.handle({ type: "play" });
    wait(1_000);
    controller.handle({ type: "pause" });
    const pausedAt = last().metrics.timeSeconds;
    wait(1_000);
    controller.handle({ type: "play" });
    expect(last().metrics.timeSeconds).toBe(pausedAt);
  });

  it("scales simulated time by the speed", () => {
    const { controller, wait, last } = setup();
    controller.handle({ type: "load", design: twoServers, seed: 1 });
    controller.handle({ type: "setSpeed", speed: 10 });
    controller.handle({ type: "play" });
    wait(1_000);
    controller.handle({ type: "pause" });
    expect(last().metrics.timeSeconds).toBeCloseTo(10, 0);
  });

  it("catches up on at most a short gap after the timer was delayed", () => {
    const { controller, wait, last } = setup();
    controller.handle({ type: "load", design: twoServers, seed: 1 });
    controller.handle({ type: "play" });
    wait(5_000, 5_000); // one tick after five seconds, as in a background tab
    expect(last().metrics.timeSeconds).toBe(MAX_TICK_GAP_MS / 1000);
  });

  it("applies traffic changes during the run", () => {
    const { controller, wait, last } = setup();
    controller.handle({ type: "load", design: twoServers, seed: 1 });
    controller.handle({ type: "play" });
    controller.handle({ type: "setRequestsPerSecond", nodeId: "users", requestsPerSecond: 6000 });
    wait(6_000);
    expect(last().metrics.errorRate).toBeGreaterThan(0.3);
  });

  it("reports problems as error messages instead of throwing", () => {
    const { controller, posted } = setup();
    controller.handle({ type: "play" });
    expect(posted.pop()).toEqual({ type: "error", message: "No design is loaded" });

    controller.handle({ type: "load", design: twoServers, seed: 1 });
    controller.handle({ type: "setRequestsPerSecond", nodeId: "api-1", requestsPerSecond: 10 });
    expect(posted.pop()).toMatchObject({
      type: "error",
      message: expect.stringMatching(/not a clients node/),
    });
    controller.handle({ type: "setSpeed", speed: 0 });
    expect(posted.pop()).toMatchObject({ type: "error" });
  });

  it("sends a quick update after play and after changes, then returns to once a second", () => {
    const { controller, posted, wait, last } = setup();
    controller.handle({ type: "load", design: twoServers, seed: 1 });
    controller.handle({ type: "play" });
    const metricsPosts = () => posted.filter((m) => m.type === "metrics").length;

    const afterPlay = metricsPosts();
    wait(300);
    expect(metricsPosts()).toBe(afterPlay + 1);
    expect(last().metrics.throughputPerSecond).toBeGreaterThan(1_000);

    wait(800);
    expect(metricsPosts()).toBe(afterPlay + 1);

    controller.handle({ type: "setRequestsPerSecond", nodeId: "users", requestsPerSecond: 3000 });
    // No update on the change itself, one soon after.
    expect(metricsPosts()).toBe(afterPlay + 1);
    wait(300);
    expect(metricsPosts()).toBe(afterPlay + 2);
  });

  it("does not post on every slider movement while playing", () => {
    const { controller, posted, wait } = setup();
    controller.handle({ type: "load", design: twoServers, seed: 1 });
    controller.handle({ type: "play" });
    wait(1_500);
    const before = posted.length;
    for (let rate = 2000; rate < 2500; rate += 10) {
      controller.handle({ type: "setRequestsPerSecond", nodeId: "users", requestsPerSecond: rate });
    }
    expect(posted.length).toBe(before);
  });
});
