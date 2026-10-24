import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { corePluginsContractPlugin } from "../fixtures/core-plugins-contract";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

/**
 * Mounted-renderer check of the same-session browser panel: no work on load,
 * explicit read-only status, click-only screenshot, explicit takeover gating
 * for manual commands, release, and plain-text snapshot rendering.
 */
it("previews screenshots and takes explicit control without implicit browser work", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
        import { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { BrowserPanel } from './src/renderer/components/workbench/BrowserPanel';
        import './src/renderer/styles/global.css';
        import './src/renderer/styles/workspace-theme.css';
        import './src/renderer/components/workbench/browser-panel.css';

        window.rpc = [];
        window.state = { available: false, takeover: false, permission: 'workspace' };
        const respond = () => ({
          sessionId: '11111111-1111-4111-8111-111111111111',
          available: window.state.available,
          takeover: window.state.takeover,
        });
        window.forge = {
          browser: async (input) => {
            window.rpc.push(input);
            if (input.action === 'status') return respond();
            if (input.action === 'takeover') {
              if (input.enabled && !window.state.available) throw new Error('No active browser for this session.');
              window.state.takeover = input.enabled;
              return respond();
            }
            if (!window.state.available) throw new Error('No active browser for this session.');
            if (window.state.permission === 'readonly') throw new Error('Browser operations are not available in readonly/plan mode.');
            const command = input.command;
            if (command.action === 'screenshot') {
              return { ...respond(), result: { text: 'screenshot', isError: false, image: { mimeType: 'image/png', data: '${PNG}' } } };
            }
            if (!window.state.takeover) throw new Error('Take browser control explicitly before performing manual actions.');
            if (command.action === 'snapshot') {
              return { ...respond(), result: {
                text: '- heading "Example" [level=1]\\\\n- button "Submit" [ref=e12]\\\\n- textbox "Email" [ref=e13]\\\\n<script>window.pwned=true</script>',
                isError: false } };
            }
            return { ...respond(), result: { text: command.action + ' ok', isError: false } };
          },
        };
        window.openBrowser = () => { window.state.available = true; window.rerender(); };
        window.closeBrowser = () => { window.state.available = false; window.state.takeover = false; window.rerender(); };
        window.downgrade = () => { window.state.permission = 'readonly'; window.rerender(); };

        function Harness() {
          const [tick, setTick] = useState(0);
          window.rerender = () => setTick(value => value + 1);
          return <div className="wb-app" style={{width: '420px'}}><BrowserPanel sessionId="11111111-1111-4111-8111-111111111111" permission={window.state.permission} active={true} /></div>;
        }
        createRoot(document.getElementById('root')).render(<Harness />);
      `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "browser.js",
    loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [corePluginsContractPlugin()],
  });
  const javascript = bundle.outputFiles.find((file) =>
    file.path.endsWith(".js"),
  )?.text;
  const css = bundle.outputFiles.find((file) =>
    file.path.endsWith(".css"),
  )?.text;
  if (!javascript) throw new Error("missing browser panel bundle");

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 420, height: 900 },
    });
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setContent('<div id="root"></div>');
    if (css) await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: javascript });

    const rpc = () =>
      page.evaluate(() => Reflect.get(window, "rpc")) as Promise<
        readonly {
          readonly action: string;
          readonly enabled?: boolean;
          readonly command?: { readonly action: string };
        }[]
      >;
    const panel = page.getByRole("region", { name: "浏览器预览与接管" });
    await expect.poll(() => panel.isVisible()).toBe(true);

    // Mount probes only read-only metadata; it never screenshots or executes.
    expect((await rpc()).map((entry) => entry.action)).toEqual(["status"]);
    await page.getByText(/本会话当前没有活动浏览器/).waitFor();
    await page.getByText(/不绕过审批/).waitFor();

    // Only the agent opening a browser makes it available; the UI cannot.
    await page.evaluate(() => Reflect.get(window, "openBrowser")());
    await page.getByRole("button", { name: "查询状态", exact: true }).click();
    await page.getByText("Agent 持有控制权", { exact: true }).waitFor();
    expect((await rpc()).every((entry) => entry.action === "status")).toBe(
      true,
    );

    // Screenshot needs no takeover but needs an explicit click.
    await page.getByRole("button", { name: "刷新截图", exact: true }).click();
    const shot = page.getByRole("img", { name: "当前浏览器页面截图" });
    await expect.poll(() => shot.isVisible()).toBe(true);
    expect(await shot.getAttribute("src")).toBe(`data:image/png;base64,${PNG}`);
    await page
      .getByText("已刷新截图。这是点击时的单帧快照，不是实时视频。", {
        exact: true,
      })
      .waitFor();
    expect(
      (await rpc()).find((entry) => entry.action === "execute")?.command,
    ).toEqual({
      action: "screenshot",
    });

    // Manual commands are not sent before takeover is explicit.
    await expect
      .poll(() =>
        page.getByRole("button", { name: "读取页面快照" }).isDisabled(),
      )
      .toBe(true);
    expect(
      (await rpc()).some((entry) => entry.command?.action === "snapshot"),
    ).toBe(false);
    await page.getByRole("button", { name: "显式接管", exact: true }).click();
    await page.getByText("你正在操作页面", { exact: true }).waitFor();
    expect(
      (await rpc()).filter((entry) => entry.action === "takeover"),
    ).toEqual([
      {
        sessionId: "11111111-1111-4111-8111-111111111111",
        action: "takeover",
        enabled: true,
      },
    ]);

    // The snapshot is rendered as text, refs are offered, HTML is not executed.
    await page
      .getByRole("button", { name: "读取页面快照", exact: true })
      .click();
    const snapshot = page.locator(".browser-snapshot-text");
    await expect.poll(() => snapshot.innerText()).toContain('button "Submit"');
    expect(await snapshot.innerText()).toContain(
      "<script>window.pwned=true</script>",
    );
    expect(await snapshot.locator("script").count()).toBe(0);
    expect(
      await page.evaluate(() => Reflect.get(window, "pwned")),
    ).toBeUndefined();
    await page.getByRole("button", { name: "@e12", exact: true }).click();
    expect(await page.getByLabel("选择器或 snapshot ref").inputValue()).toBe(
      "@e12",
    );
    await page
      .getByRole("button", { name: "执行人工动作", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await rpc()).filter((entry) => entry.command?.action === "click")
            .length,
      )
      .toBe(1);

    // Readonly downgrade: Core rejects actions, but releasing control must work.
    await page.evaluate(() => Reflect.get(window, "downgrade")());
    await page.getByText(/当前运行是只读模式/).waitFor();
    await page.getByRole("button", { name: "归还控制权", exact: true }).click();
    await page.getByText("Agent 持有控制权", { exact: true }).waitFor();
    const takeovers = (await rpc()).filter(
      (entry) => entry.action === "takeover",
    );
    expect(takeovers.at(-1)).toEqual({
      sessionId: "11111111-1111-4111-8111-111111111111",
      action: "takeover",
      enabled: false,
    });
    await page.getByText(/已归还控制权/).waitFor();

    // Run end makes the browser unavailable again; nothing lingers locally.
    await page.evaluate(() => Reflect.get(window, "closeBrowser")());
    await page.getByRole("button", { name: "查询状态", exact: true }).click();
    await page.getByText(/本会话当前没有活动浏览器/).waitFor();
    expect(await page.locator(".browser-shot img").count()).toBe(0);

    expect(errors).toEqual([]);
    // Image bytes stay in the component: never in the URL or document title.
    expect(page.url()).toBe("about:blank");
    expect(await page.title()).toBe("");
  } finally {
    await browser.close();
  }
});
