import { describe, expect, it } from "vitest";
import { mix, parseCssColor, readCanvasTheme, relativeLuminance, rgba, toHex } from "../../src/utils/theme";

describe("parseCssColor", () => {
  it("parses hex in short, long and alpha forms", () => {
    expect(parseCssColor("#fff")).toEqual([255, 255, 255]);
    expect(parseCssColor("#1e1e1e")).toEqual([30, 30, 30]);
    expect(parseCssColor("#1E1E1E80")).toEqual([30, 30, 30]);
  });
  it("parses rgb() and hsl() as themes emit them", () => {
    expect(parseCssColor("rgb(10, 20, 30)")).toEqual([10, 20, 30]);
    expect(parseCssColor("rgba(10 20 30 / 0.5)")).toEqual([10, 20, 30]);
    expect(parseCssColor("hsl(0, 0%, 100%)")).toEqual([255, 255, 255]);
    expect(parseCssColor("hsl(120deg, 100%, 50%)")).toEqual([0, 255, 0]);
  });
  it("returns null for unparseable input", () => {
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("var(--x)")).toBeNull();
  });
});

describe("colour helpers", () => {
  it("round-trips through toHex", () => {
    expect(toHex([30, 30, 30])).toBe("#1e1e1e");
  });
  it("applies alpha and leaves unparseable colours untouched", () => {
    expect(rgba("#ff0000", 0.3)).toBe("rgba(255,0,0,0.3)");
    expect(rgba("nonsense", 0.3)).toBe("nonsense");
  });
  it("mixes toward the second colour", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
  });
  it("computes luminance at the extremes", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
});

describe("readCanvasTheme", () => {
  const vars = (map: Record<string, string>) => (name: string) => map[name] ?? "";
  it("reads a dark theme from the ground colour", () => {
    const t = readCanvasTheme(vars({ "--background-primary": "#1e1e1e", "--text-normal": "#dcddde" }), false);
    expect(t).toEqual({ ground: "#1e1e1e", ink: "#dcddde", isDark: true });
  });
  it("reads a light theme from the ground colour", () => {
    const t = readCanvasTheme(vars({ "--background-primary": "#ffffff", "--text-normal": "#222222" }), true);
    expect(t.isDark).toBe(false);
    expect(t.ink).toBe("#222222");
  });
  it("falls back per mode when the variables are missing", () => {
    expect(readCanvasTheme(vars({}), true)).toEqual({ ground: "#1e1e1e", ink: "#dcddde", isDark: true });
    expect(readCanvasTheme(vars({}), false).isDark).toBe(false);
  });
});
