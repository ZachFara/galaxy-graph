import * as THREE from "three";
import type { GalaxySettings } from "../settings";
import type { GNode } from "../types";
import { DEFAULT_COLOR, FOLDER_PALETTE, heatColor } from "../utils/colors";

export class FogManager {
  private fogGroup: THREE.Group | null = null;
  private labelGroup: THREE.Group | null = null;
  private fogTexture: THREE.CanvasTexture | null = null;
  readonly fogNodeMap: Map<string, THREE.Sprite> = new Map();

  constructor(private scene: THREE.Scene) {}

  private createFogTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  rebuildFog(nodes: GNode[], s: GalaxySettings) {
    this.fogNodeMap.clear();
    if (this.fogGroup) {
      this.scene.remove(this.fogGroup);
      this.fogGroup.traverse((obj: any) => {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
        else obj.material?.dispose();
      });
      this.fogGroup = null;
    }

    if (!s.fogEnabled) return;
    if (!this.fogTexture) this.fogTexture = this.createFogTexture();

    const hubNodes = nodes.filter((n) => n.degree >= s.indexDegreeThreshold && n.x != null && n.y != null && n.z != null);
    if (hubNodes.length === 0) return;

    this.fogGroup = new THREE.Group();
    this.fogGroup.name = "galaxy-fog";

    const maxDeg = Math.max(...hubNodes.map((n) => n.degree));
    const minDeg = s.indexDegreeThreshold;

    for (const node of hubNodes) {
      const color = s.fogMode === "heat"
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
      sprite.position.set(node.x!, node.y!, node.z!);
      this.fogGroup.add(sprite);
      this.fogNodeMap.set(node.id, sprite);
    }

    this.scene.add(this.fogGroup);
  }

  syncFogPositions(nodes: GNode[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const [nodeId, sprite] of this.fogNodeMap) {
      const node = nodeById.get(nodeId);
      if (node && node.x != null && node.y != null && node.z != null) {
        sprite.position.set(node.x, node.y, node.z);
      }
    }
  }

  rebuildLabels(_nodes: GNode[], _topLabelCount: number) {
    if (!this.labelGroup) return;
    this.scene.remove(this.labelGroup);
    this.labelGroup.traverse((obj: any) => {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m: any) => { m.map?.dispose?.(); m.dispose?.(); });
      } else {
        obj.material?.map?.dispose?.();
        obj.material?.dispose?.();
      }
    });
    this.labelGroup = null;
  }

  updateLabelPosition(_node: GNode) {}

  dispose() {
    this.fogNodeMap.clear();
    if (this.fogGroup) {
      this.scene.remove(this.fogGroup);
      this.fogGroup.traverse((obj: any) => {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
        else obj.material?.dispose();
      });
      this.fogGroup = null;
    }
    if (this.labelGroup) {
      this.scene.remove(this.labelGroup);
      this.labelGroup.traverse((obj: any) => {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: any) => { m.map?.dispose?.(); m.dispose?.(); });
        } else {
          obj.material?.map?.dispose?.();
          obj.material?.dispose?.();
        }
      });
      this.labelGroup = null;
    }
    if (this.fogTexture) {
      this.fogTexture.dispose();
      this.fogTexture = null;
    }
  }
}
