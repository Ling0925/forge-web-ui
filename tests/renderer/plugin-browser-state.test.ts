import type { PluginRecord } from "@forge/core/shared/plugins";
import { browserCommandSchema } from "@forge/core/shared/plugins";
import { describe, expect, it } from "vitest";
import {
  browserCommandMutatesPage,
  browserCommandNeedsTakeover,
  browserImageDataUrl,
  browserPermissionNotice,
  browserResultView,
  browserSnapshotRefs,
} from "../../src/renderer/state/browser-session";
import {
  browserConfigDraft,
  browserConfigFromDraft,
  configDraftDirty,
  configSchemaProperties,
  parseAllowedDomains,
  pluginCapabilityLabel,
  pluginManagementAvailable,
  pluginStatusLabel,
} from "../../src/renderer/state/plugins";
import { publishesPublishedFiles } from "../../src/renderer/state/published-file-tools";
import { makePng } from "../fixtures/png";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

function record(status: PluginRecord["status"] = "disabled") {
  return {
    manifest: {
      id: "browser",
      name: "Browser · agent-browser",
      version: "1.0.0",
      apiVersion: 1,
      description: "Official isolated browser tools.",
      builtin: true,
      capabilities: ["tools", "browser", "network", "process"],
      configSchema: {},
    },
    enabled: status !== "disabled",
    config: {
      executablePath: "agent-browser",
      browserExecutablePath: "",
      allowedDomains: [],
    },
    status,
    activeSessions: 0,
  } as unknown as PluginRecord;
}

describe("plugin configuration state", () => {
  it("keeps the browser plugin id separate from the agent-browser executable", () => {
    // Core registers the built-in manifest as `browser`; `agent-browser` is
    // only the default executablePath / optional dependency name.
    expect(record().manifest.id).toBe("browser");
    expect(browserConfigDraft(record().config).draft.executablePath).toBe(
      "agent-browser",
    );
  });

  it("maps Core config to a draft and back without losing hostnames", () => {
    const { draft, error } = browserConfigDraft({
      executablePath: "/opt/agent-browser",
      browserExecutablePath: "/usr/bin/chromium",
      allowedDomains: ["example.com", "*.trusted.example"],
    });
    expect(error).toBe("");
    expect(draft.allowedDomains).toBe("example.com\n*.trusted.example");
    const parsed = browserConfigFromDraft({
      ...draft,
      allowedDomains: "example.com, *.trusted.example example.com",
    });
    expect(parsed.error).toBe("");
    expect(parsed.config.allowedDomains).toEqual([
      "example.com",
      "*.trusted.example",
    ]);
    expect(configDraftDirty(draft, parsed.config)).toBe(false);
    expect(
      configDraftDirty({ ...draft, executablePath: "other" }, parsed.config),
    ).toBe(true);
  });

  it("round-trips an explicit all-host wildcard while keeping empty configuration empty", () => {
    const { draft, error } = browserConfigDraft({ allowedDomains: ["*"] });
    expect(error).toBe("");
    expect(draft.allowedDomains).toBe("*");
    const saved = browserConfigFromDraft({
      ...draft,
      allowedDomains: " *\n* ",
    });
    expect(saved.error).toBe("");
    expect(saved.config.allowedDomains).toEqual(["*"]);
    expect(configDraftDirty(draft, saved.config)).toBe(false);
    expect(
      browserConfigFromDraft({ ...draft, allowedDomains: "" }).config
        .allowedDomains,
    ).toEqual([]);
    expect(
      browserConfigFromDraft({ ...draft, allowedDomains: "**" }).error,
    ).toContain("allowedDomains");
  });

  it("surfaces Core schema rejections instead of silently replacing a draft", () => {
    const invalid = browserConfigFromDraft({
      executablePath: "  ",
      browserExecutablePath: "",
      allowedDomains: "",
    });
    expect(invalid.error).toContain("配置未通过 Core schema 校验");
    const origin = browserConfigFromDraft({
      executablePath: "agent-browser",
      browserExecutablePath: "",
      allowedDomains: "https://example.com/path",
    });
    expect(origin.error).toContain("allowedDomains");
    const broken = browserConfigDraft({ executablePath: 1 });
    expect(broken.error).toContain("无法解析");
    expect(broken.draft.executablePath).toBe("agent-browser");
  });

  it("never labels a configured plugin as ready", () => {
    expect(pluginStatusLabel(record("disabled"))).toBe("已禁用");
    expect(pluginStatusLabel(record("configured"))).toBe("已配置 · 未检查");
    expect(
      pluginStatusLabel({
        ...record("running"),
        activeSessions: 2,
      } as PluginRecord),
    ).toBe("运行中 · 2 个活动会话");
    expect(
      ["tools", "instructions", "browser", "network", "process"].map(
        (capability) => pluginCapabilityLabel(capability).label,
      ),
    ).toEqual(["工具", "运行指令", "浏览器", "网络", "本机进程"]);
  });

  it("reads only the Core-returned JSON schema surface", () => {
    expect(
      configSchemaProperties({
        type: "object",
        properties: {
          executablePath: { type: "string", description: "binary" },
          allowedDomains: { type: "array" },
        },
      }),
    ).toEqual([
      { name: "executablePath", type: "string", description: "binary" },
      { name: "allowedDomains", type: "array" },
    ]);
    expect(configSchemaProperties({})).toEqual([]);
  });

  it("deduplicates hostnames and reports missing plugin RPC", () => {
    expect(parseAllowedDomains("a.example b.example，a.example")).toEqual([
      "a.example",
      "b.example",
    ]);
    expect(pluginManagementAvailable()).toBe(false);
  });
});

