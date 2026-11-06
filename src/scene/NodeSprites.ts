import * as THREE from "three";

// Notes drawn as flat, soft-edged discs that always face the camera, instead of shaded
// spheres. No glow: the only atmosphere on the canvas is the neighbourhood clouds. One
// shared texture; one material per note (colour + alpha). Sprites are tracked by note id so
// a size animation can scale them in place instead of rebuilding every note.

const TEXTURE_SIZE = 64;
const DISC_FRACTION = 0.92;
const DISC_EDGE = 0.08;
const SPRITE_SCALE = 2 / DISC_FRACTION;

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const shape = (r: number) => 1 - smooth(DISC_FRACTION - DISC_EDGE, DISC_FRACTION, r);

function buildTexture(): THREE.CanvasTexture {
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
        const alpha = r >= 1 ? 0 : shape(r);
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

export class NodeSpriteFactory {
  private texture: THREE.CanvasTexture | null = null;
  private byId = new Map<string, THREE.Sprite>();

  /** Forget tracked sprites; call before the graph rebuilds every note object. */
  reset() {
    this.byId.clear();
  }

  make(id: string, color: string, radius: number, opacity: number): THREE.Sprite {
    this.texture ??= buildTexture();
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(radius * SPRITE_SCALE);
    this.byId.set(id, sprite);
    return sprite;
  }

  /** Resize a tracked sprite in place (used by the spawn animation). */
  scaleTo(id: string, radius: number) {
    this.byId.get(id)?.scale.setScalar(radius * SPRITE_SCALE);
  }

  dispose() {
    this.byId.clear();
    this.texture?.dispose();
    this.texture = null;
  }
}
