// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["main.js", "node_modules/**", ".scratch/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Complexity limits. These numbers are a ratchet: they may only go down
      // (see docs/decisions/0003-quality-gates.md and the ratchet tasks in PROGRESS.md).
      complexity: ["error", { max: 20 }],
      "max-depth": ["error", { max: 4 }],
      "max-nested-callbacks": ["error", { max: 4 }],
      "max-params": ["error", { max: 7 }],
      "max-lines-per-function": ["error", { max: 550, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 1000, skipBlankLines: true, skipComments: true }],
      // No silent suppression of checks.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-expect-error": true, "ts-nocheck": true, "ts-check": false },
      ],
      "no-console": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true, ignoreVoidOperator: true },
      ],
    },
  },
  {
    files: ["**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  prettier,
);
