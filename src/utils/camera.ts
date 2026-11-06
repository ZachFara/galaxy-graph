// Pure geometry for framing the camera and sizing neighbourhood clouds.
// No three.js here so it can be unit-tested; the view converts to/from THREE types.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Sphere {
  center: Vec3;
  radius: number;
}

/** Bounding-box centre and the farthest point from it. Null for no points. */
export function boundingSphere(points: Vec3[]): Sphere | null {
  if (points.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  let radius = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z);
    if (d > radius) radius = d;
  }
  return { center, radius };
}

const ROBUST_PERCENTILE = 0.9;
const ROBUST_PADDING = 1.08;

/**
 * Centroid of the points and the distance that encloses 90% of them, padded slightly.
 * Unlike boundingSphere this ignores the few orphans the simulation flings to the
 * periphery, so framing and fog follow the body of the galaxy.
 */
export function robustSphere(points: Vec3[]): Sphere | null {
  if (points.length === 0) return null;
  let sx = 0,
    sy = 0,
    sz = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
  }
  const center = { x: sx / points.length, y: sy / points.length, z: sz / points.length };
  const distances = points.map((p) => Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z));
  return { center, radius: percentile(distances, ROBUST_PERCENTILE) * ROBUST_PADDING };
}

/** 3d-force-graph draws a node as a sphere of radius cbrt(val) × nodeRelSize. */
export function nodeRadius(val: number, nodeRelSize: number): number {
  return Math.cbrt(Math.max(0, val)) * nodeRelSize;
}

/**
 * Camera distance at which a sphere of `radius` spans `fill` of the viewport's smaller
 * dimension. `fovDeg` is the vertical field of view; `aspect` is width / height.
 */
export function fitDistance(radius: number, fovDeg: number, aspect: number, fill: number): number {
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 0.01));
  const half = Math.min(vHalf, hHalf) * Math.max(0.05, Math.min(1, fill));
  return Math.max(0, radius) / Math.sin(half);
}

/** Minimum camera distance so that an object of `objectRadius` is at most `maxFraction` of the viewport height. */
export function minDistanceForApparentFraction(
  objectRadius: number,
  fovDeg: number,
  maxFraction: number,
): number {
  const half = ((fovDeg * Math.PI) / 360) * Math.max(0.01, Math.min(1, maxFraction));
  return Math.max(0, objectRadius) / Math.tan(half);
}

/** Unit vector pointing from a target toward a camera raised `elevationDeg` above its horizon. */
export function elevatedDirection(elevationDeg: number): Vec3 {
  const e = (elevationDeg * Math.PI) / 180;
  return { x: 0, y: Math.sin(e), z: Math.cos(e) };
}

/** Linear-interpolated percentile (0–1) of an unsorted list. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.max(0, Math.min(1, p)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const t = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * t;
}

const CLOUD_PERCENTILE = 0.75;
const CLOUD_PADDING = 1.35;
const CLOUD_MIN_NODE_RADII = 3;
const CLOUD_LONE_NODE_RADII = 4;

/**
 * Radius of a hub's cloud: the extent of its neighbourhood (75th percentile of neighbour
 * distances with padding), never smaller than a few node radii.
 */
export function neighbourhoodRadius(neighbourDistances: number[], hubRadius: number): number {
  if (neighbourDistances.length === 0) return hubRadius * CLOUD_LONE_NODE_RADII;
  return Math.max(
    hubRadius * CLOUD_MIN_NODE_RADII,
    percentile(neighbourDistances, CLOUD_PERCENTILE) * CLOUD_PADDING,
  );
}
