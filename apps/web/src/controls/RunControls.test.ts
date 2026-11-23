import { describe, expect, it } from "vitest";
import { sliderMax } from "./RunControls";

describe("sliderMax", () => {
  it("leaves room for several times the design's traffic", () => {
    expect(sliderMax(2_000)).toBe(10_000);
    expect(sliderMax(3_000)).toBe(15_000);
    expect(sliderMax(4_100)).toBe(21_000);
  });
});
