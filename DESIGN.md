# Galaxy Graph — Design

This document is the source of truth for **what** the system is and does. Decision
records in `docs/decisions/` are the source of truth for **how** it is built.
Deviations from either are proposed in `PROGRESS.md`, never made silently.

## The system in one paragraph

Galaxy Graph is a desktop-only Obsidian community plugin that renders the user's
vault as a navigable 3D force-directed graph. Every markdown note is a node sized
by its link degree; every resolved wikilink is an edge. The user orbits, zooms and
pans the galaxy, clicks a node to highlight its neighbourhood and open an inspector
panel (connection counts, body preview, links in/out, cluster growth sparkline),
double-clicks to fly the camera to a note, and can replay the vault's history as a
timeline. Hub notes get atmospheric "fog" sprites and floating labels; colour can be
mapped by folder, tag, index status or recent activity. A slide-in settings panel
persists all options through Obsidian's plugin data store. All graph state lives in
memory; the plugin makes no network requests and writes nothing to disk except its
own settings (and a new note when the user explicitly asks for one from the
inspector).

## Constraints that shape every decision

- **Obsidian plugin guidelines and store submission rules apply.** No `innerHTML`,
  no global `app`, no default hotkeys, no console logging in production, sentence-case
  UI text, all DOM/timer access through window-scoped forms (`activeDocument`,
  `window.setTimeout`) so popout windows work, and release assets are
  `main.js`, `manifest.json`, `styles.css` only.
- **Startup cost is paid by every user on every launch.** `three` and
  `3d-force-graph` are large; they are imported dynamically inside `GalaxyView.onOpen`
  so plugin load stays cheap. Nothing may add a static import of either to `main.ts`.
- **Desktop only** (`isDesktopOnly: true`); WebGL is required.
- **Vaults of a few thousand notes must stay usable.** Degree, colour and activity
  heat are computed once per graph build, not per frame. The render loop pauses when
  the view is not the active leaf.
- **The canvas follows the user's theme.** Every colour the scene draws is derived from
  `--background-primary` and `--text-normal` (see `src/utils/theme.ts`) and refreshed on
  the workspace `css-change` event. The plugin ships no colour of its own except the two
  folder palettes (light tints for dark grounds, deeper tones for light grounds).
- **`minAppVersion` is 1.7.2.** Only public Obsidian API may be used, with one
  documented exception: `vault.getConfig("userIgnoreFilters")`, read in `utils/excluded.ts`
  so the galaxy hides the same notes Obsidian's own graph hides.

## Module layout and dependency rules

```
main.ts                plugin entry: registers the view, ribbon icon, command; loads/saves settings
src/
  GalaxyView.ts        the ItemView; orchestrates everything below; owns the 3d-force-graph instance
  settings.ts          GalaxySettings interface + DEFAULT_SETTINGS           (foundation, leaf)
  types.ts             GNode, GLink, resolveId                               (foundation, leaf)
  graph/               vault -> graph data. Pure data, no three.js, no DOM.
    GraphBuilder.ts    buildGraphData(app): nodes + links + degree + folder keys
  scene/               pure three.js objects. No Obsidian imports, no UI.
    FogManager.ts      neighbourhood clouds: one sprite per hub, sized to its neighbours
    dispose.ts         shared geometry/material disposal helper
  ui/                  Obsidian DOM panels. No three.js, no scene.
    InspectorPanel.ts  selected-note details, local galaxy, sparkline, "add note to index"
    SettingsPanel.ts   slide-in settings UI; writes plugin.settings, calls back into the view
  utils/               small pure helpers usable by every layer above
    theme.ts           CanvasTheme from CSS variables; colour parsing, mixing, alpha
    colors.ts          themed folder palettes, heat ramps, getNodeColor, dimNodeColor
    camera.ts          bounding/robust spheres, fit distances, cloud radius (pure maths)
    labels.ts          greedy label placement
    activity.ts        activity-heat computation
    dates.ts           parseTimestamp
tests/                 vitest unit tests (pure modules; see decision 0002 for the obsidian stub plan)
scripts/               repo maintenance scripts run by `make check`
docs/decisions/        numbered decision records
assets/                README images only
```

Layers, lowest first: `types`/`settings` → `utils` → `graph` | `scene` | `ui` →
`GalaxyView` → `main.ts`. A module may import from its own layer or lower, with these
additional rules (all enforced by `.dependency-cruiser.cjs`, run in `make check`):

