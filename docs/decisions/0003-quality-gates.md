# 0003 — One check command and ratcheting quality gates

Date: 2026-11-06

## Context

Multiple agent sessions will touch this repo. Checks that live in several places drift,
and checks that can be bypassed will be. The existing code is 2.7k lines with two
functions far above any reasonable size limit; refusing to merge until they are split
would block everything else.

## Decision

`make check` is the single definition of passing. It runs, in order:

| Gate       | Tool                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format     | prettier `--check` (printWidth 110, double quotes, trailing commas)                                                                                                 |
| lint       | eslint 10 flat config: `@eslint/js` recommended + typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, `eslint-config-prettier` last, `--max-warnings 0` |
| typecheck  | `tsc --noEmit` with the strict settings in decision 0001                                                                                                            |
| deadcode   | knip (unused files, exports, dependencies)                                                                                                                          |
| boundaries | dependency-cruiser with the rules in decision 0004                                                                                                                  |
| layout     | `scripts/check-layout.mjs` — every tracked or untracked file must match an allowed path                                                                             |
| test       | vitest                                                                                                                                                              |

Each gate is also an npm script so tools can see the commands. The pre-commit hook
(`.githooks/pre-commit`) and CI (`.github/workflows/ci.yml`) both run exactly
`make check`; neither defines any check of its own. `git config core.hooksPath
.githooks` is set by `npm install` through the `prepare` script, so hooks are
versioned and need no extra dependency (husky/lefthook rejected for that reason).

Commit messages are checked by `commitlint` with `config-conventional` (header ≤ 72)
in the commit-msg hook and again in CI over the PR's commit range.

**Complexity limits are a ratchet.** Initial ceilings were chosen as the smallest
values the existing code passes; they may only be lowered, never raised:

| Rule                   | Now  | Target | Blocking code                                     | Task |
| ---------------------- | ---- | ------ | ------------------------------------------------- | ---- |
| complexity             | 20   | 20     | max observed 19 (`InspectorPanel`, `activity`)    | —    |
| max-depth              | 4    | 4      | —                                                 | —    |
| max-nested-callbacks   | 4    | 4      | —                                                 | —    |
| max-params             | 7    | 5      | `InspectorPanel` ctor (7), 3 `SettingsPanel` rows | 5    |
| max-lines-per-function | 550  | 120    | `buildSettingsPanel` (546), `onOpen` (164)        | 6, 7 |
| max-lines              | 1000 | 1000   | `GalaxyView.ts` ≈ 930                             | —    |

Rule configuration choices made at setup (not loosenings): `eqeqeq` ignores `== null`;
`restrict-template-expressions` allows numbers and booleans;
`no-confusing-void-expression` ignores arrow shorthand. `ban-ts-comment` forbids every
`@ts-` directive. `no-console` is an error.

## Consequences

- There is no "quick" commit; the hook runs the full suite (≈15 s today). Keep it fast
  by keeping tests unit-level.
- Lowering a ceiling is a normal chore PR; raising one is a rule violation and must
  instead be raised under Open Questions in PROGRESS.md.
- Adding a top-level file or directory requires editing the layout script in the same
  PR, which makes layout changes visible in review.
