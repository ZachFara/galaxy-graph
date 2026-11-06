import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type GalaxySettings } from "../../src/settings";
import type { GNode } from "../../src/types";
import { getNodeColor, heatColor, toneByDegree } from "../../src/utils/colors";

const node = (overrides: Partial<GNode> = {}): GNode => ({
  id: "a.md",
  name: "a",
  val: 1,
  folder: "1",
  folderName: "Full Notes",
  filePath: "1 - Full Notes/a.md",
  degree: 0,
  outDegree: 0,
  inDegree: 0,
  ...overrides,
});
const settings = (overrides: Partial<GalaxySettings> = {}): GalaxySettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

describe("getNodeColor", () => {
  it("uses deeper folder tones on light grounds than on dark", () => {
    expect(getNodeColor(node(), settings(), true)).toBe("#4fc3f7");
    expect(getNodeColor(node(), settings(), false)).toBe("#0277bd");
  });
  it("falls back to the default folder colour for unknown folders", () => {
    expect(getNodeColor(node({ folder: "9" }), settings(), true)).toBe("#4fc3f7");
  });
  it("marks indexes by degree in index mode", () => {
    const s = settings({ colorBy: "index", indexDegreeThreshold: 5 });
    expect(getNodeColor(node({ degree: 5 }), s, true)).toBe("#ff9800");
    expect(getNodeColor(node({ degree: 4 }), s, true)).toBe("#4fc3f7");
  });
  it("uses the first mapped tag in tag mode", () => {
    const s = settings({ colorBy: "tag", tagColorMap: { b: "#00ff00" } });
    expect(getNodeColor(node({ tags: ["a", "b"] }), s, true)).toBe("#00ff00");
    expect(getNodeColor(node({ tags: ["zzz"] }), s, true)).toBe("#4fc3f7");
  });
  it("returns a themed rgb ramp in activity mode", () => {
    const s = settings({ colorBy: "activity" });
    expect(getNodeColor(node({ activityHeat: 0 }), s, true)).toBe("rgb(18,18,48)");
    expect(getNodeColor(node({ activityHeat: 0 }), s, false)).toBe("rgb(207,216,220)");
    expect(getNodeColor(node({ activityHeat: 1 }), s, false)).toBe("rgb(183,28,28)");
  });
});

describe("other colours", () => {
  it("tones leaves toward the ink and leaves hubs vivid", () => {
    expect(toneByDegree("#ff0000", 200, 200, "#ffffff")).toBe("#ff0000");
    expect(toneByDegree("#ff0000", 0, 200, "#ffffff")).toBe("#ff5959");
    const leaf = toneByDegree("#ff0000", 1, 200, "#ffffff");
    const sub = toneByDegree("#ff0000", 20, 200, "#ffffff");
    expect(parseInt(leaf.slice(3, 5), 16)).toBeGreaterThan(parseInt(sub.slice(3, 5), 16));
  });
  it("applies no tone at zero strength", () => {
    expect(toneByDegree("#ff0000", 0, 200, "#ffffff", 0)).toBe("#ff0000");
  });
  it("ramps heat from cool to warm", () => {
    expect(heatColor(0, 0, 10)).toBe("#4fc3f7");
    expect(heatColor(10, 0, 10)).toBe("#ff5722");
  });
});