describe("browser session state", () => {
  it("allows screenshot before takeover and requires it for every other command", () => {
    expect(browserCommandNeedsTakeover({ action: "screenshot" })).toBe(false);
    for (const command of [
      { action: "navigate", url: "https://example.com" },
      { action: "snapshot" },
      { action: "click", selector: "@e1" },
      { action: "fill", selector: "@e1", text: "x" },
      { action: "press", key: "Enter" },
      { action: "scroll", direction: "down", pixels: 100 },
    ] as const)
      expect(browserCommandNeedsTakeover(command)).toBe(true);
  });

  it("rejects credential-bearing and non-HTTP navigation before any RPC", () => {
    // The UI parses through the shared command schema, so a credential URL or a
    // javascript: URL never reaches Core even while a user is typing.
    for (const url of [
      "https://user:pass@example.com/",
      "javascript:alert(1)",
      "file:///etc/passwd",
    ])
      expect(() =>
        browserCommandSchema.parse({ action: "navigate", url }),
      ).toThrow();
    expect(
      browserCommandSchema.parse({
        action: "navigate",
        url: "https://example.com/path?q=1",
      }),
    ).toEqual({ action: "navigate", url: "https://example.com/path?q=1" });
  });

  it("invalidates refs only for page mutations", () => {
    expect(browserCommandMutatesPage({ action: "screenshot" })).toBe(false);
    expect(browserCommandMutatesPage({ action: "snapshot" })).toBe(false);
    expect(
      browserCommandMutatesPage({
        action: "navigate",
        url: "https://example.com",
      }),
    ).toBe(true);
    expect(
      browserCommandMutatesPage({
        action: "scroll",
        direction: "up",
        pixels: 10,
      }),
    ).toBe(true);
  });

  it("builds an image data URL only for a schema-valid payload", () => {
    const png = makePng(3, 2);
    expect(
      browserImageDataUrl({ mimeType: "image/png", data: png.base64 }),
    ).toBe(`data:image/png;base64,${png.base64}`);
    expect(browserImageDataUrl(undefined)).toBeUndefined();
    // Tightened contract: MIME, base64 alphabet, minimum length and %4 === 0.
    expect(
      browserImageDataUrl({ mimeType: "text/html", data: PNG } as never),
    ).toBeUndefined();
    expect(
      browserImageDataUrl({ mimeType: "image/png", data: "<svg/>" } as never),
    ).toBeUndefined();
    expect(
      browserImageDataUrl({ mimeType: "image/png", data: "abc" } as never),
    ).toBeUndefined();
    expect(
      browserImageDataUrl({ mimeType: "image/png", data: "AAAAA" } as never),
    ).toBeUndefined();
  });

  it("keeps result text and image separate from the status flags", () => {
    expect(
      browserResultView({
        sessionId: "s" as never,
        available: true,
        takeover: false,
        result: {
          text: "captured",
          isError: false,
          image: { mimeType: "image/png", data: PNG },
        },
      }),
    ).toEqual({
      text: "captured",
      isError: false,
      image: { mimeType: "image/png", data: PNG },
    });
    expect(
      browserResultView({
        sessionId: "s" as never,
        available: false,
        takeover: false,
      }),
    ).toBeUndefined();
  });

  it("reads both snapshot ref spellings and states the permission rules", () => {
    expect(
      browserSnapshotRefs('- button "Go" [ref=e12]\n- link @e7\n- @e7 again'),
    ).toEqual(["@e12", "@e7"]);
    expect(browserPermissionNotice("readonly")).toContain("归还控制权");
    expect(browserPermissionNotice("workspace")).toContain("不绕过审批");
    expect(browserPermissionNotice(undefined)).toContain("运行取消");
  });

  it("classifies only host-owned publishing tools as attachment sources", () => {
    expect(publishesPublishedFiles("publish_file")).toBe(true);
    expect(publishesPublishedFiles("browser_screenshot")).toBe(true);
    expect(publishesPublishedFiles("run_command")).toBe(false);
    expect(publishesPublishedFiles("browser_snapshot")).toBe(false);
  });
});
