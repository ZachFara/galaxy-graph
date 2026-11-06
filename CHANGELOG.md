# Changelog

## [1.1.0] — Visual redesign (current)

### Added
- **Honours Obsidian's "Files and links → Excluded files" setting.** Excluded notes are left out of the graph, the tag list, activity heat and the cluster-growth chart, matching the core graph, search and backlinks.

### Changed
- **The canvas follows the Obsidian theme.** Ground, links, dimmed nodes, label pills and cloud blending are all derived from the active theme's colours and update live when the theme or a snippet changes. Light grounds get deeper folder tones.
- **Depth comes from scene fog, not ornaments.** The wireframe spheres, concentric rings with tick marks, ground grid and starfield are gone; distant notes and links fade toward the ground colour instead.
- **Neighbourhood clouds** are sized to the spatial extent of a hub's neighbours (not its link count), tinted with the hub's colour in the active colour mode, fall off smoothly, glow additively on dark grounds and wash normally on light ones, and recede while another note is selected.
- **Camera.** A single click selects a note and opens the inspector without moving the camera. Double-click, a label click, or a link in the inspector frames the note's neighbourhood and never comes closer than where the hub would fill 8% of the view. *Reset view* frames the whole galaxy from 18° above its equator (ignoring orphans drifting at the periphery). Clicking the background only clears the selection.
- **Links** are drawn as lines rather than tubes. Highlighted links take the selected note's own colour; the selected note keeps its colour and grows instead of being recoloured to the theme accent.
- **Labels** are theme-aware pills that avoid overlapping, appear for nearby notes as you zoom in, and can be clicked to travel to that note.
- **Chrome.** Top-bar toggles show a pressed state instead of "ON/OFF" text; icons come from Obsidian's icon set; the inspector and settings rail use Obsidian's type scale and native controls with one accent per panel (the selected note's colour); the tag-colour list is capped with a *Show all* control.

### Removed
- Settings for the starfield (count, size, brightness), sphere / ring / ground-grid opacity and click zoom distance. Stale keys are dropped from saved data on load.

---

## [1.0.1] — Store Review Fixes

### Fixed
- **Popout window compatibility** — all DOM/timer calls (`document`, `setTimeout`, `requestAnimationFrame`) now use the window-scoped forms (`activeDocument`, `window.setTimeout`, `window.requestAnimationFrame`) so the view behaves correctly when dragged into an Obsidian popout window
- **Unhandled promises** — `revealLeaf`, note preview loading, and `openFile` calls are now properly awaited or explicitly marked fire-and-forget
- **Frontmatter `tags:` as a plain string crashed graph building** — tag collection now normalizes scalar frontmatter values into arrays before mapping

### Changed
- `minAppVersion` raised to **1.7.2** (the `revealLeaf` async signature this plugin relies on was introduced there)
- The 3d-force-graph instance is now fully typed (`ForceGraph3DInstance<GNode, GLink>`) instead of `any`, along with typed d3 force accessors and three.js scene-object disposal helpers
- `three` promoted to a direct dependency (it is imported directly, not just transitively)
- Replaced the `builtin-modules` package with Node's built-in `node:module` `builtinModules` list in the build config
- Releases are now built and published from GitHub Actions with artifact attestations, so release assets carry verifiable build provenance

---

## [1.0.0] — Performance & Public Release

### Fixed
- **Slow startup (5-10s)** — production builds were shipping unminified (`main.js` 3.29MB); esbuild now minifies production output, cutting bundle size to ~1.41MB
- **Eager loading of heavy dependencies** — `three` and `3d-force-graph` were statically imported and initialized at plugin load time even when the Galaxy Graph view was never opened; these are now dynamically imported in parallel with view setup and only awaited right before the scene is built
- **Intermittent multi-minute load / stuck graph** — a race condition in the `3d-force-graph` dependency chain (a 1ms debounce-based layout digest racing a `requestAnimationFrame`-scheduled tick) could leave the view stuck mid-load, especially under contention from other plugins; the render loop is now paused immediately after graph construction and resumed on the next tick, converting the race into a deterministic ordering
- **Hardcoded folder labels** — the inspector panel's folder badge used a lookup table of one vault's specific folder names; labels are now derived generically from each note's actual top-level folder name

### Changed
- `manifest.json` / `package.json` author metadata corrected

---

## [0.3.0] — Sprint 3

### Fixed
- **Galaxy drift on node drag** — auto-rotation now pauses immediately when a drag starts (`onNodeDrag`) and resumes 1 second after drag ends (`onNodeDragEnd`), preventing the entire graph from veering during interaction
- **Camera zoom too aggressive on click** — the camera now stops at a minimum distance of 4× the node's rendered radius on single-click (2× on double-click), using ease-in-out over 800ms; clicking empty space resets camera smoothly over 1500ms
- **High CPU/GPU usage** — the animation loop (RAF) pauses when Galaxy Graph is not the active Obsidian tab (via `active-leaf-change` event); force simulation uses faster alpha decay (0.02); WebGL renderer pixel ratio is capped at 1.5× for retina displays
- **Activity sparkline date bucketing** — now uses correct `(year × 12) + month` arithmetic to bucket file timestamps into the correct calendar month bins

### Added
- **Settings persistence** — settings deep-merge with `DEFAULT_SETTINGS` on plugin load, so new setting keys always get their defaults even when loading older saved data
- **Tag autocomplete** — in the "By Tag" color mode, typing in the tag input shows a dropdown of up to 8 matching tags from the vault's metadata cache; supports keyboard navigation (↑/↓ to move, Enter to select, Escape to dismiss)
- **Fog follows drag** — fog atmosphere sprites follow their index node in real time during drag via `fogNodeMap`; labels update position on every drag tick as well
- **Neighborhood list view** — when a clicked node has more than 20 direct neighbors, the Local Galaxy panel renders a scrollable sorted list (by degree) instead of the SVG mini-graph; each item shows a color dot, note name, and connection badge
- **Floating index labels** — billboard `THREE.Sprite` labels float above the top-N most-connected nodes after simulation settles; configurable 0–30 via a "Labels" slider in the settings panel; labels are camera-facing and update when the slider changes
- **Add note to index** — the inspector panel shows a "+ Add note to [IndexName]" button; clicking it creates a new markdown note in the same folder with vault-standard frontmatter and a wikilink back to the index note, opens it in a new tab, and refreshes the graph live
- **Vault Timeline mode** — a "Timeline: OFF/ON" button in the top bar replays vault history by revealing notes chronologically (by creation date, or frontmatter date if that dimension is active); shows a date readout and 0.5×/1×/2×/4× speed buttons; deactivating instantly restores the full graph

---

## [0.2.0] — Sprint 2

### Added
- **Grid sphere with auto-scaling** — after the force simulation settles (~3s), the plugin calculates the bounding radius of all nodes and renders: a wireframe sphere at 110% of bounding radius (opacity 0.06), four concentric XZ-plane depth rings at 25/50/75/110% with 32 tick marks each, and a `GridHelper` ground plane at the bounding box minimum Y; all geometry is fixed in world space and does not rotate
- **Settings panel** — a ⚙ gear button opens a 320px slide-in panel on the right edge of the canvas with sections for all configurable options; settings auto-save on every change with a "Saved ✓" flash; "Reset to defaults" button at the footer
- **Popularity dimension** — radio selector for ctime / mtime / frontmatter field; when frontmatter is selected, a text input specifies the field name; changes immediately re-render the sparkline for the selected node
- **Rotation speed slider** — 0 to 0.01 with live update
- **Color mapping modes** — "By Folder" (default, top-level folder number → color palette), "By Index vs Normal" (nodes at or above a configurable degree threshold get a warm accent), "By Tag" (user-defined tag→hex color rows with add/remove controls)
- **Link opacity controls** — three sliders for default, highlighted, and dimmed link opacity; live update
- **Index fog / cluster atmospheres** — hub nodes (degree ≥ threshold) get a radial glow `THREE.Sprite` behind them using a single shared canvas-generated texture; fog radius scales linearly with degree (2×–8× node radius); two modes: match cluster/folder color, or a cool-blue to hot-orange heat gradient by connection count; max opacity controlled by slider; fog does not intercept raycasting
- **Activity sparkline** — 12-month SVG bar chart in the inspector panel showing how many connections were created/modified in each calendar month; color-coded by folder; shows "Not enough data yet" when all buckets are zero; displays the peak month below the chart
- **Local neighborhood mini-graph** — 200×200px SVG diagram of the clicked node and its direct neighbors; neighbors are sized by their own degree; edges between visible neighbors are shown; clicking a neighbor node navigates the main graph to it
- **Zoom tuning** — initial camera fly-in on node click uses ease-in-out over 800ms and scales stop distance with node size

---

## [0.1.0] — Initial Release

### Added
- Core 3D force-directed graph rendering using `3d-force-graph` and `Three.js`; renders all markdown files in the vault as nodes and all wikilinks as edges
- Node sizing proportional to total connection count (in-degree + out-degree)
- Color coding by top-level vault folder (folder 1–6 each get a distinct color; root-level notes get a distinct accent)
- Auto-rotation around the Y axis with toggle button; rotation speed configurable
- Orphan node toggle to show or hide notes with no connections
- Right-side node inspector panel — shows note title (colored by folder), in/out/total degree stats, folder badge, first 200 characters of note content (frontmatter stripped), outgoing and incoming link lists (up to 12 each), "Open Note →" button
- Click-to-fly camera animation — clicking a node highlights the node and its direct connections (everything else dims) and flies the camera toward it
- Double-click for a closer zoom
- Background click resets highlight and returns camera to default position
- `ResizeObserver` keeps the graph canvas filling its container as the Obsidian panel resizes
- Ribbon icon (`share-2`) and command palette command (`Open Galaxy Graph`) to open the view
- Settings persistence via Obsidian's `loadData()` / `saveData()` API
- HUD wireframe sphere decorations (concentric rings, tick marks) in world space for depth perception
