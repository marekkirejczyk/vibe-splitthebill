import { describe, expect, test } from "vitest";
import {
  computeResizeTarget,
  MAX_EDGE,
  RESIZE_SIZE_THRESHOLD,
} from "../src/resizeImage";

describe("computeResizeTarget", () => {
  test("small image well under thresholds → no resize", () => {
    expect(computeResizeTarget(800, 600, 200_000)).toBeNull();
  });

  test("dimensions within limit but size over threshold → resize at scale=1 (re-encode)", () => {
    // The wrapping resizeImage uses the re-encode to recompress; we surface
    // that via a scale=1 target so the canvas path still runs.
    const t = computeResizeTarget(800, 600, RESIZE_SIZE_THRESHOLD + 1);
    expect(t).toEqual({ width: 800, height: 600 });
  });

  test("portrait larger than MAX_EDGE → scaled by longer edge", () => {
    const t = computeResizeTarget(3024, 4032, 5_000_000);
    expect(t).not.toBeNull();
    expect(Math.max(t!.width, t!.height)).toBe(MAX_EDGE);
    // Aspect ratio preserved (within 1px of rounding)
    const inputRatio = 3024 / 4032;
    const outputRatio = t!.width / t!.height;
    expect(Math.abs(inputRatio - outputRatio)).toBeLessThan(0.01);
  });

  test("landscape larger than MAX_EDGE → scaled by longer edge", () => {
    const t = computeResizeTarget(4000, 2250, 5_000_000);
    expect(t!.width).toBe(MAX_EDGE);
    expect(t!.height).toBe(900);
  });

  test("square image larger than MAX_EDGE → both edges = MAX_EDGE", () => {
    const t = computeResizeTarget(3000, 3000, 5_000_000);
    expect(t).toEqual({ width: MAX_EDGE, height: MAX_EDGE });
  });

  test("never upscales (long edge already smaller than max edge but heavy file)", () => {
    const t = computeResizeTarget(400, 300, RESIZE_SIZE_THRESHOLD + 1);
    expect(t).toEqual({ width: 400, height: 300 });
  });

  test("custom maxEdge override is honored", () => {
    const t = computeResizeTarget(2000, 1000, 5_000_000, 1000);
    expect(t).toEqual({ width: 1000, height: 500 });
  });
});
