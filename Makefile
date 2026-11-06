# Single source of truth for quality gates.
# `make check` is run by the pre-commit hook and by CI; they must never diverge.
# Each gate is an npm script so tooling (knip, editors) can see the commands too.
SHELL := /bin/bash
.DEFAULT_GOAL := check

.PHONY: check format lint typecheck deadcode boundaries layout test build hooks

check: format lint typecheck deadcode boundaries layout test
	@echo "✔ all checks passed"

format:
	npm run -s format

lint:
	npm run -s lint

typecheck:
	npm run -s typecheck

deadcode:
	npm run -s deadcode

boundaries:
	npm run -s boundaries

layout:
	npm run -s layout

test:
	npm run -s test

build:
	npm run -s build

# Point git at the versioned hooks. Also runs automatically via `npm install` (prepare).
hooks:
	git config core.hooksPath .githooks
