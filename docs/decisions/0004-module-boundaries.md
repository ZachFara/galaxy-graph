# 0004 — Module boundaries

Date: 2026-11-06

## Context

The code already had a sensible split (`graph/`, `scene/`, `ui/`, `utils/`) and no
cycles, but nothing stopped the next change from importing three.js into a UI panel or
Obsidian into a scene helper. Both would hurt: three.js in `ui` defeats lazy loading
and testability; Obsidian in `scene` ties pure rendering code to the host.

## Decision

Enforce the layering in DESIGN.md with dependency-cruiser (`.dependency-cruiser.cjs`):

- `types.ts`, `settings.ts` import nothing local.
- `utils/` may import only `types`, `settings`, `utils`, `obsidian`; never `three`.
- `graph/` is pure data: no `scene`, `ui`, `three`.
- `scene/` is pure three.js: no `obsidian`, `ui`, `graph`.
- `ui/` is Obsidian DOM: no `three`, `scene`, `graph`.
- Only `main.ts` imports `GalaxyView.ts`; nothing imports `main.ts`.
- No circular dependencies, no orphan modules.

Layer directories stay flat (no sub-directories) until a layer has more than roughly
ten files; the layout check encodes this.

## Consequences

- Cross-layer needs are met by passing data or callbacks through `GalaxyView`, which
  is the only place allowed to know about everything. If that becomes unwieldy, the
  fix is a new named module at the right layer plus an update to this record, not a
  rule exception.
- A violation fails `make check` with the rule name and the offending edge.
