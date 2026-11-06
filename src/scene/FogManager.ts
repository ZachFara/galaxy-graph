import * as THREE from "three";
import type { GalaxySettings } from "../settings";
import type { GLink, GNode } from "../types";
import { resolveId } from "../types";
import { neighbourhoodRadius, nodeRadius, robustSphere } from "../utils/camera";
import { getNodeColor, heatColor } from "../utils/colors";
import { mix, type CanvasTheme } from "../utils/theme";
import { disposeObject3D } from "./dispose";

// Neighbourhood clouds: one soft sprite per hub, sized to the extent of the hub's
// neighbours and tinted with the hub's own colour, so each cluster reads as a place
// with its own weather. Additive on dark grounds (a glow), normal-blended and darkened
// on light grounds (a wash), because additive light is invisible on white.

const TEXTURE_SIZE = 128;
const GAUSSIAN_SIGMA = 0.36;
const MAX_CLOUD_FRACTION = 0.35;
const LIGHT_OPACITY_FACTOR = 0.75;
const LIGHT_INK_MIX = 0.2;
const UNFOCUSED_CLOUD_FACTOR = 0.4;
// A cloud dissolves as the camera comes within a few cloud radii: once you are inside the
// weather it stops tinting everything.
const DISSOLVE_NEAR = 1.0;
const DISSOLVE_FAR = 2.5;
const NODE_REL_SIZE = 5;

interface Positioned extends GNode {
  x: number;
  y: number;
  z: number;
}

const isPositioned = (n: GNode): n is Positioned => n.x != null && n.y != null && n.z != null;

export class FogManager {
  private group: THREE.Group | null = null;
  private texture: THREE.CanvasTexture | null = null;
  readonly fogNodeMap = new Map<string, THREE.Sprite>();
  private baseOpacity = 0;
  private focusedHubId: string | null = null;
  private cameraPosition = new THREE.Vector3(0, 0, Number.POSITIVE_INFINITY);

  constructor(private scene: THREE.Scene) {}

  private createTexture(): THREE.CanvasTexture {
    const canvas = activeDocument.createElement("canvas");
    canvas.width = canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const image = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
      const half = TEXTURE_SIZE / 2;
      const sigma2 = GAUSSIAN_SIGMA * GAUSSIAN_SIGMA;
      for (let y = 0; y < TEXTURE_SIZE; y++) {
        for (let x = 0; x < TEXTURE_SIZE; x++) {
          const dx = (x + 0.5 - half) / half;
          const dy = (y + 0.5 - half) / half;
          const r2 = dx * dx + dy * dy;
          const alpha = r2 >= 1 ? 0 : Math.exp(-r2 / sigma2);
          const i = (y * TEXTURE_SIZE + x) * 4;
          image.data[i] = 255;
          image.data[i + 1] = 255;
          image.data[i + 2] = 255;
          image.data[i + 3] = Math.round(alpha * 255);
        }
      }
      ctx.putImageData(image, 0, 0);
    }
    return new THREE.CanvasTexture(canvas);
  }

  rebuildFog(nodes: GNode[], links: GLink[], s: GalaxySettings, theme: CanvasTheme) {
    this.clear();
    if (!s.fogEnabled) return;

    const positioned = nodes.filter(isPositioned);
    const hubs = positioned.filter((n) => n.degree >= s.indexDegreeThreshold);
    if (hubs.length === 0) return;
    this.texture ??= this.createTexture();

    const graphSphere = robustSphere(positioned);
    const radiusCap =
      graphSphere && graphSphere.radius > 0
        ? graphSphere.radius * MAX_CLOUD_FRACTION
        : Number.POSITIVE_INFINITY;

    const byId = new Map(positioned.map((n) => [n.id, n]));
    const distances = new Map<string, number[]>(hubs.map((h) => [h.id, []]));
    const record = (hubId: string, otherId: string) => {
      const list = distances.get(hubId);
      const hub = byId.get(hubId);
      const other = byId.get(otherId);
      if (!list || !hub || !other) return;
      list.push(Math.hypot(hub.x - other.x, hub.y - other.y, hub.z - other.z));
    };
    for (const link of links) {
      const a = resolveId(link.source);
      const b = resolveId(link.target);
      record(a, b);
      record(b, a);
    }

    const maxDeg = Math.max(...hubs.map((n) => n.degree));
    const minDeg = s.indexDegreeThreshold;
    const opacity = s.fogMaxOpacity * (theme.isDark ? 1 : LIGHT_OPACITY_FACTOR);
    this.baseOpacity = opacity;
    const blending = theme.isDark ? THREE.AdditiveBlending : THREE.NormalBlending;

    this.group = new THREE.Group();
    this.group.name = "galaxy-clouds";

    for (const hub of hubs) {
      const base =
        s.fogMode === "heat" ? heatColor(hub.degree, minDeg, maxDeg) : getNodeColor(hub, s, theme.isDark);
      const color = theme.isDark ? base : mix(base, theme.ink, LIGHT_INK_MIX);
      const radius = Math.min(
        radiusCap,
        neighbourhoodRadius(distances.get(hub.id) ?? [], nodeRadius(hub.val, NODE_REL_SIZE)),
      );

      const material = new THREE.SpriteMaterial({
        map: this.texture,
        color: new THREE.Color(color),
        transparent: true,
        opacity,
        depthWrite: false,
        blending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(radius * 2);
      sprite.position.set(hub.x, hub.y, hub.z);
      sprite.renderOrder = -1;
      this.group.add(sprite);
      this.fogNodeMap.set(hub.id, sprite);
    }

    this.scene.add(this.group);
    this.applyFocus();
  }

  /** While a note is selected, every cloud but the selected hub's own recedes. */
  setFocus(hubId: string | null) {
    this.focusedHubId = hubId;
    this.applyFocus();
  }

  /** Called every frame: clouds near the camera dissolve. */
  updateCamera(position: THREE.Vector3) {
    this.cameraPosition.copy(position);
    this.applyFocus();
  }

  private applyFocus() {
    for (const [id, sprite] of this.fogNodeMap) {
      const recede = this.focusedHubId !== null && id !== this.focusedHubId;
      const radius = sprite.scale.x / 2;
      const distance = sprite.position.distanceTo(this.cameraPosition) / Math.max(radius, 1);
      const t = Math.max(0, Math.min(1, (distance - DISSOLVE_NEAR) / (DISSOLVE_FAR - DISSOLVE_NEAR)));
      const proximity = t * t * (3 - 2 * t);
      sprite.material.opacity = this.baseOpacity * (recede ? UNFOCUSED_CLOUD_FACTOR : 1) * proximity;
    }
  }

  syncFogPositions(nodes: GNode[]) {
    if (this.fogNodeMap.size === 0) return;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const [nodeId, sprite] of this.fogNodeMap) {
      const node = nodeById.get(nodeId);
      if (node?.x != null && node.y != null && node.z != null) {
        sprite.position.set(node.x, node.y, node.z);
      }
    }
  }

  private clear() {
    this.fogNodeMap.clear();
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse(disposeObject3D);
      this.group = null;
    }
  }

  dispose() {
    this.clear();
    this.texture?.dispose();
    this.texture = null;
  }
}
