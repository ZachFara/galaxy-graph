import * as THREE from "three";

// Two renderings of a note, chosen by how close the camera is (see GalaxyView.followCamera):
// far out, a shaded sphere like the library's own, which keeps the galaxy's bright dust;
// close in, a flat soft-edged disc that faces the camera, which reads cleanly at size.
// No glow either way: the only atmosphere on the canvas is the neighbourhood clouds.
// Objects are tracked by note id so size and colour can change in place.

export type NodeStyle = "sphere" | "disc";

const TEXTURE_SIZE = 64;
const DISC_FRACTION = 0.92;
const DISC_EDGE = 0.08;
const SPRITE_SCALE = 2 / DISC_FRACTION;
const SPHERE_SEGMENTS = 16;
const SPHERE_OPACITY = 0.92;

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const discShape = (r: number) => 1 - smooth(DISC_FRACTION - DISC_EDGE, DISC_FRACTION, r);

function buildDiscTexture(): THREE.CanvasTexture {
  const canvas = activeDocument.createElement("canvas");
  canvas.width = canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
    const half = TEXTURE_SIZE / 2;
    for (let y = 0; y < TEXTURE_SIZE; y++) {
      for (let x = 0; x < TEXTURE_SIZE; x++) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        const r = Math.hypot(dx, dy);
        const alpha = r >= 1 ? 0 : discShape(r);
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

type NodeObject = THREE.Sprite | THREE.Mesh<THREE.SphereGeometry, THREE.MeshLambertMaterial>;

export class NodeSpriteFactory {
  private texture: THREE.CanvasTexture | null = null;
  private sphereGeometry: THREE.SphereGeometry | null = null;
  private byId = new Map<string, NodeObject>();

  /** Forget tracked objects; call before the graph rebuilds every note object. */
  reset() {
    this.byId.clear();
  }

  make(id: string, color: string, radius: number, opacity: number, style: NodeStyle): THREE.Object3D {
    const object = style === "disc" ? this.makeDisc(color, opacity) : this.makeSphere(color, opacity);
    this.byId.set(id, object);
    this.scale(object, radius);
    return object;
  }

  private makeDisc(color: string, opacity: number): THREE.Sprite {
    this.texture ??= buildDiscTexture();
    return new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.texture,
        color: new THREE.Color(color),
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
  }

  private makeSphere(color: string, opacity: number) {
    this.sphereGeometry ??= new THREE.SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS / 2);
    return new THREE.Mesh(
      this.sphereGeometry,
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: SPHERE_OPACITY * opacity,
      }),
    );
  }

  private scale(object: NodeObject, radius: number) {
    object.scale.setScalar(object instanceof THREE.Sprite ? radius * SPRITE_SCALE : radius);
  }

  /** Resize a tracked note in place (used by the spawn animation). */
  scaleTo(id: string, radius: number) {
    const object = this.byId.get(id);
    if (object) this.scale(object, radius);
  }

  /** Recolour a tracked note in place (used when the zoom level changes the tone). */
  tint(id: string, color: string) {
    this.byId.get(id)?.material.color.set(color);
  }

  dispose() {
    this.byId.clear();
    this.texture?.dispose();
    this.texture = null;
    this.sphereGeometry?.dispose();
    this.sphereGeometry = null;
  }
}
