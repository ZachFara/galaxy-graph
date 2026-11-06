/** @type {import('dependency-cruiser').IConfiguration} */
// Module boundaries. See DESIGN.md ("Module layout and dependency rules").
// Layers, lowest first: types/settings -> utils -> graph | scene | ui -> GalaxyView -> main.ts
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "no-orphans",
      severity: "error",
      from: { orphan: true, pathNot: ["\\.d\\.ts$"] },
      to: {},
    },
    {
      name: "foundation-imports-nothing-local",
      comment: "types.ts and settings.ts are leaf modules.",
      severity: "error",
      from: { path: "^src/(types|settings)\\.ts$" },
      to: { path: "^(src|main\\.ts)" },
    },
    {
      name: "utils-stay-low",
      comment: "utils may only import types, settings, other utils and obsidian.",
      severity: "error",
      from: { path: "^src/utils/" },
      to: { path: "^src/(graph|scene|ui)/|^src/GalaxyView\\.ts$|^main\\.ts$", pathNot: "^node_modules/" },
    },
    {
      name: "utils-no-three",
      severity: "error",
      from: { path: "^src/utils/" },
      to: { path: "^node_modules/three/" },
    },
    {
      name: "graph-is-pure-data",
      comment: "graph builds data from the vault; it does not touch the scene or the UI.",
      severity: "error",
      from: { path: "^src/graph/" },
      to: { path: "^src/(scene|ui)/|^src/GalaxyView\\.ts$|^main\\.ts$|^node_modules/three/" },
    },
    {
      name: "scene-no-obsidian-no-ui",
      comment: "scene is pure three.js; it must not depend on Obsidian, the UI or the graph builder.",
      severity: "error",
      from: { path: "^src/scene/" },
      to: { path: "^src/(ui|graph)/|^src/GalaxyView\\.ts$|^main\\.ts$|^node_modules/obsidian/" },
    },
    {
      name: "ui-no-three-no-scene",
      comment: "ui is Obsidian DOM only; it must not depend on three.js, the scene or the graph builder.",
      severity: "error",
      from: { path: "^src/ui/" },
      to: { path: "^src/(scene|graph)/|^src/GalaxyView\\.ts$|^main\\.ts$|^node_modules/three/" },
    },
    {
      name: "only-main-imports-view",
      comment: "GalaxyView is the orchestrator; only the plugin entry point may import it.",
      severity: "error",
      from: { pathNot: "^main\\.ts$" },
      to: { path: "^src/GalaxyView\\.ts$" },
    },
    {
      name: "nothing-imports-main",
      severity: "error",
      from: {},
      to: { path: "^main\\.ts$" },
    },
    {
      name: "tests-only-import-src",
      severity: "error",
      from: { path: "^tests/" },
      to: { path: "^main\\.ts$" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
