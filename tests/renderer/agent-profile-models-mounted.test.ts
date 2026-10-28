import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;

interface AgentModelsTestState {
  settings: any;
  dirty: boolean;
  busy: boolean;
}

interface AgentModelsTestController {
  state: { settings: any };
  updateSettings: (input: any) => Promise<{ ok: boolean; settings?: any; error?: string }>;
  loadSettings: () => Promise<any>;
}

declare global {
  interface Window {
    __agentModelsUpdateCalls: any[];
    __agentModelsEscapeModalClosed: boolean;
    __agentModelsState: AgentModelsTestState;
    __agentModelsController: AgentModelsTestController;
    __agentModelsSetSettings: (updater: any) => void;
    __agentModelsDelaySave: boolean;
    __agentModelsResolveSave?: () => void;
  }
}

describe("Agent Profile Models Mounted Tests", () => {
  let bundle: Awaited<ReturnType<typeof build>>;
  let browser: Browser;
  const pageErrors: string[] = [];

  beforeAll(async () => {
    bundle = await build({
      stdin: {
        resolveDir: resolve("."),
        loader: "tsx",
        contents: `
          import { createRoot } from "react-dom/client";
          import { useState } from "react";
          import { AgentProfilesPanel } from "./src/renderer/components/workbench/AgentProfilesPanel";
          import { defaultPublicSettings } from "@forge/core/shared/schemas";
          import "./src/renderer/styles/tokens.css";
          import "./src/renderer/styles/workspace-theme.css";
          import "./src/renderer/components/workbench/settings-page.css";

          window.__agentModelsUpdateCalls = [];
          window.__agentModelsEscapeModalClosed = false;
          window.__agentModelsDelaySave = false;

          const initialProfile = {
            id: "legacy-agent",
            name: "旧角色",
            description: "旧角色描述",
            whenToUse: "需要使用旧角色时",
            instructions: "保持旧配置不变。",
            enabled: true,
            model: {
              mode: "fixed",
              providerSourceId: "provider-a",
              model: "unlisted-legacy-99",
            },
            permission: "workspace",
            tools: { mode: "inherit" },
            isolation: "shared",
            revision: 1,
          };

          const providerSources = [
            {
              id: "provider-a",
              label: "Provider Alpha",
              model: "alpha-primary",
              modelSelection: {
                mode: "all",
                models: ["alpha-primary", "shared-id", "alpha-extra"],
              },
            },
            {
              id: "provider-b",
              label: "Provider Beta",
              model: "beta-primary",
              modelSelection: {
                mode: "selected",
                models: ["beta-primary", "shared-id"],
                manual: [{ id: "beta-hidden-from-selected" }],
              },
            },
            {
              id: "provider-none",
              label: "Provider None",
              model: "none-model",
              modelSelection: {
                mode: "none",
                models: ["none-model"],
              },
            },
          ];

          function AgentModelsTestHost() {
            const [settings, setSettings] = useState({
              ...defaultPublicSettings,
              activeSourceId: "provider-a",
              agentProfiles: [initialProfile],
              providerSources,
            });
            const [dirty, setDirty] = useState(false);
            const [busy, setBusy] = useState(false);

            window.__agentModelsSetSettings = setSettings;
            window.__agentModelsState = { settings, dirty, busy };

            const updateSettings = async (input: any) => {
              window.__agentModelsUpdateCalls.push(input);
              if (window.__agentModelsDelaySave) {
                await new Promise<void>((resolve) => {
                  window.__agentModelsResolveSave = resolve;
                });
              }
              if (input.agent) {
                const op = input.agent;
                let nextProfiles = [...(settings.agentProfiles || [])];
                if (op.type === "save") {
                  const idx = nextProfiles.findIndex((p: any) => p.id === op.profile.id);
                  const saved = { ...op.profile, revision: (op.expectedRevision || 0) + 1 };
                  if (idx >= 0) {
                    nextProfiles[idx] = saved;
                  } else {
                    nextProfiles.push(saved);
                  }
                } else if (op.type === "remove") {
                  nextProfiles = nextProfiles.filter((p: any) => p.id !== op.id);
                }
                const nextSettings = { ...settings, agentProfiles: nextProfiles };
                setSettings(nextSettings);
                return { ok: true, settings: nextSettings };
              }
              return { ok: true, settings };
            };

            window.__agentModelsController = {
              state: { settings },
              updateSettings,
              loadSettings: async () => settings,
            };

            return (
              <div
                id="mock-settings-modal"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    window.__agentModelsEscapeModalClosed = true;
                  }
                }}
              >
                <div id="test-container" style={{ width: "390px" }}>
                  <AgentProfilesPanel onDirtyChange={setDirty} onBusyChange={setBusy} />
                  <div id="dirty-indicator" data-dirty={String(dirty)} />
                  <div id="busy-indicator" data-busy={String(busy)} />
                </div>
              </div>
            );
          }

          createRoot(document.getElementById("root")!).render(<AgentModelsTestHost />);
        `,
      },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      outfile: "agent-profile-models-test.js",
      loader: { ".woff2": "dataurl" },
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [
        {
          name: "agent-models-test-host",
          setup(api) {
            api.onLoad({ filter: /workbench-context\.tsx$/ }, () => ({
              loader: "tsx",
              resolveDir: resolve("."),
              contents: `
                export function useWorkbench() {
                  return window.__agentModelsController;
                }
              `,
            }));
          },
        },
      ],
    });

    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    expect(pageErrors).toEqual([]);
  });

  const setupPage = async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    page.on("pageerror", error => pageErrors.push(error.message));
    const script = bundle.outputFiles?.find(file => file.path.endsWith(".js"))?.text;
    const css = bundle.outputFiles?.find(file => file.path.endsWith(".css"))?.text;
    if (!script || !css) throw new Error("The mounted test needs both the rendered component and its styles");
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>${css}</style>
        </head>
        <body style="margin: 0; padding: 0; background: var(--canvas-bg);">
          <div id="root"></div>
          <script>${script}</script>
        </body>
      </html>
    `);
    await page.waitForSelector(".agent-profiles-panel");
    return page;
  };

  it("directly selects a configured model and saves accurate source and model ID", async () => {
    const page = await setupPage();
    try {
      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      await page.locator("#agent-input-id").fill("agent-alpha");
      await page.locator("#agent-input-name").fill("Alpha 智能体");

      // Switch to fixed model
      await page.getByRole("button", { name: "模型模式选择", exact: true }).click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();

      // Should default to activeSourceId ("provider-a") and its default model ("alpha-primary")
      const modelTrigger = page.getByRole("button", { name: "智能体模型", exact: true });
      expect(await modelTrigger.isVisible()).toBe(true);
      expect(await modelTrigger.innerText()).toContain("alpha-primary");

      // Select another configured model "alpha-extra"
      await modelTrigger.click();
      await page.getByRole("option", { name: "alpha-extra", exact: true }).click();
      expect(await modelTrigger.innerText()).toContain("alpha-extra");

      // Precise ID text input should NOT be displayed when an available configured model is selected
      expect(await page.getByLabel("精确模型 ID", { exact: true }).count()).toBe(0);

      // Save
      await page.getByRole("button", { name: "保存智能体角色", exact: true }).click();
      await expect.poll(() => page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");

      const updateCalls = await page.evaluate(() => window.__agentModelsUpdateCalls);
      const lastSave = updateCalls.at(-1)?.agent;
      expect(lastSave?.type).toBe("save");
      expect(lastSave?.profile?.model).toEqual({
        mode: "fixed",
        providerSourceId: "provider-a",
        model: "alpha-extra",
      });
    } finally {
      await page.close();
    }
  });

  it("switches providers without leaking or retaining prior models", async () => {
    const page = await setupPage();
    try {
      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      await page.locator("#agent-input-id").fill("agent-cross-provider");
      await page.locator("#agent-input-name").fill("跨源测试");

      await page.getByRole("button", { name: "模型模式选择", exact: true }).click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();

      // On provider-a, select "shared-id"
      const modelTrigger = page.getByRole("button", { name: "智能体模型", exact: true });
      await modelTrigger.click();
      await page.getByRole("option", { name: "shared-id", exact: true }).click();
      expect(await modelTrigger.innerText()).toContain("shared-id");

      // Switch provider to provider-b
      const providerTrigger = page.getByRole("button", { name: "Provider 来源", exact: true });
      await providerTrigger.click();
      await page.getByRole("option", { name: /Provider Beta/ }).click();

      // Switching provider must re-select provider-b's default model ("beta-primary")
      expect(await modelTrigger.innerText()).toContain("beta-primary");

      // Switch back to provider-a
      await providerTrigger.click();
      await page.getByRole("option", { name: /Provider Alpha/ }).click();
      // provider-a's default model is "alpha-primary"
      expect(await modelTrigger.innerText()).toContain("alpha-primary");
    } finally {
      await page.close();
    }
  });

  it("respects modelSelection mode selected and none", async () => {
    const page = await setupPage();
    try {
      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      await page.getByRole("button", { name: "模型模式选择", exact: true }).click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();

      // Switch to provider-b which has mode: 'selected'
      const providerTrigger = page.getByRole("button", { name: "Provider 来源", exact: true });
      await providerTrigger.click();
      await page.getByRole("option", { name: /Provider Beta/ }).click();

      // Open model dropdown and inspect available options
      const modelTrigger = page.getByRole("button", { name: "智能体模型", exact: true });
      await modelTrigger.click();
      // Should show beta-primary, shared-id, and manual option
      expect(await page.getByRole("option", { name: "beta-primary", exact: true }).isVisible()).toBe(true);
      expect(await page.getByRole("option", { name: "shared-id", exact: true }).isVisible()).toBe(true);
      // "beta-hidden-from-selected" was in manual but not in selection.models, so it must not be visible
      expect(await page.getByRole("option", { name: "beta-hidden-from-selected", exact: true }).count()).toBe(0);
      await page.keyboard.press("Escape");

      // Switch to provider-none which has mode: 'none'
      await providerTrigger.click();
      await page.getByRole("option", { name: /Provider None/ }).click();

      // provider-none has no selectable models; manual input must appear with notice
      expect(await page.getByText(/未列出可用模型/).isVisible()).toBe(true);
      const manualInput = page.getByLabel("精确模型 ID", { exact: true });
      expect(await manualInput.isVisible()).toBe(true);
      expect(await manualInput.inputValue()).toBe("");
    } finally {
      await page.close();
    }
  });

  it("preserves unlisted legacy model ID on edit and save without overwriting", async () => {
    const page = await setupPage();
    try {
      // initialProfile has unlisted model "unlisted-legacy-99" under provider-a
      await page.getByRole("button", { name: "编辑", exact: true }).click();

      // Check that model trigger shows "手动输入模型 ID…" or manual indication
      const modelTrigger = page.getByRole("button", { name: "智能体模型", exact: true });
      expect(await modelTrigger.isVisible()).toBe(true);
      expect(await modelTrigger.innerText()).toContain("手动输入模型 ID");

      // Manual input must be displayed and contain the unlisted ID
      const manualInput = page.getByLabel("精确模型 ID", { exact: true });
      expect(await manualInput.isVisible()).toBe(true);
      expect(await manualInput.inputValue()).toBe("unlisted-legacy-99");

      // Notice should be present explaining unlisted model
      expect(await page.getByText(/未在来源已配置模型列表中/).isVisible()).toBe(true);

      // Only modify description and save
      await page.locator("#agent-input-desc").fill("更新描述但保留旧模型绑定");
      await page.getByRole("button", { name: "保存智能体角色", exact: true }).click();
      await expect.poll(() => page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");

      const updateCalls = await page.evaluate(() => window.__agentModelsUpdateCalls);
      const lastSave = updateCalls.at(-1)?.agent;
      expect(lastSave?.profile?.model).toEqual({
        mode: "fixed",
        providerSourceId: "provider-a",
        model: "unlisted-legacy-99",
      });
    } finally {
      await page.close();
    }
  });

  it("allows switching from manual mode back to configured model, and typing does not hide manual input", async () => {
    const page = await setupPage();
    try {
      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      await page.locator("#agent-input-id").fill("agent-manual-toggle");
      await page.locator("#agent-input-name").fill("手动切换测试");

      await page.getByRole("button", { name: "模型模式选择", exact: true }).click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();

      const modelTrigger = page.getByRole("button", { name: "智能体模型", exact: true });
      await modelTrigger.click();
      await page.getByRole("option", { name: /手动输入模型 ID/ }).click();

      // Manual input should now be visible
      const manualInput = page.getByLabel("精确模型 ID", { exact: true });
      expect(await manualInput.isVisible()).toBe(true);

      // Type a model name that matches a configured ID ("alpha-primary")
      await manualInput.fill("alpha-primary");
      // Even though text matches "alpha-primary", manual input must NOT suddenly disappear!
      expect(await manualInput.isVisible()).toBe(true);
      expect(await manualInput.inputValue()).toBe("alpha-primary");

      // Now click the dropdown and choose a configured model "alpha-extra"
      await modelTrigger.click();
      await page.getByRole("option", { name: "alpha-extra", exact: true }).click();

      // Manual input must disappear, and dropdown displays "alpha-extra"
      expect(await page.getByLabel("精确模型 ID", { exact: true }).count()).toBe(0);
      expect(await modelTrigger.innerText()).toContain("alpha-extra");
    } finally {
      await page.close();
    }
  });

  it("handles empty provider sources gracefully with notice and manual inputs", async () => {
    const page = await setupPage();
    try {
      // Clear provider sources in state via React setSettings
      await page.evaluate(() => {
        window.__agentModelsSetSettings((prev: any) => ({
          ...prev,
          providerSources: [],
        }));
      });

      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      await page.locator("#agent-input-id").fill("agent-no-sources");
      await page.locator("#agent-input-name").fill("无源智能体");

      await page.getByRole("button", { name: "模型模式选择", exact: true }).click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();

      // Callout for no sources must be visible
      expect(await page.getByText(/尚未配置任何模型服务来源/).isVisible()).toBe(true);

      // Manual inputs for source and model must be available
      await page.locator("#agent-input-source").fill("custom-src");
      await page.locator("#agent-input-model").fill("custom-model");

      await page.getByRole("button", { name: "保存智能体角色", exact: true }).click();
      await expect.poll(() => page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");

      const updateCalls = await page.evaluate(() => window.__agentModelsUpdateCalls);
      const lastSave = updateCalls.at(-1)?.agent;
      expect(lastSave?.profile?.model).toEqual({
        mode: "fixed",
        providerSourceId: "custom-src",
        model: "custom-model",
      });
    } finally {
      await page.close();
    }
  });

  it("pressing Escape in model dropdown closes menu without closing outer modal", async () => {
    const page = await setupPage();
    try {
      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      await page.getByRole("button", { name: "模型模式选择", exact: true }).click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();

      const modelTrigger = page.getByRole("button", { name: "智能体模型", exact: true });
      await modelTrigger.click();

      // Dropdown popover is visible
      expect(await page.getByRole("listbox").isVisible()).toBe(true);

      // Press Escape
      await page.keyboard.press("Escape");

      // Dropdown popover should close
      expect(await page.getByRole("listbox").count()).toBe(0);

      // Outer modal should NOT have closed
      const escapeClosed = await page.evaluate(() => window.__agentModelsEscapeModalClosed);
      expect(escapeClosed).toBe(false);
    } finally {
      await page.close();
    }
  });

  it("uses the active source's visible default and keeps the model when reselecting the same source or mode", async () => {
    const page = await setupPage();
    try {
      await page.evaluate(() => window.__agentModelsSetSettings((prev: any) => ({
        ...prev,
        activeSourceId: "provider-b",
        providerSources: prev.providerSources.map((source: any) => source.id === "provider-b"
          ? { ...source, model: "hidden-default" } : source),
      })));
      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      const mode = page.getByRole("button", { name: "模型模式选择", exact: true });
      await mode.click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();
      const models = page.getByRole("button", { name: "智能体模型", exact: true });
      const source = page.getByRole("button", { name: "Provider 来源", exact: true });
      expect(await source.textContent()).toContain("Provider Beta");
      expect(await models.textContent()).toContain("beta-primary");
      await models.click();
      expect(await page.getByRole("option", { name: "hidden-default", exact: true }).count()).toBe(0);
      await page.getByRole("option", { name: "shared-id", exact: true }).click();
      await source.click();
      await page.getByRole("option", { name: /Provider Beta/ }).click();
      await mode.click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();
      expect(await models.textContent()).toContain("shared-id");
      await page.getByRole("button", { name: "保存智能体角色", exact: true }).click();
      await expect.poll(() => page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");
      const saved = (await page.evaluate(() => window.__agentModelsUpdateCalls)).at(-1);
      expect(Object.keys(saved)).toEqual(["agent"]);
      expect(saved.agent.profile.model).toEqual({ mode: "fixed", providerSourceId: "provider-b", model: "shared-id" });
    } finally {
      await page.close();
    }
  });

  it("retains a missing source and legacy ID without allowing the missing option to clear the binding", async () => {
    const page = await setupPage();
    try {
      await page.evaluate(() => window.__agentModelsSetSettings((prev: any) => ({
        ...prev, providerSources: prev.providerSources.filter((source: any) => source.id !== "provider-a"),
      })));
      await page.getByRole("button", { name: "编辑", exact: true }).click();
      const source = page.getByRole("button", { name: "Provider 来源", exact: true });
      expect(await source.textContent()).toContain("provider-a（未找到配置）");
      expect(await page.getByLabel("精确模型 ID", { exact: true }).inputValue()).toBe("unlisted-legacy-99");
      expect(await page.getByRole("alert").textContent()).toContain("已保留原绑定");
      await source.click();
      expect(await page.getByRole("option", { name: /provider-a（未找到配置）/ }).isDisabled()).toBe(true);
      await page.keyboard.press("Escape");
      expect(await page.getByLabel("精确模型 ID", { exact: true }).inputValue()).toBe("unlisted-legacy-99");
      expect(await page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");
      expect(await page.evaluate(() => window.__agentModelsUpdateCalls)).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("preserves the draft if model visibility changes while editing and keeps manual typing stable", async () => {
    const page = await setupPage();
    try {
      await page.evaluate(() => window.__agentModelsSetSettings((prev: any) => ({
        ...prev, agentProfiles: prev.agentProfiles.map((profile: any) => ({
          ...profile, model: { ...profile.model, model: "alpha-primary" },
        })),
      })));
      await page.getByRole("button", { name: "编辑", exact: true }).click();
      expect(await page.getByLabel("精确模型 ID", { exact: true }).count()).toBe(0);
      await page.evaluate(() => window.__agentModelsSetSettings((prev: any) => ({
        ...prev, providerSources: prev.providerSources.map((source: any) => source.id === "provider-a"
          ? { ...source, modelSelection: { mode: "none" } } : source),
      })));
      const manual = page.getByLabel("精确模型 ID", { exact: true });
      await manual.waitFor();
      expect(await manual.inputValue()).toBe("alpha-primary");
      expect(await page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");
      await manual.fill("shared-id");
      await page.evaluate(() => window.__agentModelsSetSettings((prev: any) => ({
        ...prev, providerSources: prev.providerSources.map((source: any) => source.id === "provider-a"
          ? { ...source, modelSelection: { mode: "all", models: ["alpha-primary", "shared-id"] } } : source),
      })));
      expect(await manual.inputValue()).toBe("shared-id");
      expect(await manual.isVisible()).toBe(true);
      expect(await page.evaluate(() => window.__agentModelsUpdateCalls)).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("disables model controls when busy saving", async () => {
    const page = await setupPage();
    try {
      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      await page.locator("#agent-input-id").fill("agent-busy");
      await page.locator("#agent-input-name").fill("繁忙测试");

      await page.getByRole("button", { name: "模型模式选择", exact: true }).click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();

      // Enable delay save
      await page.evaluate(() => {
        window.__agentModelsDelaySave = true;
      });

      // Click save
      await page.getByRole("button", { name: "保存智能体角色", exact: true }).click();
      await expect.poll(() => page.locator("#busy-indicator").getAttribute("data-busy")).toBe("true");

      // Controls should be disabled
      const modelTrigger = page.getByRole("button", { name: "智能体模型", exact: true });
      expect(await modelTrigger.isDisabled()).toBe(true);

      const providerTrigger = page.getByRole("button", { name: "Provider 来源", exact: true });
      expect(await providerTrigger.isDisabled()).toBe(true);

      // Resolve save
      await page.evaluate(() => {
        window.__agentModelsResolveSave?.();
      });
      await expect.poll(() => page.locator("#busy-indicator").getAttribute("data-busy")).toBe("false");
      expect(await modelTrigger.isEnabled()).toBe(true);
    } finally {
      await page.close();
    }
  });
});
