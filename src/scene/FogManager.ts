import * as THREE from "three";
import type { GalaxySettings } from "../settings";
import type { GNode } from "../types";
import { DEFAULT_COLOR, FOLDER_PALETTE, heatColor } from "../utils/colors";
import { disposeObject3D, disposeObject3DWithMaps } from "./dispose";

export class FogManager {
  private fogGroup: THREE.Group | null = null;
  private labelGroup: THREE.Group | null = null;
  private fogTexture: THREE.CanvasTexture | null = null;
  readonly fogNodeMap = new Map<string, THREE.Sprite>();

  constructor(private scene: THREE.Scene) {}

  private createFogTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = activeDocument.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    return new THREE.CanvasTexture(canvas);
  }

  rebuildFog(nodes: GNode[], s: GalaxySettings) {
    this.fogNodeMap.clear();
    if (this.fogGroup) {
      this.scene.remove(this.fogGroup);
      this.fogGroup.traverse(disposeObject3D);
      this.fogGroup = null;
    }

    if (!s.fogEnabled) return;
    this.fogTexture ??= this.createFogTexture();

    const hubNodes = nodes.filter(
      (n) => n.degree >= s.indexDegreeThreshold && n.x != null && n.y != null && n.z != null,
    );
    if (hubNodes.length === 0) return;

    this.fogGroup = new THREE.Group();
    this.fogGroup.name = "galaxy-fog";

    const maxDeg = Math.max(...hubNodes.map((n) => n.degree));
    const minDeg = s.indexDegreeThreshold;

    for (const node of hubNodes) {
      const color =
        s.fogMode === "heat"
          ? heatColor(node.degree, minDeg, maxDeg)
          : (FOLDER_PALETTE[node.folder] ?? DEFAULT_COLOR);

      const nodeRadius = Math.sqrt(node.val) * 5;
      const t = Math.min(1, (node.degree - minDeg) / Math.max(1, maxDeg - minDeg));
      const fogRadius = nodeRadius * (2 + 6 * t);

      const mat = new THREE.SpriteMaterial({
        map: this.fogTexture,
        color: new THREE.Color(color),
        transparent: true,
        opacity: s.fogMaxOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(fogRadius);
      sprite.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
      this.fogGroup.add(sprite);
      this.fogNodeMap.set(node.id, sprite);
    }

    this.scene.add(this.fogGroup);
  }

  syncFogPositions(nodes: GNode[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const [nodeId, sprite] of this.fogNodeMap) {
      const node = nodeById.get(nodeId);
      if (node?.x != null && node.y != null && node.z != null) {
        sprite.position.set(node.x, node.y, node.z);
      }
    }
  }

  rebuildLabels() {
    if (!this.labelGroup) return;
    this.scene.remove(this.labelGroup);
    this.labelGroup.traverse(disposeObject3DWithMaps);
    this.labelGroup = null;
  }

  dispose() {
    this.fogNodeMap.clear();
    if (this.fogGroup) {
      this.scene.remove(this.fogGroup);
      this.fogGroup.traverse(disposeObject3D);
      this.fogGroup = null;
    }
    if (this.labelGroup) {
      this.scene.remove(this.labelGroup);
      this.labelGroup.traverse(disposeObject3DWithMaps);
      this.labelGroup = null;
    }
    if (this.fogTexture) {
      this.fogTexture.dispose();
      this.fogTexture = null;
    }
  }
}
