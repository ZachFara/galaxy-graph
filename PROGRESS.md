# PROGRESS

## Status (2026-11-06)

Phase 1 (repo setup) is complete on branch `chore/agent-workflow-setup` and awaiting
the owner's approval of its PR. No Phase 2 task has started. Plugin version 1.0.1 is
released and in the community store review pipeline.

`make check` passes. The setup PR also carried the minimal source edits needed to make
the strict type checker and linter pass on existing code (override modifiers, removal
of non-null assertions, one dead method removed, the previously unused
`parseTimestamp` helper now used at three call sites). Two behaviour nuances came with
that, listed under Open Questions Q4.

## Task list

Small tasks, one session each, in dependency order. Take the first unblocked task
unless told otherwise. Mark done with the PR number.

| #   | Task                                                                                                                                                     | Depends on | Done when                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **feat: honour Obsidian "Excluded files"** — port `src/utils/excluded.ts` and its four call sites from local commit `1ea14ea` on the old `master` branch | —          | Notes matching the setting disappear from graph, tag list, activity heat and cluster sparkline; `isExcluded` has unit tests for path, folder and regex filters; CHANGELOG entry |
| 2   | **test infra: obsidian stub for vitest** — `tests/helpers/obsidian.ts` + vitest alias so modules with runtime `obsidian` imports can be tested           | —          | A test imports `buildGraphData` with a fake `App` and passes; decision 0002 updated with the stub contract                                                                      |
| 3   | **test: GraphBuilder** — nodes, links, degree, folder keys, orphan handling                                                                              | 2          | Tests cover resolved links, self-links, missing targets, frontmatter `tags` as string vs array                                                                                  |
| 4   | **test: colors + activity** — `heatColor`, `getNodeColor` per mode, `computeActivityHeat` window logic                                                   | 2          | Each colour mode has a test; activity window boundary tested                                                                                                                    |
| 5   | **chore: ratchet max-params 7 → 5** — options objects for `InspectorPanel` constructor and three `SettingsPanel` row builders                            | —          | `eslint.config.mjs` max-params is 5; no behaviour change; manual check of inspector + settings panel in a test vault noted in PR                                                |
| 6   | **chore: split `buildSettingsPanel`** into one function per section                                                                                      | 5          | No function in `SettingsPanel.ts` exceeds 120 lines; ratchet max-lines-per-function to 200                                                                                      |
| 7   | **chore: split `GalaxyView.onOpen`** (DOM shell, event wiring, deferred init)                                                                            | 6          | `onOpen` ≤ 120 lines; ratchet max-lines-per-function to 120                                                                                                                     |
| 8   | **chore: enable `noUncheckedIndexedAccess`** (32 sites, mostly `colors.ts`, `InspectorPanel.ts`)                                                         | 3, 4       | Flag on in `tsconfig.json`; `make check` passes; no `!` assertions added                                                                                                        |
| 9   | **chore: align release workflow with CI** — Node 22, `npm ci`, reuse `make check` before building release assets                                         | —          | `release.yml` runs `make check`; a dry run on a test tag in a fork or `act` is described in the PR                                                                              |
| 10  | **docs: README refresh** — Node 22 requirement, contributor section pointing at AGENTS.md, current store status                                          | —          | README accurate; no dead links                                                                                                                                                  |
| 11  | **chore: stop tracking `main.js`** (if Q2 is answered "yes")                                                                                             | Q2         | `main.js` gitignored, release assets unaffected, README install steps still correct                                                                                             |
| 12  | **release 1.0.2** — CHANGELOG, bump `manifest.json`/`package.json`/`versions.json`, tag                                                                  | 1, 9       | Release workflow green; assets attached                                                                                                                                         |

## Open Questions

Owner decisions needed. Do not guess on these.

- **Q1 — Remotes and history.** The local clone has two remotes: `origin` → private
  `ZachFara/Galaxy_Graphs` (`master`, old history, `node_modules` committed) and
  `newrepo` → public `ZachFara/galaxy-graph` (`main`, clean 7-commit history, the one
  releases ship from). Recommendation: rename `newrepo` to `origin`, rename the old one
  to `archive`, create a local `main` tracking the public repo, and archive the private
  GitHub repo. The old `master` branch stays local as a reference until task 1 lands.
- **Q2 — Keep `main.js` in git?** It is a 1.5 MB build artifact that changes on every
  source edit and will make every PR diff noisy. The release workflow builds it fresh
  and the README tells users to build or download it. Recommendation: stop tracking it
  (task 11).
- **Q3 — Branch protection approvals.** Protection on `main` requires a PR and a green
  `check` status but **zero** approving reviews, because a solo maintainer cannot approve
  their own PR. Confirm, or name a second reviewer account to require one approval.
- **Q4 — Behaviour nuances from the setup PR's lint fixes.** (a) Frontmatter `date`
  values that are numbers are now parsed (seconds or milliseconds) via `parseTimestamp`;
  previously they fell back to file ctime. (b) Fog sprites for nodes without a position
  yet are placed at the origin instead of at `NaN` until the next position sync. Both
  look like improvements; confirm or ask for a revert.
- **Q5 — Complexity ceilings.** The initial ceilings (complexity 20, max-params 7,
  max-lines-per-function 550, max-lines 1000) were set so the existing code passes and
  only ever go down (tasks 5–7). If you want different targets, say so before task 5.

## Next steps

1. Owner reviews and merges the setup PR, answers Q1–Q5.
2. First Phase 2 session takes task 1 (it is user-visible and already written on the
   old branch; it also needs the first real unit tests).
3. Task 2 next, because every later test task depends on it.

## Learned (move durable items into AGENTS.md or a decision record)

- 2026-11-06: see "Gotchas learned so far" in AGENTS.md (obsidian types-only package,
  three.js `instanceof` narrowing, ES2022 lib, esbuild postinstall).
