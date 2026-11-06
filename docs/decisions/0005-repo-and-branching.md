# 0005 — Canonical repository, branching and commits

Date: 2026-11-06

## Context

Two GitHub repositories existed: a private `Galaxy_Graphs` with the full development
history (including a committed `node_modules`) and a public `galaxy-graph` with a
clean, squashed history that `package.json`, `manifest.json` and the release workflow
all point at. Commits had free-form messages and landed directly on the default branch.

## Decision

- **Canonical repository: `github.com/ZachFara/galaxy-graph`, branch `main`.** The
  private repository is history only (see PROGRESS Q1 for the remote clean-up).
- **`main` is protected:** pull requests required, the CI `check` status required, no
  force pushes, no deletions, rules enforced for administrators. Zero required
  approvals while there is a single maintainer (PROGRESS Q3).
- **Branches** are named `feat/…`, `fix/…`, `chore/…`, `docs/…`; one task per branch;
  squash or merge as the owner prefers, but every commit on the branch must itself
  pass commitlint.
- **Conventional commits** (`type(scope)?: subject`), header ≤ 72 characters.
- **PR template** with "What changed / Why / How it was tested" plus a checklist that
  mirrors the engineering rules in AGENTS.md.

## Consequences

- No direct pushes to `main`, including by agents and by the owner.
- The old `master` branch in local clones is a reference for unported work only
  (PROGRESS task 1) and should be deleted once that lands.
