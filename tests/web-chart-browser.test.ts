import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { expect, it } from "vitest";
import { freePort, launch } from "./fixtures/web-process";

// Requires pnpm build. No real provider, workspace data, or user configuration.
it("paints persisted charts after session switches/reloads in both themes and narrow layouts", async () => {
  const temporaryRoot = resolve("../../.forge/tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(join(temporaryRoot, "chart-browser-"));
  let core: ReturnType<typeof launch> | undefined;
  let web: ReturnType<typeof launch> | undefined;
  let browser: Browser | undefined;
  try {
    const corePort = await freePort();
    const coreOrigin = `http://127.0.0.1:${corePort}`;
    core = launch(
      [
        resolve("tests/fixtures/chart-core-process.mjs"),
        directory,
        String(corePort),
      ],
      directory,
      coreOrigin,
      "state",
    );
    await core.ready();
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    web = launch(
      [
        resolve("scripts/serve.mjs"),
        "--port",
        String(port),
        "--core-url",
        coreOrigin,
      ],
      directory,
      origin,
      "web-state",
    );
    await web.ready();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.FORGE_BROWSER_EXECUTABLE
        ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
        : {}),
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.locator(".composer-textarea").waitFor();
    const select = (name: string) =>
      page
        .getByRole("button", { name: `Chart recovery ${name}`, exact: true })
        .click();
    const expectPaint = async (count = 4) => {
      await expect
        .poll(() => page.locator(".chart-card-canvas").count())
        .toBe(count);
      await expect
        .poll(() =>
          page.locator(".chart-card-canvas").evaluateAll((containers) =>
            containers.every((container) => {
              const canvas = container.querySelector("canvas");
              const context = canvas?.getContext("2d");
              if (!canvas || !context || !canvas.width || !canvas.height)
                return false;
              const { data } = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
              );
              const color =
                getComputedStyle(document.documentElement)
                  .getPropertyValue("--chart-series")
                  .split(",")[0]
                  ?.trim() ?? "";
              const rgb = [1, 3, 5].map((index) =>
                Number.parseInt(color.slice(index, index + 2), 16),
              );
              let painted = 0;
              let seriesPixels = 0;
              for (let i = 0; i < data.length; i += 4) {
                if ((data[i + 3] ?? 0) > 0) painted++;
                if (
                  data[i] === rgb[0] &&
                  data[i + 1] === rgb[1] &&
                  data[i + 2] === rgb[2] &&
                  (data[i + 3] ?? 0) > 0
                )
                  seriesPixels++;
              }
              // Axes alone are not proof that the series has been rendered.
              return painted > 200 && seriesPixels > 50;
            }),
          ),
        )
        .toBe(true);
    };
    await select("A");
    await expectPaint();
    await select("B");
    await expect.poll(() => page.locator(".chart-card").count()).toBe(0);
    await select("A");
    await expectPaint();
    await page
      .getByRole("button", { name: "加载更早的对话记录", exact: true })
      .click();
    await expectPaint(8);
    await page.reload();
    await page.locator(".composer-textarea").waitFor();
    await select("A");
    await expectPaint();

    const first = page.locator(".chart-card").first();
    await first.getByRole("button", { name: "数据", exact: true }).click();
    expect(await first.locator(".chart-card-table").innerText()).toContain(
      "236",
    );
    await first.getByRole("button", { name: "图形", exact: true }).click();
    await expectPaint();
    const downloaded = page.waitForEvent("download");
    await first.getByRole("button", { name: "导出 PNG" }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(await download.failure()).toBeNull();
    await download.delete();

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (theme) => document.documentElement.setAttribute("data-theme", theme),
          theme,
        );
        await expectPaint();
        // Inspect the real geometry, not only a canvas-presence assertion.
        expect(
          await page.locator(".chart-card").evaluateAll((cards) =>
            cards.every((card) => {
              const bounds = card.getBoundingClientRect();
              const header = card.querySelector(".chart-card-header");
              return (
                header !== null &&
                bounds.width > 200 &&
                bounds.right <= window.innerWidth + 1 &&
                card.scrollWidth <= card.clientWidth + 1 &&
                header.scrollWidth <= header.clientWidth + 1
              );
            }),
          ),
        ).toBe(true);
        const colors = await first.evaluate((card) => ({
          background: getComputedStyle(card).backgroundColor,
          expected: getComputedStyle(document.documentElement)
            .getPropertyValue("--surface-elevated")
            .trim(),
        }));
        expect(colors.background).toBe(
          theme === "dark" ? "rgb(34, 34, 33)" : "rgb(255, 255, 255)",
        );
        // Optional visual artifacts stay under the caller's task-specific tmp dir.
        if (process.env.FORGE_CHART_SCREENSHOTS) {
          await mkdir(process.env.FORGE_CHART_SCREENSHOTS, { recursive: true });
          // ECharts animates canvas pixels, outside Playwright's CSS-animation control.
          await page.waitForTimeout(400);
          await first.screenshot({
            path: join(
              process.env.FORGE_CHART_SCREENSHOTS,
              `chart-${theme}-${width}.png`,
            ),
            animations: "disabled",
          });
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await select("Bad");
    await page.locator(".chart-card-error").waitFor();
    await page
      .getByRole("button", { name: "展开本轮执行过程", exact: true })
      .first()
      .click();
    const tool = page.locator('[data-tool="render_chart"]');
    expect(await tool.getAttribute("data-status"), await tool.innerText()).toBe(
      "completed",
    );
    const toolHeader = tool.locator(".tool-disclosure-header");
    if ((await toolHeader.getAttribute("aria-expanded")) === "false")
      await toolHeader.click();
    await page.locator(".tool-chart-section .chart-card-error").waitFor();
    expect(await page.locator(".composer-textarea").isVisible()).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await web?.stop();
    await core?.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
