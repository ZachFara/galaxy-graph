import type { GalaxySettings } from "../settings";
import type { GNode } from "../types";

export const FOLDER_PALETTE: Record<string, string> = {
  "1": "#4fc3f7",
  "2": "#81c784",
  "3": "#ffb74d",
  "4": "#ce93d8",
  "5": "#f48fb1",
  "6": "#90a4ae",
  root: "#fff176",
};
export const DEFAULT_COLOR = "#4fc3f7";
export const DIM_NODE = "rgba(70,70,70,0.10)";

export function heatColor(degree: number, minDeg: number, maxDeg: number): string {
  const t = Math.max(0, Math.min(1, (degree - minDeg) / Math.max(1, maxDeg - minDeg)));
  const r = Math.round(79 + t * (255 - 79));
  const g = Math.round(195 + t * (87 - 195));
  const b = Math.round(247 + t * (34 - 247));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const HEAT_STOPS: Array<[number, number, number, number]> = [
  [0.00,  18,  18,  48],   // cold: near-black with blue tint
  [0.25,  28,  60, 140],   // cool blue
  [0.50, 160,  72,   0],   // deep amber
  [0.75, 255, 110,  20],   // orange
  [1.00, 255, 235, 170],   // bright warm white-orange
];

export function activityHeatColor(heat: number): string {
  const h = Math.max(0, Math.min(1, heat));
  let lo = HEAT_STOPS[0], hi = HEAT_STOPS[HEAT_STOPS.length - 1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (h >= HEAT_STOPS[i][0] && h <= HEAT_STOPS[i + 1][0]) {
      lo = HEAT_STOPS[i];
      hi = HEAT_STOPS[i + 1];
      break;
    }
  }
  const t = lo[0] === hi[0] ? 0 : (h - lo[0]) / (hi[0] - lo[0]);
  const r = Math.round(lo[1] + (hi[1] - lo[1]) * t);
  const g = Math.round(lo[2] + (hi[2] - lo[2]) * t);
  const b = Math.round(lo[3] + (hi[3] - lo[3]) * t);
  return `rgb(${r},${g},${b})`;
}

export function getNodeColor(n: GNode, s: GalaxySettings): string {
  switch (s.colorBy) {
    case "folder":
      return FOLDER_PALETTE[n.folder] ?? DEFAULT_COLOR;
    case "index":
      return n.degree >= s.indexDegreeThreshold ? "#ff9800" : DEFAULT_COLOR;
    case "tag": {
      for (const tag of (n.tags ?? [])) {
        const c = s.tagColorMap[tag];
        if (c) return c;
      }
      return DEFAULT_COLOR;
    }
    case "activity":
      return activityHeatColor(n.activityHeat ?? 0);
    default:
      return FOLDER_PALETTE[n.folder] ?? DEFAULT_COLOR;
  }
}
