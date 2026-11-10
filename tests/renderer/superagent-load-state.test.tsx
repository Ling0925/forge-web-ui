import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SuperAgentLoadState } from "../../src/renderer/components/workbench/SuperAgentLoadState";
import type { SuperAgentView } from "../../src/renderer/state/superagent";

const view: SuperAgentView = {
  status: "enabled",
  requests: {
    state: "success",
    workItems: "success",
    suggestions: "success",
    outbox: "success",
  },
  routerSessionId: "router",
  workItems: [],
  suggestions: [],
  outbox: [],
};
const render = (patch: Partial<SuperAgentView> = {}) =>
  renderToStaticMarkup(
    <SuperAgentLoadState view={{ ...view, ...patch }} onRetry={() => {}} />,
  );

it("shows first probe failure with an error and retry", () => {
  const html = render({
    status: "unknown",
    requests: { ...view.requests, state: "error" },
  });
  expect(html).toContain('role="alert"');
  expect(html).toContain("Super-agent 加载失败");
  expect(html).toContain("重试");
  expect(html).not.toContain("未启用");
  expect(html).not.toContain("暂无");
});

it("keeps the failed refresh visible when enabled data was already known", () => {
  const html = render({ requests: { ...view.requests, state: "error" } });
  expect(html).toContain("加载失败");
  expect(html).toContain("已保留已知数据");
  expect(html).toContain("重试");
});

it("distinguishes disabled, unsupported, loading and successful empty", () => {
  expect(render({ status: "disabled" })).toContain("Super-agent 未启用");
  expect(render({ status: "not-supported" })).toContain("当前服务不支持");
  const loading = render({ requests: { ...view.requests, state: "loading" } });
  expect(loading).toContain("正在加载 Super-agent");
  expect(loading).not.toContain("暂无");
  const empty = render();
  expect(empty).toContain("暂无工作项");
  expect(empty).toContain("暂无建议");
  expect(empty).toContain("暂无发送队列");
  expect(empty).not.toContain("加载失败");
});

for (const [key, label] of [
  ["workItems", "工作项"],
  ["suggestions", "建议"],
  ["outbox", "发送队列"],
] as const) {
  it(`distinguishes ${label} failure, unsupported, loading and empty`, () => {
    const failed = render({ requests: { ...view.requests, [key]: "error" } });
    expect(failed).toContain(`${label}加载失败`);
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("重试");
    expect(failed).not.toContain(`暂无${label}`);
    const unsupported = render({
      requests: { ...view.requests, [key]: "not-supported" },
    });
    expect(unsupported).toContain(`当前服务不支持${label}`);
    expect(unsupported).not.toContain(`${label}加载失败`);
    expect(unsupported).not.toContain(`暂无${label}`);
    const loading = render({
      requests: { ...view.requests, [key]: "loading" },
    });
    expect(loading).toContain(`正在加载${label}`);
    expect(loading).not.toContain(`暂无${label}`);
  });
}

it("recovers from the retry button with no agent sessions", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
        import {createRoot} from 'react-dom/client';
        import {SuperAgentSessions} from './src/renderer/components/workbench/SuperAgentSessions';
        import {superAgentStore} from './src/renderer/state/superagent';
        let calls=0;
        window.forge={
          getSuperAgentState:async()=>{
            if(++calls===1) throw new Error('private credential /home/private');
            return {enabled:true, workspace:'/test', routerSessionId:null};
          },
          listWorkItems:async()=>[],
          listSuggestions:async()=>[],
          listOutbox:async()=>[]
        };
        createRoot(document.getElementById('root')).render(
          <SuperAgentSessions sessions={[]} collapsed={true} onToggle={()=>{}}/>
        );
        void superAgentStore.load();
      `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    loader: { ".css": "empty" },
  });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    for (const output of bundle.outputFiles)
      await page.addScriptTag({ content: output.text });
    await page.getByRole("alert").waitFor();
    expect(await page.locator("body").innerText()).not.toContain("private");
    await page.getByRole("button", { name: "重试" }).click();
    await page.getByLabel("暂无工作项", { exact: true }).waitFor();
    expect(await page.getByRole("alert").count()).toBe(0);
    expect(await page.getByRole("button", { name: "重试" }).count()).toBe(0);
    expect(await page.getByLabel("暂无建议", { exact: true }).count()).toBe(1);
    expect(await page.getByLabel("暂无发送队列", { exact: true }).count()).toBe(
      1,
    );
  } finally {
    await browser.close();
  }
});

for (const unavailable of ["disabled", "not-supported"] as const) {
  it(`hides persistent status noise with no sessions when ${unavailable}`, async () => {
    const bundle = await build({
      stdin: {
        resolveDir: resolve("."),
        loader: "tsx",
        contents: `
          import {createRoot} from 'react-dom/client';
          import {SuperAgentSessions} from './src/renderer/components/workbench/SuperAgentSessions';
          import {superAgentStore} from './src/renderer/state/superagent';
          window.forge={
            getSuperAgentState:async()=>({enabled:true, workspace:'/test', routerSessionId:null}),
            listWorkItems:async()=>[],
            listSuggestions:async()=>[],
            listOutbox:async()=>[]
          };
          window.setUnavailable=async()=>{
            if (${JSON.stringify(unavailable)} === 'disabled') {
              window.forge.getSuperAgentState=async()=>{
                throw Object.assign(new Error('off'), {code:'not_found'});
              };
            } else delete window.forge.getSuperAgentState;
            await superAgentStore.load();
          };
          createRoot(document.getElementById('root')).render(
            <SuperAgentSessions sessions={[]} collapsed={true} onToggle={()=>{}}/>
          );
          void superAgentStore.load();
        `,
      },
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      loader: { ".css": "empty" },
    });
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.FORGE_BROWSER_EXECUTABLE
        ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
        : {}),
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent('<div id="root"></div>');
      for (const output of bundle.outputFiles)
        await page.addScriptTag({ content: output.text });
      await page.getByLabel("暂无工作项", { exact: true }).waitFor();
      await page.evaluate("window.setUnavailable()");
      await page.waitForFunction(() => document.body.innerText.trim() === "");
      expect(await page.locator("body").innerText()).toBe("");
      expect(await page.getByRole("button", { name: "重试" }).count()).toBe(0);
    } finally {
      await browser.close();
    }
  });
}
