import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import {
  appendSessionEvent,
  sessionUsage,
} from "../../src/renderer/state/session-usage";
import { agentEventSchema } from "@forge/core/shared/schemas";

const base = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  timestamp: new Date().toISOString(),
};
const context = (
  promptTokens: number,
  cachedPromptTokens?: number,
  windowTokens: number | null = 10000,
) =>
  agentEventSchema.parse({
    ...base,
    type: "context_usage",
    usage: {
      promptTokens,
      completionTokens: 100,
      usedTokens: promptTokens + 100,
      windowTokens,
      estimated: true,
      basis: "request-with-output",
      ...(cachedPromptTokens === undefined ? {} : { cachedPromptTokens }),
      parts: {
        instructions: 0,
        memory: 0,
        conversation: promptTokens + 100,
        tools: 0,
      },
    },
  });
const finished = agentEventSchema.parse({
  ...base,
  type: "run_finished",
  status: "completed",
  turns: 1,
  toolCalls: 0,
  usage: {
    promptTokens: 1000,
    completionTokens: 100,
    totalTokens: 1100,
    cachedPromptTokens: 900,
  },
  usageComplete: true,
});

it("reuses cached usage and processes only appended events without mutating previous totals", () => {
  let reads = 0;
  const oldEvent = new Proxy(context(1000, 900), {
    get(target, key, receiver) {
      reads++;
      return Reflect.get(target, key, receiver);
    },
  });
  const events = [oldEvent];
  const original = sessionUsage(events);
  reads = 0;
  expect(sessionUsage(events)).toBe(original);
  const next = appendSessionEvent(events, finished);
  expect(sessionUsage(next).total?.totalTokens).toBe(1100);
  expect(reads).toBe(0);
  expect(original.total?.totalTokens).toBe(1100);
  const irrelevant = appendSessionEvent(
    next,
    agentEventSchema.parse({
      ...base,
      type: "state_changed",
      status: "completed",
    }),
  );
  expect(sessionUsage(irrelevant)).toBe(sessionUsage(next));
  expect(sessionUsage([...next])).toEqual(sessionUsage(next));
  expect(sessionUsage([context(5000, 0)]).total?.totalTokens).toBe(5100);
});

it("separates context from session totals, replaces live usage on completion and preserves unknown cache", () => {
  const first = context(1000, 900);
  expect(sessionUsage([first]).total?.totalTokens).toBe(1100);
  expect(sessionUsage([first, finished]).total?.totalTokens).toBe(1100);
  expect(sessionUsage([finished]).cacheRead).toBe(900);
  expect(sessionUsage([finished]).latestCache).toBeUndefined();
  const result = sessionUsage([first, finished, context(2000)]);
  expect(result.total).toEqual({
    promptTokens: 3000,
    completionTokens: 200,
    totalTokens: 3200,
  });
  expect(result.context?.usedTokens).toBe(2000);
  expect(result.latestCache).toBeUndefined();
  expect(result.averageCache).toBe(0.9);
  expect(result.cachePartial).toBe(true);
  expect(sessionUsage([context(1000, 0)]).latestCache).toBe(0);
  expect(
    sessionUsage([context(1000, undefined, null)]).context?.windowTokens,
  ).toBeNull();
  expect(sessionUsage([]).total).toBeUndefined();
});

