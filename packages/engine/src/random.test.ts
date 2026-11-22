import { describe, expect, it } from "vitest";
import { createStream, RandomStream } from "./random";

function take(stream: RandomStream, count: number): number[] {
  return Array.from({ length: count }, () => stream.next());
}

describe("RandomStream", () => {
  it("produces the same sequence for the same seed", () => {
    expect(take(new RandomStream(42), 5)).toEqual(take(new RandomStream(42), 5));
  });

  it("produces different sequences for different seeds", () => {
    expect(take(new RandomStream(42), 5)).not.toEqual(take(new RandomStream(43), 5));
  });

  it("keeps producing the exact known values (guards against accidental algorithm changes)", () => {
    expect(take(new RandomStream(42), 3)).toMatchSnapshot();
  });

  it("stays within [0, 1) and averages about 0.5", () => {
    const values = take(new RandomStream(7), 100_000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });

  it("samples exponential values with the requested mean", () => {
    const stream = new RandomStream(7);
    const samples = Array.from({ length: 100_000 }, () => stream.exponential(10));
    const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
    // Expected spread of the sample mean here is about 0.3%, so 2% is a safe tolerance.
    expect(mean).toBeGreaterThan(9.8);
    expect(mean).toBeLessThan(10.2);
  });
});

describe("createStream", () => {
  it("gives each name its own sequence", () => {
    expect(take(createStream(1, "api-1"), 5)).not.toEqual(take(createStream(1, "api-2"), 5));
  });

  it("is unaffected by other streams being created or used", () => {
    const alone = take(createStream(1, "db-1"), 5);

    const cache = createStream(1, "cache-1");
    take(cache, 1_000);
    const withNeighbour = take(createStream(1, "db-1"), 5);

    expect(withNeighbour).toEqual(alone);
  });
});
