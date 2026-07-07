export interface GalaxySettings {
  popularityDimension: 'ctime' | 'mtime' | 'frontmatter';
  popularityFrontmatterKey: string;
  rotationSpeed: number;
  colorBy: 'folder' | 'index' | 'tag' | 'activity';
  indexDegreeThreshold: number;
  tagColorMap: Record<string, string>;
  activityWindowDays: number;
  activityLeafDateField: 'mtime' | 'ctime';
  linkOpacityDefault: number;
  linkOpacityHighlight: number;
  linkOpacityDim: number;
  fogEnabled: boolean;
  fogMode: 'color' | 'heat';
  fogMaxOpacity: number;
  topLabelCount: number;
  labelHideDistance: number;
  clickFlyDistance: number;
  noteTemplate: string;
  showStars: boolean;
  starCount: number;
  starSize: number;
  starBrightness: number;
  sphereOpacity: number;
  ringsOpacity: number;
  groundGridOpacity: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  centerGravity: number;
}

export const DEFAULT_SETTINGS: GalaxySettings = {
  popularityDimension: 'ctime',
  popularityFrontmatterKey: 'updated',
  rotationSpeed: 0.001,
  colorBy: 'folder',
  indexDegreeThreshold: 10,
  tagColorMap: {},
  activityWindowDays: 30,
  activityLeafDateField: 'mtime',
  linkOpacityDefault: 0.30,
  linkOpacityHighlight: 0.90,
  linkOpacityDim: 0.02,
  fogEnabled: true,
  fogMode: 'color',
  fogMaxOpacity: 0.35,
  topLabelCount: 10,
  labelHideDistance: 3000,
  clickFlyDistance: 600,
  noteTemplate: `---
date: {{date}}
links:
  - "[[{{index}}]]"
tags:
  - 
---

# {{title}}

`,
  showStars: true,
  starCount: 2000,
  starSize: 1.2,
  starBrightness: 0.8,
  sphereOpacity: 0.06,
  ringsOpacity: 0.10,
  groundGridOpacity: 0.15,
  repelForce: -30,
  linkForce: 0.5,
  linkDistance: 30,
  centerGravity: 0.015,
};
