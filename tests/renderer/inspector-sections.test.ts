import { beforeEach, describe, expect, it } from "vitest";
import {
  INSPECTOR_DEFAULT_OPEN,
  readSectionOverrides,
  rememberSectionOpen,
  resetSectionMemory,
  resolveSectionOpen,
} from "../../src/renderer/state/inspector-sections";

describe("inspector section expand state", () => {
  beforeEach(() => resetSectionMemory());

  it("opens progress while running and changes once the run settles", () => {
    expect(resolveSectionOpen(undefined, "running", "progress")).toBe(true);
    expect(resolveSectionOpen(undefined, "running", "changes")).toBe(false);
    expect(resolveSectionOpen(undefined, "settled", "progress")).toBe(false);
    expect(resolveSectionOpen(undefined, "settled", "changes")).toBe(true);
    for (const phase of ["running", "settled"] as const) {
      expect(INSPECTOR_DEFAULT_OPEN[phase].attention).toBe(true);
      expect(INSPECTOR_DEFAULT_OPEN[phase].session).toBe(false);
      expect(INSPECTOR_DEFAULT_OPEN[phase].context).toBe(false);
    }
  });

  it("remembers an explicit choice per session across phases", () => {
    rememberSectionOpen("a", "progress", false);
    rememberSectionOpen("a", "session", true);
    const a = readSectionOverrides("a");
    expect(resolveSectionOpen(a, "running", "progress")).toBe(false);
    expect(resolveSectionOpen(a, "settled", "session")).toBe(true);
    // Untouched sections keep following the phase default.
    expect(resolveSectionOpen(a, "running", "changes")).toBe(false);
    expect(resolveSectionOpen(a, "settled", "changes")).toBe(true);
    // Another session is unaffected.
    expect(readSectionOverrides("b")).toBeUndefined();
    expect(
      resolveSectionOpen(readSectionOverrides("b"), "running", "progress"),
    ).toBe(true);
  });

  it("bounds how many sessions it remembers", () => {
    for (let index = 0; index < 205; index += 1)
      rememberSectionOpen(`s${index}`, "changes", false);
    expect(readSectionOverrides("s0")).toBeUndefined();
    expect(readSectionOverrides("s204")).toEqual({ changes: false });
  });
});
