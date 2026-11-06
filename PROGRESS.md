# PROGRESS

## Status (2026-11-06)

Phase 1 (repo setup) is complete on branch `chore/agent-workflow-setup` (PR #1) with the
`main.js` clean-up stacked on it (PR #2). On the owner's explicit instruction ("make a new
branch and fully change these visual things"), the whole canvas visual redesign from the two
design reviews was done on one branch, `feat/canvas-visual-redesign`, stacked on PR #2.
That is a deliberate exception to one-task-per-branch; decision 0007 records the result.
Ratchet tasks 5–7 were satisfied by that refactor and the ceilings lowered. Plugin version 1.0.1 is
released and in the community store review pipeline.

`make check` passes. The setup PR also carried the minimal source edits needed to make
the strict type checker and linter pass on existing code (override modifiers, removal
of non-null assertions, one dead method removed, the previously unused
`parseTimestamp` helper now used at three call sites). Two behaviour nuances came with
that, listed under Open Questions Q4.

## Task list

Small tasks, one session each, in dependency order. Take the first unblocked task
unless told otherwise. Mark done with the PR number.

| #   | Task                                                                                                                                                                                    | Depends on      | Done when                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~**feat: honour Obsidian "Excluded files"**~~ done (feat/excluded-files) — port `src/utils/excluded.ts` and its four call sites from local commit `1ea14ea` on the old `master` branch | —               | Notes matching the setting disappear from graph, tag list, activity heat and cluster sparkline; `isExcluded` has unit tests for path, folder and regex filters; CHANGELOG entry |
| 2   | **test infra: obsidian stub for vitest** — `tests/helpers/obsidian.ts` + vitest alias so modules with runtime `obsidian` imports can be tested                                          | —               | A test imports `buildGraphData` with a fake `App` and passes; decision 0002 updated with the stub contract                                                                      |
| 3   | **test: GraphBuilder** — nodes, links, degree, folder keys, orphan handling                                                                                                             | 2               | Tests cover resolved links, self-links, missing targets, frontmatter `tags` as string vs array                                                                                  |
| 4   | **test: colors + activity** — `heatColor`, `getNodeColor` per mode, `computeActivityHeat` window logic                                                                                  | 2               | Each colour mode has a test; activity window boundary tested                                                                                                                    |
| 5   | ~~**chore: ratchet max-params 7 → 5**~~ done in the visual-redesign PR — options objects for `InspectorPanel` constructor and three `SettingsPanel` row builders                        | —               | `eslint.config.mjs` max-params is 5; no behaviour change; manual check of inspector + settings panel in a test vault noted in PR                                                |
| 6   | ~~**chore: split `buildSettingsPanel`**~~ done in the visual-redesign PR into one function per section                                                                                  | 5               | No function in `SettingsPanel.ts` exceeds 120 lines; ratchet max-lines-per-function to 200                                                                                      |
| 7   | ~~**chore: split `GalaxyView.onOpen`**~~ done in the visual-redesign PR (DOM shell, event wiring, deferred init)                                                                        | 6               | `onOpen` ≤ 120 lines; ratchet max-lines-per-function to 120                                                                                                                     |
| 8   | **chore: enable `noUncheckedIndexedAccess`** (32 sites, mostly `colors.ts`, `InspectorPanel.ts`)                                                                                        | 3, 4            | Flag on in `tsconfig.json`; `make check` passes; no `!` assertions added                                                                                                        |
| 9   | **chore: align release workflow with CI** — Node 22, `npm ci`, reuse `make check` before building release assets                                                                        | —               | `release.yml` runs `make check`; a dry run on a test tag in a fork or `act` is described in the PR                                                                              |
| 10  | ~~**docs: README refresh**~~ done (docs/readme-media) — Node 22 requirement, contributor section pointing at AGENTS.md, current store status                                            | —               | README accurate; no dead links                                                                                                                                                  |
| 11  | **chore: stop tracking `main.js`** — done, stacked PR on top of the setup PR                                                                                                            | —               | `main.js` gitignored, release assets unaffected, README install steps still correct                                                                                             |
| 13  | ~~**docs: re-record README demo GIFs and screenshots**~~ done (docs/readme-media)                                                                                                       | redesign merged | README media shows the current look in dark and light themes                                                                                                                    |
| 14  | **perf: measure the per-frame label pass near 2k notes** and throttle if needed                                                                                                         | redesign merged | Frame time stays under 16 ms with labels on in a 2k-note vault; decision 0007 updated with the numbers                                                                          |
| 15  | **feat: cap cloud size in screen space** so a cloud never exceeds ~35% of the view when the camera is inside a neighbourhood                                                            | redesign merged | Scale updated per frame from camera distance; test for the clamp maths                                                                                                          |
| 12  | **release 1.1.0** — CHANGELOG, bump `manifest.json`/`package.json`/`versions.json`, tag                                                                                                 | 1, 9            | Release workflow green; assets attached                                                                                                                                         |

## Open Questions

None open. Decisions taken by the owner on 2026-11-06 ("do all your recommendations"):

- **Q1 — Remotes and history: done.** Local remotes renamed: `origin` → public
  `ZachFara/galaxy-graph` (`main`), `archive` → private `ZachFara/Galaxy_Graphs`, which
  is now archived on GitHub (read-only). Local `main` tracks `origin/main`. The local
  `master` branch stays as a reference for task 1 only.
- **Q2 — `main.js` in git: stop tracking it.** Done (task 11, decision 0006).
- **Q3 — Branch protection: zero required approvals** (solo maintainer); PR and green
  `check` status required, no force pushes or deletions, enforced for admins.
- **Q4 — Behaviour nuances from the lint fixes: keep.** Numeric frontmatter dates now
  parse via `parseTimestamp`; fog sprites without a position start at the origin.
- **Q5 — Complexity ceilings: keep the ratchet** as recorded in decision 0003 and tasks
  5–7.

## Next steps

1. Owner reviews and merges PR #1, then PR #2, then the visual-redesign PR (in that order).
2. First Phase 2 session takes task 1 (it is user-visible and already written on the
   old branch; it also needs the first real unit tests).
3. Task 2 next, because every later test task depends on it.

## Notes

- The test vault is not isolated: a Linear plugin inside it synced 100 real issues during a
  session (1087 → 1187 notes). Treat it as throwaway for the plugin's files only.

## Learned (move durable items into AGENTS.md or a decision record)

- 2026-11-06: see "Gotchas learned so far" in AGENTS.md (obsidian types-only package,
  three.js `instanceof` narrowing, ES2022 lib, esbuild postinstall).
