import { describe, expect, it } from "vitest";
import { topLevelKey } from "../src/graph/GraphBuilder";
import { parseTimestamp } from "../src/utils/dates";

describe("smoke", () => {
  it("derives the top-level folder key from a vault path", () => {
    expect(topLevelKey("3 - Indexes/Physics.md")).toBe("3");
    expect(topLevelKey("Root note.md")).toBe("root");
  });

  it("parses frontmatter timestamps and falls back when unparseable", () => {
    expect(parseTimestamp("2024-03-01", 7)).toBe(Date.UTC(2024, 2, 1));
    expect(parseTimestamp(1_700_000_000, 7)).toBe(1_700_000_000_000);
    expect(parseTimestamp({ not: "a date" }, 7)).toBe(7);
  });
});
