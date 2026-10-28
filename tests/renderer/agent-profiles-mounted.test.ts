import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;

declare global {
  interface Window {
    updateCalls: any[];
    failWithConflict: boolean;
    getSettingsCalls: number;
    testState: any;
    testController: any;
  }
}

describe("Agent Profiles Mounted Tests", () => {
  it("verifies CRUD payloads, templates, toggles, duplicate, conflict preservation, and draft protection", async () => {
    const bundle = await build({
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

          window.updateCalls = [];
          window.failWithConflict = false;
          window.getSettingsCalls = 0;

          const initialProfile = {
            id: "reviewer",
            name: "代码审查",
            description: "检查代码质量与规范",
            whenToUse: "在完成功能需要独立审阅时",
            instructions: "仔细审阅 diff 与测试。",
            enabled: true,
            model: { mode: "inherit" },
            permission: "readonly",
            tools: { mode: "restricted", groups: ["read"], mcpServers: [] },
            isolation: "shared",
            revision: 1,
          };

          function TestHost() {
            const [settings, setSettings] = useState({
              ...defaultPublicSettings,
              agentProfiles: [initialProfile],
              providerSources: [{ id: "default", label: "Default Provider", model: "cn:deepseek-v4.1-flash" }],
            });
            const [dirty, setDirty] = useState(false);
            const [busy, setBusy] = useState(false);

            window.testState = { settings, dirty, busy };

            window.forge = {
              getSettings: async () => {
                window.getSettingsCalls++;
                return {
                  ...settings,
                  agentProfiles: (settings.agentProfiles || []).map((p) => ({
                    ...p,
                    revision: p.revision + 1,
                    name: "服务器最新探索",
                  })),
                };
              },
            };

            const updateSettings = async (input) => {
              window.updateCalls.push(input);
              if (window.failWithConflict) {
                return {
                  ok: false,
                  error: "该智能体配置已被其他窗口或 CLI 修改。请重新加载设置后再保存，避免覆盖对方的改动。",
                };
              }
              if (input.agent) {
                const op = input.agent;
                let nextProfiles = [...(settings.agentProfiles || [])];
                if (op.type === "save") {
                  const idx = nextProfiles.findIndex(p => p.id === op.profile.id);
                  const saved = { ...op.profile, revision: (op.expectedRevision || 0) + 1 };
                  if (idx >= 0) {
                    nextProfiles[idx] = saved;
                  } else {
                    nextProfiles.push(saved);
                  }
                } else if (op.type === "remove") {
                  nextProfiles = nextProfiles.filter(p => p.id !== op.id);
                }
                const nextSettings = { ...settings, agentProfiles: nextProfiles };
                setSettings(nextSettings);
                return { ok: true, settings: nextSettings };
              }
              return { ok: true, settings };
            };

            window.testController = {
              state: { settings },
              updateSettings,
              loadSettings: async () => {
                const latest = await window.forge.getSettings();
                setSettings(latest);
                return latest;
              },
            };

            return (
              <div id="test-container">
                <AgentProfilesPanel onDirtyChange={setDirty} onBusyChange={setBusy} />
                <div id="dirty-indicator" data-dirty={String(dirty)} />
              </div>
            );
          }

          createRoot(document.getElementById("root")).render(<TestHost />);
        `,
      },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      outfile: "agent-profiles-test.js",
      loader: { ".woff2": "dataurl" },
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [
        {
          name: "agent-test-host",
          setup(api) {
            api.onLoad({ filter: /workbench-context\.tsx$/ }, () => ({
              loader: "tsx",
              resolveDir: resolve("."),
              contents: `
                export function useWorkbench() {
                  return window.testController;
                }
              `,
            }));
          },
        },
      ],
    });

    const browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });

    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      page.on("dialog", (dialog) => dialog.accept());
      await page.setContent('<div id="root"></div>');
      await page.addStyleTag({
        content: bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text,
      });
      await page.addScriptTag({
        content: bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text,
      });

      // 1. Initial render & Old data compatibility check
      await page.getByRole("region", { name: "智能体角色配置" }).waitFor();
      expect(await page.getByText("已配置 1 / 64 个智能体").count()).toBe(1);
      expect(await page.getByText("代码审查").count()).toBe(1);

      // 2. Enable/Disable toggle test
      const toggleBtn = page.getByRole("button", { name: "停用", exact: true });
      await toggleBtn.click();
      await page.waitForTimeout(60);

      const toggleCall = (await page.evaluate(() => window.updateCalls)).at(-1);
      expect(toggleCall).toEqual({
        agent: {
          type: "save",
          profile: expect.objectContaining({
            id: "reviewer",
            enabled: false,
          }),
          expectedRevision: 1,
        },
      });

      // 3. Add from template: Explorer
      await page.getByRole("button", { name: "从模板添加" }).click();
      await page.getByRole("menuitem", { name: /探索/ }).click();
      await page.getByRole("region", { name: "智能体编辑器" }).waitFor();

      expect(await page.locator("#agent-input-id").inputValue()).toBe("explorer");
      expect(await page.locator("#agent-input-name").inputValue()).toBe("探索");

      // Check dirty indicator
      expect(await page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("true");

      // Save new profile
      await page.getByRole("button", { name: "保存智能体角色" }).click();
      await page.waitForTimeout(60);

      const saveNewCall = (await page.evaluate(() => window.updateCalls)).at(-1);
      expect(saveNewCall).toEqual({
        agent: {
          type: "save",
          profile: expect.objectContaining({
            id: "explorer",
            name: "探索",
            permission: "readonly",
            isolation: "shared",
          }),
          expectedRevision: 0,
        },
      });

      // After save success, dirty indicator must reset to false
      expect(await page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");

      // 4. Return to list and verify count is now 2
      await page.getByRole("button", { name: "返回列表" }).click();
      await page.getByRole("region", { name: "智能体角色配置" }).waitFor();
      expect(await page.getByText("已配置 2 / 64 个智能体").count()).toBe(1);

      // 5. Duplicate test
      const copyBtns = page.getByRole("button", { name: "复制", exact: true });
      await copyBtns.first().click();
      await page.getByRole("region", { name: "智能体编辑器" }).waitFor();
      const duplicateId = await page.locator("#agent-input-id").inputValue();
      expect(duplicateId).toMatch(/copy/);

      // Cancel duplicate
      await page.getByRole("button", { name: "返回列表" }).click();

      // 6. Delete confirmation test
      const deleteBtn = page.getByRole("button", { name: /删除智能体/ }).first();
      await deleteBtn.click();
      expect(await page.getByText("确认删除？此操作不可逆").count()).toBe(1);

      // Click cancel
      await page.getByRole("button", { name: "取消", exact: true }).click();
      expect(await page.getByText("确认删除？此操作不可逆").count()).toBe(0);

      // Confirm delete
      await deleteBtn.click();
      await page.getByRole("button", { name: "确定删除", exact: true }).click();
      await page.waitForTimeout(60);

      const deleteCall = (await page.evaluate(() => window.updateCalls)).at(-1);
      expect(deleteCall?.agent?.type).toBe("remove");

      // 7. Conflict handling: retain draft, and refresh from host test
      // Edit remaining profile (explorer)
      await page.getByRole("button", { name: "编辑", exact: true }).click();
      await page.getByRole("region", { name: "智能体编辑器" }).waitFor();
      await page.locator("#agent-input-name").fill("探索（修改中）");

      // Inject conflict failure
      await page.evaluate(() => {
        window.failWithConflict = true;
      });

      await page.getByRole("button", { name: "保存智能体角色" }).click();
      await page.waitForTimeout(60);

      // Verify draft is retained and conflict notice is displayed
      expect(await page.getByText(/版本冲突/).count()).toBe(1);
      expect(await page.locator("#agent-input-name").inputValue()).toBe("探索（修改中）");

      // Click "刷新为最新配置"
      const refreshBtn = page.getByRole("button", { name: "刷新为最新配置" });
      expect(await refreshBtn.count()).toBe(1);
      await refreshBtn.click();
      await page.waitForTimeout(60);

      // Verify window.forge.getSettings was called
      const getSettingsCalls = await page.evaluate(() => window.getSettingsCalls);
      expect(getSettingsCalls).toBe(1);

      // 8. Test SettingsSelect Escape keydown: only closes dropdown popover, does not close modal
      const selectTrigger = page.getByRole("button", { name: /模型模式选择/ });
      await selectTrigger.click();
      expect(await selectTrigger.getAttribute("aria-expanded")).toBe("true");
      expect(await page.getByRole("listbox", { name: /模型模式选择/ }).count()).toBe(1);

      // Press Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(60);

      // Verify dropdown is closed but editor is still mounted
      expect(await selectTrigger.getAttribute("aria-expanded")).toBe("false");
      expect(await page.getByRole("listbox", { name: /模型模式选择/ }).count()).toBe(0);
      expect(await page.getByRole("region", { name: "智能体编辑器" }).count()).toBe(1);
      expect(await page.locator("#agent-input-name").inputValue()).toBe("服务器最新探索");
      await page.getByRole("button", { name: "返回列表" }).click();
      expect(await page.getByRole("article", { name: "智能体：服务器最新探索", exact: true }).count()).toBe(1);
      await page.getByRole("button", { name: "编辑", exact: true }).click();
      await page.evaluate(() => { window.failWithConflict = false; });

      // A typed comma must survive until the user can enter the next MCP ID.
      await page.getByRole("switch", { name: "MCP", exact: true }).click();
      const servers = page.getByLabel("允许的 MCP 服务器列表", { exact: true });
      await servers.pressSequentially("github, memory");
      expect(await servers.inputValue()).toBe("github, memory");
      await selectTrigger.click();
      await page.getByRole("option", { name: /固定绑定模型/ }).click();
      await page.getByLabel("精确模型 ID", { exact: true }).fill("ag/gemini-3.8-flash");
      await page.locator("#agent-input-instructions").fill("长".repeat(9000));
      await page.getByRole("button", { name: "保存智能体角色" }).click();
      await expect.poll(() => page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");
      const fullSave = (await page.evaluate(() => window.updateCalls)).at(-1).agent;
      expect(fullSave.profile.tools.mcpServers).toEqual(["github", "memory"]);
      expect(fullSave.profile.model).toEqual({ mode: "fixed", providerSourceId: "default", model: "ag/gemini-3.8-flash" });
      expect(fullSave.profile.instructions).toHaveLength(9000);
      expect(fullSave.expectedRevision).toBe(2);

      // Maximum-length identifiers remain valid when duplicated.
      await page.getByRole("button", { name: "返回列表" }).click();
      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      await page.locator("#agent-input-id").fill("a".repeat(64));
      await page.locator("#agent-input-name").fill("名".repeat(80));
      await page.getByRole("button", { name: "保存智能体角色" }).click();
      await expect.poll(() => page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");
      await page.getByRole("button", { name: "返回列表" }).click();
      await page.getByRole("article", { name: `智能体：${"名".repeat(80)}`, exact: true }).getByRole("button", { name: "复制", exact: true }).click();
      expect(await page.locator("#agent-input-id").inputValue()).toHaveLength(64);
      expect(await page.locator("#agent-input-name").inputValue()).toHaveLength(80);
      await page.getByRole("button", { name: "保存智能体角色" }).click();
      await expect.poll(() => page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");
    } finally {
      await browser.close();
    }
  });
});
