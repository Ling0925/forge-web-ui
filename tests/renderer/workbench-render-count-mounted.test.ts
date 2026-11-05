import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

// Counts how often each workbench surface renders while one session streams.
// Each listed component is wrapped at bundle time with a render counter, so
// the measurement covers the real App, provider and reducer.
const tracked: Record<string, string> = {
  "App.tsx": "Workbench",
  "Sidebar.tsx": "Sidebar",
  "SessionListItem.tsx": "SessionListItem",
  "WorkbenchHeader.tsx": "WorkbenchHeader",
  "Inspector.tsx": "Inspector",
  "Transcript.tsx": "Transcript",
  "Composer.tsx": "Composer",
};
const DELTAS = 40;
type RenderWindow = Window & {
  renders: Record<string, number>;
  emit(event: object): void;
};

it("streamed tokens only re-render the surfaces that show them", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
      import {createRoot} from 'react-dom/client';
      import {App} from './src/renderer/components/workbench/App';
      import {defaultPublicSettings} from '@forge/core/shared/schemas';
      const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
      const runId='44444444-4444-4444-8444-444444444444';
      const snapshot=(id,i)=>({version:1,id,title:'Session '+i,workspace:'/tmp/project',model:'fixture/model',status:'idle',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-0'+(i+1)+'T00:00:00.000Z',messages:[{role:'user',content:'hello '+i}],events:[],changes:[]});
      const sessions=ids.map(snapshot);
      const listeners=new Set();
      window.renders={};
      window.emit=(event)=>listeners.forEach(l=>l({runId,event:{sessionId:ids[0],timestamp:new Date().toISOString(),...event}}));
      window.forge={
        getSettings:async()=>({...defaultPublicSettings,model:'fixture/model',isConfigured:true}),
        listSessions:async()=>sessions.map(({messages,events,changes,...s})=>s),
        getSession:async(id)=>sessions.find(s=>s.id===id),
        onEvent:(l)=>{listeners.add(l);return()=>listeners.delete(l)},
        chooseWorkspace:async()=>'/tmp/project',listMcpServers:async()=>[],listCheckpoints:async()=>[],
        getProjectContext:async()=>({instructionSources:[],skills:[],warnings:[],counts:{instructions:0,skills:0,warnings:0}}),
        getDiagnostics:async()=>({transcriptChars:0,projectedChars:0,messageCount:0,summaryFallback:false}),
      };
      createRoot(document.getElementById('root')).render(<App/>);
    `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    loader: { ".css": "empty" },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "render-counter",
        setup(api) {
          api.onLoad(
            { filter: /components\/workbench\/[A-Za-z]+\.tsx$/ },
            async (args) => {
              const name = tracked[args.path.split("/").at(-1) ?? ""];
              if (!name) return undefined;
              const source = await readFile(args.path, "utf8");
              const pattern = new RegExp(`(export )?function ${name}\\(`);
              if (!pattern.test(source))
                throw new Error(`${name} not found in ${args.path}`);
              return {
                loader: "tsx",
                contents: source.replace(
                  pattern,
                  (_, exported = "") =>
                    `${exported}function ${name}(...args: any[]) { const r = (window as any).renders; r.${name} = (r.${name} ?? 0) + 1; return (${name}__impl as any)(...args); }\nfunction ${name}__impl(`,
                ),
              };
            },
          );
        },
      },
    ],
  });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 900 },
    });
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    const script = bundle.outputFiles[0]?.text;
    if (!script) throw new Error("Missing fixture bundle");
    await page.addScriptTag({ content: script });

    await page
      .locator(".session-item-main")
      .filter({ hasText: "Session 0" })
      .click();
    await page.getByRole("textbox", { name: "继续任务" }).waitFor();
    await page.evaluate(() =>
      (window as unknown as RenderWindow).emit({
        type: "run_started",
        model: "fixture/model",
        permission: "workspace",
      }),
    );
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => ({
      ...(window as unknown as RenderWindow).renders,
    }));
    for (let i = 0; i < DELTAS; i++) {
      await page.evaluate(
        (i) =>
          (window as unknown as RenderWindow).emit({
            type: "text_delta",
            text: `token${i} `,
          }),
        i,
      );
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => done(null))),
      );
    }
    await expect
      .poll(() => page.locator(".workbench-main").innerText())
      .toContain(`token${DELTAS - 1}`);
    const after = await page.evaluate(() => ({
      ...(window as unknown as RenderWindow).renders,
    }));
    const delta = Object.fromEntries(
      Object.values(tracked).map((name) => [
        name,
        (after[name] ?? 0) - (before[name] ?? 0),
      ]),
    );
    console.log(
      `renders during ${DELTAS} text_delta events:`,
      JSON.stringify(delta),
    );
    expect(errors).toEqual([]);
    // Positive control: the streaming surface keeps up with the tokens.
    expect(delta.Transcript).toBeGreaterThanOrEqual(DELTAS / 2);
    // Shell, navigation and inspector do not depend on streamed text.
    for (const name of [
      "Workbench",
      "Sidebar",
      "SessionListItem",
      "WorkbenchHeader",
      "Inspector",
    ])
      expect(delta[name], name).toBe(0);
  } finally {
    await browser.close();
  }
}, 30000);
