import * as THREE from "three";
import type { GNode } from "../types";

const HUD_COLOR = 0x5577bb;

export function buildHUDSphere(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.name = "galaxy-hud";
  const C = HUD_COLOR;

  const addWireframe = (radius: number, wSeg: number, hSeg: number, opacity: number) => {
    const geo = new THREE.SphereGeometry(radius, wSeg, hSeg);
    const wire = new THREE.WireframeGeometry(geo);
    geo.dispose();
    group.add(new THREE.LineSegments(wire,
      new THREE.LineBasicMaterial({ color: C, transparent: true, opacity, depthWrite: false })
    ));
  };

  addWireframe(190, 12, 8, 0.08);
  addWireframe(420, 18, 10, 0.045);
  addWireframe(740, 14, 8, 0.025);

  const addRing = (radius: number, opacity: number, rx = 0, ry = 0, rz = 0) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: C, transparent: true, opacity, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.rotation.set(rx, ry, rz);
    group.add(line);
  };

  const P = Math.PI;
  addRing(420, 0.16);
  addRing(740, 0.10);
  addRing(420, 0.09, P * 0.18);
  addRing(420, 0.09, -P * 0.18);
  addRing(420, 0.08, P * 0.37);
  addRing(420, 0.08, -P * 0.37);
  addRing(420, 0.07, P / 2);
  addRing(420, 0.07, 0, 0, P * 0.28);

  const TICKS = 36;
  for (let i = 0; i < TICKS; i++) {
    const angle = (i / TICKS) * P * 2;
    const isLong = i % 9 === 0;
    const isMed = i % 3 === 0;
    const len = isLong ? 18 : isMed ? 10 : 5;
    const op = isLong ? 0.22 : isMed ? 0.14 : 0.07;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const r0 = 420 - len / 2, r1 = 420 + len / 2;
    const tGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cos * r0, 0, sin * r0),
      new THREE.Vector3(cos * r1, 0, sin * r1),
    ]);
    group.add(new THREE.Line(tGeo,
      new THREE.LineBasicMaterial({ color: C, transparent: true, opacity: op, depthWrite: false })
    ));
  }

  scene.add(group);
  return group;
}

export function buildGridSphere(scene: THREE.Scene, nodes: GNode[], existingGroup: THREE.Group | null): THREE.Group | null {
  if (existingGroup) {
    scene.remove(existingGroup);
    existingGroup.traverse((obj: any) => {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
      else obj.material?.dispose();
    });
  }

  const GC = 0x8ab4f8;
  const positions = nodes
    .filter((n) => n.x != null && n.y != null && n.z != null)
    .map((n) => new THREE.Vector3(n.x!, n.y!, n.z!));

  if (positions.length === 0) return null;

  const group = new THREE.Group();
  group.name = "galaxy-grid";

  const bbox = new THREE.Box3();
  positions.forEach((p) => bbox.expandByPoint(p));
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const bRadius = positions.reduce((max, p) => Math.max(max, p.distanceTo(center)), 0);
  const sphereR = bRadius * 1.1;

  const sphereGeo = new THREE.SphereGeometry(sphereR, 32, 32);
  const sphereWire = new THREE.WireframeGeometry(sphereGeo);
  sphereGeo.dispose();
  group.add(new THREE.LineSegments(sphereWire,
    new THREE.LineBasicMaterial({ color: GC, transparent: true, opacity: 0.06, depthWrite: false })
  ));

  for (const pct of [0.25, 0.50, 0.75, 1.10]) {
    const r = bRadius * pct;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(center.x + Math.cos(a) * r, center.y, center.z + Math.sin(a) * r));
    }
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: GC, transparent: true, opacity: 0.10, depthWrite: false })
    ));

    const TICKS = 32;
    for (let i = 0; i < TICKS; i++) {
      const a = (i / TICKS) * Math.PI * 2;
      const cos = Math.cos(a), sin = Math.sin(a);
      const len = 4;
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(center.x + cos * (r - len), center.y, center.z + sin * (r - len)),
          new THREE.Vector3(center.x + cos * (r + len), center.y, center.z + sin * (r + len)),
        ]),
        new THREE.LineBasicMaterial({ color: GC, transparent: true, opacity: 0.20, depthWrite: false })
      ));
    }
  }

  const gridSize = bRadius * 2.2;
  const grid = new THREE.GridHelper(gridSize, 20, 0x1a2a3a, 0x1a2a3a);
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
  mats.forEach((m: any) => { m.opacity = 0.15; m.transparent = true; });
  grid.position.set(center.x, bbox.min.y, center.z);
  group.add(grid);

  scene.add(group);
  return group;
}

export function updateGridSphereOpacities(
  group: THREE.Group | null,
  sphereOpacity: number,
  ringsOpacity: number,
  groundGridOpacity: number
) {
  if (!group) return;
  group.traverse((obj) => {
    if (obj instanceof THREE.GridHelper) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        (m as THREE.Material & { opacity: number; transparent: boolean }).opacity = groundGridOpacity;
        (m as THREE.Material & { opacity: number; transparent: boolean }).transparent = true;
      });
    } else if (obj instanceof THREE.LineSegments) {
      const mat = obj.material as THREE.LineBasicMaterial;
      mat.opacity = sphereOpacity;
      mat.transparent = true;
    } else if (obj instanceof THREE.Line) {
      const mat = obj.material as THREE.LineBasicMaterial;
      const isTick = obj.geometry instanceof THREE.BufferGeometry && obj.geometry.getAttribute("position")?.count === 2;
      mat.opacity = isTick ? Math.min(0.3, ringsOpacity + 0.1) : ringsOpacity;
      mat.transparent = true;
    }
  });
}

export function buildStarfield(scene: THREE.Scene, boundingRadius: number, starCount = 2000, starSize = 1.2, starBrightness = 0.8): THREE.Points {
  const STAR_COUNT = starCount;
  const starRadius = Math.max(1500, boundingRadius * 3);

  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = starRadius * (0.9 + Math.random() * 0.1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const roll = Math.random();
    if (roll < 0.8) {
      colors[i * 3] = 1; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 1;
    } else if (roll < 0.9) {
      colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 1;
    } else {
      colors[i * 3] = 1; colors[i * 3 + 1] = 0.96; colors[i * 3 + 2] = 0.8;
    }

    sizes[i] = 0.3 + Math.random() * 0.9;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: starSize,
    vertexColors: true,
    transparent: true,
    opacity: starBrightness,
    sizeAttenuation: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  points.name = "galaxy-stars";
  scene.add(points);
  return points;
}

export function disposeGroup(scene: THREE.Scene | null, group: THREE.Group | null) {
  if (!scene || !group) return;
  scene.remove(group);
  group.traverse((obj: any) => {
    obj.geometry?.dispose();
    if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
    else obj.material?.dispose();
  });
}
