import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
// three.js and 3d-force-graph are the bulk of this plugin's bundle size.
// They're dynamically imported in onOpen() instead of statically here, so their
// (expensive) module evaluation only happens when the Galaxy Graph view is actually
// opened, rather than on every Obsidian startup for every user who has the plugin enabled.
import type * as THREE from "three";
import type { ForceGraph3DInstance } from "3d-force-graph";
import { buildGraphData } from "./graph/GraphBuilder";
import type { GalaxySettings } from "./settings";
import type { FogManager } from "./scene/FogManager";
import type { NodeSpriteFactory, NodeStyle } from "./scene/NodeSprites";
import { computeActivityHeat } from "./utils/activity";
import type { GLink, GNode } from "./types";
import { resolveId } from "./types";
import {
  boundingSphere,
  elevatedDirection,
  fitDistance,
  minDistanceForApparentFraction,
  nodeRadius,
  robustSphere,
  type Vec3,
} from "./utils/camera";
import { getNodeColor, toneByDegree } from "./utils/colors";
import { parseTimestamp } from "./utils/dates";
import { estimateLabelWidth, placeLabels, type LabelCandidate } from "./utils/labels";
import { mix, readCanvasTheme, rgba, type CanvasTheme } from "./utils/theme";
import { InspectorPanel } from "./ui/InspectorPanel";
import { buildSettingsPanel } from "./ui/SettingsPanel";

export const VIEW_TYPE_GALAXY = "galaxy-graph";
const MAX_NODES_WARN = 2000;
const DOUBLE_CLICK_MS = 280;
const FLY_DUR_FOCUS = 700;
const FLY_DUR_RESET = 1200;
const ROT_RAD_PER_MS = (2 * Math.PI) / (5 * 60 * 1000);
const SPAWN_ANIMATION_MS = 400;
const SETTLE_MS = 3000;
const NODE_REL_SIZE = 5;
const INITIAL_CAMERA_Z = 1400;
const INITIAL_GRAPH_RADIUS = 600;
// Camera framing: the whole graph fills ~62% of the view from 18° above its equator,
// a focused neighbourhood fills ~60%, and a hub never grows past 8% of the view height.
const CAMERA_ELEVATION_DEG = 18;
const FRAME_FILL = 0.85;
const FOCUS_FILL = 0.6;
const MAX_HUB_FRACTION = 0.08;
const FOCUS_MIN_NODE_RADII = 6;
// Scene fog density relative to the graph's radius: the far side of the galaxy fades to
// about half, which is the one depth cue the canvas uses.
const FOG_DENSITY_FACTOR = 0.18;
// Fog also follows the camera: zooming into a neighbourhood fades the galaxy behind it.
const FOG_CAMERA_FACTOR = 0.25;
// "Closeness" runs from 0 at the whole-galaxy framing to 1 deep inside a neighbourhood.
// Far out, notes are shaded spheres in their full colour (the galaxy's bright dust); as the
// camera comes within NEAR_START of the framing distance they become flat discs and leaves
// tone toward the ink, fully so at NEAR_FULL.
const NEAR_START = 0.7;
const NEAR_FULL = 0.2;
const CLOSENESS_STEP = 0.05;
const TONE_MAX = 0.35;
// The selected note grows a little and brightens toward the ink; everything outside the
// selection becomes a translucent ghost of its own colour.
const SELECTED_SPRITE_SCALE = 1.3;
const SELECTED_TINT = 0.35;
const DIMMED_OPACITY = 0.2;
// The camera may not orbit closer than this many radii of the largest hub, so a hub never
// grows past roughly a fifth of the view and notes stay points rather than plates.
const MIN_CAMERA_DISTANCE_RADII = 10;
const MIN_CAMERA_DISTANCE = 60;
// Labels: hub labels are always candidates; any node whose sphere is at least this many
// pixels across gets one too, so a neighbourhood becomes legible as you arrive.
const LABEL_MAX = 28;
const LABEL_NEAR_PX = 7;
const LABEL_HEIGHT = 22;
const LABEL_GAP = 4;
const TOPBAR_BAND_PX = 48;

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

type Mutable = GNode & { vx?: number; vy?: number; vz?: number };

const toVec = (n: GNode): Vec3 => ({ x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 });
const isPositioned = (n: GNode) => n.x != null && n.y != null && n.z != null;

function setPressed(el: HTMLElement, on: boolean) {
  el.toggleClass("is-on", on);
  el.setAttribute("aria-pressed", String(on));
}

