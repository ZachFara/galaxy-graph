import { App, Notice, TFile, setIcon } from "obsidian";
import type { GalaxySettings } from "../settings";
import type { GLink, GNode } from "../types";
import { resolveId } from "../types";
import { getNodeColor } from "../utils/colors";
import { visibleMarkdownFiles } from "../utils/excluded";
import { parseTimestamp } from "../utils/dates";
import type { CanvasTheme } from "../utils/theme";

export interface InspectorContext {
  app: App;
  getSettings(): GalaxySettings;
  getGraphData(): { nodes: GNode[]; links: GLink[] };
  getTheme(): CanvasTheme;
}

export interface InspectorPanelActions {
  navigateTo(node: GNode): void;
  clearSelection(): void;
  refreshGraphData(): { nodes: GNode[]; links: GLink[] };
  updateGraphData(data: { nodes: GNode[]; links: GLink[] }): void;
  graphInstance(): { graphData(data: { nodes: GNode[]; links: GLink[] }): unknown } | null;
  rebuildFog(): void;
  rebuildLabels(): void;
}

interface ActivityData {
  monthly: number[];
  cumulative: number[];
  labels: string[];
  totalNotes: number;
  indexName: string;
}

const PREVIEW_CHARS = 200;
const LINK_LIST_MAX = 12;
const NEIGHBOUR_GRAPH_MAX = 20;
const SVG_NS = "http://www.w3.org/2000/svg";

export class InspectorPanel {
  constructor(
    private el: HTMLElement,
    private ctx: InspectorContext,
    private actions: InspectorPanelActions,
  ) {}

  private nodeColor(n: GNode): string {
    return getNodeColor(n, this.ctx.getSettings(), this.ctx.getTheme().isDark);
  }

  show(node: GNode) {
    const panel = this.el;
    panel.empty();

    const graphData = this.ctx.getGraphData();
    const outgoing: GNode[] = [];
    const incoming: GNode[] = [];
    const byId = new Map(graphData.nodes.map((n) => [n.id, n]));

    for (const link of graphData.links) {
      const src = resolveId(link.source);
      const tgt = resolveId(link.target);
      if (src === node.id) {
        const t = byId.get(tgt);
        if (t) outgoing.push(t);
      } else if (tgt === node.id) {
        const s = byId.get(src);
        if (s) incoming.push(s);
      }
    }

    // The selected note's own colour is the panel's one accent.
    panel.style.setProperty("--galaxy-node-color", this.nodeColor(node));

    const header = panel.createDiv({ cls: "galaxy-inspector-header" });
    header.createEl("span", { cls: "galaxy-inspector-title", text: node.name });
    const closeBtn = header.createEl("button", {
      cls: "galaxy-icon-btn",
      attr: { "aria-label": "Close inspector" },
    });
    setIcon(closeBtn, "x");
    closeBtn.onclick = () => {
      this.actions.clearSelection();
      this.hide();
    };

    const stats = panel.createDiv({ cls: "galaxy-inspector-stats" });
    for (const [lbl, v] of [
      ["Out", node.outDegree],
      ["In", node.inDegree],
      ["Total", node.degree],
    ] as [string, number][]) {
      const stat = stats.createEl("span");
      stat.appendText(`${lbl} `);
      stat.createEl("b", { text: String(v) });
    }

    panel.createEl("span", { cls: "galaxy-inspector-badge", text: node.folderName });

    const preview = panel.createDiv({ cls: "galaxy-inspector-preview", text: "Loading preview…" });
    void this.loadPreview(node.filePath).then((previewText) => {
      preview.textContent = previewText || "(empty note)";
    });

    this.renderActions(panel, node);

    if (outgoing.length > 0) this.renderLinkSection(panel, "Links to", outgoing);
    if (incoming.length > 0) this.renderLinkSection(panel, "Linked from", incoming);
    if (!outgoing.length && !incoming.length) {
      panel.createEl("p", { text: "No connections in the current graph.", cls: "galaxy-empty-note" });
    }

    this.renderSparkline(panel, this.buildActivityData(node));
    this.renderNeighborhoodGraph(panel, node, byId);

    panel.addClass("is-visible");
  }

