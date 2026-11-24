import type { LiveMetrics } from "@sdi/engine";
import { describe, expect, it } from "vitest";
import { LiveStore } from "./live-store";
import { rateLabel } from "./TrafficEdge";

describe("rateLabel", () => {
  it("labels traffic briefly", () => {
    expect(rateLabel(850)).toBe("850/s");
    expect(rateLabel(1_234)).toBe("1.2k/s");
  });
});

describe("LiveStore", () => {
  const metrics = {
    nodes: [{ id: "api-1", type: "server", utilization: 0.6 }],
    edges: [{ from: "users", to: "lb", requestsPerSecond: 2000, rejectedPerSecond: 0 }],
  } as unknown as LiveMetrics;

  it("hands out one node's or one connection's metrics and notifies subscribers", () => {
    const store = new LiveStore();
    let notified = 0;
    const unsubscribe = store.subscribe(() => notified++);
    store.set(metrics, true);
    expect(notified).toBe(1);
    expect(store.node("api-1")?.utilization).toBe(0.6);
    expect(store.edge(0)?.requestsPerSecond).toBe(2000);
    expect(store.isPlaying()).toBe(true);
    unsubscribe();
    store.set(undefined, false);
    expect(notified).toBe(1);
    expect(store.node("api-1")).toBeUndefined();
  });
});
