import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;

declare global {
  interface Window {
    setParentRunningStatus: (isRunning: boolean, runId?: string) => void;
    switchToChildSession: () => void;
    testController: any;
  }
}

describe("Agent Advisor Coordination Mounted Tests", () => {
  it("renders role badges, waiting pills, advisor section, delivered receipts and truthful live/historical status", async () => {
    const bundle = await build({
      stdin: {
        resolveDir: resolve("."),
        loader: "tsx",
        contents: `
          import { createRoot } from "react-dom/client";
          import { useState } from "react";
          import { SubAgentsPanel } from "./src/renderer/components/workbench/RuntimePanels";
          import { defaultPublicSettings } from "@forge/core/shared/schemas";
          import "./src/renderer/styles/tokens.css";
          import "./src/renderer/styles/workspace-theme.css";
          import "./src/renderer/components/workbench/inspector.css";

          const parentSessionId = "11111111-1111-4111-8111-111111111111";
          const childSessionId = "22222222-2222-4222-8222-222222222222";

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

          const answeredPendingDeliveryReq = {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            parentSessionId,
            parentRunId: "run-parent-1",
            childSessionId,
            toolCallId: "call_adv_3",
            question: "是否在移动端隐藏非必要边框？",
            status: "answered",
            createdAt: "2026-01-01T00:03:00.000Z",
            updatedAt: "2026-01-01T00:03:10.000Z",
            deadlineAt: "2026-01-01T00:13:00.000Z",
            answer: "是的，移动端移除冗余内边框",
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
            advisorRequests: [
              pendingAdvisorReq,
              answeredAdvisorReq,
              answeredPendingDeliveryReq,
              ...["cancelled", "expired", "interrupted"].map((status, index) => ({
                ...pendingAdvisorReq,
                id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd" + index,
                status,
                question: "已结束问题：" + status,
              })),
            ],
          };

          const childSnapshotWithProfile = {
            version: 1,
            id: childSessionId,
            parentSessionId,
            title: "前端界面实现子任务",
            workspace: "/tmp/project",
            model: "cn:deepseek-v4.1-flash",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
            status: "running",
            agentTask: "实现智能体与 advisor 界面",
            ownership: "src/renderer/**",
            agentProfile: {
              id: "frontend",
              name: "前端设计与实现",
              description: "实现交互、页面与样式，并验证真实渲染",
              whenToUse: "需要界面设计、交互实现与前端缺陷修复时",
              instructions: "严格遵循 Web UI 规范，使用赤陶与暖纸色系。",
              enabled: true,
              model: { mode: "inherit" },
              permission: "workspace",
              tools: { mode: "restricted", groups: ["read", "edit", "browser"], mcpServers: [] },
              isolation: "shared",
              revision: 1,
            },
            messages: [],
            events: [],
            changes: [],
          };

          window.forge = {
            getSession: async (id) => id === childSessionId ? childSnapshotWithProfile : parentSnapshot,
            cancelSession: async () => false,
          };

          function TestHarness() {
            const [activeSnap, setActiveSnap] = useState(parentSnapshot);
            const [selectedSessionId, setSelectedSessionId] = useState(parentSessionId);
            const [activeRunId, setActiveRunId] = useState("run-parent-1");
            const [hasActiveRun, setHasActiveRun] = useState(true);

            window.setParentRunningStatus = (isRunning, runId = "run-parent-1") => {
              setActiveSnap((snap) => ({
                ...snap,
                // Even a stale persisted "running" snapshot is not proof of a live run.
                status: "running",
              }));
              setHasActiveRun(isRunning);
              setActiveRunId(runId);
            };

            window.switchToChildSession = () => {
              setSelectedSessionId(childSessionId);
              setActiveSnap(childSnapshotWithProfile);
            };

            window.testController = {
              state: {
                activeSessionId: selectedSessionId,
                activeSnapshot: activeSnap,
                sessions: [childSummary],
                activeRuns: hasActiveRun ? {
                  [activeSnap.id]: {
                    sessionId: activeSnap.id,
                    runId: "host-transport-" + activeRunId,
                    rootRunId: activeRunId,
                    status: "running",
                    streamingText: "",
                  },
                } : {},
                snapshotCache: {
                  [childSessionId]: { snapshot: childSnapshotWithProfile, persistedAt: null },
                },
              },
              selectSession: (id) => setSelectedSessionId(id),
              refreshActiveSession: async () => {},
            };

            return (
              <div id="inspector-test-root" className="wb-inspector">
                <SubAgentsPanel />
              </div>
            );
          }

          createRoot(document.getElementById("root")).render(<TestHarness />);
        `,
      },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      outfile: "agent-advisor-test.js",
      loader: { ".woff2": "dataurl" },
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [
        {
          name: "advisor-test-host",
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
      await page.setContent('<div id="root"></div>');
      await page.addStyleTag({
        content: bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text,
      });
      await page.addScriptTag({
        content: bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text,
      });

      // 1. Verify child session card displays role badge and waiting for advisor pill
      const childCard = page.locator(".child-session-card");
      await childCard.waitFor();
      expect(await childCard.locator(".child-role-badge").textContent()).toBe(
        "前端设计与实现",
      );
      expect(
        await childCard.locator(".child-advisor-pill").textContent(),
      ).toContain("等待答疑");

      // 2. Verify advisor coordination section header and hint
      expect(
        await page.getByRole("heading", { name: /答疑与协调/ }).count(),
      ).toBe(1);
      expect(
        await page
          .getByText(/默认由主代理在后续步骤自动答复，不提供人工审批按钮/)
          .count(),
      ).toBe(1);

      // 3. Verify pending advisor request when parent active run matches parentRunId (live)
      const pendingCard = page.locator(".inspector-advisor-card.is-pending");
      await pendingCard.waitFor();
      expect(
        await pendingCard.locator(".advisor-badge.is-pending").textContent(),
      ).toContain("等待主代理答复");
      expect(
        await pendingCard.locator(".advisor-question-text").textContent(),
      ).toBe("是否保留旧版配置的向前兼容支持？");
      expect(
        await pendingCard.locator(".advisor-option-chip").allTextContents(),
      ).toEqual(["全量保留旧版", "仅兼容核心字段", "放弃旧版"]);
      expect(
        await pendingCard.locator(".advisor-recommendation-text").textContent(),
      ).toBe("推荐全量保留旧版，以防老会话崩溃");

      // 4. Verify answered request with deliveredAt (delivered receipt)
      const answeredCard = page
        .locator(".inspector-advisor-card.is-answered")
        .first();
      expect(
        await answeredCard.locator(".advisor-delivered-receipt").textContent(),
      ).toContain("✓ 已投递到子代理");
      expect(
        await answeredCard
          .getByText("使用规范统一的 --accent 变量，已做过 4.5:1 对比度校准。")
          .count(),
      ).toBe(1);
      expect(
        await answeredCard.getByText("继续完成 390px 响应式断点检查").count(),
      ).toBe(1);

      // 5. Verify answered request without deliveredAt (pending delivery receipt)
      const pendingDeliveryCard = page
        .locator(".inspector-advisor-card.is-answered")
        .nth(1);
      expect(
        await pendingDeliveryCard
          .locator(".advisor-pending-receipt")
          .textContent(),
      ).toContain("已在主会话保存，等待子代理同步确认");

      expect(
        await page
          .locator(".inspector-advisor-card.is-cancelled .advisor-badge")
          .textContent(),
      ).toBe("已取消");
      expect(
        await page
          .locator(".inspector-advisor-card.is-expired .advisor-badge")
          .textContent(),
      ).toBe("已超时");
      expect(
        await page
          .locator(".inspector-advisor-card.is-interrupted .advisor-badge")
          .textContent(),
      ).toBe("已中断");

      // 6. Test historical running but runId mismatch (active run is run-parent-2, request was run-parent-1):
      // Must NOT pretend to be live!
      await page.evaluate(() => {
        window.setParentRunningStatus(true, "run-parent-2");
      });
      await page.waitForTimeout(60);

      expect(
        await childCard.locator(".child-advisor-pill").textContent(),
      ).toContain("答疑已中断");
      expect(
        await pendingCard
          .locator(".advisor-badge.is-interrupted")
          .textContent(),
      ).toContain("已中断");

      // 7. Test historical/inactive parent status: snapshot.status="running" on disk but no activeRun in memory
      await page.evaluate(() => {
        window.setParentRunningStatus(false);
      });
      await page.waitForTimeout(60);

      expect(
        await childCard.locator(".child-advisor-pill").textContent(),
      ).toContain("答疑已中断");
      expect(
        await pendingCard
          .locator(".advisor-badge.is-interrupted")
          .textContent(),
      ).toContain("已中断");

      // 8. Switch to child session: verify full snapshot.agentProfile renders
      await page.evaluate(() => {
        window.switchToChildSession();
      });
      await page.waitForTimeout(60);

      const profileCard = page.locator(".inspector-agent-profile-card");
      await profileCard.waitFor();
      expect(
        await profileCard
          .locator(".inspector-agent-profile-name")
          .textContent(),
      ).toBe("前端设计与实现");
      expect(
        await profileCard.locator(".inspector-agent-profile-id").textContent(),
      ).toBe("frontend");
      expect(await profileCard.getByText("权限上限：workspace").count()).toBe(
        1,
      );
      expect(await profileCard.getByText("工作树：shared").count()).toBe(1);
      expect(await profileCard.getByText("模型：继承父模型").count()).toBe(1);
      expect(
        await profileCard.getByText("工具：read, edit, browser").count(),
      ).toBe(1);
      await profileCard.locator("summary").click();
      expect(
        await profileCard
          .getByText("严格遵循 Web UI 规范，使用赤陶与暖纸色系。", {
            exact: true,
          })
          .isVisible(),
      ).toBe(true);
      expect(
        await profileCard.getByText("配置版本：1", { exact: true }).count(),
      ).toBe(1);
    } finally {
      await browser.close();
    }
  });
});
