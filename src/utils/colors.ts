import type { GalaxySettings } from "../settings";
import type { GNode } from "../types";
import { rgba } from "./theme";

// Two folder palettes: lighter tints read on dark grounds, deeper tones on light grounds.
const FOLDER_PALETTE_DARK: Record<string, string> = {
  "1": "#4fc3f7",
  "2": "#81c784",
  "3": "#ffb74d",
  "4": "#ce93d8",
  "5": "#f48fb1",
  "6": "#90a4ae",
  root: "#fff176",
};
const FOLDER_PALETTE_LIGHT: Record<string, string> = {
  "1": "#0277bd",
  "2": "#2e7d32",
  "3": "#ef6c00",
  "4": "#6a1b9a",
  "5": "#ad1457",
  "6": "#455a64",
  root: "#f9a825",
};
const INDEX_ACCENT = { dark: "#ff9800", light: "#e65100" };
const DIM_NODE_ALPHA = 0.12;

function folderPalette(isDark: boolean): Record<string, string> {
  return isDark ? FOLDER_PALETTE_DARK : FOLDER_PALETTE_LIGHT;
}

function defaultNodeColor(isDark: boolean): string {
  return folderPalette(isDark)["1"];
}

/** Colour for everything outside the current selection. */
export function dimNodeColor(ink: string): string {
  return rgba(ink, DIM_NODE_ALPHA);
}

/** Cool-to-warm ramp by degree, used for the cloud heat mode. */
export function heatColor(degree: number, minDeg: number, maxDeg: number): string {
  const t = Math.max(0, Math.min(1, (degree - minDeg) / Math.max(1, maxDeg - minDeg)));
  const r = Math.round(79 + t * (255 - 79));
  const g = Math.round(195 + t * (87 - 195));
  const b = Math.round(247 + t * (34 - 247));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

type HeatStop = [number, number, number, number];
const HEAT_STOPS_DARK: HeatStop[] = [
  [0.0, 18, 18, 48],
  [0.25, 28, 60, 140],
  [0.5, 160, 72, 0],
  [0.75, 255, 110, 20],
  [1.0, 255, 235, 170],
];
const HEAT_STOPS_LIGHT: HeatStop[] = [
  [0.0, 207, 216, 220],
  [0.25, 144, 164, 174],
  [0.5, 255, 167, 38],
  [0.75, 230, 81, 0],
  [1.0, 183, 28, 28],
];

function activityHeatColor(heat: number, isDark: boolean): string {
  const stops = isDark ? HEAT_STOPS_DARK : HEAT_STOPS_LIGHT;
  const h = Math.max(0, Math.min(1, heat));
  let lo = stops[0],
    hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (h >= stops[i][0] && h <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const t = lo[0] === hi[0] ? 0 : (h - lo[0]) / (hi[0] - lo[0]);
  const r = Math.round(lo[1] + (hi[1] - lo[1]) * t);
  const g = Math.round(lo[2] + (hi[2] - lo[2]) * t);
  const b = Math.round(lo[3] + (hi[3] - lo[3]) * t);
  return `rgb(${r},${g},${b})`;
}

export function getNodeColor(n: GNode, s: GalaxySettings, isDark: boolean): string {
  const palette = folderPalette(isDark);
  const fallback = defaultNodeColor(isDark);
  switch (s.colorBy) {
    case "folder":
      return palette[n.folder] ?? fallback;
    case "index":
      return n.degree >= s.indexDegreeThreshold
        ? isDark
          ? INDEX_ACCENT.dark
          : INDEX_ACCENT.light
        : fallback;
    case "tag": {
      for (const tag of n.tags ?? []) {
        const c = s.tagColorMap[tag];
        if (c) return c;
      }
      return fallback;
    }
    case "activity":
      return activityHeatColor(n.activityHeat ?? 0, isDark);
    default:
      return palette[n.folder] ?? fallback;
  }
}
