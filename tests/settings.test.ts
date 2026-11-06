import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/settings";

describe("sanitizeSettings", () => {
  it("keeps known keys of the right type", () => {
    expect(sanitizeSettings({ rotationSpeed: 0.002, colorBy: "tag", tagColorMap: { a: "#fff" } })).toEqual({
      rotationSpeed: 0.002,
      colorBy: "tag",
      tagColorMap: { a: "#fff" },
    });
  });
  it("drops keys from older versions and keys of the wrong type", () => {
    const out = sanitizeSettings({
      showStars: true,
      starCount: 2000,
      sphereOpacity: 0.06,
      clickFlyDistance: 600,
      rotationSpeed: "fast",
      tagColorMap: ["not", "a", "map"],
      fogEnabled: null,
    });
    expect(out).toEqual({});
  });
  it("tolerates missing or malformed data", () => {
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings(undefined)).toEqual({});
    expect(sanitizeSettings("string")).toEqual({});
  });
  it("never invents keys that are not in the defaults", () => {
    const keys = Object.keys(sanitizeSettings({ ...DEFAULT_SETTINGS, extra: 1 }));
    expect(keys).not.toContain("extra");
    expect(keys).toEqual(Object.keys(DEFAULT_SETTINGS));
  });
});
