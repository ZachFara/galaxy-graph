import type { App, TFile } from "obsidian";

// Obsidian's "Files and links > Excluded files" setting. Notes matching it are
// hidden from the core graph, search and backlinks; Galaxy Graph should hide
// them too. getConfig is not in the public typings but has been stable for years.
export function excludedFilters(app: App): string[] {
  const cfg = (app.vault as unknown as { getConfig?: (k: string) => unknown }).getConfig?.(
    "userIgnoreFilters",
  );
  return Array.isArray(cfg) ? cfg.filter((f): f is string => typeof f === "string" && f.length > 0) : [];
}

export function isExcluded(path: string, filters: string[]): boolean {
  for (const f of filters) {
    if (f.startsWith("/") && f.endsWith("/") && f.length > 2) {
      try {
        if (new RegExp(f.slice(1, -1)).test(path)) return true;
      } catch {
        /* bad regex, skip */
      }
    } else if (path === f || path.startsWith(f.endsWith("/") ? f : f + "/") || path.startsWith(f)) {
      return true;
    }
  }
  return false;
}

// vault.getMarkdownFiles() minus the excluded ones.
export function visibleMarkdownFiles(app: App): TFile[] {
  const filters = excludedFilters(app);
  const files = app.vault.getMarkdownFiles();
  return filters.length ? files.filter((f) => !isExcluded(f.path, filters)) : files;
}
