import { Plugin, WorkspaceLeaf } from "obsidian";
import { GalaxyView, VIEW_TYPE_GALAXY } from "./src/GalaxyView";
import { DEFAULT_SETTINGS, type GalaxySettings } from "./src/settings";

export default class GalaxyPlugin extends Plugin {
  settings: GalaxySettings = { ...DEFAULT_SETTINGS };

  async onload() {
    const saved = ((await this.loadData()) ?? {}) as Partial<GalaxySettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    this.registerView(VIEW_TYPE_GALAXY, (leaf: WorkspaceLeaf) => new GalaxyView(leaf, this));
    this.addRibbonIcon("share-2", "Open galaxy view", () => this.openView());
    this.addCommand({
      id: "open",
      name: "Open galaxy view",
      callback: () => this.openView(),
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async openView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_GALAXY)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_GALAXY, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
