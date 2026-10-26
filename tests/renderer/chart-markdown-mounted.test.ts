import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

const validFence = [
  "```chart",
  JSON.stringify({
    title: "月度收入",
    chart: { type: "bar", categories: ["一月", "二月"], series: [{ name: "收入", values: [10, 20] }] },
  }),
  "```",
].join("\n");

it("renders chart fences only for enabled settled messages and degrades safely", async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {flushSync} from 'react-dom';
        import {Markdown} from './src/renderer/components/workbench/Markdown';
        import {ToolDisclosure} from './src/renderer/components/primitives/ToolDisclosure';
        window.render = (source, enableCharts, highlight = true) => flushSync(() =>
          root.render(
            <Markdown source={source} highlight={highlight} enableCharts={enableCharts}/>
          ));
        window.renderToolCard = (output) => flushSync(() =>
          root.render(
            <ToolDisclosure toolName="render_chart" status="completed" defaultExpanded={true} output={output}/>
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
    await page.evaluate(
      `window.render(${JSON.stringify(validFence)}, true)`,
    );
    expect(await page.locator(".chart-card").count()).toBe(1);
    expect(await page.locator(".chart-card-title").innerText()).toContain("月度收入");
    await page.waitForSelector(".chart-card-canvas canvas", { timeout: 5000 });
    // The data-table toggle exists and swaps the canvas for a table.
    await page.getByRole("button", { name: "数据" }).click();
    expect(await page.locator(".chart-card-table th").count()).toBe(2);
    // Theme toggle re-renders without page errors.
    await page.evaluate("document.documentElement.setAttribute('data-theme','dark')");
    await page.waitForTimeout(120);
    expect(errors).toEqual([]);

    // User message (charts disabled): plain code block, no card.
    await page.evaluate(
      `window.render(${JSON.stringify(validFence)}, false)`,
    );
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
        raw: { option: { tooltip: { formatter: "<img src=x onerror=alert(1)>" } } },
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
    expect(await page.locator(".tool-chart-section .chart-card").count()).toBe(1);
    await page.waitForSelector(".tool-chart-section .chart-card-canvas canvas", { timeout: 5000 });

    // A failed render_chart result shows no preview card.
    const failureOutput = JSON.stringify({ ok: false, errors: ["chart.type: 无效图型"] });
    await page.evaluate(`window.renderToolCard(${JSON.stringify(failureOutput)})`);
    expect(await page.locator(".tool-chart-section").count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