export class GalaxyView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: GalaxyPluginLike,
  ) {
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
  private theme: CanvasTheme = { ground: "#1e1e1e", ink: "#dcddde", isDark: true };
  private sceneFog: THREE.FogExp2 | null = null;
  private galaxyFogDensity = FOG_DENSITY_FACTOR / INITIAL_GRAPH_RADIUS;
  private bodyRadius = INITIAL_GRAPH_RADIUS;
  private closeness = 0;
  private nodeStyle: NodeStyle = "sphere";
  private maxDegree = 1;
  private nodeSprites: NodeSpriteFactory | null = null;
  private autoRotating = true;
  private rotationFrameId: number | null = null;
  private rotateBtnEl: HTMLElement | null = null;
  private showOrphans = true;
  private orphanBtnEl: HTMLElement | null = null;
  private fogManager: FogManager | null = null;
  private settingsPanelEl: HTMLElement | null = null;
  private savedEl: HTMLElement | null = null;
  private isDragging = false;
  private tabVisible = true;
  private timelineActive = false;
  private timelineBtnEl: HTMLElement | null = null;
  private timelineVisibleSet = new Set<string>();
  private timelineSpeed = 1;
  private timelineDateEl: HTMLElement | null = null;
  private timelineSpeedBar: HTMLElement | null = null;
  private timelineSpeedButtons = new Map<number, HTMLElement>();
  private timelineTimeoutId: number | null = null;
  private labelOverlayEl: HTMLElement | null = null;
  private labelPool = new Map<string, HTMLElement>();
  private topLabelNodes: GNode[] = [];
  private spawnAnimations = new Map<string, SpawnAnimationState>();
  private spawnAnimationFrameId: number | null = null;

  // Populated once the lazily-loaded three.js / 3d-force-graph modules resolve (see onOpen).
  private THREE: typeof import("three") | null = null;
  private ForceGraph3DCtor: GalaxyGraphCtor | null = null;

  override getViewType() {
    return VIEW_TYPE_GALAXY;
  }
  override getDisplayText() {
    return "Galaxy Graph";
  }
  override getIcon() {
    return "share-2";
  }

  override async onOpen() {
    // Kick off the heavy three.js / 3d-force-graph module loads immediately, in parallel
    // with the synchronous DOM and graph-data setup below — they're only awaited right
    // before they're actually needed (initGraph).
    const depsPromise = Promise.all([
      import("three"),
      import("3d-force-graph"),
      import("./scene/FogManager"),
      import("./scene/NodeSprites"),
    ]);

    this.theme = this.readTheme();

    const root = this.contentEl;
    root.empty();
    root.addClass("galaxy-view-root");
    this.graphContainer = root.createDiv({ cls: "galaxy-canvas" });
    this.labelOverlayEl = root.createDiv({ cls: "galaxy-labels-overlay" });
    const countLabel = this.buildTopBar(root);
    this.buildPanels(root);

    const data = buildGraphData(this.app);
    this.graphData = data;
    this.fullGraphData = data;
    this.maxDegree = data.nodes.reduce((m, n) => Math.max(m, n.degree), 1);
    if (this.plugin.settings.colorBy === "activity") {
      computeActivityHeat(this.app, data.nodes, this.plugin.settings);
    }
    const orphanCount = data.nodes.filter((n) => n.degree === 0).length;
    countLabel.textContent =
      `${data.nodes.length} notes · ${data.links.length} links` +
      (orphanCount ? ` · ${orphanCount} orphans` : "");

    this.registerDomEvent(
      activeDocument,
      "keydown",
      (evt: KeyboardEvent) => {
        if (evt.key === "Escape" && this.selectedNode !== null) {
          evt.stopPropagation();
          evt.preventDefault();
          this.resetView();
        }
      },
      { capture: true },
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.tabVisible = leaf === this.leaf;
        if (this.graph) {
          if (this.tabVisible) this.graph.resumeAnimation();
          else this.graph.pauseAnimation();
        }
      }),
    );
    this.registerEvent(this.app.workspace.on("css-change", () => this.applyTheme()));

    if (data.nodes.length > MAX_NODES_WARN) {
      new Notice(`Galaxy Graph: ${data.nodes.length} nodes detected. Rendering may be slow.`, 6000);
    }

    const [threeMod, forceGraphMod, fogManagerMod, nodeSpritesMod] = await depsPromise;
    this.THREE = threeMod;
    this.ForceGraph3DCtor = forceGraphMod.default as unknown as GalaxyGraphCtor;
    this.nodeSprites = new nodeSpritesMod.NodeSpriteFactory();

    window.setTimeout(() => {
      this.initGraph();
      const graph = this.graph;
      if (!graph) return;
      graph.d3AlphaDecay(0.02);
      graph.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.fogManager = new fogManagerMod.FogManager(graph.scene());
      this.startRotationLoop();
      this.attachResizeObserver();
      window.setTimeout(() => this.onSimulationSettled(), SETTLE_MS);
    }, 50);
  }

  override onClose(): Promise<void> {
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
    this.labelPool.clear();
    this.labelOverlayEl?.empty();

    if (this.graph) {
      this.fogManager?.dispose();
      this.fogManager = null;
      this.nodeSprites?.dispose();
      this.nodeSprites = null;
      try {
        this.graph.pauseAnimation();
      } catch {
        /* renderer already torn down */
      }
      this.graph = null;
    }
    return Promise.resolve();
  }

  // ---- DOM shell -------------------------------------------------------------------

  private buildTopBar(root: HTMLElement): HTMLElement {
    const bar = root.createDiv({ cls: "galaxy-topbar" });
    const button = (text: string) => bar.createEl("button", { text, cls: "galaxy-topbar-btn" });
    const toggle = (text: string, pressed: boolean, onClick: () => void) => {
      const el = button(text);
      setPressed(el, pressed);
      el.onclick = onClick;
      return el;
    };

    button("Reset view").onclick = () => this.resetView();
    this.rotateBtnEl = toggle("Rotate", this.autoRotating, () => this.toggleRotation());
    this.orphanBtnEl = toggle("Orphans", this.showOrphans, () => this.toggleOrphans());
    this.timelineBtnEl = toggle("Timeline", false, () => this.toggleTimeline());

    this.timelineSpeedBar = bar.createDiv({ cls: "galaxy-topbar-group" });
    for (const spd of [0.5, 1, 2, 4]) {
      const sBtn = this.timelineSpeedBar.createEl("button", { text: `${spd}×`, cls: "galaxy-topbar-btn" });
      setPressed(sBtn, spd === this.timelineSpeed);
      this.timelineSpeedButtons.set(spd, sBtn);
      sBtn.onclick = () => this.setTimelineSpeed(spd);
    }
    this.timelineDateEl = bar.createEl("span", {
      cls: "galaxy-topbar-readout galaxy-timeline-date is-hidden",
    });

    const gearBtn = bar.createEl("button", {
      cls: "galaxy-topbar-btn galaxy-topbar-btn--icon",
      attr: { "aria-label": "Graph settings" },
    });
    setIcon(gearBtn, "settings");
    gearBtn.onclick = () => this.openSettingsPanel();

    return bar.createEl("span", { cls: "galaxy-topbar-readout" });
  }

  private buildPanels(root: HTMLElement) {
    this.settingsPanelEl = root.createDiv({ cls: "galaxy-settings-panel" });
    buildSettingsPanel(this.settingsPanelEl, this.plugin, this.app, {
      closeSettingsPanel: () => this.closeSettingsPanel(),
      refreshNodeColors: () => this.refreshNodeColors(),
      refreshLinkColors: () => this.refreshLinkColors(),
      rebuildFog: () => this.rebuildFog(),
      rebuildLabels: () => this.rebuildLabels(),
      refreshSparklineIfSelected: () => this.refreshSparklineIfSelected(),
      refreshForces: () => this.refreshForces(),
      recomputeActivityHeat: () => this.recomputeActivityHeat(),
      flashSaved: () => this.flashSaved(),
      setSavedEl: (el) => {
        this.savedEl = el;
      },
    });

    this.inspectorEl = root.createDiv({ cls: "galaxy-inspector" });
    this.inspectorPanel = new InspectorPanel(
      this.inspectorEl,
      {
        app: this.app,
        getSettings: () => this.plugin.settings,
        getGraphData: () => this.graphData,
        getTheme: () => this.theme,
      },
      {
        navigateTo: (node) => {
          this.selectNode(node);
          this.focusNode(node);
        },
        clearSelection: () => this.clearHighlight(),
        refreshGraphData: () => buildGraphData(this.app),
        updateGraphData: (data) => {
          this.graphData = data;
          this.fullGraphData = data;
        },
        graphInstance: () => this.graph,
        rebuildFog: () => this.rebuildFog(),
        rebuildLabels: () => this.rebuildLabels(),
      },
    );
  }

  // ---- Graph setup -----------------------------------------------------------------

  private initGraph() {
    const three = this.THREE;
    const GraphCtor = this.ForceGraph3DCtor;
    if (!this.graphContainer || !three || !GraphCtor) return;
    const w = this.graphContainer.clientWidth || 800;
    const h = this.graphContainer.clientHeight || 600;

    this.graph = new GraphCtor(this.graphContainer, { controlType: "orbit" })
      .width(w)
      .height(h)
      .backgroundColor(this.theme.ground)
      .graphData(this.graphData)
      .nodeId("id")
      // The hover tooltip only for notes that do not already carry a label pill.
      .nodeLabel((n: GNode) => (this.labelPool.has(n.id) ? "" : n.name))
      .linkColor((l: GLink) => this.linkColorFor(l))
      .linkWidth(0)
      .linkOpacity(1.0)
      .linkDirectionalArrowLength(0)
      .onNodeClick((n: GNode) => this.handleNodeClick(n))
      .onNodeDrag((n: GNode) => {
        this.isDragging = true;
        this.moveCloudTo(n);
      })
      .onNodeDragEnd((n: GNode) => {
        this.moveCloudTo(n);
        window.setTimeout(() => {
          this.isDragging = false;
        }, 1000);
      })
      .onBackgroundClick(() => this.clearSelection());

    this.applyNodeStyle();
    this.sceneFog = new three.FogExp2(this.theme.ground, this.galaxyFogDensity);
    this.graph.scene().fog = this.sceneFog;

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
    this.graph.cameraPosition({ x: 0, y: 0, z: INITIAL_CAMERA_Z });
  }

  private onSimulationSettled() {
    if (!this.graph) return;
    const controls = this.graph.controls() as { minDistance?: number };
    controls.minDistance = Math.max(
      MIN_CAMERA_DISTANCE,
      nodeRadius(this.maxDegree, NODE_REL_SIZE) * MIN_CAMERA_DISTANCE_RADII,
    );
    this.updateSceneFog();
    this.rebuildFog();
    this.rebuildLabels();
    this.frameGraph(FLY_DUR_RESET);
  }

  private moveCloudTo(n: GNode) {
    const sprite = this.fogManager?.fogNodeMap.get(n.id);
    if (sprite && n.x != null && n.y != null && n.z != null) sprite.position.set(n.x, n.y, n.z);
  }

  // ---- Theme -----------------------------------------------------------------------

  private readTheme(): CanvasTheme {
    const style = activeWindow.getComputedStyle(this.contentEl);
    const fallbackDark = activeDocument.body.classList.contains("theme-dark");
    return readCanvasTheme((name) => style.getPropertyValue(name), fallbackDark);
  }

  private applyTheme() {
    this.theme = this.readTheme();
    if (this.graph) {
      this.graph.backgroundColor(this.theme.ground);
      this.sceneFog?.color.set(this.theme.ground);
    }
    this.refreshNodeColors();
    this.refreshLinkColors();
    this.rebuildFog();
    this.refreshSparklineIfSelected();
  }

  private updateSceneFog() {
    if (!this.sceneFog) return;
    const radius = Math.max(this.graphSphere()?.radius ?? 0, 200);
    this.bodyRadius = radius;
    this.galaxyFogDensity = FOG_DENSITY_FACTOR / radius;
    this.sceneFog.density = this.galaxyFogDensity;
    this.sceneFog.color.set(this.theme.ground);
  }

  // ---- Per-frame loop --------------------------------------------------------------

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
        if (controls) {
          const tx = controls.target?.x ?? 0;
          const tz = controls.target?.z ?? 0;
          const dx = camera.position.x - tx;
          const dz = camera.position.z - tz;
          const rad = (this.plugin.settings.rotationSpeed / 0.001) * ROT_RAD_PER_MS * dt;
          const cos = Math.cos(rad),
            sin = Math.sin(rad);
          camera.position.x = tx + cos * dx + sin * dz;
          camera.position.z = tz - sin * dx + cos * dz;
        }
      }

      this.fogManager?.syncFogPositions(this.graphData.nodes);
      this.followCamera();
      this.updateLabelOverlay();
    };
    this.rotationFrameId = window.requestAnimationFrame(tick);
  }

  /** Depth cues that scale with where the camera is: fog density and cloud dissolve. */
  private followCamera() {
    if (!this.graph) return;
    const camera = this.graph.camera();
    const controls = this.graph.controls() as { target?: THREE.Vector3 } | null;
    const target = controls?.target;
    const camDist = target ? camera.position.distanceTo(target) : camera.position.length();
    if (this.sceneFog) {
      this.sceneFog.density = Math.max(this.galaxyFogDensity, FOG_CAMERA_FACTOR / Math.max(camDist, 1));
    }
    this.fogManager?.updateCamera(camera.position);
    this.updateCloseness(camDist);
  }

  /** Crossfades the notes between the far look and the near look as the camera moves. */
  private updateCloseness(camDist: number) {
    const frameDist = fitDistance(this.bodyRadius, this.cameraFov(), this.viewportAspect(), FRAME_FILL);
    const raw = (NEAR_START * frameDist - camDist) / ((NEAR_START - NEAR_FULL) * frameDist);
    const closeness = Math.round(Math.max(0, Math.min(1, raw)) / CLOSENESS_STEP) * CLOSENESS_STEP;
    if (closeness === this.closeness) return;
    this.closeness = closeness;
    const style: NodeStyle = closeness > 0 ? "disc" : "sphere";
    if (style !== this.nodeStyle) {
      this.nodeStyle = style;
      this.applyNodeStyle();
      return;
    }
    const factory = this.nodeSprites;
    if (!factory) return;
    for (const n of this.graphData.nodes) factory.tint(n.id, this.displayColorFor(n));
  }

  private toggleRotation() {
    this.autoRotating = !this.autoRotating;
    if (this.rotateBtnEl) setPressed(this.rotateBtnEl, this.autoRotating);
  }

  private toggleOrphans() {
    this.showOrphans = !this.showOrphans;
    if (this.orphanBtnEl) setPressed(this.orphanBtnEl, this.showOrphans);
    if (!this.graph) return;
    this.graphData = this.visibleGraphData();
    this.graph.graphData(this.graphData);
    this.rebuildFog();
    this.rebuildLabels();
  }

  private visibleGraphData() {
    return this.showOrphans
      ? this.fullGraphData
      : { nodes: this.fullGraphData.nodes.filter((n) => n.degree > 0), links: this.fullGraphData.links };
  }

  // ---- Timeline --------------------------------------------------------------------

  private toggleTimeline() {
    if (this.timelineActive) this.stopTimeline();
    else this.startTimeline();
  }

  private setTimelineSpeed(speed: number) {
    this.timelineSpeed = speed;
    for (const [spd, el] of this.timelineSpeedButtons) setPressed(el, spd === speed);
    if (this.timelineActive) {
      this.stopTimeline();
      this.startTimeline();
    }
  }

  private startTimeline() {
    if (!this.graph) return;
    if (this.timelineTimeoutId !== null) {
      window.clearTimeout(this.timelineTimeoutId);
      this.timelineTimeoutId = null;
    }

    this.timelineActive = true;
    if (this.timelineBtnEl) setPressed(this.timelineBtnEl, true);
    this.timelineSpeedBar?.addClass("is-visible");
    this.timelineDateEl?.removeClass("is-hidden");

    // Cinematic forces for timeline — restored to user settings when timeline ends
    (this.graph.d3Force("charge") as ForceLike | undefined)?.strength?.(-120);
    (this.graph.d3Force("link") as ForceLike | undefined)?.strength?.(0.25).distance?.(50);
    this.graph.d3AlphaDecay(0.06);
    this.graph.d3VelocityDecay(0.3);
    // Soft boundary: no gravity inside 350 units, increasing pull beyond that
    const BOUND_RADIUS = 650;
    this.graph.d3Force("center-gravity", (alpha: number) => {
      for (const node of this.graphData.nodes as Mutable[]) {
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

    const allNodes = this.timelinePlaybackNodes().sort(
      (a, b) => this.getTimelineTimestamp(a) - this.getTimelineTimestamp(b),
    );
    const msPerNode = 250 / this.timelineSpeed;
    let idx = 0;

    this.timelineVisibleSet.clear();
    this.spawnAnimations.clear();
    this.graph.graphData({ nodes: [], links: [] });
    this.rebuildFog();
    this.rebuildLabels();

    const reveal = () => {
      if (!this.timelineActive) return;
      const n = allNodes[idx++] as Mutable;
      const spawn = this.spawnNearCentroid();
      n.x = spawn.x;
      n.y = spawn.y;
      n.z = spawn.z;
      n.vx = 0;
      n.vy = 0;
      n.vz = 0;
      this.timelineVisibleSet.add(n.id);
      this.startSpawnAnimation(n);

      if (this.timelineDateEl) {
        const d = new Date(this.getTimelineTimestamp(n));
        this.timelineDateEl.textContent = d.toLocaleDateString("default", { year: "numeric", month: "long" });
      }

      const visibleNodes = this.fullGraphData.nodes.filter((v) => this.timelineVisibleSet.has(v.id));
      const visibleLinks = this.fullGraphData.links.filter(
        (l) =>
          this.timelineVisibleSet.has(resolveId(l.source)) &&
          this.timelineVisibleSet.has(resolveId(l.target)),
      );
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

  private timelinePlaybackNodes(): GNode[] {
    const candidateNodes = this.showOrphans
      ? this.fullGraphData.nodes
      : this.fullGraphData.nodes.filter((n) => n.degree > 0);
    if (this.showOrphans) return [...candidateNodes];
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
    return candidateNodes.filter((n) => connectedIds.has(n.id));
  }

  private spawnNearCentroid(): Vec3 {
    const positioned = this.fullGraphData.nodes.filter(
      (v) => this.timelineVisibleSet.has(v.id) && v.x != null,
    );
    const count = positioned.length || 1;
    const cx = positioned.reduce((sum, v) => sum + (v.x ?? 0), 0) / count;
    const cy = positioned.reduce((sum, v) => sum + (v.y ?? 0), 0) / count;
    const cz = positioned.reduce((sum, v) => sum + (v.z ?? 0), 0) / count;
    const jitter = 25;
    return {
      x: cx + (Math.random() - 0.5) * jitter,
      y: cy + (Math.random() - 0.5) * jitter,
      z: cz + (Math.random() - 0.5) * jitter,
    };
  }

  private stopTimeline(keepState = false) {
    if (this.timelineTimeoutId !== null) {
      window.clearTimeout(this.timelineTimeoutId);
      this.timelineTimeoutId = null;
    }
    this.timelineActive = false;
    if (this.timelineBtnEl) setPressed(this.timelineBtnEl, false);
    this.timelineSpeedBar?.removeClass("is-visible");
    if (this.timelineDateEl) {
      this.timelineDateEl.addClass("is-hidden");
      this.timelineDateEl.textContent = "";
    }

    this.graph?.d3AlphaDecay(0.02);
    this.graph?.d3VelocityDecay(0.3);
    this.refreshForces();

    if (!keepState) {
      this.timelineVisibleSet.clear();
      this.graphData = this.visibleGraphData();
      this.graph?.graphData(this.graphData);
      this.rebuildFog();
      this.rebuildLabels();
    }
    this.updateSceneFog();
  }

  private getTimelineTimestamp(node: GNode): number {
    const file = this.app.vault.getAbstractFileByPath(node.filePath);
    if (!(file instanceof TFile)) return 0;
    const cache = this.app.metadataCache.getFileCache(file);
    return parseTimestamp(cache?.frontmatter?.date, file.stat.ctime);
  }

  // ---- Clouds, labels, forces -------------------------------------------------------

  private rebuildFog() {
    if (!this.graph || !this.fogManager) return;
    this.fogManager.rebuildFog(this.graphData.nodes, this.graphData.links, this.plugin.settings, this.theme);
  }

  private rebuildLabels() {
    this.topLabelNodes = [...this.graphData.nodes]
      .filter((node) => node.degree >= this.plugin.settings.indexDegreeThreshold)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, this.plugin.settings.topLabelCount);
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
      for (const node of this.graphData.nodes as Mutable[]) {
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

  private startSpawnAnimation(node: GNode) {
    const targetVal = Math.max(node.val, 0.01);
    this.spawnAnimations.set(node.id, { node, targetVal, startTime: performance.now() });
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
      for (const state of this.spawnAnimations.values()) {
        this.nodeSprites?.scaleTo(state.node.id, nodeRadius(state.node.val, NODE_REL_SIZE));
      }
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
    const three = this.THREE;
    const overlay = this.labelOverlayEl;
    if (!overlay || !this.graph || !three) return;
    const camera = this.graph.camera() as THREE.PerspectiveCamera;
    const canvas = this.graph.renderer().domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) {
      this.syncLabelPool([]);
      return;
    }

    const focalPx = height / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const showHubs = camera.position.length() <= this.plugin.settings.labelHideDistance;
    const hubIds = new Set(showHubs ? this.topLabelNodes.map((n) => n.id) : []);
    const hubCandidates: LabelCandidate<GNode>[] = [];
    const nearCandidates: LabelCandidate<GNode>[] = [];
    const vec = new three.Vector3();

    const consider = (node: GNode, isHub: boolean) => {
      if (node.x == null || node.y == null || node.z == null) return;
      vec.set(node.x, node.y, node.z);
      const dist = vec.distanceTo(camera.position);
      const screenRadius = (nodeRadius(node.val, NODE_REL_SIZE) * focalPx) / Math.max(dist, 1);
      if (!isHub && screenRadius < LABEL_NEAR_PX) return;
      vec.project(camera);
      if (vec.z > 1) return;
      const cx = (vec.x * 0.5 + 0.5) * width;
      const cy = (-vec.y * 0.5 + 0.5) * height;
      const w = estimateLabelWidth(node.name);
      const top = cy - screenRadius - LABEL_HEIGHT - LABEL_GAP;
      if (cx + w / 2 < 0 || cx - w / 2 > width || top + LABEL_HEIGHT < TOPBAR_BAND_PX || top > height) return;
      (isHub ? hubCandidates : nearCandidates).push({
        key: node,
        x: cx - w / 2,
        y: top,
        width: w,
        height: LABEL_HEIGHT,
      });
    };

    if (showHubs) for (const hub of this.topLabelNodes) consider(hub, true);
    for (const node of this.graphData.nodes) if (!hubIds.has(node.id)) consider(node, false);
    nearCandidates.sort((a, b) => b.key.degree - a.key.degree);

    this.syncLabelPool(placeLabels([...hubCandidates, ...nearCandidates], LABEL_MAX));
  }

  private syncLabelPool(placed: LabelCandidate<GNode>[]) {
    const overlay = this.labelOverlayEl;
    if (!overlay) return;
    const keep = new Set<string>();
    for (const c of placed) {
      keep.add(c.key.id);
      let el = this.labelPool.get(c.key.id);
      if (!el) {
        el = overlay.createDiv({ cls: "galaxy-label" });
        el.createEl("span", { cls: "galaxy-label-dot" });
        el.createEl("span", { cls: "galaxy-label-text", text: c.key.name });
        const node = c.key;
        el.onclick = () => {
          this.selectNode(node);
          this.focusNode(node);
        };
        this.labelPool.set(c.key.id, el);
      }
      el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`;
      const dot = el.firstElementChild as HTMLElement | null;
      if (dot) dot.style.background = getNodeColor(c.key, this.plugin.settings, this.theme.isDark);
    }
    for (const [id, el] of this.labelPool) {
      if (!keep.has(id)) {
        el.remove();
        this.labelPool.delete(id);
      }
    }
  }

  private attachResizeObserver() {
    if (!this.graphContainer || !this.graph) return;
    this.resizeObserver = new ResizeObserver((entries) => {
      const e = entries.at(0);
      if (!e || !this.graph) return;
      this.graph.width(e.contentRect.width).height(e.contentRect.height);
    });
    this.resizeObserver.observe(this.graphContainer);
  }

  // ---- Selection and camera --------------------------------------------------------

  private handleNodeClick(node: GNode) {
    const now = Date.now();
    const isDouble = now - this.lastClickTime < DOUBLE_CLICK_MS && this.lastClickedNodeId === node.id;
    this.lastClickTime = now;
    this.lastClickedNodeId = node.id;
    if (isDouble) {
      this.focusNode(node);
      return;
    }
    this.selectNode(node);
  }

  private selectNode(node: GNode) {
    this.selectedNode = node;
    this.updateHighlight(node);
    this.inspectorPanel?.show(node);
  }

  private clearSelection() {
    this.clearHighlight();
    this.inspectorPanel?.hide();
    this.lastClickedNodeId = null;
  }

  private neighboursOf(node: GNode): GNode[] {
    const byId = new Map(this.graphData.nodes.map((n) => [n.id, n]));
    const out: GNode[] = [];
    for (const link of this.graphData.links) {
      const src = resolveId(link.source);
      const tgt = resolveId(link.target);
      const otherId = src === node.id ? tgt : tgt === node.id ? src : null;
      if (otherId === null) continue;
      const other = byId.get(otherId);
      if (other) out.push(other);
    }
    return out;
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
    this.fogManager?.setFocus(node.id);
    this.refreshNodeColors();
    this.refreshLinkColors();
  }

  private clearHighlight() {
    this.highlightNodes.clear();
    this.highlightLinks.clear();
    this.selectedNode = null;
    this.fogManager?.setFocus(null);
    this.refreshNodeColors();
    this.refreshLinkColors();
  }

  /** The body of the galaxy: connected notes only, since orphans drift to the periphery. */
  private graphSphere() {
    const positioned = this.graphData.nodes.filter(isPositioned);
    const connected = positioned.filter((n) => n.degree > 0);
    return robustSphere((connected.length > 0 ? connected : positioned).map(toVec));
  }

  private cameraFov(): number {
    return this.graph ? (this.graph.camera() as THREE.PerspectiveCamera).fov : 75;
  }

  private viewportAspect(): number {
    const el = this.graph?.renderer().domElement;
    return el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 1.2;
  }

  /** Frames the whole graph from slightly above its equator. */
  private frameGraph(duration: number) {
    if (!this.graph) return;
    const sphere = this.graphSphere();
    const center = sphere?.center ?? { x: 0, y: 0, z: 0 };
    const radius = Math.max(sphere?.radius ?? 0, 100);
    const dist = fitDistance(radius, this.cameraFov(), this.viewportAspect(), FRAME_FILL);
    const dir = elevatedDirection(CAMERA_ELEVATION_DEG);
    this.graph.cameraPosition(
      { x: center.x + dir.x * dist, y: center.y + dir.y * dist, z: center.z + dir.z * dist },
      center,
      duration,
    );
  }

  /** Frames a node with its neighbourhood, keeping the approach direction and never getting too close. */
  private focusNode(node: GNode) {
    if (!this.graph || node.x == null || node.y == null || node.z == null) return;
    const hubRadius = nodeRadius(node.val, NODE_REL_SIZE);
    const sphere = boundingSphere([node, ...this.neighboursOf(node)].filter(isPositioned).map(toVec));
    const radius = Math.max(sphere?.radius ?? 0, hubRadius * FOCUS_MIN_NODE_RADII);
    const fov = this.cameraFov();
    const dist = Math.max(
      fitDistance(radius, fov, this.viewportAspect(), FOCUS_FILL),
      minDistanceForApparentFraction(hubRadius, fov, MAX_HUB_FRACTION),
    );
    const camera = this.graph.camera();
    const dx = camera.position.x - node.x;
    const dy = camera.position.y - node.y;
    const dz = camera.position.z - node.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    this.graph.cameraPosition(
      { x: node.x + (dx / len) * dist, y: node.y + (dy / len) * dist, z: node.z + (dz / len) * dist },
      { x: node.x, y: node.y, z: node.z },
      FLY_DUR_FOCUS,
    );
  }

  private resetView() {
    this.clearSelection();
    this.frameGraph(FLY_DUR_RESET);
  }

  // ---- Colour accessors ------------------------------------------------------------

  private ownColorFor(n: GNode): string {
    const base = getNodeColor(n, this.plugin.settings, this.theme.isDark);
    return toneByDegree(base, n.degree, this.maxDegree, this.theme.ink, TONE_MAX * this.closeness);
  }

  private displayColorFor(n: GNode): string {
    const own = this.ownColorFor(n);
    return this.selectedNode?.id === n.id ? mix(own, this.theme.ink, SELECTED_TINT) : own;
  }

  private isDimmed(n: GNode): boolean {
    return this.highlightNodes.size > 0 && !this.highlightNodes.has(n.id);
  }

  /** Every note is a soft sprite: its own colour, toned by degree, ghosted outside a selection. */
  private applyNodeStyle() {
    const factory = this.nodeSprites;
    if (!this.graph || !factory) return;
    factory.reset();
    this.graph.nodeThreeObject((n: GNode) => {
      const isSelected = this.selectedNode?.id === n.id;
      const radius =
        nodeRadius(this.getAnimatedNodeVal(n), NODE_REL_SIZE) * (isSelected ? SELECTED_SPRITE_SCALE : 1);
      return factory.make(
        n.id,
        this.displayColorFor(n),
        radius,
        this.isDimmed(n) ? DIMMED_OPACITY : 1,
        this.nodeStyle,
      );
    });
  }

  private linkColorFor(l: GLink): string {
    const s = this.plugin.settings;
    if (this.highlightLinks.size === 0) return rgba(this.theme.ink, s.linkOpacityDefault);
    if (this.highlightLinks.has(l)) {
      const c = this.selectedNode ? getNodeColor(this.selectedNode, s, this.theme.isDark) : this.theme.ink;
      return rgba(c, s.linkOpacityHighlight);
    }
    return rgba(this.theme.ink, s.linkOpacityDim);
  }

  private refreshNodeColors() {
    this.applyNodeStyle();
    this.updateLabelOverlay();
  }

  private refreshLinkColors() {
    this.graph?.linkColor((l: GLink) => this.linkColorFor(l));
  }

  // ---- Panels ----------------------------------------------------------------------

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

  private refreshSparklineIfSelected() {
    if (this.selectedNode) this.inspectorPanel?.show(this.selectedNode);
  }
}
