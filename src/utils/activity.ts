import { App, TFile } from "obsidian";
import type { GalaxySettings } from "../settings";
import type { GNode } from "../types";
import { parseTimestamp } from "./dates";

const COLD_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 6 months = fully cold for leaf notes
const HOT_INDEX_COUNT = 8; // notes added in window to reach max heat on index nodes

export function computeActivityHeat(app: App, nodes: GNode[], settings: GalaxySettings): void {
  const now = Date.now();
  const windowMs = settings.activityWindowDays * 24 * 60 * 60 * 1000;

  // Count notes added to each index cluster within the activity window
  const indexCounts = new Map<string, number>();
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const raw: unknown = cache?.frontmatter?.links ?? [];
    const links: unknown[] = Array.isArray(raw) ? raw : [raw];
    const noteTime = parseTimestamp(cache?.frontmatter?.date, file.stat.ctime);
    if (now - noteTime > windowMs) continue;
    for (const link of links) {
      const name = String(link).replace(/[[\]]/g, "").split("|")[0].trim();
      if (name) indexCounts.set(name, (indexCounts.get(name) ?? 0) + 1);
    }
  }

  for (const node of nodes) {
    const file = app.vault.getAbstractFileByPath(node.filePath);
    if (!(file instanceof TFile)) {
      node.activityHeat = 0;
      continue;
    }

    if (node.degree >= settings.indexDegreeThreshold) {
      // Index node: heat = fraction of HOT_INDEX_COUNT reached by recent additions
      const count = indexCounts.get(node.name) ?? 0;
      node.activityHeat = Math.min(1, count / HOT_INDEX_COUNT);
    } else {
      // Leaf note: heat = how recently it was modified
      const age = now - (settings.activityLeafDateField === "ctime" ? file.stat.ctime : file.stat.mtime);
      node.activityHeat = Math.max(0, 1 - age / COLD_AGE_MS);
    }
  }
}
