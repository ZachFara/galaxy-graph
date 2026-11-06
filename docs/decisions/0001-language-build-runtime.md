# 0001 — Language, build and runtime baseline

Date: 2026-11-06

## Context

The plugin already exists in TypeScript, bundled by esbuild into a single CommonJS
`main.js`, as the Obsidian sample plugin prescribes. Obsidian runs on Electron, so the
runtime is a current Chromium. The repo had `strictNullChecks` only, esbuild 0.20,
`@types/node` 16 and no declared Node baseline.

## Decision

- **TypeScript** with `strict: true`, `noImplicitOverride`, `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`. `noUncheckedIndexedAccess` is a
  tracked follow-up (PROGRESS task 8), not yet on.
- **Target ES2018 syntax, ES2022 lib.** esbuild downlevels syntax for the `es2018`
  target Obsidian's template uses; the lib bump is safe because the runtime is Chromium.
- **esbuild 0.28** (bumped from 0.20 to satisfy vitest's peer range). Config unchanged:
  single entry `main.ts`, `obsidian`/`electron`/CodeMirror externals, minified in
  production, `process.env.NODE_ENV` defined for three.js.
- **Node 22 baseline** (`engines.node >=22`, CI on Node 22, `@types/node` 22).
- `three` and `3d-force-graph` stay dynamic imports inside the view (see DESIGN.md).

## Consequences

- Strict mode required small edits to existing code (override modifiers, removal of
  `!` assertions); these shipped in the setup PR.
- Contributors need Node 22+. The README must say so (PROGRESS task 10).
- `release.yml` still uses Node 20 and must be aligned (PROGRESS task 9).