  hide() {
    this.el.removeClass("is-visible");
  }

  private renderActions(panel: HTMLElement, node: GNode) {
    const actions = panel.createDiv({ cls: "galaxy-inspector-actions" });
    const openBtn = actions.createEl("button", { text: "Open note", cls: "mod-cta" });
    openBtn.onclick = () => {
      const file = this.ctx.app.vault.getAbstractFileByPath(node.filePath);
      if (file instanceof TFile) void this.ctx.app.workspace.getLeaf("tab").openFile(file);
    };
    const addNoteBtn = actions.createEl("button", { text: "Add note here" });
    addNoteBtn.setAttribute("aria-label", `Add a note linked to ${node.name}`);
    addNoteBtn.onclick = () => void this.createLinkedNote(node);
  }

  private async createLinkedNote(node: GNode) {
    try {
      const folderPath = node.filePath.includes("/")
        ? node.filePath.substring(0, node.filePath.lastIndexOf("/"))
        : "";
      const timestamp = new Date().toISOString().slice(0, 10);
      const baseName = `Untitled ${timestamp}`;
      let newFileName = folderPath ? `${folderPath}/${baseName}.md` : `${baseName}.md`;
      let suffix = 2;
      while (this.ctx.app.vault.getAbstractFileByPath(newFileName)) {
        newFileName = folderPath ? `${folderPath}/${baseName} ${suffix}.md` : `${baseName} ${suffix}.md`;
        suffix++;
      }
      const content = this.ctx
        .getSettings()
        .noteTemplate.replace(/\{\{date\}\}/g, timestamp)
        .replace(/\{\{index\}\}/g, node.name.replace(/[[\]]/g, ""))
        .replace(/\{\{title\}\}/g, "Untitled")
        .replace(/\{\{folder\}\}/g, folderPath || "vault root");
      const newFile = await this.ctx.app.vault.create(newFileName, content);
      await this.ctx.app.workspace.getLeaf("tab").openFile(newFile);
      new Notice(`Created note in ${folderPath || "vault root"}`);
      const newData = this.actions.refreshGraphData();
      this.actions.updateGraphData(newData);
      this.actions.graphInstance()?.graphData(newData);
      this.actions.rebuildFog();
      this.actions.rebuildLabels();
    } catch (err) {
      new Notice(`Error creating note: ${String(err)}`);
    }
  }

  private renderLinkSection(parent: HTMLElement, heading: string, nodes: GNode[]) {
    parent.createEl("div", { text: heading, cls: "galaxy-section-heading" });
    const list = parent.createEl("ul", { cls: "galaxy-link-list" });
    for (const n of nodes.slice(0, LINK_LIST_MAX)) {
      const a = list.createEl("li").createEl("a", { text: n.name, cls: "galaxy-link-item" });
      a.onclick = (e) => {
        e.preventDefault();
        this.actions.navigateTo(n);
      };
    }
    if (nodes.length > LINK_LIST_MAX) {
      list.createEl("li", { text: `+${nodes.length - LINK_LIST_MAX} more`, cls: "galaxy-link-more" });
    }
  }

