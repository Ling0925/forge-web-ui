import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

/**
 * The workspace picker is a position:fixed dialog mounted inside the new
 * session composer. Any transform on an ancestor (an entrance animation that
 * keeps `transform` after it finishes, a scale-in on the panel) turns that
 * ancestor into the fixed overlay's containing block: the backdrop shrinks to
 * the composer and the dialog drifts off-centre. This mounts the real v2
 * stylesheets in their production order and measures both against the
 * viewport, so a regression in any of them fails here.
 */
it("centres the workspace picker on the viewport with a full-screen backdrop", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
      import {createRoot} from 'react-dom/client';
      import {useState} from 'react';
      import {WorkspacePicker} from './src/renderer/components/workbench/WorkspacePicker';
      import {hostCapabilities} from './src/renderer/web-host';
      import './src/renderer/styles/global.css';
      import './src/renderer/styles/workspace-theme.css';
      import './src/renderer/styles/sidebar-compact.css';
      import './src/renderer/styles/design-foundation.css';
      import './src/renderer/components/workbench/workbench.css';
      import './src/renderer/components/workbench/app.css';
      import './src/renderer/components/workbench/new-session.css';
      import './src/renderer/styles/motion.css';
      import './src/renderer/components/workbench/composer-layout.css';
      import './src/renderer/components/workbench/new-session-v2.css';
      hostCapabilities.web = true;
      window.forge = { browseWorkspaces: async ({ path } = {}) => ({
        path: path || '/srv/projects', parentPath: '/srv',
        entries: ['android', 'docs', 'repos', 'scripts'].map(name => ({ name, path: '/srv/projects/' + name })),
        truncated: false,
      }) };
      function Harness(){
        const [path, setPath] = useState('/srv/projects');
        // Same nesting as the real new-session page: the picker lives inside
        // the animated composer, inside the scrolling main pane.
        return <div className="wb-app" style={{height:'100vh'}}>
          <main className="workbench-main wb-new-session" style={{height:'100%'}}>
            <div className="wb-new-session-scroll" style={{height:'60%'}} />
            <form className="workbench-composer composer composer-fresh">
              <WorkspacePicker workspace={path} onChange={setPath} onDone={()=>{}} chooseWorkspace={async()=>null}/>
            </form>
          </main>
        </div>;
      }
      createRoot(document.getElementById('root')).render(<Harness/>);
    `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "picker-overlay.js",
    loader: { ".woff2": "dataurl", ".png": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
  const css = bundle.outputFiles.find((file) =>
    file.path.endsWith(".css"),
  )?.text;
  if (!js || !css) throw new Error("Missing test bundle");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1200, height: 700 },
      { width: 390, height: 844 },
    ]) {
      for (const theme of ["light", "dark"]) {
        // Motion stays on: the bug lived in an entrance animation's fill.
        const page = await browser.newPage({ viewport });
        page.setDefaultTimeout(5000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setContent(
          `<html data-theme="${theme}"><body><div id="root"></div></body></html>`,
        );
        await page.addStyleTag({ content: css });
        await page.addScriptTag({ content: js });
        await page
          .getByRole("button", { name: "选择工作区", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        // Let every entrance animation finish so the measured state is the
        // resting one, including any fill-mode transform left behind.
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .map((a) => a.finished.catch(() => undefined)),
          ),
        );
        const report = await page.evaluate(() => {
          const box = (selector: string) => {
            const rect = document
              .querySelector(selector)
              ?.getBoundingClientRect();
            return rect
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : null;
          };
          // Any transformed ancestor would capture the fixed overlay.
          const transformed: string[] = [];
          for (
            let node = document.querySelector(
              ".workspace-picker-panel",
            )?.parentElement;
            node;
            node = node.parentElement
          ) {
            const style = getComputedStyle(node);
            if (
              style.transform !== "none" ||
              style.filter !== "none" ||
              style.perspective !== "none"
            )
              transformed.push(node.className || node.tagName);
          }
          return {
            panel: box(".workspace-picker-panel"),
            backdrop: box(".workspace-picker-backdrop"),
            transformed,
          };
        });
        const label = `${viewport.width}x${viewport.height} ${theme}`;
        expect(report.transformed, label).toEqual([]);
        expect(report.backdrop, label).toEqual({
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height,
        });
        const panel = report.panel;
        if (!panel) throw new Error(`Missing picker panel at ${label}`);
        expect(panel.x, label).toBeGreaterThanOrEqual(0);
        expect(panel.y, label).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width, label).toBeLessThanOrEqual(
          viewport.width,
        );
        expect(panel.y + panel.height, label).toBeLessThanOrEqual(
          viewport.height,
        );
        // Centred on the viewport, not on the composer.
        expect(
          Math.abs(panel.x + panel.width / 2 - viewport.width / 2),
          label,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(panel.y + panel.height / 2 - viewport.height / 2),
          label,
        ).toBeLessThanOrEqual(1);
        expect(errors, label).toEqual([]);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}, 30000);
