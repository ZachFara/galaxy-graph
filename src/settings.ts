export interface GalaxySettings {
  popularityDimension: "ctime" | "mtime" | "frontmatter";
  popularityFrontmatterKey: string;
  rotationSpeed: number;
  colorBy: "folder" | "index" | "tag" | "activity";
  indexDegreeThreshold: number;
  tagColorMap: Record<string, string>;
  activityWindowDays: number;
  activityLeafDateField: "mtime" | "ctime";
  linkOpacityDefault: number;
  linkOpacityHighlight: number;
  linkOpacityDim: number;
  fogEnabled: boolean;
  fogMode: "color" | "heat";
  fogMaxOpacity: number;
  topLabelCount: number;
  labelHideDistance: number;
  noteTemplate: string;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  centerGravity: number;
}

export const DEFAULT_SETTINGS: GalaxySettings = {
  popularityDimension: "ctime",
  popularityFrontmatterKey: "updated",
  rotationSpeed: 0.001,
  colorBy: "folder",
  indexDegreeThreshold: 10,
  tagColorMap: {},
  activityWindowDays: 30,
  activityLeafDateField: "mtime",
  linkOpacityDefault: 0.25,
  linkOpacityHighlight: 0.9,
  linkOpacityDim: 0.02,
  fogEnabled: true,
  fogMode: "color",
  fogMaxOpacity: 0.28,
  topLabelCount: 10,
  labelHideDistance: 3000,
  noteTemplate: `---
date: {{date}}
links:
  - "[[{{index}}]]"
tags:
  - 
---

# {{title}}

`,
  repelForce: -30,
  linkForce: 0.5,
  linkDistance: 30,
  centerGravity: 0.015,
};

/**
 * Keeps only the keys that exist in DEFAULT_SETTINGS with a value of the same type.
 * Settings removed in later versions (starfield, depth grid, click zoom distance) are
 * dropped here so stale keys never accumulate in data.json.
 */
export function sanitizeSettings(saved: unknown): Partial<GalaxySettings> {
  if (saved === null || typeof saved !== "object") return {};
  const source = saved as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof GalaxySettings)[]) {
    const fallback: unknown = DEFAULT_SETTINGS[key];
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== typeof fallback) continue;
    if (typeof fallback === "object" && Array.isArray(value)) continue;
    out[key] = value;
  }
  return out;
}
