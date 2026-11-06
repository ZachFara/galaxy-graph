# 0007 — Canvas visual language

Date: 2026-11-06

## Context

A design review of the canvas (see DESIGN.md "Visual language" for the result) found five
overlapping ornament systems (wireframe spheres, bounding sphere, rings with ticks, ground
grid, starfield) that carried no information and collapsed to a hard line when the camera sat
on their plane; a camera that flew too close on click and double-click; clouds whose colour
ignored the active colour mode and whose size came from link count rather than extent; and a
canvas that ignored the Obsidian theme (background read once at open, every other colour
hardcoded, additive sprites invisible on light grounds). The owner asked for the space
imagery to stay a justification for atmosphere, not a theme.

## Decision

- **Theme-derived palette.** `CanvasTheme { ground, ink, isDark }` is read from CSS variables
  at open and on `css-change`; every scene colour is computed from it. Folder palettes come
  in a dark-ground and a light-ground set. No hex literal in scene or view code except those
  two palettes and the heat ramps.
- **Delete the ornaments; depth by scene fog.** `THREE.FogExp2` in the ground colour, density
  0.18 / galaxy radius. The six related settings are removed and dropped from saved data by
  `sanitizeSettings`.
- **Clouds as neighbourhood weather.** Radius from the 75th percentile of neighbour distances,
  colour from `getNodeColor` in the active mode, gaussian texture, blending by ground
  luminance, receding to 40% while another note is selected.
- **Camera rules.** Single click selects only. Focus (double-click, label click, inspector
  link) frames node + neighbours with a minimum-distance clamp. Reset frames the connected
  body of the galaxy from 18° elevation using a 90th-percentile radius so orphans do not
  shrink the view. Background click clears the selection without moving.
- **Lines, not tubes.** `linkWidth(0)`; opacity rides on the rgba alpha the library multiplies
  in. Highlight by the selected note's colour; selection grows the node rather than
  recolouring it.
- **Labels** are pooled DOM pills placed greedily with overlap rejection; hubs always,
  nearby notes when their sphere projects ≥ 7 px; clickable.
- **Chrome** uses Obsidian's variables, type scale and native controls; one accent per panel.

## Consequences

- The plugin has no "look" of its own beyond the folder palettes; it inherits the user's
  theme, which is what an Obsidian plugin should do. Screenshots in the README are out of
  date and must be re-recorded (PROGRESS task).
- Users who tuned the starfield or grid lose those controls; the clouds and link opacity
  remain the only atmosphere settings.
- Per-frame work grew slightly (projecting every node for near-field labels); measured
  fine at 1.2k nodes, to be re-checked near the 2k warning threshold.
