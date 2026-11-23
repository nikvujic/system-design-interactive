import { describe, expect, it } from "vitest";
import { runTwoServersExample } from "./example-run";

describe("runTwoServersExample", () => {
  it("validates and simulates the bundled example", () => {
    const { run } = runTwoServersExample(() => 0);
    expect(run.requests.completed).toBeGreaterThan(100_000);
    expect(run.errorRate).toBe(0);
  });
});
