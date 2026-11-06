import { describe, expect, it } from "vitest";
import {
  boundingSphere,
  elevatedDirection,
  fitDistance,
  minDistanceForApparentFraction,
  neighbourhoodRadius,
  nodeRadius,
  percentile,
  robustSphere,
} from "../../src/utils/camera";

describe("boundingSphere", () => {
  it("returns null for no points", () => {
    expect(boundingSphere([])).toBeNull();
  });
  it("centres on the bounding box and reaches the farthest point", () => {
    const s = boundingSphere([
      { x: -10, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 0, y: 4, z: 0 },
    ]);
    expect(s?.center).toEqual({ x: 0, y: 2, z: 0 });
    expect(s?.radius).toBeCloseTo(Math.hypot(10, 2), 5);
  });
});

describe("robustSphere", () => {
  it("ignores a far outlier when sizing the galaxy", () => {
    const ring = Array.from({ length: 20 }, (_, i) => ({ x: Math.cos(i) * 100, y: Math.sin(i) * 100, z: 0 }));
    const withOutlier = [...ring, { x: 5000, y: 0, z: 0 }];
    const s = robustSphere(withOutlier);
    expect(s).not.toBeNull();
    expect(s?.radius ?? 0).toBeLessThan(400);
    expect(boundingSphere(withOutlier)?.radius ?? 0).toBeGreaterThan(2000);
  });
  it("returns null for no points", () => {
    expect(robustSphere([])).toBeNull();
  });
});

describe("camera distances", () => {
  it("fits a sphere to the view: radius / sin(half angle)", () => {
    expect(fitDistance(100, 90, 1, 1)).toBeCloseTo(100 / Math.sin(Math.PI / 4), 5);
  });
  it("uses the narrower horizontal angle on tall viewports", () => {
    expect(fitDistance(100, 90, 0.5, 1)).toBeGreaterThan(fitDistance(100, 90, 1, 1));
  });
  it("moves further away for a smaller fill", () => {
    expect(fitDistance(100, 75, 1.5, 0.5)).toBeGreaterThan(fitDistance(100, 75, 1.5, 0.8));
  });
  it("keeps an object under a fraction of the view height", () => {
    expect(minDistanceForApparentFraction(10, 90, 0.5)).toBeCloseTo(10 / Math.tan(Math.PI / 8), 5);
  });
  it("matches the graph library's sphere radius", () => {
    expect(nodeRadius(8, 5)).toBeCloseTo(10, 5);
    expect(nodeRadius(-1, 5)).toBe(0);
  });
  it("returns a unit direction raised by the elevation", () => {
    const d = elevatedDirection(30);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 5);
    expect(d.y).toBeCloseTo(0.5, 5);
  });
});

describe("neighbourhood radius", () => {
  it("interpolates percentiles", () => {
    expect(percentile([3, 1, 2], 0.5)).toBe(2);
    expect(percentile([0, 10], 0.25)).toBe(2.5);
    expect(percentile([], 0.5)).toBe(0);
  });
  it("uses the 75th percentile of neighbour distances with padding", () => {
    expect(neighbourhoodRadius([100, 100, 100, 100], 5)).toBeCloseTo(135, 5);
  });
  it("never shrinks below a few hub radii, and gives lone hubs a small cloud", () => {
    expect(neighbourhoodRadius([1, 1, 1], 10)).toBe(30);
    expect(neighbourhoodRadius([], 10)).toBe(40);
  });
});
