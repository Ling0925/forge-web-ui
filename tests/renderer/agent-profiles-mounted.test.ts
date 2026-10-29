import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;

declare global {
  interface Window {
    updateCalls: any[];
    failWithConflict: boolean;
    failGetSettings: boolean;
    getSettingsCalls: number;
    escapeModalClosed: boolean;
    testState: any;
    testController: any;
  }
}

describe("Agent Profiles Mounted Tests", () => {
  let bundle: any;
  let browser: Browser;

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

          window.updateCalls = [];
          window.failWithConflict = false;
          window.failGetSettings = false;
          window.getSettingsCalls = 0;
          window.escapeModalClosed = false;

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
                if (window.failGetSettings) {
                  throw new Error("服务端连接超时");
                }
                return {
                  ...settings,
                  agentProfiles: (settings.agentProfiles || []).map((p) => ({
                    ...p,
                    revision: p.revision + 1,
                    name: p.id === "reviewer" ? "代码审查（权威更新）" : "服务器最新探索",
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
              <div
                id="mock-settings-modal"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    window.escapeModalClosed = true;
                  }
                }}
              >
                <div id="test-container">
                  <AgentProfilesPanel onDirtyChange={setDirty} onBusyChange={setBusy} />
                  <div id="dirty-indicator" data-dirty={String(dirty)} />
                </div>
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

    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  });

  afterAll(async () => {
    await browser?.close();
  });

  const setupPage = async () => {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    page.on("dialog", (dialog) => dialog.accept());
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({
      content: bundle.outputFiles.find((f: any) => f.path.endsWith(".css"))!.text,
    });
    await page.addScriptTag({
      content: bundle.outputFiles.find((f: any) => f.path.endsWith(".js"))!.text,
    });
    return page;
  };

  it("verifies CRUD payloads, templates, toggles, duplicate, conflict preservation, and draft protection", async () => {
    const page = await setupPage();
    try {
      // 1. Initial render & Old data compatibility check
      await page.getByRole("region", { name: "智能体角色配置" }).waitFor();
      expect(await page.getByText("已配置 1 / 64 个智能体").count()).toBe(1);
      expect(await page.getByText("代码审查").count()).toBe(1);

      // 2. Enable/Disable toggle test
      const toggleBtn = page.getByRole("button", { name: "停用", exact: true });
      await toggleBtn.click();
      await expect.poll(async () => {
        const calls = await page.evaluate(() => window.updateCalls);
        return calls.length;
      }).toBeGreaterThan(0);

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
      await expect.poll(async () => {
        return await page.locator("#dirty-indicator").getAttribute("data-dirty");
      }).toBe("false");

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
      await expect.poll(async () => {
        const calls = await page.evaluate(() => window.updateCalls);
        return calls.at(-1)?.agent?.type;
      }).toBe("remove");

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
      await expect.poll(async () => {
        return await page.getByText(/版本冲突/).count();
      }).toBe(1);

      // Verify draft is retained and conflict notice is displayed
      expect(await page.locator("#agent-input-name").inputValue()).toBe("探索（修改中）");

      // Click "刷新为最新配置"
      const refreshBtn = page.getByRole("button", { name: "刷新为最新配置" });
      expect(await refreshBtn.count()).toBe(1);
      await refreshBtn.click();

      // Verify window.forge.getSettings was called
      await expect.poll(async () => {
        return await page.evaluate(() => window.getSettingsCalls);
      }).toBe(1);

      // 8. Test SettingsSelect Escape keydown
      const selectTrigger = page.getByRole("button", { name: /模型模式选择/ });
      await selectTrigger.click();
      expect(await selectTrigger.getAttribute("aria-expanded")).toBe("true");
      expect(await page.getByRole("listbox", { name: /模型模式选择/ }).count()).toBe(1);

      // Press Escape
      await page.keyboard.press("Escape");
      await expect.poll(async () => {
        return await selectTrigger.getAttribute("aria-expanded");
      }).toBe("false");

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
      await page.getByRole("button", { name: "智能体模型", exact: true }).click();
      await page.getByRole("option", { name: /手动输入模型 ID/ }).click();
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
      await page.close();
    }
  });

  it.each(["new", "frontend", "backend"])("defaults %s roles to parent permission inheritance and saves that policy", async kind => {
    const page = await setupPage();
    try {
      if (kind === "new") {
        await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      } else {
        await page.getByRole("button", { name: "从模板添加", exact: true }).click();
        await page.getByRole("menuitem", { name: kind === "frontend" ? /前端设计与实现/ : /后端实现/ }).click();
      }
      const permission = page.getByRole("button", { name: "权限上限选择", exact: true });
      expect(await permission.textContent()).toContain("继承主会话权限");
      expect(await page.getByRole("note").filter({ hasText: "当前角色仍需逐次用户审批" }).count()).toBe(0);
      await page.getByRole("button", { name: "保存智能体角色", exact: true }).click();
      await expect.poll(() => page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");
      const saved = (await page.evaluate(() => window.updateCalls)).at(-1).agent;
      expect(saved.profile.permission).toBe("unrestricted");
      expect(saved.expectedRevision).toBe(0);
      await page.getByRole("button", { name: "返回列表", exact: true }).click();
      await page.getByRole("article", { name: `智能体：${saved.profile.name}`, exact: true })
        .getByText("权限：继承主会话", { exact: true }).waitFor();
    } finally { await page.close(); }
  });

  it("preserves saved readonly/workspace caps and only switches to inheritance after an explicit edit", async () => {
    const page = await setupPage();
    try {
      await page.getByRole("button", { name: "编辑", exact: true }).click();
      const permission = page.getByRole("button", { name: "权限上限选择", exact: true });
      expect(await permission.textContent()).toContain("只读");
      expect(await page.evaluate(() => window.updateCalls)).toEqual([]);
      await page.getByRole("button", { name: "返回列表", exact: true }).click();
      // Seed a pre-existing workspace role, not the new default.
      await page.evaluate(async () => {
        const { revision, ...profile } = window.testState.settings.agentProfiles[0];
        await window.testController.updateSettings({ agent: { type: "save", expectedRevision: revision,
          profile: { ...profile, permission: "workspace" } } });
      });
      await page.getByText("权限：逐次审批", { exact: true }).waitFor();
      await page.getByRole("button", { name: "编辑", exact: true }).click();
      expect(await permission.textContent()).toContain("工作区逐次审批");
      const warning = page.getByRole("note").filter({ hasText: "当前角色仍需逐次用户审批" });
      await warning.waitFor();
      expect(await page.evaluate(() => window.updateCalls.length)).toBe(1);
      await permission.click();
      await page.getByRole("option", { name: /继承主会话权限/ }).click();
      await warning.waitFor({ state: "hidden" });
      expect(await page.evaluate(() => window.updateCalls.length)).toBe(1);
      await page.getByRole("button", { name: "保存智能体角色", exact: true }).click();
      await expect.poll(() => page.locator("#dirty-indicator").getAttribute("data-dirty")).toBe("false");
      const saved = (await page.evaluate(() => window.updateCalls)).at(-1).agent;
      expect(saved.expectedRevision).toBe(2);
      expect(saved.profile).toMatchObject({ id: "reviewer", permission: "unrestricted",
        model: { mode: "inherit" }, tools: { mode: "restricted", groups: ["read"] } });
    } finally { await page.close(); }
  });

  it("handles list conflicts on toggle and delete with refresh recovery, new revision retry, and failure feedback", async () => {
    const page = await setupPage();
    try {
      await page.getByRole("region", { name: "智能体角色配置" }).waitFor();

      // 1. Toggle conflict test
      await page.evaluate(() => {
        window.failWithConflict = true;
      });

      const toggleBtn = page.getByRole("button", { name: "停用", exact: true });
      await toggleBtn.click();

      // Verify Core conflict message displayed
      const conflictMsg = "该智能体配置已被其他窗口或 CLI 修改。请重新加载设置后再保存，避免覆盖对方的改动。";
      await expect.poll(async () => {
        return await page.locator(".form-error").textContent();
      }).toContain(conflictMsg);

      // Verify list conflict recovery button appears with exact text "刷新为最新配置"
      const listRefreshBtn = page.locator(".form-error").getByRole("button", { name: "刷新为最新配置" });
      expect(await listRefreshBtn.isVisible()).toBe(true);

      const callsCountBeforeRefresh = await page.evaluate(() => window.updateCalls.length);

      // Turn off conflict on server side to simulate fresh state
      await page.evaluate(() => {
        window.failWithConflict = false;
      });

      // Click "刷新为最新配置"
      await listRefreshBtn.click();

      // Verify authoritative state loaded
      await expect.poll(async () => {
        return await page.evaluate(() => window.getSettingsCalls);
      }).toBe(1);

      // Verify the list now shows authoritative updated profile name "代码审查（权威更新）"
      expect(await page.getByText("代码审查（权威更新）").isVisible()).toBe(true);

      // Verify refresh did NOT re-dispatch or auto-retry any toggle or delete operation
      const callsCountAfterRefresh = await page.evaluate(() => window.updateCalls.length);
      expect(callsCountAfterRefresh).toBe(callsCountBeforeRefresh);

      // 2. User re-initiates toggle; verify payload carries new revision (2 instead of 1)
      const nextToggleBtn = page.getByRole("button", { name: "停用", exact: true });
      await nextToggleBtn.click();
      await expect.poll(async () => {
        return (await page.evaluate(() => window.updateCalls)).length;
      }).toBe(callsCountBeforeRefresh + 1);

      const retryToggleCall = (await page.evaluate(() => window.updateCalls)).at(-1);
      expect(retryToggleCall).toEqual({
        agent: {
          type: "save",
          profile: expect.objectContaining({
            id: "reviewer",
            enabled: false,
          }),
          expectedRevision: 2,
        },
      });

      // 3. Delete conflict test
      // Start delete
      const deleteBtn = page.getByRole("button", { name: /删除智能体/ });
      await deleteBtn.click();
      expect(await page.getByText("确认删除？此操作不可逆").isVisible()).toBe(true);

      // Inject conflict for delete
      await page.evaluate(() => {
        window.failWithConflict = true;
      });

      await page.getByRole("button", { name: "确定删除", exact: true }).click();

      // Conflict appears in list
      await expect.poll(async () => {
        return await page.locator(".form-error").textContent();
      }).toContain(conflictMsg);
      expect(await page.locator(".form-error").getByRole("button", { name: "刷新为最新配置" }).isVisible()).toBe(true);

      // Turn off conflict
      await page.evaluate(() => {
        window.failWithConflict = false;
      });

      // Refresh from host
      await page.locator(".form-error").getByRole("button", { name: "刷新为最新配置" }).click();

      // Verify previous deletion confirmation state was cleared upon refresh
      expect(await page.getByText("确认删除？此操作不可逆").count()).toBe(0);

      // Re-trigger delete with new revision (revision 3 after previous save & refresh)
      await page.getByRole("button", { name: /删除智能体/ }).click();
      expect(await page.getByText("确认删除？此操作不可逆").isVisible()).toBe(true);
      await page.getByRole("button", { name: "确定删除", exact: true }).click();

      await expect.poll(async () => {
        const lastCall = (await page.evaluate(() => window.updateCalls)).at(-1);
        return lastCall?.agent?.type;
      }).toBe("remove");

      const finalDeleteCall = (await page.evaluate(() => window.updateCalls)).at(-1);
      expect(finalDeleteCall).toEqual({
        agent: {
          type: "remove",
          id: "reviewer",
          expectedRevision: 4,
        },
      });

      // 4. Refresh failure feedback test
      // Trigger a conflict to show the refresh button
      // First create a new agent so we have something to operate on
      await page.getByRole("button", { name: "新建智能体", exact: true }).click();
      await page.locator("#agent-input-id").fill("temp-agent");
      await page.locator("#agent-input-name").fill("临时智能体");
      await page.getByRole("button", { name: "保存智能体角色" }).click();
      await expect.poll(async () => {
        return await page.locator("#dirty-indicator").getAttribute("data-dirty");
      }).toBe("false");
      await page.getByRole("button", { name: "返回列表" }).click();

      // Now toggle with conflict
      await page.evaluate(() => {
        window.failWithConflict = true;
      });
      await page.getByRole("button", { name: "停用", exact: true }).click();
      expect(await page.locator(".form-error").getByRole("button", { name: "刷新为最新配置" }).isVisible()).toBe(true);

      // Now simulate loadSettings failure
      await page.evaluate(() => {
        window.failGetSettings = true;
      });

      const updateCallsBeforeFailRefresh = await page.evaluate(() => window.updateCalls.length);
      await page.locator(".form-error").getByRole("button", { name: "刷新为最新配置" }).click();

      // Error message should reflect the refresh failure, not false success
      await expect.poll(async () => {
        return await page.locator(".form-error").textContent();
      }).toContain("拉取最新配置失败：服务端连接超时");

      // The refresh entry MUST still be retained for retry
      expect(await page.locator(".form-error").getByRole("button", { name: "刷新为最新配置" }).isVisible()).toBe(true);

      // No update calls dispatched during failed refresh
      expect(await page.evaluate(() => window.updateCalls.length)).toBe(updateCallsBeforeFailRefresh);
    } finally {
      await page.close();
    }
  });

  it("verifies template menu ARIA, focus on open, keyboard navigation, Escape without closing modal, and click/tab out", async () => {
    const page = await setupPage();
    try {
      await page.getByRole("region", { name: "智能体角色配置" }).waitFor();

      const trigger = page.getByRole("button", { name: "从模板添加" });
      expect(await trigger.isVisible()).toBe(true);

      // 1. ARIA attributes when closed
      expect(await trigger.getAttribute("aria-haspopup")).toBe("menu");
      expect(await trigger.getAttribute("aria-expanded")).toBe("false");

      // 2. Click to open: check aria-expanded and focus on first item
      await trigger.click();
      expect(await trigger.getAttribute("aria-expanded")).toBe("true");

      const menu = page.getByRole("menu");
      expect(await menu.isVisible()).toBe(true);
      const menuId = await menu.getAttribute("id");
      expect(menuId).toBeTruthy();
      expect(await trigger.getAttribute("aria-controls")).toBe(menuId);

      // Open focus: check that the first menu item is focused
      const items = menu.getByRole("menuitem");
      const firstItem = items.first();
      await expect.poll(async () => {
        return await page.evaluate(() => document.activeElement?.textContent);
      }).toContain(await firstItem.locator("strong").textContent());

      // 3. ArrowDown navigation
      await page.keyboard.press("ArrowDown");
      const secondItem = items.nth(1);
      await expect.poll(async () => {
        return await page.evaluate(() => document.activeElement?.textContent);
      }).toContain(await secondItem.locator("strong").textContent());

      // 4. End key navigation: jumps to last item
      await page.keyboard.press("End");
      const lastItem = items.last();
      await expect.poll(async () => {
        return await page.evaluate(() => document.activeElement?.textContent);
      }).toContain(await lastItem.locator("strong").textContent());

      // 5. Home key navigation: jumps back to first item
      await page.keyboard.press("Home");
      await expect.poll(async () => {
        return await page.evaluate(() => document.activeElement?.textContent);
      }).toContain(await firstItem.locator("strong").textContent());

      // 6. ArrowUp navigation: wraps around to last item
      await page.keyboard.press("ArrowUp");
      await expect.poll(async () => {
        return await page.evaluate(() => document.activeElement?.textContent);
      }).toContain(await lastItem.locator("strong").textContent());

      // 7. Escape keydown: closes menu, returns focus to trigger, and does NOT close modal
      await page.keyboard.press("Escape");
      await expect.poll(async () => {
        return await trigger.getAttribute("aria-expanded");
      }).toBe("false");
      expect(await menu.count()).toBe(0);

      // Focus returned to trigger
      await expect.poll(async () => {
        return await page.evaluate(() => document.activeElement?.id);
      }).toBe("agent-template-menu-trigger");

      // Modal is NOT closed (escapeModalClosed should remain false)
      const modalClosed = await page.evaluate(() => window.escapeModalClosed);
      expect(modalClosed).toBe(false);

      // 8. Click outside closes menu
      await trigger.click();
      expect(await page.getByRole("menu").isVisible()).toBe(true);
      // Click on background count badge outside menu
      await page.locator(".agent-count-badge").click();
      await expect.poll(async () => {
        return await trigger.getAttribute("aria-expanded");
      }).toBe("false");
      expect(await page.getByRole("menu").count()).toBe(0);

      // 9. Focus leaves container closes menu
      await trigger.click();
      expect(await page.getByRole("menu").isVisible()).toBe(true);
      // Tab must reach the next control, not strand focus on the document body.
      await page.keyboard.press("Tab");
      await expect.poll(() => trigger.getAttribute("aria-expanded")).toBe("false");
      expect(await page.getByRole("menu").count()).toBe(0);
      await expect.poll(() => page.getByRole("button", { name: "新建智能体", exact: true })
        .evaluate(element => element === document.activeElement)).toBe(true);
    } finally {
      await page.close();
    }
  });
});
