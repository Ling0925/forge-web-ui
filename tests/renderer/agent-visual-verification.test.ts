import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;
const screenshotDir = resolve("../../.forge/tmp/agent-collaboration-retry");

declare global {
  interface Window {
    switchView: (view: "settings" | "inspector") => void;
    testController: any;
  }
}

describe("Agent Collaboration Visual & Responsive Verification", () => {
  it("verifies 390px and 1440px responsive layout and light/dark theme rendering without overflow", async () => {
    const bundle = await build({
      stdin: {
        resolveDir: resolve("."),
        loader: "tsx",
        contents: `
          import { createRoot } from "react-dom/client";
          import { useState } from "react";
          import { Settings } from "./src/renderer/components/workbench/Settings";
          import { SubAgentsPanel } from "./src/renderer/components/workbench/RuntimePanels";
          import { defaultPublicSettings } from "@forge/core/shared/schemas";
          import "./src/renderer/styles/tokens.css";
          import "./src/renderer/styles/workspace-theme.css";
          import "./src/renderer/components/workbench/settings-page.css";
          import "./src/renderer/components/workbench/inspector.css";

          const parentSessionId = "11111111-1111-4111-8111-111111111111";
          const childSessionId = "22222222-2222-4222-8222-222222222222";

          const testProfile = {
            id: "frontend",
            name: "前端设计与实现",
            description: "负责 React 组件、CSS 布局及响应式断点适配",
            whenToUse: "在需要界面设计、交互实现与前端缺陷修复时使用",
            instructions: "严格遵循 Web UI 规范，使用暖纸与赤陶色系。",
            enabled: true,
            model: { mode: "fixed", providerSourceId: "default", model: "provider/" + "long-model-id-".repeat(18) },
            permission: "workspace",
            tools: { mode: "restricted", groups: ["read", "edit", "browser"], mcpServers: [] },
            isolation: "shared",
            revision: 1,
          };

          const childSummary = {
            id: childSessionId,
            title: "前端界面实现子任务",
            model: "cn:deepseek-v4.1-flash",
            workspace: "/tmp/project",
            status: "running",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
            parentSessionId,
            agentProfileId: "frontend",
            agentProfileName: "前端设计与实现",
            messagesCount: 2,
          };

          const pendingAdvisorReq = {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            parentSessionId,
            parentRunId: "run-parent-1",
            childSessionId,
            toolCallId: "call_adv_1",
            question: "是否保留旧版配置的向前兼容支持？",
            context: "已检查旧版调用方，两处存在可选字段依赖。",
            options: ["全量保留旧版", "仅兼容核心字段", "放弃旧版"],
            recommendation: "推荐全量保留旧版，以防老会话崩溃",
            status: "pending",
            createdAt: "2026-01-01T00:01:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
            deadlineAt: "2026-01-01T00:11:00.000Z",
          };

          const answeredAdvisorReq = {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            parentSessionId,
            parentRunId: "run-parent-1",
            childSessionId,
            toolCallId: "call_adv_2",
            question: "深色模式下的赤陶强调色是否需要额外加对比度？",
            status: "answered",
            createdAt: "2026-01-01T00:02:00.000Z",
            updatedAt: "2026-01-01T00:02:30.000Z",
            deadlineAt: "2026-01-01T00:12:00.000Z",
            answer: "使用规范统一的 --accent 变量，已做过 4.5:1 对比度校准。",
            nextInstruction: "继续完成 390px 响应式断点检查",
            deliveredAt: "2026-01-01T00:02:35.000Z",
          };

          const parentSnapshot = {
            version: 1,
            id: parentSessionId,
            title: "主任务工作台",
            workspace: "/tmp/project",
            model: "cn:deepseek-v4.1-flash",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:03:00.000Z",
            status: "running",
            messages: [],
            events: [],
            changes: [],
            advisorRequests: [pendingAdvisorReq, answeredAdvisorReq],
          };

          window.forge = {
            getSession: async () => parentSnapshot,
            cancelSession: async () => false,
            listMcpServers: async () => [],
            listModels: async () => [
              { id: "cn:deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", sourceId: "default" },
            ],
            getProjectContext: async () => null,
          };

          function VisualApp() {
            const [view, setView] = useState("settings"); // "settings" | "inspector"
            const [settings, setSettings] = useState({
              ...defaultPublicSettings,
              agentProfiles: [testProfile],
              providerSources: [
                {
                  id: "default",
                  label: "Default Provider",
                  model: "cn:deepseek-v4.1-flash",
                  protocol: "openai-compatible",
                  baseUrl: "https://api.deepseek.com",
                },
              ],
            });

            window.switchView = setView;

            window.testController = {
              state: {
                activeSessionId: parentSessionId,
                activeSnapshot: parentSnapshot,
                sessions: [childSummary],
                activeRuns: {
                  [parentSessionId]: {
                    sessionId: parentSessionId,
                    runId: "host-transport-1",
                    rootRunId: "run-parent-1",
                    status: "running",
                    streamingText: "",
                  },
                },
                snapshotCache: {},
                settings,
                isSettingsOpen: true,
              },
              openSettings: () => {},
              selectSession: () => {},
              refreshActiveSession: async () => {},
              updateSettings: async (input) => {
                return { ok: true, settings };
              },
            };

            return (
              <div id="visual-root">
                {view === "settings" ? (
                  <Settings />
                ) : (
                  <div className="wb-inspector" style={{ padding: 16 }}>
                    <SubAgentsPanel />
                  </div>
                )}
              </div>
            );
          }

          createRoot(document.getElementById("root")).render(<VisualApp />);
        `,
      },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      outfile: "agent-visual-test.js",
      loader: { ".woff2": "dataurl" },
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [
        {
          name: "visual-test-host",
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
      page.setDefaultTimeout(8000);
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      const runViewportTheme = async (
        width: number,
        height: number,
        theme: "light" | "dark",
      ) => {
        await page.setViewportSize({ width, height });
        await page.setContent('<div id="root"></div>');
        await page.evaluate((t) => {
          document.documentElement.setAttribute("data-theme", t);
        }, theme);
        await page.addStyleTag({
          content: bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text,
        });
        await page.addScriptTag({
          content: bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text,
        });

        // 1. Settings view with agent profile list
        const agentsTab = page.getByRole("navigation", { name: "设置分类" }).getByRole("button", { name: "智能体", exact: true });
        await agentsTab.scrollIntoViewIfNeeded();
        await agentsTab.click();
        await page.getByRole("region", { name: "智能体角色配置" }).waitFor();

        // Check horizontal overflow
        const settingsOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(settingsOverflow).toBe(false);

        await page.screenshot({
          path: `${screenshotDir}/settings-agent-${width}-${theme}.png`,
          fullPage: true,
          animations: "disabled",
        });

        await page.getByRole("button", { name: "从模板添加", exact: true }).click();
        const templateMenu = page.getByRole("menu");
        await templateMenu.waitFor();
        const menuBounds = await templateMenu.boundingBox();
        expect(menuBounds).not.toBeNull();
        expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
        expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
        await page.screenshot({ path: `${screenshotDir}/settings-agent-templates-${width}-${theme}.png`, fullPage: true, animations: "disabled" });
        await page.keyboard.press("Escape");
        await templateMenu.waitFor({ state: "hidden" });

        await page.getByRole("button", { name: "编辑", exact: true }).click();
        await page.getByRole("region", { name: "智能体编辑器", exact: true }).waitFor();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
        await page.screenshot({ path: `${screenshotDir}/settings-agent-editor-${width}-${theme}.png`, fullPage: true, animations: "disabled" });

        // 2. Switch to Inspector / Subagents & Advisor view
        await page.evaluate(() => {
          window.switchView("inspector");
        });
        await page.locator(".inspector-subagents-section").waitFor();

        // Check horizontal overflow
        const inspectorOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(inspectorOverflow).toBe(false);

        await page.screenshot({
          path: `${screenshotDir}/subagents-advisor-${width}-${theme}.png`,
          fullPage: true,
          animations: "disabled",
        });
      };

      // Test 390px (mobile) light and dark
      await runViewportTheme(390, 844, "light");
      await runViewportTheme(390, 844, "dark");

      // Test 1440px (desktop) light and dark
      await runViewportTheme(1440, 900, "light");
      await runViewportTheme(1440, 900, "dark");
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60000);
});
