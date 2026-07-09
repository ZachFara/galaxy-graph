import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
// three.js and 3d-force-graph are the bulk of this plugin's bundle size.
// They're dynamically imported in onOpen() instead of statically here, so their
// (expensive) module evaluation only happens when the Galaxy Graph view is actually
// opened, rather than on every Obsidian startup for every user who has the plugin enabled.
import type * as THREE from "three";
import type { ForceGraph3DInstance } from "3d-force-graph";
import { buildGraphData } from "./graph/GraphBuilder";
import type { GalaxySettings } from "./settings";
import type { FogManager } from "./scene/FogManager";
import { computeActivityHeat } from "./utils/activity";
import type { GLink, GNode } from "./types";
import { resolveId } from "./types";
import { DIM_NODE, getNodeColor } from "./utils/colors";
import { InspectorPanel } from "./ui/InspectorPanel";
import { buildSettingsPanel } from "./ui/SettingsPanel";

export const VIEW_TYPE_GALAXY = "galaxy-graph";
const MAX_NODES_WARN = 2000;
const DOUBLE_CLICK_MS = 280;
const FLY_DIST_DOUBLE = 150;
const FLY_DUR_SINGLE = 800;
const FLY_DUR_DOUBLE = 600;
const FLY_DUR_RESET = 1500;
const ROT_RAD_PER_MS = (2 * Math.PI) / (5 * 60 * 1000);
const SPAWN_ANIMATION_MS = 400;

interface GalaxyPluginLike {
  settings: GalaxySettings;
  saveSettings(): Promise<void>;
}

interface SpawnAnimationState {
  node: GNode;
  targetVal: number;
  startTime: number;
}

type GalaxyGraph = ForceGraph3DInstance<GNode, GLink>;
type GalaxyGraphCtor = new (
  el: HTMLElement,
  config?: { controlType?: "trackball" | "orbit" | "fly" },
) => GalaxyGraph;

// d3 forces expose chainable config methods the ForceFn type doesn't surface.
interface ForceLike {
  (alpha: number): void;
  strength?: (v: number) => ForceLike;
  distance?: (v: number) => ForceLike;
}

