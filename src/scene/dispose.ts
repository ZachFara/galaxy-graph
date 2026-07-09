import type * as THREE from "three";

// Frees an object's geometry and material(s). Textures are deliberately left
// alone: fog sprites share a single CanvasTexture whose lifetime is managed by
// FogManager, so disposing maps here would kill it for the surviving sprites.
export function disposeObject3D(obj: THREE.Object3D): void {
  const o = obj as THREE.Object3D & {
    geometry?: { dispose(): void };
    material?: THREE.Material | THREE.Material[];
  };
  o.geometry?.dispose();
  if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
  else o.material?.dispose();
}

// Variant for objects whose materials own their textures (per-object maps).
export function disposeObject3DWithMaps(obj: THREE.Object3D): void {
  const o = obj as THREE.Object3D & {
    geometry?: { dispose(): void };
    material?: THREE.Material | THREE.Material[];
  };
  o.geometry?.dispose();
  const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
  for (const m of mats) {
    (m as THREE.Material & { map?: THREE.Texture | null }).map?.dispose();
    m.dispose();
  }
}
