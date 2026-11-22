import { describe, expect, it } from "vitest";
import { Histogram } from "./histogram";
import { RandomStream } from "./random";

/** Exact percentile by sorting, for comparison. */
function exactPercentile(values: number[], percent: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((percent / 100) * sorted.length));
  return sorted[rank - 1]!;
}

describe("Histogram", () => {
  it("reports nothing when empty", () => {
    const h = new Histogram();
    expect(h.count).toBe(0);
    expect(h.mean).toBeUndefined();
    expect(h.percentile(99)).toBeUndefined();
  });

  it("is exact for small values", () => {
    const h = new Histogram();
    for (let v = 1; v <= 100; v++) h.record(v);
    expect(h.percentile(50)).toBe(50);
    expect(h.percentile(99)).toBe(99);
    expect(h.percentile(100)).toBe(100);
    expect(h.min).toBe(1);
    expect(h.max).toBe(100);
    expect(h.mean).toBe(50.5);
  });

  it("stays within 1% of the exact percentile across a wide range of values", () => {
    // Latencies from 0.1 ms to several seconds, skewed like real ones.
    const rng = new RandomStream(3);
    const values = Array.from({ length: 50_000 }, () => Math.round(100 + rng.exponential(20_000) ** 1.3));
    const h = new Histogram();
    for (const v of values) h.record(v);

    for (const p of [1, 10, 50, 90, 99, 99.9]) {
      const exact = exactPercentile(values, p);
      expect(Math.abs(h.percentile(p)! - exact) / exact).toBeLessThan(0.01);
    }
  });

  it("merges into the same result as recording everything in one histogram", () => {
    const rng = new RandomStream(9);
    const all = new Histogram();
    const a = new Histogram();
    const b = new Histogram();
    for (let i = 0; i < 10_000; i++) {
      const v = Math.round(rng.exponential(5_000));
      all.record(v);
      (i % 2 === 0 ? a : b).record(v);
    }
    a.merge(b);

    for (const p of [50, 90, 99]) expect(a.percentile(p)).toBe(all.percentile(p));
    expect(a.count).toBe(all.count);
    expect(a.mean).toBe(all.mean);
  });

  it("rejects values it cannot store", () => {
    const h = new Histogram();
    expect(() => h.record(-1)).toThrow(RangeError);
    expect(() => h.record(1.5)).toThrow(RangeError);
    expect(() => h.record(2 ** 32)).toThrow(RangeError);
  });
});