export class GalaxyView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: GalaxyPluginLike) {
    super(leaf);
  }

  private graph: GalaxyGraph | null = null;
  private graphData: { nodes: GNode[]; links: GLink[] } = { nodes: [], links: [] };
  private fullGraphData: { nodes: GNode[]; links: GLink[] } = { nodes: [], links: [] };
  private highlightNodes = new Set<string>();
  private highlightLinks = new Set<GLink>();
  private selectedNode: GNode | null = null;
  private lastClickTime = 0;
  private lastClickedNodeId: string | null = null;
  private inspectorEl: HTMLElement | null = null;
  private inspectorPanel: InspectorPanel | null = null;
  private graphContainer: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private themeAccent = "#7c5cbf";
  private themeBg = "#000b1a";
  private autoRotating = true;
  private rotationFrameId: number | null = null;
  private rotateBtnEl: HTMLElement | null = null;
  private showOrphans = true;
  private orphanBtnEl: HTMLElement | null = null;
  private hudGroup: THREE.Group | null = null;
  private gridGroup: THREE.Group | null = null;
  private fogManager: FogManager | null = null;
  private settingsPanelEl: HTMLElement | null = null;
  private savedEl: HTMLElement | null = null;
  private isDragging = false;
  private tabVisible = true;
  private timelineActive = false;
  private timelineBtnEl: HTMLElement | null = null;
  private timelineVisibleSet: Set<string> = new Set();
  private timelineSpeed = 1;
  private timelineDateEl: HTMLElement | null = null;
  private timelineSpeedBar: HTMLElement | null = null;
  private timelineTimeoutId: number | null = null;
  private labelOverlayEl: HTMLElement | null = null;
  private topLabelNodes: GNode[] = [];
  private starsObject: THREE.Points | null = null;
  private spawnAnimations = new Map<string, SpawnAnimationState>();
  private spawnAnimationFrameId: number | null = null;

  // Populated once the lazily-loaded three.js / 3d-force-graph modules resolve (see onOpen).
  private THREE: typeof import("three") | null = null;
  private ForceGraph3DCtor: GalaxyGraphCtor | null = null;
  private FogManagerCtor: (new (scene: THREE.Scene) => FogManager) | null = null;
  private sphereGridMod: typeof import("./scene/SphereGrid") | null = null;

  getViewType() { return VIEW_TYPE_GALAXY; }
  getDisplayText() { return "Galaxy Graph"; }
  getIcon() { return "share-2"; }

  async onOpen() {
    // Kick off the heavy three.js / 3d-force-graph module loads immediately, in parallel
    // with the synchronous DOM and graph-data setup below — they're only awaited right
    // before they're actually needed (initGraph).
    const depsPromise = Promise.all([
      import("three"),
      import("3d-force-graph"),
      import("./scene/FogManager"),
      import("./scene/SphereGrid"),
    ]);

    const style = activeWindow.getComputedStyle(activeDocument.body);
    const cssVar = (v: string, fb: string) => style.getPropertyValue(v).trim() || fb;
    this.themeAccent = cssVar("--interactive-accent", "#7c5cbf");
    this.themeBg = cssVar("--background-primary", "#000b1a");

    const root = this.contentEl;
    root.empty();
    root.addClass("galaxy-view-root");

    this.graphContainer = root.createDiv({ cls: "galaxy-canvas" });

    this.labelOverlayEl = root.createDiv();
    this.labelOverlayEl.id = "galaxy-labels-overlay";
    this.labelOverlayEl.className = "galaxy-labels-overlay";

    const bar = root.createDiv({ cls: "galaxy-topbar" });

    const btn = (text: string) => bar.createEl("button", { text, cls: "galaxy-topbar-btn" });

    btn("Reset view").onclick = () => this.resetView();

    this.rotateBtnEl = btn("Rotate: ON");
    this.rotateBtnEl.onclick = () => this.toggleRotation();

    this.orphanBtnEl = btn("Orphans: ON");
    this.orphanBtnEl.onclick = () => this.toggleOrphans();

    const gearBtn = btn("⚙");
    gearBtn.title = "Settings";
    gearBtn.onclick = () => this.openSettingsPanel();

    this.timelineBtnEl = btn("Timeline: OFF");
    this.timelineBtnEl.onclick = () => this.toggleTimeline();

    this.timelineSpeedBar = bar.createDiv({ cls: "galaxy-timeline-speedbar" });
    for (const spd of [0.5, 1, 2, 4]) {
      const sBtn = this.timelineSpeedBar.createEl("button", {
        text: `${spd}x`,
        cls: "galaxy-topbar-btn galaxy-topbar-btn--small",
      });
      sBtn.onclick = () => {
        this.timelineSpeed = spd;
        if (this.timelineActive) {
          this.stopTimeline();
          this.startTimeline();
        }
      };
    }

    this.timelineDateEl = bar.createEl("span", { cls: "galaxy-timeline-date" });

    const countLabel = bar.createEl("span", { cls: "galaxy-count-label" });

    this.settingsPanelEl = root.createDiv({ cls: "galaxy-settings-panel" });
    buildSettingsPanel(this.settingsPanelEl, this.plugin, this.app, {
      closeSettingsPanel: () => this.closeSettingsPanel(),
      refreshNodeColors: () => this.refreshNodeColors(),
      refreshLinkColors: () => this.refreshLinkColors(),
      rebuildFog: () => this.rebuildFog(),
      rebuildLabels: () => this.rebuildLabels(),
      refreshSparklineIfSelected: () => this.refreshSparklineIfSelected(),
      updateGridOpacities: () => this.updateGridOpacities(),
      toggleStars: (enabled) => this.toggleStars(enabled),
      rebuildStars: () => this.rebuildStars(),
      refreshForces: () => this.refreshForces(),
      recomputeActivityHeat: () => this.recomputeActivityHeat(),
      flashSaved: () => this.flashSaved(),
      setSavedEl: (el) => { this.savedEl = el; },
    });

    this.inspectorEl = root.createDiv({ cls: "galaxy-inspector" });

    this.inspectorPanel = new InspectorPanel(
      this.inspectorEl,
      this.app,
      () => this.plugin.settings,
      () => this.graphData,
      {
        updateHighlight: (node) => this.updateHighlight(node),
        flyToNode: (node, dist, duration) => this.flyToNode(node, dist, duration),
        clearHighlight: () => this.clearHighlight(),
        refreshGraphData: () => buildGraphData(this.app),
        updateGraphData: (data) => {
          this.graphData = data;
          this.fullGraphData = data;
        },
        graphInstance: () => this.graph,
        rebuildFog: () => this.rebuildFog(),
        rebuildLabels: () => this.rebuildLabels(),
      },
      () => this.plugin.settings.clickFlyDistance,
      FLY_DUR_SINGLE,
    );

    const data = buildGraphData(this.app);
    this.graphData = data;
    this.fullGraphData = data;
    if (this.plugin.settings.colorBy === 'activity') {
      computeActivityHeat(this.app, data.nodes, this.plugin.settings);
    }

    const orphanCount = data.nodes.filter((n) => n.degree === 0).length;
    countLabel.textContent =
      `${data.nodes.length} notes · ${data.links.length} links` +
      (orphanCount ? ` · ${orphanCount} orphans` : "");

    this.registerDomEvent(activeDocument, "keydown", (evt: KeyboardEvent) => {
      if (evt.key === "Escape" && this.selectedNode !== null) {
        evt.stopPropagation();
        evt.preventDefault();
        this.resetView();
      }
    }, { capture: true });

    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      this.tabVisible = leaf === this.leaf;
      if (this.graph) {
        if (this.tabVisible) this.graph.resumeAnimation();
        else this.graph.pauseAnimation();
      }
    }));

    if (data.nodes.length > MAX_NODES_WARN) {
      new Notice(`Galaxy Graph: ${data.nodes.length} nodes detected. Rendering may be slow.`, 6000);
    }

    const [threeMod, forceGraphMod, fogManagerMod, sphereGridMod] = await depsPromise;
    this.THREE = threeMod;
    this.ForceGraph3DCtor = forceGraphMod.default as GalaxyGraphCtor;
    this.FogManagerCtor = fogManagerMod.FogManager;
    this.sphereGridMod = sphereGridMod;

    window.setTimeout(() => {
      this.initGraph();
      this.graph?.d3AlphaDecay(0.02);
      const renderer = this.graph?.renderer();
      if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      const scene = this.graph?.scene() ?? null;
      if (scene) {
        this.hudGroup = this.sphereGridMod!.buildHUDSphere(scene);
        this.fogManager = new this.FogManagerCtor!(scene);
        if (this.plugin.settings.showStars) {
          const s = this.plugin.settings;
          this.starsObject = this.sphereGridMod!.buildStarfield(scene, 800, s.starCount, s.starSize, s.starBrightness);
        }
      }
      this.startRotationLoop();
      this.attachResizeObserver();
      window.setTimeout(() => {
        if (this.graph) {
          const sceneNow = this.graph.scene();
          if (sceneNow) {
            this.gridGroup = this.sphereGridMod!.buildGridSphere(sceneNow, this.graphData.nodes, this.gridGroup);
            this.updateGridOpacities();
          }
          this.rebuildFog();
          this.rebuildLabels();
        }
      }, 3000);
    }, 50);
  }

  async onClose() {
    this.resizeObserver?.disconnect();

    if (this.rotationFrameId !== null) {
      window.cancelAnimationFrame(this.rotationFrameId);
      this.rotationFrameId = null;
    }

    if (this.timelineTimeoutId !== null) {
      window.clearTimeout(this.timelineTimeoutId);
      this.timelineTimeoutId = null;
    }

    if (this.spawnAnimationFrameId !== null) {
      window.cancelAnimationFrame(this.spawnAnimationFrameId);
      this.spawnAnimationFrameId = null;
    }

    this.spawnAnimations.clear();
    this.labelOverlayEl?.empty();

    if (this.graph) {
      const scene = this.graph.scene() ?? null;
      this.sphereGridMod?.disposeGroup(scene, this.hudGroup);
      this.hudGroup = null;
      this.sphereGridMod?.disposeGroup(scene, this.gridGroup);
      this.gridGroup = null;
      if (scene && this.starsObject) {
        scene.remove(this.starsObject);
        this.starsObject.geometry.dispose();
        (this.starsObject.material as THREE.Material).dispose();
        this.starsObject = null;
      }
      this.fogManager?.dispose();
      this.fogManager = null;
      try { this.graph.pauseAnimation(); } catch { /* renderer already torn down */ }
      this.graph = null;
    }
  }

  private initGraph() {
    if (!this.graphContainer) return;
    const w = this.graphContainer.clientWidth || 800;
    const h = this.graphContainer.clientHeight || 600;

    const hlNodes = this.highlightNodes;
    const hlLinks = this.highlightLinks;
    const accent = this.themeAccent;

    const GraphCtor = this.ForceGraph3DCtor!;
    this.graph = new GraphCtor(this.graphContainer, { controlType: "orbit" })
      .width(w).height(h)
      .backgroundColor(this.themeBg)
      .graphData(this.graphData)
      .nodeId("id").nodeLabel("name")
      .nodeVal((n: GNode) => this.getAnimatedNodeVal(n))
      .nodeRelSize(5).nodeOpacity(0.92).nodeResolution(16)
      .nodeColor((n: GNode) => {
        if (hlNodes.size === 0) return getNodeColor(n, this.plugin.settings);
        return hlNodes.has(n.id) ? accent : DIM_NODE;
      })
      .linkColor((l: GLink) => {
        if (hlLinks.size === 0) return this.linkNormal();
        return hlLinks.has(l) ? this.linkHighlight() : this.linkDim();
      })
      .linkWidth((l: GLink) => (hlLinks.has(l) ? 1.8 : 0.5))
      .linkOpacity(1.0)
      .linkDirectionalArrowLength(0)
      .onNodeClick((n: GNode, ev: MouseEvent) => this.handleNodeClick(n, ev))
      .onNodeDrag((n: GNode) => {
        this.isDragging = true;
        const sprite = this.fogManager?.fogNodeMap.get(n.id);
        if (sprite && n.x != null && n.y != null && n.z != null) {
          sprite.position.set(n.x, n.y, n.z);
        }
      })
      .onNodeDragEnd((n: GNode) => {
        const sprite = this.fogManager?.fogNodeMap.get(n.id);
        if (sprite && n.x != null && n.y != null && n.z != null) {
          sprite.position.set(n.x, n.y, n.z);
        }
        window.setTimeout(() => {
          this.isDragging = false;
        }, 1000);
      })
      .onBackgroundClick(() => this.resetView());

    // 3d-force-graph kicks off its internal render loop synchronously on construction (via
    // requestAnimationFrame), but the physics-engine setup triggered by .graphData() above is
    // processed on an internal debounced (1ms) timer. Under main-thread contention — e.g.
    // another plugin doing heavy synchronous work at the same moment — the render loop's next
    // animation frame can fire before that debounce resolves, crashing on the not-yet-created
    // engine ("Cannot read properties of undefined (reading 'tick')"). Pausing immediately and
    // resuming after a delay comfortably longer than the internal debounce avoids the race:
    // both are setTimeout-based, so their relative firing order is preserved even if the main
    // thread is busy for a while, unlike the original setTimeout-vs-requestAnimationFrame race.
    this.graph.pauseAnimation();
    window.setTimeout(() => this.graph?.resumeAnimation(), 50);

    this.refreshForces();
    this.graph.cameraPosition({ x: 0, y: 0, z: 1400 });
  }

  private startRotationLoop() {
    let lastMs = performance.now();

    const tick = (nowMs: number) => {
      this.rotationFrameId = window.requestAnimationFrame(tick);

      if (!this.graph || !this.tabVisible) {
        lastMs = nowMs;
        return;
      }

      const dt = Math.min(nowMs - lastMs, 100);
      lastMs = nowMs;

      if (this.autoRotating && !this.isDragging) {
        const camera = this.graph.camera();
        const controls = this.graph.controls() as { target?: { x?: number; z?: number } } | null;
        if (camera && controls) {
          const tx = controls.target?.x ?? 0;
          const tz = controls.target?.z ?? 0;
          const dx = camera.position.x - tx;
          const dz = camera.position.z - tz;
          const rad = (this.plugin.settings.rotationSpeed / 0.001) * ROT_RAD_PER_MS * dt;
          const cos = Math.cos(rad), sin = Math.sin(rad);
          camera.position.x = tx + cos * dx + sin * dz;
          camera.position.z = tz - sin * dx + cos * dz;
        }
      }

      this.fogManager?.syncFogPositions(this.graphData.nodes);
      this.updateLabelOverlay();
    };

    this.rotationFrameId = window.requestAnimationFrame(tick);
  }

  private toggleRotation() {
    this.autoRotating = !this.autoRotating;
    if (this.rotateBtnEl) {
      this.rotateBtnEl.textContent = `Rotate: ${this.autoRotating ? "ON" : "OFF"}`;
    }
  }

  private toggleOrphans() {
    this.showOrphans = !this.showOrphans;
    if (this.orphanBtnEl) {
      this.orphanBtnEl.textContent = `Orphans: ${this.showOrphans ? "ON" : "OFF"}`;
    }
    if (!this.graph) return;
    this.graphData = this.showOrphans
      ? this.fullGraphData
      : { nodes: this.fullGraphData.nodes.filter((n) => n.degree > 0), links: this.fullGraphData.links };
    this.graph.graphData(this.graphData);
    this.rebuildFog();
    this.rebuildLabels();
  }

  private toggleTimeline() {
    if (this.timelineActive) this.stopTimeline();
    else this.startTimeline();
  }

  private startTimeline() {
    if (!this.graph) return;

    if (this.timelineTimeoutId !== null) {
      window.clearTimeout(this.timelineTimeoutId);
      this.timelineTimeoutId = null;
    }

    this.timelineActive = true;
    if (this.timelineBtnEl) this.timelineBtnEl.textContent = "Timeline: ON";
    this.timelineSpeedBar?.addClass("is-visible");
    this.timelineDateEl?.addClass("is-visible");

    // Cinematic forces for timeline — restored to user settings when timeline ends
    (this.graph.d3Force("charge") as ForceLike | undefined)?.strength?.(-120);
    (this.graph.d3Force("link") as ForceLike | undefined)?.strength?.(0.25).distance?.(50);
    this.graph.d3AlphaDecay(0.06);
    this.graph.d3VelocityDecay(0.3);
    // Soft boundary: no gravity inside 350 units, increasing pull beyond that
    const BOUND_RADIUS = 650;
    this.graph.d3Force("center-gravity", (alpha: number) => {
      for (const node of this.graphData.nodes as Array<GNode & { vx?: number; vy?: number; vz?: number }>) {
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const z = node.z ?? 0;
        const dist = Math.sqrt(x * x + y * y + z * z);
        if (dist < 0.01) continue;
        const excess = dist - BOUND_RADIUS;
        if (excess <= 0) continue;
        const strength = 0.018 * (excess / dist) * alpha;
        node.vx = (node.vx ?? 0) - x * strength;
        node.vy = (node.vy ?? 0) - y * strength;
        node.vz = (node.vz ?? 0) - z * strength;
      }
    });

    const candidateNodes = this.showOrphans
      ? this.fullGraphData.nodes
      : this.fullGraphData.nodes.filter((n) => n.degree > 0);

    let playbackNodes: GNode[];
    if (!this.showOrphans) {
      const candidateIds = new Set(candidateNodes.map((n) => n.id));
      const connectedIds = new Set<string>();
      for (const link of this.fullGraphData.links) {
        const src = resolveId(link.source);
        const tgt = resolveId(link.target);
        if (candidateIds.has(src) && candidateIds.has(tgt)) {
          connectedIds.add(src);
          connectedIds.add(tgt);
        }
      }
      playbackNodes = candidateNodes.filter((n) => connectedIds.has(n.id));
    } else {
      playbackNodes = [...candidateNodes];
    }

    const allNodes = playbackNodes.sort((a, b) => this.getTimelineTimestamp(a) - this.getTimelineTimestamp(b));

    const msPerNode = 250 / this.timelineSpeed;
    let idx = 0;

    this.timelineVisibleSet.clear();
    this.spawnAnimations.clear();
    this.graph.graphData({ nodes: [], links: [] });
    this.rebuildFog();
    this.rebuildLabels();

    const getSpawnNearCentroid = (): { x: number; y: number; z: number } => {
      const positioned = this.fullGraphData.nodes.filter(
        (v) => this.timelineVisibleSet.has(v.id) && v.x != null
      );
      const count = positioned.length || 1;
      const cx = positioned.reduce((s, v) => s + (v.x ?? 0), 0) / count;
      const cy = positioned.reduce((s, v) => s + (v.y ?? 0), 0) / count;
      const cz = positioned.reduce((s, v) => s + (v.z ?? 0), 0) / count;
      const jitter = 25;
      return {
        x: cx + (Math.random() - 0.5) * jitter,
        y: cy + (Math.random() - 0.5) * jitter,
        z: cz + (Math.random() - 0.5) * jitter,
      };
    };

    const reveal = () => {
      if (!this.timelineActive) return;

      const n = allNodes[idx++];
      const spawn = getSpawnNearCentroid();
      n.x = spawn.x;
      n.y = spawn.y;
      n.z = spawn.z;
      (n as GNode & { vx?: number; vy?: number; vz?: number }).vx = 0;
      (n as GNode & { vx?: number; vy?: number; vz?: number }).vy = 0;
      (n as GNode & { vx?: number; vy?: number; vz?: number }).vz = 0;
      this.timelineVisibleSet.add(n.id);
      this.startSpawnAnimation(n);

      if (this.timelineDateEl) {
        const d = new Date(this.getTimelineTimestamp(n));
        this.timelineDateEl.textContent = d.toLocaleDateString("default", { year: "numeric", month: "long" });
      }

      const visibleNodes = this.fullGraphData.nodes.filter((v) => this.timelineVisibleSet.has(v.id));
      const visibleLinks = this.fullGraphData.links.filter((l) => {
        return this.timelineVisibleSet.has(resolveId(l.source)) && this.timelineVisibleSet.has(resolveId(l.target));
      });

      this.graphData = { nodes: visibleNodes, links: visibleLinks };
      // graphData() re-heats the simulation on its own, so no explicit alpha kick is needed
      this.graph?.graphData(this.graphData);
      this.rebuildFog();
      this.rebuildLabels();

      if (idx >= allNodes.length) {
        this.stopTimeline(true);
        return;
      }

      this.timelineTimeoutId = window.setTimeout(reveal, msPerNode);
    };

    reveal();
  }

  private stopTimeline(keepState = false) {
    if (this.timelineTimeoutId !== null) {
      window.clearTimeout(this.timelineTimeoutId);
      this.timelineTimeoutId = null;
    }

    this.timelineActive = false;
    if (this.timelineBtnEl) this.timelineBtnEl.textContent = "Timeline: OFF";
    this.timelineSpeedBar?.removeClass("is-visible");
    if (this.timelineDateEl) {
      this.timelineDateEl.removeClass("is-visible");
      this.timelineDateEl.textContent = "";
    }

    this.graph?.d3AlphaDecay(0.02);
    this.graph?.d3VelocityDecay(0.3);
    this.refreshForces();

    if (!keepState) {
      this.timelineVisibleSet.clear();
      this.graphData = this.showOrphans
        ? this.fullGraphData
        : { nodes: this.fullGraphData.nodes.filter((n) => n.degree > 0), links: this.fullGraphData.links };
      this.graph?.graphData(this.graphData);
      this.rebuildFog();
      this.rebuildLabels();
    }
  }

  private getTimelineTimestamp(node: GNode): number {
    const file = this.app.vault.getAbstractFileByPath(node.filePath);
    if (!(file instanceof TFile)) return 0;

    const cache = this.app.metadataCache.getFileCache(file);
    const rawDate: unknown = cache?.frontmatter?.date;
    if (rawDate) {
      const parsed = new Date(String(rawDate));
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }

    return file.stat.ctime;
  }

  private rebuildFog() {
    if (!this.graph || !this.fogManager) return;
    this.fogManager.rebuildFog(this.graphData.nodes, this.plugin.settings);
  }

  private rebuildLabels() {
    this.topLabelNodes = [...this.graphData.nodes]
      .filter((node) => node.degree >= this.plugin.settings.indexDegreeThreshold)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, this.plugin.settings.topLabelCount);
    this.fogManager?.rebuildLabels([], 0);
    this.updateLabelOverlay();
  }

  private refreshForces() {
    if (!this.graph) return;
    const s = this.plugin.settings;
    const charge = this.graph.d3Force("charge") as ForceLike | undefined;
    if (charge?.strength) charge.strength(s.repelForce);
    const link = this.graph.d3Force("link") as ForceLike | undefined;
    if (link) {
      if (link.strength) link.strength(s.linkForce);
      if (link.distance) link.distance(s.linkDistance);
    }
    this.applyRadialForce();
    this.graph.d3ReheatSimulation();
  }

  private applyRadialForce() {
    if (!this.graph) return;
    const s = this.plugin.settings;
    this.graph.d3Force("center-gravity", (alpha: number) => {
      for (const node of this.graphData.nodes as Array<GNode & { vx?: number; vy?: number; vz?: number }>) {
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const z = node.z ?? 0;
        const dist = Math.sqrt(x * x + y * y + z * z);
        if (dist < 0.01) continue;
        const isIndex = node.degree >= s.indexDegreeThreshold;
        const strength = s.centerGravity * (isIndex ? 1.5 : 1.0) * alpha;
        node.vx = (node.vx ?? 0) - x * strength;
        node.vy = (node.vy ?? 0) - y * strength;
        node.vz = (node.vz ?? 0) - z * strength;
      }
    });
  }

  private getSpawnPosition(node: GNode, nodeById: Map<string, GNode>) {
    const neighbors: Array<{ x: number; y: number; z: number }> = [];
    for (const link of this.fullGraphData.links) {
      const src = resolveId(link.source);
      const tgt = resolveId(link.target);
      const neighborId = src === node.id ? tgt : tgt === node.id ? src : null;
      if (!neighborId || !this.timelineVisibleSet.has(neighborId)) continue;
      const neighbor = nodeById.get(neighborId);
      if (neighbor?.x != null && neighbor.y != null && neighbor.z != null) {
        neighbors.push({ x: neighbor.x, y: neighbor.y, z: neighbor.z });
      }
    }

    if (neighbors.length > 0) {
      const sum = neighbors.reduce((acc, pos) => ({
        x: acc.x + pos.x,
        y: acc.y + pos.y,
        z: acc.z + pos.z,
      }), { x: 0, y: 0, z: 0 });
      return {
        x: sum.x / neighbors.length,
        y: sum.y / neighbors.length,
        z: sum.z / neighbors.length,
      };
    }

    const offset = () => (Math.random() - 0.5) * 100;
    return { x: offset(), y: offset(), z: offset() };
  }

  private startSpawnAnimation(node: GNode) {
    const targetVal = Math.max(node.val, 0.01);
    this.spawnAnimations.set(node.id, {
      node,
      targetVal,
      startTime: performance.now(),
    });
    node.val = 0.01;
    this.runSpawnAnimationLoop();
  }

  private runSpawnAnimationLoop() {
    if (this.spawnAnimationFrameId !== null) return;

    const step = (now: number) => {
      let hasActive = false;
      for (const [nodeId, state] of this.spawnAnimations) {
        const t = Math.min(1, (now - state.startTime) / SPAWN_ANIMATION_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        state.node.val = 0.01 + (state.targetVal - 0.01) * eased;
        if (t >= 1) {
          state.node.val = state.targetVal;
          this.spawnAnimations.delete(nodeId);
        } else {
          hasActive = true;
        }
      }

      this.graph?.nodeVal(this.graph.nodeVal());

      if (hasActive || this.spawnAnimations.size > 0) {
        this.spawnAnimationFrameId = window.requestAnimationFrame(step);
      } else {
        this.spawnAnimationFrameId = null;
      }
    };

    this.spawnAnimationFrameId = window.requestAnimationFrame(step);
  }

  private getAnimatedNodeVal(node: GNode) {
    const anim = this.spawnAnimations.get(node.id);
    if (!anim) return node.val;
    const t = Math.min(1, (performance.now() - anim.startTime) / SPAWN_ANIMATION_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    return 0.01 + (anim.targetVal - 0.01) * eased;
  }

  private updateLabelOverlay() {
    if (!this.labelOverlayEl || !this.graph) return;
    this.labelOverlayEl.empty();
    if (!this.topLabelNodes.length) return;

    const camera = this.graph.camera();
    const renderer = this.graph.renderer();
    if (!camera || !renderer) return;

    if (camera.position.length() > this.plugin.settings.labelHideDistance) return;

    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    for (const node of this.topLabelNodes) {
      if (node.x == null || node.y == null || node.z == null) continue;

      const vec = new this.THREE!.Vector3(node.x, node.y, node.z);
      vec.project(camera);
      if (vec.z > 1) continue;

      const x = (vec.x * 0.5 + 0.5) * width;
      const y = (-vec.y * 0.5 + 0.5) * height;
      if (x < -50 || x > width + 50 || y < -20 || y > height + 20) continue;

      const color = getNodeColor(node, this.plugin.settings);
      const labelEl = this.labelOverlayEl.createDiv({ cls: "galaxy-label" });
      labelEl.style.left = `${x}px`;
      labelEl.style.top = `${y}px`;

      const dot = labelEl.createEl("span", { cls: "galaxy-label-dot" });
      dot.style.background = color;

      const text = labelEl.createEl("span");
      text.textContent = node.name;
    }
  }

  private updateGridOpacities() {
    this.sphereGridMod?.updateGridSphereOpacities(
      this.gridGroup,
      this.plugin.settings.sphereOpacity,
      this.plugin.settings.ringsOpacity,
      this.plugin.settings.groundGridOpacity
    );
  }

  private toggleStars(enabled: boolean) {
    const scene = this.graph?.scene() ?? null;
    if (!scene || !this.sphereGridMod) return;
    if (enabled && !this.starsObject) {
      const s = this.plugin.settings;
      this.starsObject = this.sphereGridMod.buildStarfield(scene, 800, s.starCount, s.starSize, s.starBrightness);
    } else if (!enabled && this.starsObject) {
      scene.remove(this.starsObject);
      this.starsObject.geometry.dispose();
      (this.starsObject.material as THREE.Material).dispose();
      this.starsObject = null;
    }
  }

  private rebuildStars() {
    this.toggleStars(false);
    if (this.plugin.settings.showStars) this.toggleStars(true);
  }

  private attachResizeObserver() {
    if (!this.graphContainer || !this.graph) return;
    this.resizeObserver = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e || !this.graph) return;
      this.graph.width(e.contentRect.width).height(e.contentRect.height);
    });
    this.resizeObserver.observe(this.graphContainer);
  }

  private handleNodeClick(node: GNode, _ev: MouseEvent) {
    const now = Date.now();
    const isDouble =
      now - this.lastClickTime < DOUBLE_CLICK_MS &&
      this.lastClickedNodeId === node.id;
    this.lastClickTime = now;
    this.lastClickedNodeId = node.id;

    if (isDouble) {
      this.flyToNode(node, FLY_DIST_DOUBLE, FLY_DUR_DOUBLE);
      return;
    }

    this.selectedNode = node;
    this.updateHighlight(node);
    this.showInspector(node);
    this.flyToNode(node, this.plugin.settings.clickFlyDistance, FLY_DUR_SINGLE);
  }

  private updateHighlight(node: GNode) {
    this.highlightNodes.clear();
    this.highlightLinks.clear();
    this.highlightNodes.add(node.id);

    for (const link of this.graphData.links) {
      const src = resolveId(link.source);
      const tgt = resolveId(link.target);
      if (src === node.id || tgt === node.id) {
        this.highlightLinks.add(link);
        this.highlightNodes.add(src);
        this.highlightNodes.add(tgt);
      }
    }

    if (!this.graph) return;
    this.refreshNodeColors();
    this.refreshLinkColors();
    this.graph.linkWidth(this.graph.linkWidth());
  }

  private clearHighlight() {
    this.highlightNodes.clear();
    this.highlightLinks.clear();
    this.selectedNode = null;
    if (!this.graph) return;
    this.refreshNodeColors();
    this.refreshLinkColors();
    this.graph.linkWidth(this.graph.linkWidth());
  }

  private flyToNode(node: GNode, dist: number, duration: number) {
    const { x = 0, y = 0, z = 0 } = node;
    if (!this.graph) return;
    const camera = this.graph.camera();
    const dx = camera.position.x - x;
    const dy = camera.position.y - y;
    const dz = camera.position.z - z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const nodeRadius = Math.sqrt(node.val) * 5;
    const effectiveDist = Math.max(dist, nodeRadius * (dist <= FLY_DIST_DOUBLE ? 2 : 4));
    this.graph.cameraPosition(
      { x: x + (dx / len) * effectiveDist, y: y + (dy / len) * effectiveDist, z: z + (dz / len) * effectiveDist },
      { x, y, z },
      duration
    );
  }

  private resetView() {
    this.clearHighlight();
    this.hideInspector();
    this.lastClickedNodeId = null;
    if (!this.graph) return;
    this.graph.cameraPosition(
      { x: 0, y: 0, z: 1400 },
      { x: 0, y: 0, z: 0 },
      FLY_DUR_RESET
    );
  }

  private showInspector(node: GNode) {
    this.inspectorPanel?.show(node);
  }

  private hideInspector() {
    this.inspectorPanel?.hide();
  }

  private openSettingsPanel() {
    this.settingsPanelEl?.addClass("is-open");
  }

  private closeSettingsPanel() {
    this.settingsPanelEl?.removeClass("is-open");
  }

  private flashSaved() {
    if (!this.savedEl) return;
    this.savedEl.addClass("is-visible");
    window.setTimeout(() => this.savedEl?.removeClass("is-visible"), 1500);
  }

  private recomputeActivityHeat() {
    computeActivityHeat(this.app, this.fullGraphData.nodes, this.plugin.settings);
    this.refreshNodeColors();
  }

  private refreshNodeColors() {
    if (!this.graph) return;
    this.graph.nodeColor((n: GNode) => {
      if (this.highlightNodes.size === 0) return getNodeColor(n, this.plugin.settings);
      return this.highlightNodes.has(n.id) ? this.themeAccent : DIM_NODE;
    });
    this.updateLabelOverlay();
  }

  private refreshLinkColors() {
    if (!this.graph) return;
    this.graph.linkColor((l: GLink) => {
      if (this.highlightLinks.size === 0) return this.linkNormal();
      return this.highlightLinks.has(l) ? this.linkHighlight() : this.linkDim();
    });
  }

  private refreshSparklineIfSelected() {
    if (!this.selectedNode || !this.inspectorEl) return;
    this.showInspector(this.selectedNode);
  }

  private linkNormal() { return `rgba(120,160,220,${this.plugin.settings.linkOpacityDefault})`; }
  private linkHighlight() { return `rgba(255,160,0,${this.plugin.settings.linkOpacityHighlight})`; }
  private linkDim() { return `rgba(60,60,60,${this.plugin.settings.linkOpacityDim})`; }
}