| From                | May import                                                  | Must not import                               |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `types`, `settings` | nothing local                                               | anything in `src/` or `main.ts`               |
| `utils/`            | `types`, `settings`, `utils`, `obsidian`                    | `graph`, `scene`, `ui`, `GalaxyView`, `three` |
| `graph/`            | `types`, `settings`, `utils`, `obsidian`                    | `scene`, `ui`, `GalaxyView`, `three`          |
| `scene/`            | `types`, `settings`, `utils`, `scene`, `three`              | `obsidian`, `ui`, `graph`, `GalaxyView`       |
| `ui/`               | `types`, `settings`, `utils`, `obsidian`                    | `three`, `scene`, `graph`, `GalaxyView`       |
| `GalaxyView.ts`     | everything in `src/`, `obsidian`, `three`, `3d-force-graph` | `main.ts`                                     |
| `main.ts`           | `GalaxyView`, `settings`, `obsidian`                        | `three`, `3d-force-graph` (statically)        |

No circular imports. No orphan modules. New source files go in one of the four
layer directories (flat, no sub-directories) or are one of the three named root
modules; the layout check in `scripts/check-layout.mjs` rejects anything else.

## Data flow

1. `GalaxyView.onOpen` kicks off the dynamic imports, builds the DOM shell, then
   calls `buildGraphData(app)`.
2. `GraphBuilder` walks `vault.getMarkdownFiles()` and `metadataCache.resolvedLinks`
   to produce `{ nodes, links }` with degree, folder key and base colour.
3. `computeActivityHeat` annotates nodes when the activity colour mode is on.
4. The 3d-force-graph instance is created with the data; accessors read `GNode`
   fields and `GalaxySettings` for size, colour, opacity.
5. After the simulation settles (~3 s), the view sets the scene-fog density from the
   galaxy's radius, builds the neighbourhood clouds from node positions and links, computes
   the hub labels, and frames the whole galaxy.
6. User input (clicks, settings changes, timeline) mutates view state and calls
   narrow update methods (`refreshNodeColors`, `rebuildFog`, `rebuildLabels`,
   `updateGridOpacities`) rather than rebuilding the graph.
7. Settings changes are deep-merged with `DEFAULT_SETTINGS` and persisted through
   `plugin.saveData`.

## Visual language

The canvas is a nebula, not a space scene: the only atmosphere is the one the data makes.

- **No ornaments.** No grids, rings, wireframe spheres or starfields. Depth is conveyed by
  exponential scene fog in the ground colour (density ≈ 0.18 / galaxy radius) plus node
  size attenuation. The empty canvas is the plain ground.
- **Neighbourhood clouds** are the signature element. Each hub (degree ≥ the index
  threshold) gets one soft sprite with a gaussian falloff, radius = 75th percentile of its
  neighbours' distances × 1.35 (capped at 35% of the galaxy radius), colour = the hub's own
  colour in the active colour mode. Additive on dark grounds, normal-blended and slightly
  darkened on light grounds. While a note is selected, every cloud but the selected hub's
  recedes to 40%.
- **Nodes and links.** Node colour by the active mode; links are lines in the ink colour at
  the configured opacity. Selection keeps colours: the selected note grows, its links take
  its colour, everything else dims to ink at 12%.
- **Camera.** Reset frames the connected body of the galaxy (90th-percentile radius) at 85%
  of the view from 18° elevation. Focus frames a note plus its neighbours at 60% of the
  view, clamped so the hub never exceeds 8% of the view height. Single click never moves the
  camera. Auto-rotation orbits the current target slowly (one turn per five minutes).
- **Labels.** Theme-coloured pills with the node's colour dot. The top-N hubs are always
  candidates; any node whose sphere projects to ≥ 7 px is a candidate too, so a neighbourhood
  becomes legible on arrival. Placement is greedy by priority with overlap rejection, capped
  at 28, and keeps clear of the top bar. Pills are clickable.
- **Chrome.** Obsidian's type scale (12/13/15), sentence case, native controls. One accent
  per panel: the selected note's colour on the inspector title, badge and chart. Toggle
  buttons show state by inversion (ink fill, ground text), never by text.

## Untrusted data

Vault content is untrusted input: frontmatter values, tags, note bodies and link
targets can be any shape. Code that reads them types them as `unknown` and narrows
explicitly (see `parseTimestamp`, the `links` normalisation in `activity.ts`). They
are rendered through Obsidian's DOM helpers (`createEl`, `setText`), never as HTML.

## Known gaps (tracked in PROGRESS.md)

- Automated test coverage exists only for pure helpers; modules that import Obsidian
  values at runtime need a test stub before they can be unit-tested.
- Clouds are capped in world units, not screen pixels, so a cloud can still fill the view
  when the camera is inside a neighbourhood.
