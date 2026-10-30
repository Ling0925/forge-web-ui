import { resolve } from "node:path";
import { build } from "esbuild";
import { type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Sub-agent in Conversation / Transcript Mounted Verification", () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("renders structured subagent cards, role badges, status edge bars, and tabular-nums", async () => {
    const bundle = await build({
      stdin: {
        resolveDir: resolve("."),
        loader: "tsx",
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { ToolDisclosure } from './src/renderer/components/primitives/ToolDisclosure';
          import './src/renderer/styles/global.css';
          import './src/renderer/styles/tokens.css';
          import './src/renderer/styles/workspace-theme.css';
          import './src/renderer/components/primitives/tool-disclosure.css';
          import './src/renderer/components/workbench/app.css';

          const spawnParams = JSON.stringify({
            profileId: 'frontend-specialist',
            profileRevision: 2,
            model: 'cn:deepseek-v4.1-flash',
            task: '优化 Web 端子代理视觉与交互规范',
            writePaths: ['src/renderer/components/primitives/tool-disclosure/agents.tsx']
          });

          const spawnResult = JSON.stringify({
            childSessionId: 'sess-child-12345678',
            workspace: '/home/user/project'
          });

          const waitParams = JSON.stringify({
            ids: ['sess-child-12345678']
          });

          const waitResult = JSON.stringify([
            {
              id: 'sess-child-12345678',
              status: 'running',
              profileId: 'frontend-specialist',
              model: 'cn:deepseek-v4.1-flash',
              title: '优化视觉规范',
              summary: '正在按规范要求对齐色彩 Token 与边条',
              usage: { promptTokens: 1200, completionTokens: 450 }
            },
            {
              id: 'sess-child-87654321',
              status: 'completed',
              profileId: 'reviewer',
              model: 'cn:deepseek-v4.1-flash',
              title: '代码审查任务',
              summary: '### 审查通过\\n\\n代码已严格遵守规范。',
              usage: { promptTokens: 3400, completionTokens: 890 }
            }
          ]);

          const answerAdvisorParams = JSON.stringify({
            requestId: 'req-advisor-abcdef12',
            answer: '采用 2.5px 状态语义边条与 CSS 变量',
            nextInstruction: '继续运行聚焦测试'
          });

          const listProfilesResult = JSON.stringify({
            profiles: [
              {
                id: 'explorer',
                name: '探索专家',
                description: '负责只读调研和代码探索',
                permission: 'readonly'
              }
            ]
          });

          function App() {
            return (
              <div id="test-container" className="wb-app" data-theme="dark">
                <ToolDisclosure
                  className="test-spawn"
                  toolName="spawn_agent"
                  parameters={spawnParams}
                  output={spawnResult}
                  status="completed"
                  defaultExpanded={true}
                />
                <ToolDisclosure
                  className="test-wait"
                  toolName="wait_agents"
                  parameters={waitParams}
                  output={waitResult}
                  status="completed"
                  defaultExpanded={true}
                />
                <ToolDisclosure
                  className="test-answer"
                  toolName="answer_advisor"
                  parameters={answerAdvisorParams}
                  output="true"
                  status="completed"
                  defaultExpanded={true}
                />
                <ToolDisclosure
                  className="test-profiles"
                  toolName="list_agent_profiles"
                  parameters="{}"
                  output={listProfilesResult}
                  status="completed"
                  defaultExpanded={true}
                />
              </div>
            );
          }

          createRoot(document.getElementById('root')!).render(<App />);
        `,
      },
      write: false,
      bundle: true,
      format: "iife",
      jsx: "automatic",
      outfile: "subagent-transcript-test.js",
      loader: { ".woff2": "dataurl" },
      define: { "process.env.NODE_ENV": '"development"' },
    });

    const js = bundle.outputFiles.find((file) =>
      file.path.endsWith(".js"),
    )?.text;
    const css = bundle.outputFiles.find((file) =>
      file.path.endsWith(".css"),
    )?.text;
    if (!js) throw new Error("Missing js bundle");

    await page.setContent('<div id="root"></div>');
    if (css) await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: js });
    await page.waitForSelector(".test-spawn");

    // 1. Verify spawn_agent card presentation
    const spawnRoleBadge = page.locator(".test-spawn .child-role-badge");
    expect(await spawnRoleBadge.textContent()).toContain("frontend-specialist");
    expect(await spawnRoleBadge.textContent()).toContain("v2");
    const spawnModelChip = page.locator(".test-spawn .agent-model-chip");
    expect(await spawnModelChip.textContent()).toContain(
      "cn:deepseek-v4.1-flash",
    );
    const spawnSessionBtn = page.locator(".test-spawn .agent-session-link-btn");
    expect(await spawnSessionBtn.textContent()).toContain("子会话 #sess-chi");

    // 2. Verify wait_agents cards presentation: index, role, link, tabular-nums, edge bar
    const waitCards = page.locator(".test-wait .agent-report-card");
    expect(await waitCards.count()).toBe(2);

    // Card 1: running
    const card1 = waitCards.nth(0);
    expect(await card1.locator(".child-index-badge").textContent()).toBe("#1");
    expect(await card1.locator(".child-status-badge").textContent()).toContain(
      "执行中",
    );
    expect(await card1.locator(".agent-live-dot").isVisible()).toBe(true);
    expect(await card1.locator(".agent-role-badge").textContent()).toContain(
      "frontend-specialist",
    );
    expect(await card1.locator(".agent-id-link-btn").textContent()).toContain(
      "优化视觉规范",
    );
    expect(await card1.locator(".agent-usage-tag").textContent()).toContain(
      "1.2k 入 / 450 出",
    );

    // Card 2: completed with markdown
    const card2 = waitCards.nth(1);
    expect(await card2.locator(".child-index-badge").textContent()).toBe("#2");
    expect(await card2.locator(".child-status-badge").textContent()).toContain(
      "已完成",
    );
    expect(await card2.locator(".agent-summary-content h3").textContent()).toBe(
      "审查通过",
    );

    // Verify Tabular Nums CSS property
    const cardUsageTag = card1.locator(".agent-usage-tag");
    const fontVariant = await cardUsageTag.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("font-variant-numeric"),
    );
    expect(fontVariant).toContain("tabular-nums");

    // 3. Verify answer_advisor presentation
    const answerView = page.locator(".test-answer .agent-advisor-answer-view");
    expect(await answerView.isVisible()).toBe(true);
    expect(await answerView.locator(".agent-id-chip").textContent()).toContain(
      "咨询请求 #req-advi",
    );
    expect(
      await answerView.locator(".child-status-badge").textContent(),
    ).toContain("主代理已答复");
    expect(
      await answerView
        .locator(".agent-message-box .agent-message-content")
        .textContent(),
    ).toContain("采用 2.5px 状态语义边条与 CSS 变量");
    expect(
      await answerView.locator(".agent-instruction-box").textContent(),
    ).toContain("继续运行聚焦测试");

    // 4. Verify list_agent_profiles presentation
    const profileItem = page.locator(".test-profiles .agent-profile-item-card");
    expect(await profileItem.isVisible()).toBe(true);
    expect(
      await profileItem.locator(".agent-role-badge").textContent(),
    ).toContain("探索专家");
    expect(
      await profileItem.locator(".agent-profile-desc").textContent(),
    ).toContain("负责只读调研和代码探索");
  });
});
