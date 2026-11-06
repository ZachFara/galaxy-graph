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
- **`minAppVersion` is 1.7.2.** Only public Obsidian API may be used, with one
  documented exception: `vault.getConfig("userIgnoreFilters")` for the "Excluded
  files" setting (planned, see PROGRESS.md).

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
    FogManager.ts      hub fog sprites, position sync, disposal
    SphereGrid.ts      HUD sphere, depth rings, ground grid, starfield
    dispose.ts         shared geometry/material disposal helpers
  ui/                  Obsidian DOM panels. No three.js, no scene.
    InspectorPanel.ts  selected-note details, local galaxy, sparkline, "add note to index"
    SettingsPanel.ts   slide-in settings UI; writes plugin.settings, calls back into the view
  utils/               small pure helpers usable by every layer above
    colors.ts          palettes, heat colours, getNodeColor
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
5. After the simulation settles, `scene/` builds the grid sphere, starfield, fog and
   labels from node positions.
6. User input (clicks, settings changes, timeline) mutates view state and calls
   narrow update methods (`refreshNodeColors`, `rebuildFog`, `rebuildLabels`,
   `updateGridOpacities`) rather than rebuilding the graph.
7. Settings changes are deep-merged with `DEFAULT_SETTINGS` and persisted through
   `plugin.saveData`.

## Untrusted data

Vault content is untrusted input: frontmatter values, tags, note bodies and link
targets can be any shape. Code that reads them types them as `unknown` and narrows
explicitly (see `parseTimestamp`, the `links` normalisation in `activity.ts`). They
are rendered through Obsidian's DOM helpers (`createEl`, `setText`), never as HTML.

## Known gaps (tracked in PROGRESS.md)

- Obsidian's "Files and links → Excluded files" setting is not yet honoured.
- Automated test coverage exists only for pure helpers; modules that import Obsidian
  values at runtime need a test stub before they can be unit-tested.
- Two functions exceed the target size limits and are covered by ratchet tasks.
