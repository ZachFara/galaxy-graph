// The canvas takes its colours from the active Obsidian theme instead of shipping its own.
// Everything the scene draws (ground, links, dimmed nodes, label pills, cloud tints) is
// derived from the three values in CanvasTheme, so a theme or snippet change re-skins
// the galaxy without any plugin-specific colour settings.

export interface CanvasTheme {
  /** Canvas background: Obsidian's --background-primary, as #rrggbb. */
  ground: string;
  /** Primary text colour: Obsidian's --text-normal, as #rrggbb. */
  ink: string;
  isDark: boolean;
}

export type Rgb = [number, number, number];

const DARK_FALLBACK: CanvasTheme = { ground: "#1e1e1e", ink: "#dcddde", isDark: true };
const LIGHT_FALLBACK: CanvasTheme = { ground: "#ffffff", ink: "#222222", isDark: false };

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = Math.max(0, Math.min(1, s));
  const light = Math.max(0, Math.min(1, l));
  if (sat === 0) return [clampByte(light * 255), clampByte(light * 255), clampByte(light * 255)];
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const channel = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    clampByte(channel(hue + 1 / 3) * 255),
    clampByte(channel(hue) * 255),
    clampByte(channel(hue - 1 / 3) * 255),
  ];
}

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla(). Returns null for anything else. */
export function parseCssColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/.exec(s);
  if (rgb) return [clampByte(Number(rgb[1])), clampByte(Number(rgb[2])), clampByte(Number(rgb[3]))];
  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/.exec(s);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  return null;
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

/** The colour as an rgba() string with the given alpha. Unparseable input is returned unchanged. */
export function rgba(color: string, alpha: number): string {
  const rgb = parseCssColor(color);
  if (!rgb) return color;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

/** Linear blend from `a` (t = 0) to `b` (t = 1), as #rrggbb. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseCssColor(a);
  const cb = parseCssColor(b);
  if (!ca || !cb) return a;
  const k = Math.max(0, Math.min(1, t));
  return toHex([ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k]);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Builds the canvas theme from CSS custom properties. `getVar` receives a property name
 * such as "--background-primary" and returns its computed value (or ""). `fallbackDark`
 * decides the fallback set when the ground colour cannot be parsed.
 */
export function readCanvasTheme(getVar: (name: string) => string, fallbackDark: boolean): CanvasTheme {
  const ground = parseCssColor(getVar("--background-primary"));
  const ink = parseCssColor(getVar("--text-normal"));
  const isDark = ground ? relativeLuminance(ground) < 0.4 : fallbackDark;
  const fallback = isDark ? DARK_FALLBACK : LIGHT_FALLBACK;
  return {
    ground: ground ? toHex(ground) : fallback.ground,
    ink: ink ? toHex(ink) : fallback.ink,
    isDark,
  };
}