  private async loadPreview(filePath: string): Promise<string> {
    const file = this.ctx.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return "";
    try {
      const raw = await this.ctx.app.vault.cachedRead(file);
      const body = raw.replace(/^---[\s\S]*?---\n?/, "").trim();
      const clean = body.replace(/^#{1,6}\s+/gm, "").replace(/[*_`[\]]/g, "");
      return clean.length > PREVIEW_CHARS ? clean.slice(0, PREVIEW_CHARS) + "…" : clean;
    } catch {
      return "";
    }
  }

  private buildActivityData(node: GNode): ActivityData {
    const constellationDates: Date[] = [];
    const clickedIndexName = node.name.replace(/[[\]]/g, "");

    for (const file of visibleMarkdownFiles(this.ctx.app)) {
      const cache = this.ctx.app.metadataCache.getFileCache(file);
      const frontmatterLinks: unknown = cache?.frontmatter?.links ?? [];
      const linksArray: unknown[] = Array.isArray(frontmatterLinks) ? frontmatterLinks : [frontmatterLinks];

      for (const link of linksArray) {
        const clean = String(link).replace(/[[\]]/g, "").split("|")[0].trim();
        if (clean !== clickedIndexName) continue;
        constellationDates.push(new Date(parseTimestamp(cache?.frontmatter?.date, file.stat.ctime)));
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
    const last = constellationDates[constellationDates.length - 1];
    const latest = new Date(last.getFullYear(), last.getMonth(), 1);
    if (constellationDates.every((date) => date < startMonth)) {
      startMonth = earliest;
      endMonth = latest;
    }

    const monthCount = Math.max(
      1,
      (endMonth.getFullYear() - startMonth.getFullYear()) * 12 +
        (endMonth.getMonth() - startMonth.getMonth()) +
        1,
    );
    const monthly: number[] = new Array<number>(monthCount).fill(0);
    const labels = Array.from({ length: monthCount }, (_, i) => {
      const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      return d.toLocaleString("default", { month: "short", year: "2-digit" });
    });

    for (const date of constellationDates) {
      const monthIndex =
        (date.getFullYear() - startMonth.getFullYear()) * 12 + (date.getMonth() - startMonth.getMonth());
      if (monthIndex >= 0 && monthIndex < monthly.length) monthly[monthIndex]++;
    }

    let running = 0;
    const cumulative = monthly.map((count) => {
      running += count;
      return running;
    });

    return { monthly, cumulative, labels, totalNotes, indexName: clickedIndexName };
  }

  private renderSparkline(container: HTMLElement, data: ActivityData) {
    const wrap = container.createDiv({ cls: "galaxy-subpanel" });
    wrap.createEl("div", { text: "Cluster growth", cls: "galaxy-section-heading" });

    if (data.totalNotes === 0) {
      wrap.createEl("div", { text: "No notes link to this note yet.", cls: "galaxy-empty-hint" });
      return;
    }
    if (data.totalNotes < 3 || data.monthly.length < 3) {
      wrap.createEl("div", {
        text: `${data.totalNotes} notes in this cluster`,
        cls: "galaxy-cluster-summary",
      });
      return;
    }

    const width = 250;
    const height = 80;
    const padTop = 8;
    const padRight = 6;
    const padBottom = 18;
    const padLeft = 6;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;
    const maxMonthly = Math.max(...data.monthly, 1);
    const maxCumulative = Math.max(...data.cumulative, 1);
    const step = plotWidth / Math.max(1, data.monthly.length);
    const barWidth = Math.max(3, step - 2);

    const svg = activeDocument.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", `${width}`);
    svg.setAttribute("height", `${height}`);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "galaxy-svg");

    const linePoints: string[] = [];
    data.monthly.forEach((count, i) => {
      const x = padLeft + i * step + (step - barWidth) / 2;
      const barHeight = (count / maxMonthly) * plotHeight;
      const bar = activeDocument.createElementNS(SVG_NS, "rect");
      bar.setAttribute("x", `${x}`);
      bar.setAttribute("y", `${padTop + plotHeight - barHeight}`);
      bar.setAttribute("width", `${barWidth}`);
      bar.setAttribute("height", `${Math.max(0, barHeight)}`);
      bar.setAttribute("fill", "var(--galaxy-node-color)");
      bar.setAttribute("fill-opacity", "0.55");
      svg.appendChild(bar);
      linePoints.push(
        `${padLeft + i * step + step / 2},${padTop + plotHeight - (data.cumulative[i] / maxCumulative) * plotHeight}`,
      );
    });

    const line = activeDocument.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", linePoints.join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);

    const quarterStep = Math.max(1, Math.floor(data.labels.length / 4));
    data.labels.forEach((label, i) => {
      if (i !== 0 && i !== data.labels.length - 1 && i % quarterStep !== 0) return;
      const text = activeDocument.createElementNS(SVG_NS, "text");
      text.textContent = label.split(" ")[0];
      text.setAttribute("x", `${padLeft + i * step + step / 2}`);
      text.setAttribute("y", `${height - 4}`);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "currentColor");
      text.setAttribute("fill-opacity", "0.7");
      text.setAttribute("font-size", "10");
      svg.appendChild(text);
    });

    wrap.appendChild(svg);
    wrap.createEl("div", { cls: "galaxy-note-count", text: `${data.totalNotes} notes in ${data.indexName}` });
  }

  private renderNeighborhoodGraph(container: HTMLElement, centerNode: GNode, byId: Map<string, GNode>) {
    const graphData = this.ctx.getGraphData();
    const neighborIds = new Set<string>();
    for (const link of graphData.links) {
      const src = resolveId(link.source);
      const tgt = resolveId(link.target);
      if (src === centerNode.id) neighborIds.add(tgt);
      else if (tgt === centerNode.id) neighborIds.add(src);
    }
    const neighbors = [...neighborIds].map((id) => byId.get(id)).filter((n): n is GNode => n !== undefined);
    if (neighbors.length === 0) return;

    const wrap = container.createDiv({ cls: "galaxy-subpanel" });
    wrap.createEl("div", {
      text: `Local galaxy · ${neighbors.length} neighbours`,
      cls: "galaxy-section-heading",
    });

    if (neighbors.length > NEIGHBOUR_GRAPH_MAX) {
      this.renderNeighbourList(wrap, neighbors);
      return;
    }
    this.renderNeighbourSvg(wrap, centerNode, neighbors, graphData.links);
  }

  private renderNeighbourList(wrap: HTMLElement, neighbors: GNode[]) {
    const list = wrap.createDiv({ cls: "galaxy-neighbor-list" });
    for (const n of [...neighbors].sort((a, b) => b.degree - a.degree)) {
      const item = list.createDiv({ cls: "galaxy-neighbor-item" });
      item.onclick = () => this.actions.navigateTo(n);
      const dot = item.createEl("span", { cls: "galaxy-neighbor-dot" });
      dot.style.background = this.nodeColor(n);
      item.createEl("span", { text: n.name, cls: "galaxy-neighbor-name" });
      item.createEl("span", { text: `${n.degree} links`, cls: "galaxy-neighbor-degree" });
    }
  }

  private renderNeighbourSvg(wrap: HTMLElement, centerNode: GNode, neighbors: GNode[], links: GLink[]) {
    const W = 250;
    const H = 200;
    const CX = W / 2;
    const CY = H / 2;
    const R = 72;

    const svg = activeDocument.createElementNS(SVG_NS, "svg");
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
    for (const link of links) {
      const src = resolveId(link.source);
      const tgt = resolveId(link.target);
      if (!neighborSet.has(src) || !neighborSet.has(tgt)) continue;
      const sp = positions.get(src);
      const tp = positions.get(tgt);
      if (!sp || !tp) continue;
      const line = activeDocument.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", `${sp.x}`);
      line.setAttribute("y1", `${sp.y}`);
      line.setAttribute("x2", `${tp.x}`);
      line.setAttribute("y2", `${tp.y}`);
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-opacity", "0.2");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);
    }

    for (const n of [centerNode, ...neighbors]) {
      const pos = positions.get(n.id);
      if (!pos) continue;
      const isCenter = n.id === centerNode.id;
      const r = isCenter ? 8 : Math.max(3, Math.min(7, 3 + Math.cbrt(n.val)));
      const circle = activeDocument.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", `${pos.x}`);
      circle.setAttribute("cy", `${pos.y}`);
      circle.setAttribute("r", `${r}`);
      circle.setAttribute("fill", this.nodeColor(n));
      if (!isCenter) circle.onclick = () => this.actions.navigateTo(n);
      svg.appendChild(circle);

      if (!isCenter) {
        const svgText = activeDocument.createElementNS(SVG_NS, "text");
        svgText.textContent = n.name.length > 11 ? n.name.slice(0, 11) + "…" : n.name;
        svgText.setAttribute("x", `${pos.x}`);
        svgText.setAttribute("y", `${pos.y + r + 11}`);
        svgText.setAttribute("text-anchor", "middle");
        svgText.setAttribute("fill", "currentColor");
        svgText.setAttribute("fill-opacity", "0.75");
        svgText.setAttribute("font-size", "10");
        svg.appendChild(svgText);
      }
    }

    wrap.appendChild(svg);
  }
}
