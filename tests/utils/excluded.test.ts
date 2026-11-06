import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { excludedFilters, isExcluded, visibleMarkdownFiles } from "../../src/utils/excluded";

const fakeApp = (filters: unknown, paths: string[] = []) =>
  ({
    vault: {
      getConfig: () => filters,
      getMarkdownFiles: () => paths.map((path) => ({ path })),
    },
  }) as unknown as App;

describe("excludedFilters", () => {
  it("reads string filters from Obsidian's config and ignores junk", () => {
    expect(excludedFilters(fakeApp(["Archive/", "", 3, "/tmp.*/"]))).toEqual(["Archive/", "/tmp.*/"]);
    expect(excludedFilters(fakeApp(undefined))).toEqual([]);
  });
});

describe("isExcluded", () => {
  it("matches folders with or without a trailing slash", () => {
    expect(isExcluded("Archive/old.md", ["Archive/"])).toBe(true);
    expect(isExcluded("Archive/old.md", ["Archive"])).toBe(true);
    expect(isExcluded("Archived notes/a.md", ["Archive/"])).toBe(false);
  });
  it("matches exact files and regular expressions", () => {
    expect(isExcluded("Templates/daily.md", ["Templates/daily.md"])).toBe(true);
    expect(isExcluded("x/draft-2024.md", ["/draft-\\d+/"])).toBe(true);
    expect(isExcluded("x/final.md", ["/draft-\\d+/"])).toBe(false);
  });
  it("skips an invalid regular expression instead of throwing", () => {
    expect(isExcluded("a.md", ["/[/"])).toBe(false);
  });
});

describe("visibleMarkdownFiles", () => {
  it("filters the vault's markdown files by the excluded filters", () => {
    const app = fakeApp(["Archive/"], ["Archive/old.md", "Notes/a.md"]);
    expect(visibleMarkdownFiles(app).map((f) => f.path)).toEqual(["Notes/a.md"]);
  });
  it("returns every file when nothing is excluded", () => {
    const app = fakeApp([], ["Notes/a.md", "Notes/b.md"]);
    expect(visibleMarkdownFiles(app)).toHaveLength(2);
  });
});
