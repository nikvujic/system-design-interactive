import { describe, expect, it } from "vitest";
import { EventQueue } from "./event-queue";

function drain<T>(queue: EventQueue<T>): Array<{ time: number; event: T }> {
  const out: Array<{ time: number; event: T }> = [];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    out.push(next);
  }
  return out;
}

describe("EventQueue", () => {
  it("returns undefined when empty", () => {
    const queue = new EventQueue<string>();
    expect(queue.pop()).toBeUndefined();
    expect(queue.peekTime()).toBeUndefined();
    expect(queue.size).toBe(0);
  });

  it("hands out events in time order, regardless of push order", () => {
    const queue = new EventQueue<string>();
    queue.push(300, "c");
    queue.push(100, "a");
    queue.push(200, "b");

    expect(queue.peekTime()).toBe(100);
    expect(drain(queue).map((e) => e.event)).toEqual(["a", "b", "c"]);
  });

  it("hands out same-time events in the order they were pushed", () => {
    const queue = new EventQueue<string>();
    queue.push(500, "first");
    queue.push(100, "early");
    queue.push(500, "second");
    queue.push(500, "third");

    expect(drain(queue).map((e) => e.event)).toEqual(["early", "first", "second", "third"]);
  });

  it("rejects times that are not non-negative integers", () => {
    const queue = new EventQueue<string>();
    expect(() => queue.push(1.5, "x")).toThrow(RangeError);
    expect(() => queue.push(-1, "x")).toThrow(RangeError);
    expect(() => queue.push(Number.NaN, "x")).toThrow(RangeError);
  });

  it("stays ordered across many interleaved pushes and pops", () => {
    // Fixed pseudo-random sequence (a linear congruential generator), so the test is repeatable.
    let state = 12345;
    const nextInt = (max: number) => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return state % max;
    };

    const queue = new EventQueue<number>();
    const popped: Array<{ time: number; event: number }> = [];
    let id = 0;
    for (let round = 0; round < 2_000; round++) {
      queue.push(nextInt(1_000), id++);
      if (nextInt(3) === 0) {
        const next = queue.pop();
        if (next) popped.push(next);
      }
    }
    const rest = drain(queue);

    // Everything still queued at the end must come out sorted by time, ties by insertion id.
    for (let i = 1; i < rest.length; i++) {
      const prev = rest[i - 1]!;
      const cur = rest[i]!;
      expect(prev.time < cur.time || (prev.time === cur.time && prev.event < cur.event)).toBe(true);
    }
    // Nothing was lost or duplicated.
    expect(popped.length + rest.length).toBe(id);
  });
});
