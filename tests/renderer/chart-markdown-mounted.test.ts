import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

/**
 * A canvas element exists as soon as echarts.init() runs, so presence alone
 * cannot prove anything was painted. Count pixels that differ from the
 * transparent/blank baseline to catch a chart that mounts but never setOption.
 */
const paintedCount = (canvasSelector: string) => `(() => {
  const canvas = document.querySelector(${JSON.stringify(canvasSelector)});
  if (!canvas) return -1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return -1;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
  return painted;
})()`;

const validFence = [
  "```chart",
  JSON.stringify({
    title: "月度收入",
    chart: {
      type: "bar",
      categories: ["一月", "二月"],
      series: [{ name: "收入", values: [10, 20] }],
    },
  }),
  "```",
].join("\n");

/**
 * In production the ECharts chunk arrives over the network tens of milliseconds
 * after mount, so the theme re-render lands *before* the instance exists. An
 * inlined dynamic import resolves in a microtask and hides that ordering,
 * which is exactly how the "card mounts but canvas stays blank" regression
 * slipped past this test once. Delay the loader with a real macrotask and run
 * under StrictMode like main.tsx so the effect order matches the real page.
 */
it("renders chart fences only for enabled settled messages and degrades safely", async () => {
  const echartsInstancePath = resolve(
    ".",
    "src/renderer/components/charts/echarts-instance.ts",
  ).replace(/\\/g, "/");
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {flushSync} from 'react-dom';
        import {Markdown} from './src/renderer/components/workbench/Markdown';
        import {ToolDisclosure} from './src/renderer/components/primitives/ToolDisclosure';
        import {ChartCard} from './src/renderer/components/charts/ChartCard';
        window.renderCard = spec => flushSync(() => root.render(
          <React.StrictMode><ChartCard spec={spec} source={JSON.stringify(spec)}/></React.StrictMode>
        ));
        window.render = (source, enableCharts, highlight = true) => flushSync(() =>
          root.render(
            <React.StrictMode><Markdown source={source} highlight={highlight} enableCharts={enableCharts}/></React.StrictMode>
          ));
        window.renderToolCard = (output) => flushSync(() =>
          root.render(
            <React.StrictMode><ToolDisclosure toolName="render_chart" status="completed" defaultExpanded={true} output={output}/></React.StrictMode>
          ));
        const root = createRoot(document.getElementById('root'));
      `,
      resolveDir: resolve("."),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "empty" },
    plugins: [
      {
        name: "slow-load-echarts",
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /^\.\/load-echarts$/ }, () => ({
            path: "slow-load-echarts",
            namespace: "slow-echarts",
          }));
          pluginBuild.onLoad(
            { filter: /.*/, namespace: "slow-echarts" },
            () => ({
              contents: `
              import { echarts } from '${echartsInstancePath}';
              let loader;
              export function loadEcharts() {
                loader ??= new Promise((resolve) => setTimeout(() => resolve({
                  ...echarts,
                  init(...args) {
                    if (window.failNextChartInit) {
                      window.failNextChartInit = false;
                      throw new Error('fixture init failure');
                    }
                    return echarts.init(...args);
                  },
                }), 120));
                return loader;
              }
            `,
              loader: "ts",
              resolveDir: resolve("."),
            }),
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
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    const script = bundle.outputFiles[0]?.text;
    if (!script) throw Error("Missing test bundle");
    await page.addScriptTag({ content: script });

    // Assistant (charts enabled, settled): a real ChartCard with a canvas.
    await page.evaluate(`window.render(${JSON.stringify(validFence)}, true)`);
    expect(await page.locator(".chart-card").count()).toBe(1);
    expect(await page.locator(".chart-card-title").innerText()).toContain(
      "月度收入",
    );
    await page.waitForSelector(".chart-card-canvas canvas", { timeout: 5000 });
    // Regression guard: the canvas must actually be painted, not just created.
    await expect
      .poll(() => page.evaluate(paintedCount(".chart-card-canvas canvas")))
      .toBeGreaterThan(200);
    // The data-table toggle exists and swaps the canvas for a table.
    await page.getByRole("button", { name: "数据" }).click();
    expect(await page.locator(".chart-card-table th").count()).toBe(2);
    // Toggling back rebuilds the instance on the fresh canvas and repaints it.
    await page.getByRole("button", { name: "图形" }).click();
    await page.waitForSelector(".chart-card-canvas canvas", { timeout: 5000 });
    await expect
      .poll(() => page.evaluate(paintedCount(".chart-card-canvas canvas")))
      .toBeGreaterThan(200);
    // Reopening a hidden pane must wait for measurable layout, then repaint.
    await page.evaluate(
      `window.render('other session', true); document.getElementById('root').style.display = 'none'; window.render(${JSON.stringify(validFence)}, true)`,
    );
    await page.waitForTimeout(180);
    expect(await page.locator(".chart-card-canvas canvas").count()).toBe(0);
    await page.evaluate("document.getElementById('root').style.display = ''");
    await expect
      .poll(() => page.evaluate(paintedCount(".chart-card-canvas canvas")))
      .toBeGreaterThan(200);

    // A restored bitmap can be blank even though the container size is unchanged.
    // Simulate that loss, rather than merely checking that a canvas node exists.
    await page.waitForTimeout(400);
    const clearBitmap = `document.querySelectorAll('.chart-card-canvas canvas').forEach(canvas => {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    })`;
    await page.evaluate(clearBitmap);
    expect(await page.evaluate(paintedCount(".chart-card-canvas canvas"))).toBe(
      0,
    );
    await page.evaluate(
      "window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))",
    );
    await expect
      .poll(() => page.evaluate(paintedCount(".chart-card-canvas canvas")))
      .toBeGreaterThan(200);
    await page.waitForTimeout(400);
    await page.evaluate(clearBitmap);
    await page.evaluate(
      "document.dispatchEvent(new Event('visibilitychange'))",
    );
    await expect
      .poll(() => page.evaluate(paintedCount(".chart-card-canvas canvas")))
      .toBeGreaterThan(200);

    // The manual repaint action creates a live replacement, never a second canvas.
    await page.getByRole("button", { name: "重新绘制图表" }).click();
    await expect
      .poll(() => page.evaluate(paintedCount(".chart-card-canvas canvas")))
      .toBeGreaterThan(200);
    expect(await page.locator(".chart-card-canvas canvas").count()).toBe(1);

    // Theme toggle re-renders without page errors.
    await page.evaluate(
      "document.documentElement.setAttribute('data-theme','dark')",
    );
    await page.waitForTimeout(120);
    expect(errors).toEqual([]);

    // User message (charts disabled): plain code block, no card.
    await page.evaluate(`window.render(${JSON.stringify(validFence)}, false)`);
    expect(await page.locator(".chart-card").count()).toBe(0);
    expect(await page.locator(".code-block").count()).toBe(1);

    // Streaming (highlight off): stays code until settled.
    await page.evaluate(
      `window.render(${JSON.stringify(validFence)}, true, false)`,
    );
    expect(await page.locator(".chart-card").count()).toBe(0);

    // Invalid fence with charts enabled: falls back to the code block.
    await page.evaluate(
      `window.render(${JSON.stringify("```chart\n{not json\n```")}, true)`,
    );
    expect(await page.locator(".chart-card").count()).toBe(0);
    expect(await page.locator(".code-block").count()).toBe(1);

    // Hostile raw option: card mounts, sanitizer blocks the HTML formatter.
    const hostile = [
      "```chart",
      JSON.stringify({
        title: "恶意",
        raw: {
          option: { tooltip: { formatter: "<img src=x onerror=alert(1)>" } },
        },
      }),
      "```",
    ].join("\n");
    await page.evaluate(`window.render(${JSON.stringify(hostile)}, true)`);
    expect(await page.locator(".chart-card-error").count()).toBe(1);
    expect(errors).toEqual([]);

    // render_chart tool card previews the validated fence it returned.
    const toolOutput = JSON.stringify({
      ok: true,
      fence: validFence,
      hint: "粘贴下面这段围栏到回复正文中即可渲染图表；不要改动其中 JSON。",
    });
    await page.evaluate(`window.renderToolCard(${JSON.stringify(toolOutput)})`);
    expect(await page.locator(".tool-chart-section .chart-card").count()).toBe(
      1,
    );
    await page.waitForSelector(
      ".tool-chart-section .chart-card-canvas canvas",
      { timeout: 5000 },
    );
    await expect
      .poll(() =>
        page.evaluate(
          paintedCount(".tool-chart-section .chart-card-canvas canvas"),
        ),
      )
      .toBeGreaterThan(200);

    // Schema-valid JSON is not necessarily drawable by ECharts. A broken raw
    // preview must stay local instead of unmounting the entire React root.
    const badSpec = {
      title: "Broken chart",
      raw: { option: { series: [{ type: "bar", data: [1, 2] }] } },
    };
    const badOutput = JSON.stringify({
      ok: true,
      fence: ["```chart", JSON.stringify(badSpec), "```"].join("\n"),
    });
    await page.evaluate(`window.renderToolCard(${JSON.stringify(badOutput)})`);
    await page.waitForSelector(".chart-card-error");
    expect(await page.locator(".tool-disclosure-header").count()).toBe(1);
    expect(await page.locator(".chart-card-canvas canvas").count()).toBe(0);
    expect(errors).toEqual([]);

    // Recover on changed spec in the same component and on a one-off init error.
    await page.evaluate(`window.renderCard(${JSON.stringify(badSpec)})`);
    await page.waitForSelector(".chart-card-error");
    const repairedSpec = {
      title: "Recovered",
      chart: { type: "bar", categories: ["A"], series: [{ values: [42] }] },
    };
    await page.evaluate(`window.renderCard(${JSON.stringify(repairedSpec)})`);
    await expect
      .poll(() => page.evaluate(paintedCount(".chart-card-canvas canvas")))
      .toBeGreaterThan(200);
    await page.evaluate("window.failNextChartInit = true");
    await page.getByRole("button", { name: "重新绘制图表" }).click();
    await page.waitForSelector(".chart-card-error");
    // The data view remains usable even when the renderer fails.
    await page.getByRole("button", { name: "数据", exact: true }).click();
    expect(await page.locator(".chart-card-table").innerText()).toContain("42");
    expect(await page.getByRole("button", { name: "导出 PNG" }).count()).toBe(
      0,
    );
    await page.getByRole("button", { name: "图形", exact: true }).click();
    await expect
      .poll(() => page.evaluate(paintedCount(".chart-card-canvas canvas")))
      .toBeGreaterThan(200);
    expect(await page.locator(".chart-card-error").count()).toBe(0);
    expect(errors).toEqual([]);

    // A failed render_chart result shows no preview card.
    const failureOutput = JSON.stringify({
      ok: false,
      errors: ["chart.type: 无效图型"],
    });
    await page.evaluate(
      `window.renderToolCard(${JSON.stringify(failureOutput)})`,
    );
    expect(await page.locator(".tool-chart-section").count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
