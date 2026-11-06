# 0002 — Test framework and the Obsidian stub

Date: 2026-11-06

## Context

The project had no tests. The `obsidian` npm package publishes type declarations only;
any module that imports a runtime value from it (`Notice`, `TFile`, `getAllTags`, …)
cannot be loaded in Node. Modules whose `obsidian` imports are `import type` load
fine. The rendering code depends on WebGL and cannot run headless in a meaningful way.

## Decision

- **Vitest**, `environment: node`, tests under `tests/**/*.test.ts`, explicit imports
  from `vitest` (no globals). Run via `make test` / `npm test`.
- **Test pure modules directly.** `utils/dates`, `utils/colors`, `graph/GraphBuilder`'s
  path helpers, `types.resolveId` are importable today.
- **Obsidian stub, when needed (PROGRESS task 2):** a single `tests/helpers/obsidian.ts`
  that implements only the runtime values the code under test touches (`TFile` class,
  `Notice` no-op, `getAllTags`), wired through a vitest `resolve.alias` for `obsidian`.
  Fake `App` objects are built per test from plain objects. No mocking framework.
- **Do not unit-test three.js scene construction.** Verification of rendering stays
  manual in a throwaway test vault and is described in the PR under "How it was tested".
- **Test files mirror source names** (`tests/graph/GraphBuilder.test.ts` for
  `src/graph/GraphBuilder.ts`).

## Consequences

- Coverage will grow bottom-up: utils and graph first, UI logic once extracted from DOM
  code. Code that is hard to test is a signal to move logic down a layer, not to mock
  more.
- The stub is a dependency of every test task; it is scheduled before them.
