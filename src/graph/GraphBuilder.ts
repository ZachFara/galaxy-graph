import type { App } from "obsidian";
import type { GLink, GNode } from "../types";
import { DEFAULT_COLOR, FOLDER_PALETTE } from "../utils/colors";

export function topLevelKey(filePath: string): string {
  const slash = filePath.indexOf("/");
  if (slash === -1) return "root";
  const match = /^(\d+)/.exec(filePath.slice(0, slash));
  return match ? match[1] : "root";
}

// Human-readable label for a note's top-level folder, e.g. "1 - Full Notes" -> "Full Notes".
// Falls back to the raw folder name for vaults that don't use a numeric prefix convention.
function topLevelFolderName(filePath: string): string {
  const slash = filePath.indexOf("/");
  if (slash === -1) return "Root";
  return filePath.slice(0, slash).replace(/^\d+\s*-\s*/, "");
}

export function buildGraphData(app: App): { nodes: GNode[]; links: GLink[] } {
  const { vault, metadataCache } = app;
  const files = vault.getMarkdownFiles();
  const fileSet = new Set(files.map((f) => f.path));

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const f of files) {
    inDeg.set(f.path, 0);
    outDeg.set(f.path, 0);
  }

  const links: GLink[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const cache = metadataCache.getFileCache(file);
    if (!cache) continue;

    const rawLinks: string[] = [];
    for (const l of cache.links ?? []) rawLinks.push(l.link);
    for (const l of cache.frontmatterLinks ?? []) rawLinks.push(l.link);

    for (const linkStr of rawLinks) {
      const resolved = metadataCache.getFirstLinkpathDest(linkStr, file.path);
      if (!resolved || !fileSet.has(resolved.path)) continue;
      if (resolved.path === file.path) continue;

      const key = `${file.path}\x00${resolved.path}`;
      if (seen.has(key)) continue;
      seen.add(key);

      links.push({ source: file.path, target: resolved.path });
      outDeg.set(file.path, (outDeg.get(file.path) ?? 0) + 1);
      inDeg.set(resolved.path, (inDeg.get(resolved.path) ?? 0) + 1);
    }
  }

  const nodes: GNode[] = files.map((f) => {
    const out = outDeg.get(f.path) ?? 0;
    const inp = inDeg.get(f.path) ?? 0;
    const deg = out + inp;
    const folder = topLevelKey(f.path);
    const rawTags: unknown = metadataCache.getFileCache(f)?.frontmatter?.tags ?? [];
    const tagList: unknown[] = Array.isArray(rawTags) ? rawTags : [rawTags];
    return {
      id: f.path,
      name: f.basename,
      val: Math.max(1, deg),
      color: FOLDER_PALETTE[folder] ?? DEFAULT_COLOR,
      folder,
      folderName: topLevelFolderName(f.path),
      filePath: f.path,
      degree: deg,
      outDegree: out,
      inDegree: inp,
      tags: tagList.map((t) => String(t).replace(/^#/, "")),
    };
  });

  return { nodes, links };
}
