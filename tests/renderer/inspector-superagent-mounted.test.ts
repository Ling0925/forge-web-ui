import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("keeps super-agent decisions, work items and section memory in the compact inspector", async () => {
  const output = resolve(
    process.env.FORGE_UI_TEST_OUTPUT ?? "../../.forge/tmp/inspector-superagent",
  );
  await mkdir(output, { recursive: true });
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
      import {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {Inspector} from './src/renderer/components/workbench/Inspector';
      import {WorkspaceResourcesDialog} from './src/renderer/components/workbench/WorkspaceResourcesDialog';
      import {initialWorkbenchState} from './src/renderer/state/workbench-reducer';
      import {superAgentStore} from './src/renderer/state/superagent';
      import {requestInspectorSection} from './src/renderer/state/inspector-sections';
      import './src/renderer/styles/global.css';
      import './src/renderer/components/workbench/app.css';
      import './src/renderer/styles/workspace-theme.css';
      import './src/renderer/styles/design-foundation.css';
      const router='11111111-1111-4111-8111-111111111111';
      const worker='22222222-2222-4222-8222-222222222222';
      const now='2026-10-01T00:00:00.000Z';
      const work={id:'wrk_fixture',routerSessionId:router,workerSessionId:worker,status:'running',pendingStatus:null,
        title:'修复登录',brief:'保留工作项与审批功能',threadIds:[],profileId:'default',worktree:null,progress:'已定位问题',createdAt:now,updatedAt:now,claimedBy:null};
      const outbox={id:'out_fixture',workId:work.id,state:'pending',error:null,createdAt:now,decidedAt:null,sentAt:null,
        kind:'comment',target:{thread:'gh:fixture/project#1'},body:{text:'测试发送内容'}};
      const suggestion={id:'sug_fixture',threadIds:[],brief:'检查回归',triggerIds:[],state:'pending',workId:null};
      const base={version:1,model:'fixture/model',workspace:'/fixture/project',createdAt:now,updatedAt:now,changes:[],events:[],messages:[]};
      const sessions=[{...base,id:router,title:'路由任务',status:'running',agentRole:{kind:'router',ownerId:'fixture'},
        plan:{steps:[{step:'检查冲突',status:'in_progress'},{step:'验证合并',status:'pending'}]}},
        {...base,id:worker,title:'失败子任务',status:'failed',parentSessionId:router}];
      window.decisions=[]; window.diagnostics=0;
      window.forge={
        getSuperAgentState:async()=>({routerSessionId:router}), listWorkItems:async()=>[work],
        listSuggestions:async()=>[suggestion],listOutbox:async()=>[outbox],
        decideOutbox:async(id,approve)=>{window.decisions.push({kind:'outbox',id,approve});return {...outbox,state:approve?'sent':'rejected'};},
        decideSuggestion:async(id,accept)=>{window.decisions.push({kind:'suggestion',id,accept});return {...suggestion,state:accept?'accepted':'rejected'};},
        listCheckpoints:async()=>[],getDiagnostics:async()=>{window.diagnostics++;return null;},
        getProjectContext:async()=>({instructionSources:[],skills:[],warnings:[],counts:{instructions:0,skills:0,warnings:0}}),
        listMcpServers:async()=>[],listWorkspaceEntries:async()=>({workspace:'/fixture/project',path:'.',parentPath:null,entries:[],truncated:false})
      };
      function Harness(){
        const [id,select]=useState(router);const [tick,refresh]=useState(0);
        window.selectFixture=select;window.refreshFixture=()=>refresh(n=>n+1);window.revealChanges=()=>requestInspectorSection('changes');
        window.testController={state:{...initialWorkbenchState,activeSessionId:id,activeSnapshot:{...sessions.find(s=>s.id===id),updatedAt:String(tick)},sessions,activeRuns:{}},
          selectSession:async(id)=>select(id),refreshActiveSession:async()=>{},answerApproval:async()=>{},setMobileTab:()=>{}};
        return <div className="wb-app mobile-inspector" style={{height:'100vh',justifyContent:'flex-end'}}><Inspector/><WorkspaceResourcesDialog/></div>;
      }
      void superAgentStore.load().then(()=>createRoot(document.getElementById('root')).render(<Harness/>));
    `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "inspector-superagent.js",
    loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "test-controller",
        setup(api) {
          api.onLoad({ filter: /workbench-context\.tsx$/ }, () => ({
            contents: "export const useWorkbench=()=>window.testController;",
            loader: "js",
          }));
        },
      },
    ],
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  const css = bundle.outputFiles.find((file) =>
    file.path.endsWith(".css"),
  )!.text;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          reducedMotion: "reduce",
        });
        page.setDefaultTimeout(5000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setContent(
          `<html data-theme="${theme}"><body><div id="root"></div></body></html>`,
        );
        await page.addStyleTag({ content: css });
        await page.addScriptTag({ content: js });
        const attention = page.getByRole("region", { name: "需要处理" });
        await attention.waitFor();
        expect(await attention.innerText()).toContain("失败子任务");
        expect(await attention.innerText()).toContain("检查回归");
        const work = page.getByRole("list", { name: "工作项" });
        expect(await work.innerText()).toContain("修复登录");
        const progress = page.getByRole("button", {
          name: "进度 0/2",
          exact: true,
        });
        await progress.click();
        await page.evaluate(() => Reflect.get(window, "refreshFixture")());
        expect(await progress.getAttribute("aria-expanded")).toBe("false");
        await work.getByRole("button", { name: "打开 Worker" }).click();
        await expect
          .poll(() =>
            page
              .locator('.inspector-summary [data-section="progress"]')
              .count(),
          )
          .toBe(0);
        await page.evaluate(() =>
          Reflect.get(
            window,
            "selectFixture",
          )("11111111-1111-4111-8111-111111111111"),
        );
        expect(await progress.getAttribute("aria-expanded")).toBe("false");
        expect(
          await page.evaluate(() => Reflect.get(window, "diagnostics")),
        ).toBe(0);
        await page.screenshot({
          path: resolve(output, `inspector-superagent-${width}-${theme}.png`),
          animations: "disabled",
        });
        // Approving remains a two-step decision, with no RPC on opening/cancelling.
        await attention
          .getByRole("button", { name: "批准…", exact: true })
          .click();
        const confirm = page.getByRole("dialog", {
          name: "批准这条外部写操作？",
        });
        await confirm.waitFor();
        expect(
          await page.evaluate(() => Reflect.get(window, "decisions")),
        ).toEqual([]);
        await confirm
          .getByRole("button", { name: "取消", exact: true })
          .click();
        await attention
          .getByRole("button", { name: "批准…", exact: true })
          .click();
        await confirm
          .getByRole("button", { name: "批准并发送", exact: true })
          .click();
        await expect
          .poll(() => page.evaluate(() => Reflect.get(window, "decisions")))
          .toEqual([{ kind: "outbox", id: "out_fixture", approve: true }]);
        await attention
          .getByRole("button", { name: "接受并开始", exact: true })
          .click();
        await expect
          .poll(() =>
            page.evaluate(() => Reflect.get(window, "decisions").length),
          )
          .toBe(2);
        await page
          .getByRole("button", { name: "工作区文件", exact: true })
          .click();
        const workspace = page.getByRole("dialog");
        await workspace.waitFor();
        await workspace
          .getByRole("button", { name: "关闭面板", exact: true })
          .click();
        await page.evaluate(() => Reflect.get(window, "revealChanges")());
        await page
          .getByRole("button", { name: "刷新检查点", exact: true })
          .waitFor();
        expect(await attention.isVisible()).toBe(true);
        await page
          .getByRole("button", { name: "返回概要", exact: true })
          .click();
        await page
          .getByRole("button", { name: "上下文与用量", exact: true })
          .click();
        await expect
          .poll(() => page.evaluate(() => Reflect.get(window, "diagnostics")))
          .toBe(1);
        expect(
          await page
            .locator(".inspector-scroll")
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        ).toBe(true);
        expect(errors).toEqual([]);
        await page.close();
      }
  } finally {
    await browser.close();
  }
}, 30000);
