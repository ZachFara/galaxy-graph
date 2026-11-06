import { describe, expect, it } from "vitest";
import { estimateLabelWidth, placeLabels, rectsOverlap } from "../../src/utils/labels";

const rect = (key: string, x: number, y: number, width = 50, height = 20) => ({ key, x, y, width, height });

describe("label placement", () => {
  it("detects overlap only when rectangles intersect", () => {
    expect(rectsOverlap(rect("a", 0, 0), rect("b", 40, 10))).toBe(true);
    expect(rectsOverlap(rect("a", 0, 0), rect("b", 50, 0))).toBe(false);
    expect(rectsOverlap(rect("a", 0, 0), rect("b", 0, 20))).toBe(false);
  });
  it("keeps earlier candidates and skips later ones that collide", () => {
    const placed = placeLabels([rect("hub", 0, 0), rect("leaf", 10, 5), rect("far", 200, 0)], 10);
    expect(placed.map((p) => p.key)).toEqual(["hub", "far"]);
  });
  it("respects the maximum count", () => {
    const placed = placeLabels([rect("a", 0, 0), rect("b", 100, 0), rect("c", 200, 0)], 2);
    expect(placed).toHaveLength(2);
  });
  it("estimates wider pills for longer names", () => {
    expect(estimateLabelWidth("Long note title")).toBeGreaterThan(estimateLabelWidth("Note"));
  });
});
