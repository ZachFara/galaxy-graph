// Layout check: every tracked (or staged) file must live in an allowed location.
// Allowed locations are the directory layout in DESIGN.md / AGENTS.md. Add a new
// directory here only together with a decision record that introduces it.
import { execFileSync } from "node:child_process";
import process from "node:process";

const ALLOWED_ROOT_FILES = new Set([
  ".dependency-cruiser.cjs",
  ".gitignore",
  ".prettierignore",
  ".prettierrc",
  "AGENTS.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "DESIGN.md",
  "LICENSE",
  "Makefile",
  "PROGRESS.md",
  "README.md",
  "commitlint.config.mjs",
  "esbuild.config.mjs",
  "eslint.config.mjs",
  "knip.json",
  "main.ts",
  "manifest.json",
  "package-lock.json",
  "package.json",
  "styles.css",
  "tsconfig.json",
  "versions.json",
  "vitest.config.mts",
]);

// [regex, description]
const ALLOWED_PATTERNS = [
  [/^src\/(GalaxyView|settings|types)\.ts$/, "view orchestrator and foundation modules"],
  [/^src\/(graph|scene|ui|utils)\/[A-Za-z0-9]+\.ts$/, "one of the four source layers, flat"],
  [/^tests\/.+\.test\.ts$/, "unit tests"],
  [/^tests\/helpers\/.+\.ts$/, "test helpers"],
  [/^scripts\/[a-z0-9-]+\.mjs$/, "repo maintenance scripts"],
  [/^docs\/decisions\/\d{4}-[a-z0-9-]+\.md$/, "decision records"],
  [/^docs\/decisions\/README\.md$/, "decision record index"],
  [/^\.github\/workflows\/[a-z0-9-]+\.yml$/, "CI workflows"],
  [/^\.github\/PULL_REQUEST_TEMPLATE\.md$/, "PR template"],
  [/^\.githooks\/(pre-commit|commit-msg)$/, "git hooks"],
  [/^assets\/[A-Za-z0-9_-]+\.(png|gif|svg)$/, "README images"],
];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

const bad = files.filter((f) => !ALLOWED_ROOT_FILES.has(f) && !ALLOWED_PATTERNS.some(([re]) => re.test(f)));

if (bad.length > 0) {
  process.stderr.write("Layout check failed. Files outside the allowed layout:\n");
  for (const f of bad) process.stderr.write(`  ${f}\n`);
  process.stderr.write("\nAllowed locations:\n");
  for (const [re, what] of ALLOWED_PATTERNS) process.stderr.write(`  ${re}  ${what}\n`);
  process.stderr.write("Throwaway files belong in .scratch/ (gitignored).\n");
  process.exit(1);
}
process.stdout.write(`Layout check passed (${files.length} files).\n`);
