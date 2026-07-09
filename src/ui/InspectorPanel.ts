import { App, Notice, TFile } from "obsidian";
import type { GalaxySettings } from "../settings";
import type { GLink, GNode } from "../types";
import { resolveId } from "../types";
import { DEFAULT_COLOR, FOLDER_PALETTE, getNodeColor } from "../utils/colors";

export interface InspectorPanelActions {
  updateHighlight(node: GNode): void;
  flyToNode(node: GNode, dist: number, duration: number): void;
  clearHighlight(): void;
  refreshGraphData(): { nodes: GNode[]; links: GLink[] };
  updateGraphData(data: { nodes: GNode[]; links: GLink[] }): void;
  graphInstance(): { graphData(data: { nodes: GNode[]; links: GLink[] }): unknown } | null;
  rebuildFog(): void;
  rebuildLabels(): void;
}

export class InspectorPanel {
  constructor(
    private el: HTMLElement,
    private app: App,
    private getSettings: () => GalaxySettings,
    private getGraphData: () => { nodes: GNode[]; links: GLink[] },
    private actions: InspectorPanelActions,
    private getFlyDist: () => number,
    private flyDurSingle: number,
  ) {}

  show(node: GNode) {
    const panel = this.el;
    panel.empty();

    const graphData = this.getGraphData();
    const outgoing: GNode[] = [];
    const incoming: GNode[] = [];
    const byId = new Map(graphData.nodes.map((n) => [n.id, n]));

    for (const link of graphData.links) {
      const src = resolveId(link.source);
      const tgt = resolveId(link.target);
      if (src === node.id) { const t = byId.get(tgt); if (t) outgoing.push(t); }
      else if (tgt === node.id) { const s = byId.get(src); if (s) incoming.push(s); }
    }

    const fc = FOLDER_PALETTE[node.folder] ?? DEFAULT_COLOR;

    const header = panel.createDiv({ cls: "galaxy-inspector-header" });
    const title = header.createEl("span", { cls: "galaxy-inspector-title" });
    title.style.color = fc;
    title.textContent = node.name;
    const closeBtn = header.createEl("button", { text: "×", cls: "galaxy-inspector-close" });
    closeBtn.onclick = () => { this.actions.clearHighlight(); this.hide(); };

    const stats = panel.createDiv({ cls: "galaxy-inspector-stats" });
    for (const [lbl, v] of [["Out", node.outDegree], ["In", node.inDegree], ["Total", node.degree]] as [string, number][]) {
      const stat = stats.createEl("span");
      stat.createSpan({ text: `${lbl}:`, cls: "galaxy-stat-label" });
      stat.appendText(` ${v}`);
    }

    const badge = panel.createEl("span", { cls: "galaxy-inspector-badge" });
    badge.style.color = fc;
    badge.style.border = `1px solid ${fc}44`;
    badge.textContent = node.folderName;

    const preview = panel.createDiv({ cls: "galaxy-inspector-preview" });
    preview.textContent = "Loading preview…";
    void this.loadPreview(node.filePath).then((previewText) => {
      preview.textContent = previewText || "(empty)";
      if (!previewText) preview.addClass("is-plain");
    });

    const openBtn = panel.createEl("button", { text: "Open note →", cls: "galaxy-open-btn" });
    openBtn.onclick = () => {
      const file = this.app.vault.getAbstractFileByPath(node.filePath);
      if (file instanceof TFile) void this.app.workspace.getLeaf("tab").openFile(file);
    };

    const truncTitle = node.name.length > 20 ? node.name.slice(0, 20) + "…" : node.name;
    const addNoteBtn = panel.createEl("button", { text: `+ Add note to ${truncTitle}`, cls: "galaxy-add-btn" });
    addNoteBtn.onclick = async () => {
      try {
        const folderPath = node.filePath.includes("/") ? node.filePath.substring(0, node.filePath.lastIndexOf("/")) : "";
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 10);
        const baseName = `Untitled ${timestamp}`;
        let newFileName = folderPath ? `${folderPath}/${baseName}.md` : `${baseName}.md`;
        let suffix = 2;
        while (this.app.vault.getAbstractFileByPath(newFileName)) {
          newFileName = folderPath ? `${folderPath}/${baseName} ${suffix}.md` : `${baseName} ${suffix}.md`;
          suffix++;
        }
        const tpl = this.getSettings().noteTemplate;
        const content = tpl
          .replace(/\{\{date\}\}/g, timestamp)
          .replace(/\{\{index\}\}/g, node.name.replace(/[[\]]/g, ""))
          .replace(/\{\{title\}\}/g, "Untitled")
          .replace(/\{\{folder\}\}/g, folderPath || "vault root");
        const newFile = await this.app.vault.create(newFileName, content);
        const newLeaf = this.app.workspace.getLeaf("tab");
        await newLeaf.openFile(newFile);
        new Notice(`Created note in ${folderPath || "vault root"}`);
        const newData = this.actions.refreshGraphData();
        this.actions.updateGraphData(newData);
        this.actions.graphInstance()?.graphData(newData);
        this.actions.rebuildFog();
        this.actions.rebuildLabels();
      } catch (err) {
        new Notice(`Error creating note: ${String(err)}`);
      }
    };

