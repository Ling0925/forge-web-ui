import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { corePluginsContractPlugin } from "../fixtures/core-plugins-contract";
import { dataUrl, makePng } from "../fixtures/png";

// Decodable, non-trivial fixture bytes: a schema-valid base64 string is not
// enough to prove the <img> renders, so the fixture is a real PNG and the test
// asserts naturalWidth/naturalHeight from the browser's decoder.
const shotA = makePng(24, 16);
const shotB = makePng(11, 7);

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

        const SESSION_A = '11111111-1111-4111-8111-111111111111';
        const SESSION_B = '22222222-2222-4222-8222-222222222222';
        window.rpc = [];
        // Core keeps takeover per session scope, so the fixture does too: a
        // global flag would fake cross-session control that Core never allows.
        window.state = { available: false, takeover: {}, permission: 'workspace' };
        const respond = (sessionId) => ({
          sessionId,
          available: window.state.available,
          takeover: window.state.takeover[sessionId] === true,
        });
        const images = {
          [SESSION_A]: { mimeType: 'image/png', data: '${shotA.base64}' },
          [SESSION_B]: { mimeType: 'image/png', data: '${shotB.base64}' },
        };
        // Lets a test hold the next screenshot response open across a session
        // switch, so a late reply cannot paint the previous session's frame.
        window.holdScreenshot = false;
        window.releaseScreenshot = () => {};
        const screenshot = async (input) => {
          const response = { ...respond(input.sessionId), result: { text: 'screenshot', isError: false, image: images[input.sessionId] } };
          if (!window.holdScreenshot) return response;
          window.holdScreenshot = false;
          await new Promise((resolve) => { window.releaseScreenshot = resolve; });
          return response;
        };
        window.forge = {
          browser: async (input) => {
            window.rpc.push(input);
            if (input.action === 'status') return respond(input.sessionId);
            if (input.action === 'takeover') {
              if (input.enabled && !window.state.available) throw new Error('No active browser for this session.');
              window.state.takeover[input.sessionId] = input.enabled;
              return respond(input.sessionId);
            }
            if (!window.state.available) throw new Error('No active browser for this session.');
            if (window.state.permission === 'readonly') throw new Error('Browser operations are not available in readonly/plan mode.');
            const command = input.command;
            if (command.action === 'screenshot') return screenshot(input);
            if (!window.state.takeover[input.sessionId]) throw new Error('Take browser control explicitly before performing manual actions.');
            if (command.action === 'snapshot') {
              return { ...respond(input.sessionId), result: {
                text: '- heading "Example" [level=1]\\\\n- button "Submit" [ref=e12]\\\\n- textbox "Email" [ref=e13]\\\\n<script>window.pwned=true</script>',
                isError: false } };
            }
            return { ...respond(input.sessionId), result: { text: command.action + ' ok', isError: false } };
          },
        };
        window.holdNextScreenshot = () => { window.holdScreenshot = true; };
        window.releaseHeldScreenshot = () => { window.releaseScreenshot(); };
        window.openBrowser = () => { window.state.available = true; window.rerender(); };
        window.closeBrowser = () => { window.state.available = false; window.state.takeover = {}; window.rerender(); };
        window.downgrade = () => { window.state.permission = 'readonly'; window.rerender(); };

        function Harness() {
          const [tick, setTick] = useState(0);
          const [sessionId, setSessionId] = useState(SESSION_A);
          window.rerender = () => setTick(value => value + 1);
          window.switchSession = (id) => setSessionId(id);
          return (
            <div className="wb-app" style={{width: '420px'}}>
              <BrowserPanel sessionId={sessionId} permission={window.state.permission} active={true} />
            </div>
          );
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
          readonly sessionId: string;
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
    expect(await shot.getAttribute("src")).toBe(
      `data:image/png;base64,${shotA.base64}`,
    );
    // The browser decoded real bytes: existence of an <img> is not proof.
    await expect
      .poll(() =>
        shot.evaluate((image: HTMLImageElement) => ({
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        })),
      )
      .toEqual({
        complete: true,
        naturalWidth: shotA.width,
        naturalHeight: shotA.height,
      });
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

    // Switching the Forge session must clear the previous session's frame,
    // snapshot and takeover banner before the new probe answers.
    await page.evaluate(() =>
      (
        window as unknown as { switchSession: (id: string) => void }
      ).switchSession("22222222-2222-4222-8222-222222222222"),
    );
    await expect.poll(() => page.locator(".browser-shot img").count()).toBe(0);
    expect(await page.locator(".browser-snapshot-text").count()).toBe(0);
    await page.getByText("Agent 持有控制权", { exact: true }).waitFor();
    await expect
      .poll(async () => (await rpc()).at(-1)?.sessionId)
      .toBe("22222222-2222-4222-8222-222222222222");
    // A new frame only appears after an explicit click and is this session's.
    await page.getByRole("button", { name: "刷新截图", exact: true }).click();
    const shotBImage = page.getByRole("img", { name: "当前浏览器页面截图" });
    await expect.poll(() => shotBImage.isVisible()).toBe(true);
    expect(await shotBImage.getAttribute("src")).toBe(
      `data:image/png;base64,${shotB.base64}`,
    );
    await expect
      .poll(() =>
        shotBImage.evaluate((image: HTMLImageElement) => ({
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        })),
      )
      .toEqual({ naturalWidth: shotB.width, naturalHeight: shotB.height });

    // A late response for the previous session is discarded even if the RPC
    // resolves after the switch: hold session B's capture, switch back to A,
    // then release B's reply and require it never paints.
    await page.evaluate(() => Reflect.get(window, "holdNextScreenshot")());
    await page.getByRole("button", { name: "刷新截图", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await rpc()).filter(
            (entry) => entry.command?.action === "screenshot",
          ).length,
      )
      .toBe(3);
    await page.evaluate(() =>
      (
        window as unknown as { switchSession: (id: string) => void }
      ).switchSession("11111111-1111-4111-8111-111111111111"),
    );
    await expect.poll(() => page.locator(".browser-shot img").count()).toBe(0);
    await page.evaluate(() => Reflect.get(window, "releaseHeldScreenshot")());
    await page.waitForTimeout(50);
    expect(await page.locator(".browser-shot img").count()).toBe(0);
    expect(await page.locator(".browser-snapshot-text").count()).toBe(0);

    // Take control of session B, then downgrade to readonly and verify that
    // releasing control still works even though actions are now rejected.
    await page.evaluate(() =>
      (
        window as unknown as { switchSession: (id: string) => void }
      ).switchSession("22222222-2222-4222-8222-222222222222"),
    );
    await page.getByText("Agent 持有控制权", { exact: true }).waitFor();
    await page.getByRole("button", { name: "显式接管", exact: true }).click();
    await page.getByText("你正在操作页面", { exact: true }).waitFor();
    await page.evaluate(() => Reflect.get(window, "downgrade")());
    await page.getByText(/当前运行是只读模式/).waitFor();
    await page.getByRole("button", { name: "归还控制权", exact: true }).click();
    await page.getByText("Agent 持有控制权", { exact: true }).waitFor();
    const takeovers = (await rpc()).filter(
      (entry) => entry.action === "takeover",
    );
    expect(takeovers.at(-1)).toEqual({
      sessionId: "22222222-2222-4222-8222-222222222222",
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

// Keep the fixture helper honest even if the component test is skipped locally.
it("fixture PNGs are real decodable images", async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<img id="a" src="${dataUrl(shotA)}"><img id="b" src="${dataUrl(shotB)}">`,
    );
    const sizes = await page.evaluate(() =>
      ["a", "b"].map((id) => {
        const image = document.getElementById(id) as HTMLImageElement;
        return {
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        };
      }),
    );
    expect(sizes).toEqual([
      { complete: true, naturalWidth: 24, naturalHeight: 16 },
      { complete: true, naturalWidth: 11, naturalHeight: 7 },
    ]);
  } finally {
    await browser.close();
  }
});
