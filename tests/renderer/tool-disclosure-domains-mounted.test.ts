import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("keeps agent copying and search links working across disclosure toggles", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
        import {createRoot} from 'react-dom/client';
        import {ToolDisclosure} from './src/renderer/components/primitives/ToolDisclosure';
        import './src/renderer/styles/global.css';
        import './src/renderer/styles/workspace-theme.css';
        window.openedUrls = [];
        window.forge = {openExternal: async url => {window.openedUrls.push(url);}};
        createRoot(document.getElementById('root')).render(
          <main className="wb-app">
            <ToolDisclosure toolName="spawn_agent" status="completed" defaultExpanded
              parameters={{task:'Inspect runtime\\nKeep behavior unchanged',ownership:'Runtime extraction',writePaths:['src/core/runtime.ts']}}
              output={JSON.stringify({childSessionId:'agent-12345678',model:'fixture-model'})} />
            <ToolDisclosure toolName="get_agent_result" status="completed" defaultExpanded
              output={JSON.stringify({id:'agent-12345678',status:'completed',summary:'Focused checks passed',usage:{promptTokens:1200,completionTokens:200}})} />
            <ToolDisclosure toolName="web_search" status="completed" defaultExpanded
              parameters={{query:'Forge references'}}
              output={JSON.stringify({citations:[{url:'https://example.com/reference',title:'Reference title'}],sources:['https://example.org/source']})} />
            <ToolDisclosure toolName="list_files" status="completed" defaultExpanded
              output={JSON.stringify({entries:[{path:'src/core/runtime.ts',kind:'file'},{path:'src/context',kind:'directory'}]})} />
          </main>
        );
      `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "tool-domains.js",
    loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
  const css = bundle.outputFiles.find((file) =>
    file.path.endsWith(".css"),
  )?.text;
  if (!js || !css) throw new Error("Missing bundle");
  const captureDirectory = process.env.FORGE_QA_DIR;
  if (captureDirectory) await mkdir(captureDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        hasTouch: width === 390,
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("http://localhost/tool-disclosure", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<div id="root"></div>',
        }),
      );
      await page.goto("http://localhost/tool-disclosure");
      await page.addStyleTag({
        content: `${css}\nhtml,body,#root {height:auto;overflow:visible;background:var(--canvas-bg)} .wb-app {max-width:760px;margin:24px auto;padding:16px;}`,
      });
      await page.addScriptTag({ content: js });

      const spawn = page.locator('[data-tool="spawn_agent"]');
      await spawn.getByRole("button", { name: "复制任务" }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        "Inspect runtime\nKeep behavior unchanged",
      );
      expect(await spawn.getByRole("button", { name: "已复制" }).count()).toBe(
        1,
      );
      await spawn.locator(".tool-disclosure-header").click();
      await expect
        .poll(() => spawn.locator(".agent-card-view").count())
        .toBe(0);
      await spawn.locator(".tool-disclosure-header").press("Enter");
      await spawn.getByRole("button", { name: "复制任务" }).waitFor();

      const report = page.locator('[data-tool="get_agent_result"]');
      await report.getByRole("button", { name: "复制报告" }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        "Focused checks passed",
      );
      const search = page.locator('[data-tool="web_search"]');
      const links = search.locator(".tool-web-search-link");
      await links.nth(0).click();
      await links.nth(1).click();
      expect(
        await page.evaluate(() => Reflect.get(window, "openedUrls")),
      ).toEqual([
        "https://example.com/reference",
        "https://example.org/source",
      ]);
      expect(page.url()).toBe("http://localhost/tool-disclosure");
      await search.locator(".tool-disclosure-header").click();
      await expect.poll(() => links.count()).toBe(0);
      await search.locator(".tool-disclosure-header").press("Enter");
      await links.first().waitFor();
      expect(await links.count()).toBe(2);

      const files = page.locator('[data-tool="list_files"]');
      expect(await files.innerText()).toContain("1 个文件 · 1 个目录");
      expect(await files.innerText()).toContain("runtime.ts");
      const overflow = await page.locator(".wb-app").evaluate((node) => ({
        scroll: node.scrollWidth,
        width: node.clientWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
      if (captureDirectory)
        for (const theme of ["light", "dark"]) {
          await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
          }, theme);
          await page.screenshot({
            path: resolve(captureDirectory, `domains-${width}-${theme}.png`),
            fullPage: true,
            animations: "disabled",
          });
        }
      expect(errors).toEqual([]);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}, 20000);
