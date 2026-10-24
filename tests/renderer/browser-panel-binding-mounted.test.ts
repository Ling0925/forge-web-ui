import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { corePluginsContractPlugin } from "../fixtures/core-plugins-contract";
import { makePng } from "../fixtures/png";

const sessionShot = makePng(20, 12);

/**
 * Integration-level rendered check: the Inspector mounts the browser panel only
 * inside the 会话信息 → 浏览器 subtab, binds it to the selected Forge session,
 * and performs no browser RPC before that subtab is opened.
 */
it("binds the browser panel to the selected session and probes only when opened", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
        import {useState} from 'react';
        import {createRoot} from 'react-dom/client';
        import {Inspector} from './src/renderer/components/workbench/Inspector';
        import {initialWorkbenchState} from './src/renderer/state/workbench-reducer';
        import './src/renderer/styles/global.css';
        import './src/renderer/components/workbench/app.css';
        import './src/renderer/styles/workspace-theme.css';

        window.browserRpc = [];
        window.forge = {
          browser: async (input) => {
            window.browserRpc.push(input);
            // Session A has a live browser and a frame already taken; session B
            // does not. Switching must not carry A's frame into B.
            if (input.sessionId === '11111111-1111-4111-8111-111111111111' && input.action === 'execute')
              return { sessionId: input.sessionId, available: true, takeover: false,
                result: { text: 'captured', isError: false, image: { mimeType: 'image/png', data: '${sessionShot.base64}' } } };
            return { sessionId: input.sessionId,
              available: input.sessionId === '11111111-1111-4111-8111-111111111111',
              takeover: false };
          },
          listCheckpoints: async () => [],
          listMcpServers: async () => [],
          getProjectContext: async () => ({counts:{instructions:0,skills:0},instructionSources:[],skills:[],warnings:[]}),
          getDiagnostics: async () => null,
          listWorkspaceEntries: async () => ({workspace:'/w',path:'.',parentPath:null,entries:[],truncated:false}),
          readWorkspaceFile: async ({path}) => ({path,sizeBytes:0,binary:false,truncated:false,content:''}),
        };
        const sessions = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].map(id => ({
          id, title: id, model: 'fixture', workspace: '/w', status: 'completed',
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
          messages: [], events: [], changes: [],
        }));
        function Harness() {
          const [id, select] = useState(sessions[0].id);
          window.testController = {
            state: {...initialWorkbenchState, activeSessionId: id, activeSnapshot: sessions.find(s => s.id === id),
              activeRuns: {}, sessions, settings: {defaultPermission: 'workspace'}},
            refreshActiveSession: async () => {}, selectSession: select,
            answerApproval: async () => {}, setMobileTab: () => {},
          };
          window.selectTestSession = (next) => select(next);
          return <div className="wb-app" style={{height: '100vh', display: 'flex', justifyContent: 'flex-end'}}><Inspector/></div>;
        }
        createRoot(document.getElementById('root')).render(<Harness/>);
      `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "inspector-browser.js",
    loader: { ".woff2": "dataurl", ".css": "css" },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "test-controller",
        setup(api) {
          api.onLoad({ filter: /workbench-context\.tsx$/ }, () => ({
            contents:
              "export function useWorkbench() { return window.testController; }",
            loader: "js",
          }));
        },
      },
      corePluginsContractPlugin(),
    ],
  });
  const javascript = bundle.outputFiles.find((file) =>
    file.path.endsWith(".js"),
  )?.text;
  const css = bundle.outputFiles.find((file) => file.path.endsWith(".js"))
    ? bundle.outputFiles
        .filter((file) => file.path.endsWith(".css"))
        .map((file) => file.text)
        .join("\n")
    : "";
  if (!javascript) throw new Error("missing inspector bundle");

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
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
      page.evaluate(() => Reflect.get(window, "browserRpc")) as Promise<
        readonly {
          readonly sessionId: string;
          readonly action: string;
          readonly command?: { readonly action: string };
        }[]
      >;

    await page.getByRole("tab", { name: "会话信息", exact: true }).click();
    // The default subtab is the overview: the browser tab has not been opened.
    expect(await rpc()).toEqual([]);
    await page.getByRole("tab", { name: "浏览器", exact: true }).click();
    const panel = page.getByRole("region", { name: "浏览器预览与接管" });
    await expect.poll(() => panel.isVisible()).toBe(true);
    // Only a read-only status probe, scoped to the selected session.
    await expect.poll(async () => (await rpc()).length).toBe(1);
    expect((await rpc())[0]).toEqual({
      sessionId: "11111111-1111-4111-8111-111111111111",
      action: "status",
    });
    await panel.getByText("Agent 持有控制权", { exact: true }).waitFor();
    await panel.getByText(/不绕过审批/).waitFor();

    // Capture a real frame for session A before switching away from it.
    await panel.getByRole("button", { name: "刷新截图", exact: true }).click();
    const shot = panel.getByRole("img", { name: "当前浏览器页面截图" });
    await expect.poll(() => shot.isVisible()).toBe(true);
    await expect
      .poll(() =>
        shot.evaluate((image: HTMLImageElement) => ({
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        })),
      )
      .toEqual({
        naturalWidth: sessionShot.width,
        naturalHeight: sessionShot.height,
      });

    // Switching the session rebinds the panel; the new probe names the new id
    // and the previous session's frame is gone before any new capture.
    await page.evaluate(() =>
      (
        window as unknown as { selectTestSession: (id: string) => void }
      ).selectTestSession("22222222-2222-4222-8222-222222222222"),
    );
    await expect
      .poll(async () => (await rpc()).at(-1)?.sessionId)
      .toBe("22222222-2222-4222-8222-222222222222");
    await expect.poll(() => panel.locator(".browser-shot img").count()).toBe(0);
    await panel.getByText("未可用", { exact: true }).waitFor();

    // The only non-status call is the explicitly clicked capture, and it is
    // bound to session A. Nothing ran for session B, and there was no implicit
    // capture or takeover.
    const calls = await rpc();
    expect(calls.filter((entry) => entry.action === "execute")).toEqual([
      {
        sessionId: "11111111-1111-4111-8111-111111111111",
        action: "execute",
        command: { action: "screenshot" },
      },
    ]);
    expect(calls.filter((entry) => entry.action === "takeover")).toEqual([]);
    expect(
      calls.some(
        (entry) =>
          entry.sessionId === "22222222-2222-4222-8222-222222222222" &&
          entry.action !== "status",
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