it("usage popover stays readable and dismissible on desktop/mobile in both themes", async () => {
  const events = [
    context(1000, 900),
    finished,
    context(486300, 474628, 1048576),
  ];
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
    import {createRoot} from 'react-dom/client';
    import {UsagePopover} from './src/renderer/components/workbench/UsagePopover';
    import './src/renderer/styles/global.css';
    import './src/renderer/components/workbench/app.css';
    import './src/renderer/styles/workspace-theme.css';
    const events = ${JSON.stringify(events)};
    if (location.search === '?unknown-window') {
      events.splice(0, events.length, ${JSON.stringify(context(61597, 58368, null))});
    } else {
      events.at(-1).usage.parts = { instructions: 20000, memory: 40000, conversation: 100000, tools: 326400 };
    }
    let snapshot = {version:1,id:events[0].sessionId,title:'test',workspace:'/tmp',model:'model',createdAt:events[0].timestamp,updatedAt:events.at(-1).timestamp,status:'completed',messages:[],changes:[],events:[...events]};
    if (location.search === '?unknown-window') snapshot.status = 'running';
    let selection;
    const root = createRoot(document.getElementById('root'));
    const render = () => root.render(<div className="wb-app"><UsagePopover events={[...events]} snapshot={snapshot} selection={selection} /></div>);
    window.setContextSettings = value => { window.contextSettings = value; render(); };
    window.setSelection = value => { selection = value; render(); };
    window.finishUsage = () => { snapshot = { ...snapshot, status: 'completed' }; render(); };
    window.usageEvents = () => JSON.stringify(events);
    window.appendUsage = event => { events.push(event); snapshot = { ...snapshot, events: [...events], status: 'running' }; render(); };
    render();
  `,
    },
    plugins: [{ name: "workbench-settings-fixture", setup(plugin) {
      plugin.onLoad({ filter: /[/\\]state[/\\]workbench-context\.tsx$/ }, () => ({
        contents: "export const useWorkbench = () => ({ state: { settings: window.contextSettings } });",
        loader: "ts",
      }));
    } }],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "usage.js",
    loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    const js = bundle.outputFiles.find((file) =>
      file.path.endsWith(".js"),
    )?.text;
    const css = bundle.outputFiles.find((file) =>
      file.path.endsWith(".css"),
    )?.text;
    if (!js || !css) throw new Error("Missing usage bundle");
    await page.route("http://usage.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<style>${css}.wb-app{height:650px!important;align-items:flex-end;justify-content:flex-end;padding:24px}</style><div id="root"></div><button id="outside">外部</button><script>${js.replaceAll("</script", "<\\/script")}</script>`,
      }),
    );
    await page.goto("http://usage.test/");
    for (const width of [1440, 390])
      for (const theme of ["dark", "light"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        const trigger = page.getByLabel("上下文与用量", { exact: true });
        expect(await trigger.innerText()).toContain("CH 97.6%");
        expect(await trigger.innerText()).toContain("1M");
        const track = await page.locator(".usage-track").boundingBox();
        if (!track) throw new Error("Missing context track");
        expect(track.height).toBe(3);
        const segments = await page.locator(".usage-segment").evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, color: getComputedStyle(node).backgroundColor })));
        expect(new Set(segments.map(segment => segment.color)).size).toBe(4);
        expect(segments.reduce((sum, segment) => sum + segment.width, 0) / track.width).toBeCloseTo(486400 / 1048576, 2);
        const reserve = await page.locator(".usage-reserve").boundingBox();
        if (!reserve) throw new Error("Missing context reserve segment");
        expect(reserve.width / track.width).toBeCloseTo(0.2, 1);
        expect(await page.locator(".usage-reserve").getAttribute("title")).toContain("压缩预留区");
        await trigger.click();
        const panel = page.getByRole("region", { name: "用量详情" });
        expect(await panel.innerText()).toContain("46.4% / 486.3K");
        expect(await panel.innerText()).toContain("97.6%");
        expect(await panel.innerText()).toContain("压缩预留");
        for (const label of ["指令", "记忆", "对话", "工具"]) expect(await panel.innerText()).toContain(label);
        const panelSegments = await page.locator(".usage-panel-segment").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
        expect(new Set(panelSegments).size).toBe(4);
        expect(await page.locator(".usage-panel-reserve").count()).toBe(1);
        const rect = await panel.boundingBox();
        if (!rect) throw new Error("Missing usage panel");
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: `/tmp/forge-usage-${width}-${theme}.png`,
        });
        await page.keyboard.press("Escape");
        expect(await panel.count()).toBe(0);
        await trigger.click();
        await page.locator("#outside").click();
        expect(await panel.count()).toBe(0);
      }
    const saved = await page.evaluate(() =>
      localStorage.getItem("forge-session-usage-v2"),
    );
    expect(saved).toContain('"eventCount":3');
    await page.reload();
    await page.getByLabel("上下文与用量", { exact: true }).click();
    expect(
      await page.getByRole("region", { name: "用量详情" }).innerText(),
    ).toContain("46.4% / 486.3K");
    expect(
      await page.evaluate(() => localStorage.getItem("forge-session-usage-v2")),
    ).toBe(saved);
    const projected = { ...base, type: "context_usage", usage: { windowTokens: 1048576, usedTokens: 120000, estimated: true, basis: "projected", parts: { instructions: 0, memory: 0, conversation: 120000, tools: 0 } } };
    await page.evaluate(event => Reflect.get(window, 'appendUsage')(event), projected);
    const detail = page.getByRole('region', { name: '用量详情' });
    await expect.poll(() => detail.innerText()).toContain('≈120K tokens');
    expect(await page.getByLabel('上下文与用量', { exact: true }).innerText()).toContain('1M');
    expect(await detail.innerText()).toContain('最近请求输入（实报）');
    await page.evaluate(event => Reflect.get(window, 'appendUsage')(event), { ...base, type: 'context_compacted', removedMessages: 10, beforeChars: 1000000, afterChars: 400000 });
    await page.evaluate(event => Reflect.get(window, 'appendUsage')(event), projected);
    await expect.poll(() => page.getByLabel('上下文与用量', { exact: true }).innerText()).toContain('1M');
    expect(await detail.innerText()).toContain('压缩后预估（待实报）');
    expect(await detail.innerText()).toContain('累计用量不清零');
    // Active runs use the captured budget, while idle history uses current settings.
    const settings = { contextBudgetChars: 100000, contextBudgetTokens: null, modelContextWindows: { model: 64000 } };
    const oldEvents = await page.evaluate(() => Reflect.get(window, 'usageEvents')());
    await page.evaluate(value => Reflect.get(window, 'setContextSettings')(value), settings);
    await expect.poll(() => page.getByLabel('上下文与用量', { exact: true }).innerText()).toContain('1M');
    expect(await page.evaluate(() => localStorage.getItem('forge-session-usage-v2'))).toBe(saved);
    await page.evaluate(() => Reflect.get(window, 'finishUsage')());
    await expect.poll(() => page.getByLabel('上下文与用量', { exact: true }).innerText()).toContain('64K');
    const completedCache = await page.evaluate(() => localStorage.getItem('forge-session-usage-v2'));
    expect(await detail.innerText()).toContain('187.5% / 120K');
    expect(await page.locator('.usage-reserve').getAttribute('title')).toContain('下一次请求前自动压缩');
    await page.evaluate(value => Reflect.get(window, 'setContextSettings')(value), {
      ...settings, modelContextWindows: { model: 1000000 }, contextBudgetTokens: 500000,
    });
    await expect.poll(() => detail.innerText()).toContain('窗口 1M tokens');
    expect(await detail.innerText()).toContain('12.0% / 120K');
    expect(await page.locator('.usage-reserve').getAttribute('title')).toContain('500K tokens (50.0%)');
    expect(await page.evaluate(() => localStorage.getItem('forge-session-usage-v2'))).toBe(completedCache);
    expect(await page.evaluate(() => Reflect.get(window, 'usageEvents')())).toBe(oldEvents);
    await page.goto("http://usage.test/?unknown-window");
    await page.getByText("61.6K tokens", { exact: true }).click();
    const unknownPanel = page.getByRole("region", { name: "用量详情" });
    expect(await unknownPanel.innerText()).toContain("61.6K tokens 已用");
    expect(await unknownPanel.innerText()).toContain("上下文窗口未知，暂不计算百分比");
    expect(await page.getByRole("progressbar", { name: "上下文占用" }).count()).toBe(0);

    // Verify linking model pricing from Usage (getUsageStats) and displaying TPS + breakdowns.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://usage.test/");
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      Reflect.set(window, "forge", {
        getUsageStats: async () => ({
          totalPromptTokens: 487300,
          totalCompletionTokens: 200,
          totalCachedTokens: 475528,
          totalTokens: 487500,
          totalSessions: 1,
          totalRuns: 1,
          averageCacheRate: 0.976,
          models: [],
          daily: [],
          topSessions: [],
          pricing: { state: "ready" },
          modelPrices: {
            model: {
              providerId: "anthropic",
              modelId: "claude-sonnet-4-5",
              rates: { input: 3, output: 15, cacheRead: 0.3 },
              contextTiers: [
                {
                  aboveTokens: 200000,
                  rates: { input: 6, output: 22.5, cacheRead: 0.6 },
                },
              ],
            },
          },
        }),
      });
    });
    const t0 = new Date(Date.now() - 10000).toISOString();
    const t1 = new Date(Date.now() - 8000).toISOString();
    const t2 = new Date(Date.now() - 5000).toISOString();
    const t3 = new Date(Date.now() - 3000).toISOString();
    await page.evaluate(
      ([s1, e1, s2, e2]) => {
        const append = Reflect.get(window, "appendUsage");
        append(s1);
        append(e1);
        append(s2);
        append(e2);
      },
      [
        {
          ...base,
          type: "provider_attempt",
          turn: 1,
          step: 1,
          timestamp: t0,
          selection: {
            model: "model",
            sourceId: "src",
            apiMode: "responses",
            attempt: 1,
            reason: "direct",
            outcome: "started",
            timestamp: t0,
          },
        },
        {
          ...base,
          type: "provider_attempt",
          turn: 1,
          step: 1,
          timestamp: t1,
          selection: {
            model: "model",
            sourceId: "src",
            apiMode: "responses",
            attempt: 1,
            reason: "direct",
            outcome: "succeeded",
            timestamp: t1,
            usage: {
              promptTokens: 1000,
              completionTokens: 80,
              cachedPromptTokens: 900,
              totalTokens: 1080,
            },
          },
        },
        {
          ...base,
          type: "provider_attempt",
          turn: 1,
          step: 2,
          timestamp: t2,
          selection: {
            model: "model",
            sourceId: "src",
            apiMode: "responses",
            attempt: 1,
            reason: "direct",
            outcome: "started",
            timestamp: t2,
          },
        },
        {
          ...base,
          type: "provider_attempt",
          turn: 1,
          step: 2,
          timestamp: t3,
          selection: {
            model: "model",
            sourceId: "src",
            apiMode: "responses",
            attempt: 1,
            reason: "direct",
            outcome: "succeeded",
            timestamp: t3,
            usage: {
              promptTokens: 486300,
              completionTokens: 120,
              cachedPromptTokens: 474628,
              totalTokens: 486420,
            },
          },
        },
      ],
    );
    const richTrigger = page.getByLabel("上下文与用量", { exact: true });
    await expect.poll(() => richTrigger.innerText()).toContain("50.0 tok/s");
    await richTrigger.click();
    const richPanel = page.getByRole("region", { name: "用量详情" });
    await expect.poll(() => richPanel.innerText()).toContain("入 $6 · 出 $22.5 · 缓存 $0.6 /M");
    expect(await richPanel.innerText()).toContain("模型单价 (>200K)");
    expect(await richPanel.innerText()).toContain("$0.36");
    expect(await richPanel.innerText()).toContain("省 $2.57");
    expect(await richPanel.innerText()).toContain("输出速度 (TPS)");
    expect(await richPanel.innerText()).toContain("50.0 tok/s");
    expect(await richPanel.innerText()).toContain("峰值 60.0 · 耗时 4.0s");
    expect(await richPanel.innerText()).toContain("未缓存 11.8K");
    await page.screenshot({ path: "/tmp/forge-usage-priced-tps.png" });
  } finally {
    await browser.close();
  }
}, 20000);