    if (outgoing.length > 0) this.renderLinkSection(panel, "Links to", outgoing, "galaxy-link-item--out");
    if (incoming.length > 0) this.renderLinkSection(panel, "Linked from", incoming, "galaxy-link-item--in");
    if (!outgoing.length && !incoming.length) {
      panel.createEl("p", { text: "No connections in the current graph.", cls: "galaxy-empty-note" });
    }

    this.renderSparkline(panel, node, this.buildActivityData(node));
    this.renderNeighborhoodGraph(panel, node, byId);

    panel.addClass("is-visible");
  }

  hide() {
    this.el.removeClass("is-visible");
  }

  private renderLinkSection(parent: HTMLElement, heading: string, nodes: GNode[], colorCls: string) {
    parent.createEl("div", { text: heading, cls: "galaxy-section-heading" });

    const list = parent.createEl("ul", { cls: "galaxy-link-list" });
    const MAX = 12;
    for (const n of nodes.slice(0, MAX)) {
      const a = list.createEl("li").createEl("a", { text: n.name, cls: `galaxy-link-item ${colorCls}` });
      a.onclick = (e) => {
        e.preventDefault();
        this.actions.updateHighlight(n);
        this.show(n);
        this.actions.flyToNode(n, this.getFlyDist(), this.flyDurSingle);
      };
    }
    if (nodes.length > MAX) {
      list.createEl("li", { text: `+${nodes.length - MAX} more`, cls: "galaxy-link-more" });
    }
  }

  private async loadPreview(filePath: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return "";
    try {
      const raw = await this.app.vault.cachedRead(file);
      const body = raw.replace(/^---[\s\S]*?---\n?/, "").trim();
      const clean = body.replace(/^#{1,6}\s+/gm, "").replace(/[*_`[\]]/g, "");
      return clean.length > 200 ? clean.slice(0, 200) + "…" : clean;
    } catch {
      return "";
    }
  }

  private buildActivityData(node: GNode): {
    monthly: number[];
    cumulative: number[];
    labels: string[];
    totalNotes: number;
    indexName: string;
  } {
    const constellationDates: Date[] = [];
    const clickedIndexName = node.name.replace(/[[\]]/g, "");

    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatterLinks: unknown = cache?.frontmatter?.links ?? [];
      const linksArray: unknown[] = Array.isArray(frontmatterLinks) ? frontmatterLinks : [frontmatterLinks];

      for (const link of linksArray) {
        const clean = String(link).replace(/[[\]]/g, "").split("|")[0].trim();
        if (clean !== clickedIndexName) continue;

        const rawDate: unknown = cache?.frontmatter?.date;
        const parsedDate = rawDate ? new Date(String(rawDate)) : new Date(file.stat.ctime);
        constellationDates.push(isNaN(parsedDate.getTime()) ? new Date(file.stat.ctime) : parsedDate);
        break;
      }
    }

    const totalNotes = constellationDates.length;
    if (totalNotes === 0) {
      return { monthly: [], cumulative: [], labels: [], totalNotes, indexName: clickedIndexName };
    }

    constellationDates.sort((a, b) => a.getTime() - b.getTime());

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let startMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 11, 1);
    let endMonth = currentMonth;
    const earliest = new Date(constellationDates[0].getFullYear(), constellationDates[0].getMonth(), 1);
    const latest = new Date(constellationDates[constellationDates.length - 1].getFullYear(), constellationDates[constellationDates.length - 1].getMonth(), 1);
    if (constellationDates.every((date) => date < startMonth)) {
      startMonth = earliest;
      endMonth = latest;
    }

    const monthCount = Math.max(
      1,
      (endMonth.getFullYear() - startMonth.getFullYear()) * 12 + (endMonth.getMonth() - startMonth.getMonth()) + 1
    );
    const monthly = new Array(monthCount).fill(0);
    const labels = new Array(monthCount).fill("").map((_, i) => {
      const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      return d.toLocaleString("default", { month: "short", year: "2-digit" });
    });

    for (const date of constellationDates) {
      const monthIndex = (date.getFullYear() - startMonth.getFullYear()) * 12 + (date.getMonth() - startMonth.getMonth());
      if (monthIndex >= 0 && monthIndex < monthly.length) monthly[monthIndex]++;
    }

    let running = 0;
    const cumulative = monthly.map((count) => {
      running += count;
      return running;
    });

    return { monthly, cumulative, labels, totalNotes, indexName: clickedIndexName };
  }

  private renderSparkline(container: HTMLElement, node: GNode, data: {
    monthly: number[];
    cumulative: number[];
    labels: string[];
    totalNotes: number;
    indexName: string;
  }) {
    const wrap = container.createDiv({ cls: "galaxy-subpanel" });

    wrap.createEl("div", { text: "Cluster growth · date field", cls: "galaxy-section-heading" });

    if (data.totalNotes === 0) {
      wrap.createEl("div", { text: "No notes link to this index yet", cls: "galaxy-empty-hint" });
      return;
    }

    if (data.totalNotes < 3 || data.monthly.length < 3) {
      wrap.createEl("div", { text: `${data.totalNotes} notes in this cluster`, cls: "galaxy-cluster-summary" });
      return;
    }

    const NS = "http://www.w3.org/2000/svg";
    const width = 220;
    const height = 80;
    const padTop = 10;
    const padRight = 10;
    const padBottom = 20;
    const padLeft = 10;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;
    const maxMonthly = Math.max(...data.monthly, 1);
    const maxCumulative = Math.max(...data.cumulative, 1);
    const step = plotWidth / Math.max(1, data.monthly.length);
    const barWidth = Math.max(3, step - 2);
    const color = getNodeColor(node, this.getSettings());

    const svg = activeDocument.createElementNS(NS, "svg");
    svg.setAttribute("width", `${width}`);
    svg.setAttribute("height", `${height}`);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "galaxy-svg");

    const axis = activeDocument.createElementNS(NS, "line");
    axis.setAttribute("x1", `${padLeft}`);
    axis.setAttribute("y1", `${padTop + plotHeight}`);
    axis.setAttribute("x2", `${width - padRight}`);
    axis.setAttribute("y2", `${padTop + plotHeight}`);
    axis.setAttribute("stroke", "currentColor");
    axis.setAttribute("stroke-opacity", "0.18");
    axis.setAttribute("stroke-width", "1");
    svg.appendChild(axis);

    const linePoints: string[] = [];
    data.monthly.forEach((count, i) => {
      const x = padLeft + i * step + (step - barWidth) / 2;
      const barHeight = (count / maxMonthly) * plotHeight;
      const y = padTop + plotHeight - barHeight;
      const bar = activeDocument.createElementNS(NS, "rect");
      bar.setAttribute("x", `${x}`);
      bar.setAttribute("y", `${y}`);
      bar.setAttribute("width", `${barWidth}`);
      bar.setAttribute("height", `${Math.max(0, barHeight)}`);
      bar.setAttribute("rx", "1.5");
      bar.setAttribute("fill", color);
      bar.setAttribute("fill-opacity", "0.6");
      svg.appendChild(bar);

      const lineX = padLeft + i * step + step / 2;
      const lineY = padTop + plotHeight - (data.cumulative[i] / maxCumulative) * plotHeight;
      linePoints.push(`${lineX},${lineY}`);
    });

    const line = activeDocument.createElementNS(NS, "polyline");
    line.setAttribute("points", linePoints.join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);

    data.cumulative.forEach((value, i) => {
      const cx = padLeft + i * step + step / 2;
      const cy = padTop + plotHeight - (value / maxCumulative) * plotHeight;
      const dot = activeDocument.createElementNS(NS, "circle");
      dot.setAttribute("cx", `${cx}`);
      dot.setAttribute("cy", `${cy}`);
      dot.setAttribute("r", "1.8");
      dot.setAttribute("fill", "currentColor");
      svg.appendChild(dot);
    });

    const quarterStep = Math.max(1, Math.floor(data.labels.length / 4));
    data.labels.forEach((label, i) => {
      if (i !== 0 && i !== data.labels.length - 1 && i % quarterStep !== 0) return;
      const x = padLeft + i * step + step / 2;
      const text = activeDocument.createElementNS(NS, "text");
      text.textContent = label.split(" ")[0];
      text.setAttribute("x", `${x}`);
      text.setAttribute("y", `${height - 6}`);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "currentColor");
      text.setAttribute("fill-opacity", "0.65");
      text.setAttribute("font-size", "8");
      svg.appendChild(text);
    });

    wrap.appendChild(svg);

    const sub = wrap.createEl("div", { cls: "galaxy-note-count" });
    sub.style.color = color;
    sub.textContent = `${data.totalNotes} total notes in ${data.indexName}`;
  }

  private renderNeighborhoodGraph(container: HTMLElement, centerNode: GNode, byId: Map<string, GNode>) {
    const wrap = container.createDiv({ cls: "galaxy-subpanel" });

    const heading = wrap.createEl("div", { text: "Local galaxy", cls: "galaxy-section-heading" });

    const graphData = this.getGraphData();
    const neighborIds = new Set<string>();
    for (const link of graphData.links) {
      const src = resolveId(link.source);
      const tgt = resolveId(link.target);
      if (src === centerNode.id) neighborIds.add(tgt);
      else if (tgt === centerNode.id) neighborIds.add(src);
    }
    const neighbors = [...neighborIds].map((id) => byId.get(id)).filter(Boolean) as GNode[];

    if (neighbors.length === 0) return;

    if (neighbors.length > 20) {
      heading.textContent = `Local galaxy (${neighbors.length} neighbors)`;
      const sorted = [...neighbors].sort((a, b) => b.degree - a.degree);
      const list = wrap.createDiv({ cls: "galaxy-neighbor-list" });
      for (const n of sorted) {
        const item = list.createDiv({ cls: "galaxy-neighbor-item" });
        item.onclick = () => {
          this.actions.updateHighlight(n);
          this.show(n);
          this.actions.flyToNode(n, this.getFlyDist(), this.flyDurSingle);
        };
        const dot = item.createEl("span", { cls: "galaxy-neighbor-dot" });
        dot.style.background = getNodeColor(n, this.getSettings());
        item.createEl("span", { text: n.name, cls: "galaxy-neighbor-name" });
        item.createEl("span", { text: `${n.degree} links`, cls: "galaxy-neighbor-degree" });
      }
      wrap.appendChild(list);
      return;
    }

    const W = 200, H = 200, CX = 100, CY = 100, R = 70;
    const NS = "http://www.w3.org/2000/svg";

    const svg = activeDocument.createElementNS(NS, "svg");
    svg.setAttribute("width", `${W}`);
    svg.setAttribute("height", `${H}`);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "galaxy-svg galaxy-svg--clickable");

    const positions = new Map<string, { x: number; y: number }>();
    positions.set(centerNode.id, { x: CX, y: CY });
    neighbors.forEach((n, i) => {
      const a = (i / neighbors.length) * Math.PI * 2 - Math.PI / 2;
      positions.set(n.id, { x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R });
    });

    const neighborSet = new Set(neighbors.map((n) => n.id));
    neighborSet.add(centerNode.id);
    for (const link of graphData.links) {
      const src = resolveId(link.source);
      const tgt = resolveId(link.target);
      if (!neighborSet.has(src) || !neighborSet.has(tgt)) continue;
      const sp = positions.get(src);
      const tp = positions.get(tgt);
      if (!sp || !tp) continue;
      const line = activeDocument.createElementNS(NS, "line");
      line.setAttribute("x1", `${sp.x}`);
      line.setAttribute("y1", `${sp.y}`);
      line.setAttribute("x2", `${tp.x}`);
      line.setAttribute("y2", `${tp.y}`);
      line.setAttribute("stroke", "rgba(120,160,220,0.25)");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
    }

    const allNodes = [centerNode, ...neighbors];
    for (const n of allNodes) {
      const pos = positions.get(n.id);
      if (!pos) continue;
      const isCenter = n.id === centerNode.id;
      const r = isCenter ? 8 : Math.max(3, Math.min(7, 3 + Math.sqrt(n.val)));
      const color = getNodeColor(n, this.getSettings());

      const glow = activeDocument.createElementNS(NS, "circle");
      glow.setAttribute("cx", `${pos.x}`);
      glow.setAttribute("cy", `${pos.y}`);
      glow.setAttribute("r", `${r + 3}`);
      glow.setAttribute("fill", color);
      glow.setAttribute("fill-opacity", "0.12");
      svg.appendChild(glow);

      const circle = activeDocument.createElementNS(NS, "circle");
      circle.setAttribute("cx", `${pos.x}`);
      circle.setAttribute("cy", `${pos.y}`);
      circle.setAttribute("r", `${r}`);
      circle.setAttribute("fill", color);
      circle.setAttribute("fill-opacity", isCenter ? "1.0" : "0.85");
      if (!isCenter) {
        circle.onclick = () => {
          this.actions.updateHighlight(n);
          this.show(n);
          this.actions.flyToNode(n, this.getFlyDist(), this.flyDurSingle);
        };
      }
      svg.appendChild(circle);

      if (!isCenter) {
        const svgText = activeDocument.createElementNS(NS, "text");
        const trimmed = n.name.length > 9 ? n.name.slice(0, 9) + "…" : n.name;
        svgText.textContent = trimmed;
        svgText.setAttribute("x", `${pos.x}`);
        svgText.setAttribute("y", `${pos.y + r + 9}`);
        svgText.setAttribute("text-anchor", "middle");
        svgText.setAttribute("fill", "currentColor");
        svgText.setAttribute("fill-opacity", "0.65");
        svgText.setAttribute("font-size", "7");
        svg.appendChild(svgText);
      }
    }

    wrap.appendChild(svg);
  }
}
