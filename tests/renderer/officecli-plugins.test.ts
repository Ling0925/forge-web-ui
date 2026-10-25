import { officecliPluginConfigSchema } from "@forge/core/shared/plugins";
import {
  PUBLISHED_HTML_PREVIEW_MAX_BYTES,
  PUBLISHED_PREVIEW_MAX_BYTES,
} from "@forge/core/shared/published-files";
import { describe, expect, it } from "vitest";
import {
  BROWSER_PLUGIN_ID,
  OFFICECLI_PLUGIN_ID,
  OFFICECLI_TIMEOUT_SECONDS,
  officeCliConfigDraft,
  officeCliConfigDraftDirty,
  officeCliConfigFromDraft,
  parseOfficeCliTimeoutSeconds,
  pluginDraftDirty,
  pluginDraftFor,
} from "../../src/renderer/state/plugins";

describe("OfficeCLI plugin config draft", () => {
  it("uses Core's defaults and manifest id", () => {
    expect(OFFICECLI_PLUGIN_ID).toBe("officecli");
    const { draft, error } = officeCliConfigDraft({});
    expect(error).toBe("");
    expect(draft).toEqual({
      executablePath: "officecli",
      timeoutSeconds: "120",
    });
    expect(officeCliConfigFromDraft(draft)).toEqual({
      config: { executablePath: "officecli", timeoutMs: 120000 },
      error: "",
    });
  });

  it("stays in sync with the Core timeout schema bounds", () => {
    expect(
      officecliPluginConfigSchema.parse({ timeoutMs: 1000 }).timeoutMs,
    ).toBe(1000);
    expect(
      officecliPluginConfigSchema.parse({ timeoutMs: 300000 }).timeoutMs,
    ).toBe(300000);
    expect(
      officecliPluginConfigSchema.safeParse({ timeoutMs: 999 }).success,
    ).toBe(false);
    expect(
      officecliPluginConfigSchema.safeParse({ timeoutMs: 300001 }).success,
    ).toBe(false);
    expect(OFFICECLI_TIMEOUT_SECONDS.min).toBe(1);
    expect(OFFICECLI_TIMEOUT_SECONDS.max).toBe(300);
  });

  it("round-trips millisecond precision without silently rounding", () => {
    // A CLI-configured 1501 ms must survive an open/save in the Web UI.
    const { draft } = officeCliConfigDraft({
      executablePath: "/opt/officecli",
      timeoutMs: 1501,
    });
    expect(draft.timeoutSeconds).toBe("1.501");
    expect(officeCliConfigFromDraft(draft).config.timeoutMs).toBe(1501);
    expect(
      officeCliConfigDraftDirty(draft, {
        executablePath: "/opt/officecli",
        timeoutMs: 1501,
      }),
    ).toBe(false);
    for (const [ms, text] of [
      [1000, "1"],
      [120000, "120"],
      [1001, "1.001"],
      [90500, "90.5"],
      [90010, "90.01"],
      [300000, "300"],
    ] as const) {
      expect(officeCliConfigDraft({ timeoutMs: ms }).draft.timeoutSeconds).toBe(
        text,
      );
      expect(
        officeCliConfigFromDraft({
          executablePath: "officecli",
          timeoutSeconds: text,
        }).config.timeoutMs,
      ).toBe(ms);
    }
  });

  it("rejects excessive precision instead of rounding the user's value", () => {
    for (const value of [
      "1.5001",
      "0.999",
      "300.001",
      "1e2",
      "abc",
      "",
      "  ",
      "-5",
      "1.2.3",
    ])
      expect(parseOfficeCliTimeoutSeconds(value).error).not.toBe("");
    expect(
      officeCliConfigFromDraft({
        executablePath: "officecli",
        timeoutSeconds: "1.5001",
      }).error,
    ).toContain("timeoutMs");
    expect(parseOfficeCliTimeoutSeconds("90").timeoutMs).toBe(90000);
    expect(parseOfficeCliTimeoutSeconds("90.5").timeoutMs).toBe(90500);
    expect(parseOfficeCliTimeoutSeconds(" 2.25 ").timeoutMs).toBe(2250);
    expect(parseOfficeCliTimeoutSeconds("300").timeoutMs).toBe(300000);
    expect(parseOfficeCliTimeoutSeconds("1").timeoutMs).toBe(1000);
  });

  it("reports schema and executable errors without replacing a draft", () => {
    const blank = officeCliConfigFromDraft({
      executablePath: "   ",
      timeoutSeconds: "120",
    });
    expect(blank.error).toContain("executablePath");
    const broken = officeCliConfigDraft({ executablePath: 42 });
    expect(broken.error).toContain("无法解析");
    expect(broken.draft.executablePath).toBe("officecli");
    // A fresh default draft is not dirty, but any edit is.
    expect(
      officeCliConfigDraftDirty(broken.draft, {
        executablePath: "officecli",
        timeoutMs: 120000,
      }),
    ).toBe(false);
    expect(
      officeCliConfigDraftDirty(
        { executablePath: "officecli", timeoutSeconds: "121" },
        { executablePath: "officecli", timeoutMs: 120000 },
      ),
    ).toBe(true);
    // Fractional text that is not representable exactly is dirty, not equal.
    expect(
      officeCliConfigDraftDirty(
        { executablePath: "officecli", timeoutSeconds: "1.5001" },
        { executablePath: "officecli", timeoutMs: 1500 },
      ),
    ).toBe(true);
  });
});

describe("plugin drafts for known and unknown plugins", () => {
  it("keeps the browser draft unchanged and adds no editor for unknown plugins", () => {
    const browser = pluginDraftFor(BROWSER_PLUGIN_ID, {
      executablePath: "agent-browser",
      browserExecutablePath: "",
      allowedDomains: ["example.com"],
    });
    expect(browser).toEqual({
      executablePath: "agent-browser",
      browserExecutablePath: "",
      allowedDomains: "example.com",
    });
    expect(pluginDraftFor("third-party", { anything: true })).toBeUndefined();
    // Unknown plugins must never render a false "unsaved" badge.
    expect(
      pluginDraftDirty(
        "third-party",
        { executablePath: "x", timeoutSeconds: "1" },
        { anything: true },
      ),
    ).toBe(false);
  });
});

describe("HTML attachment preview limits", () => {
  it("keeps text at 1 MiB while allowing an 8 MiB HTML document", () => {
    expect(PUBLISHED_PREVIEW_MAX_BYTES).toBe(1024 * 1024);
    expect(PUBLISHED_HTML_PREVIEW_MAX_BYTES).toBe(8 * 1024 * 1024);
    // Text stays capped even though HTML shares the larger preview budget.
    expect(PUBLISHED_HTML_PREVIEW_MAX_BYTES).toBeGreaterThan(
      PUBLISHED_PREVIEW_MAX_BYTES,
    );
  });
});
