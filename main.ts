import { Plugin, WorkspaceLeaf } from "obsidian";
import { GalaxyView, VIEW_TYPE_GALAXY } from "./src/GalaxyView";
import { DEFAULT_SETTINGS, type GalaxySettings } from "./src/settings";

export default class GalaxyPlugin extends Plugin {
  settings: GalaxySettings = { ...DEFAULT_SETTINGS };

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) ?? {});
    this.registerView(VIEW_TYPE_GALAXY, (leaf: WorkspaceLeaf) => new GalaxyView(leaf, this));
    this.addRibbonIcon("share-2", "Open Galaxy Graph", () => this.openView());
    this.addCommand({
      id: "open-galaxy-graph",
      name: "Open Galaxy Graph",
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
    workspace.revealLeaf(leaf);
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GALAXY);
  }
}
