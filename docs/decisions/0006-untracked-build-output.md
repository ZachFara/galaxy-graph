# 0006 — Build output is not tracked in git

Date: 2026-11-06

## Context

`main.js` (≈1.5 MB, minified) was committed alongside the source. Every source edit
changed it, so each PR carried an unreviewable binary-sized diff, merges conflicted on
it, and it could silently drift from the source it claimed to be built from. The
release workflow already builds it from source and attaches it, with provenance
attestation, to each GitHub release.

## Decision

`main.js` is gitignored. It is produced by `npm run build` locally and by
`.github/workflows/release.yml` for releases. Users install from release assets or
build from source (README). The layout check no longer lists it.

## Consequences

- PR diffs contain only source. Reviewers never see generated code.
- A fresh clone has no `main.js` until `npm run build` runs; the README says so.
- Anyone who used the raw-repo `main.js` must switch to release assets.
