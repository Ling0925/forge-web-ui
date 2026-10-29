import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

const output = resolve(process.env.FORGE_UI_TEST_OUTPUT ?? "../../.forge/tmp/workbench-chrome");
let browser: Browser;
let js: string;
let css: string;

beforeAll(async () => {
  await mkdir(output, { recursive: true });
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."), loader: "tsx", contents: `
        import { createRoot } from 'react-dom/client';
        import { App } from './src/renderer/components/workbench/App';
        import { defaultPublicSettings } from '@forge/core/shared/schemas';
        import './src/renderer/styles/global.css';
        import './src/renderer/styles/workspace-theme.css';
        import './src/renderer/styles/sidebar-compact.css';
        const id = '11111111-1111-4111-8111-111111111111';
        const model = 'fixture/long-model-name-for-session-specific-selection';
        const now = '2026-10-29T00:00:00Z';
        const source = { id: 'session-source', label: 'Session source', revision: 1,
          baseUrl: 'https://fixture.invalid/v1', model: '', hasApiKey: false,
          modelSelection: { mode: 'all', models: [model] } };
        window.fixtureSettings = { ...defaultPublicSettings, isConfigured: false,
          baseUrl: '', model: '', theme: 'dark', activeSourceId: source.id,
          providerSources: window.emptyServices ? [] : [source] };
        const session = { version: 1, id, title: '你好', model, providerSourceId: source.id,
          workspace: '/fixture/a-very-long-workspace-path/long-project-name-for-overflow-checks',
          status: 'completed', createdAt: now, updatedAt: now, changes: [], events: [],
          messages: [
            { id: 'm1', role: 'user', content: '你好', timestamp: now },
            { id: 'm2', role: 'assistant', content: '你好！有什么我可以帮你的吗？', timestamp: now }
          ] };
        let releaseSettings;
        const settingsReady = new Promise(resolve => { releaseSettings = resolve; });
        window.releaseSettings = () => releaseSettings();
        window.forge = {
          getSettings: async () => { await settingsReady; return window.fixtureSettings; },
          listSessions: async () => [session], getSession: async () => session,
          onEvent: listener => { window.emit = listener; return () => {}; },
          listModels: async () => [model], listModelCatalog: async () => [],
          chooseWorkspace: async () => session.workspace,
          listMcpServers: async () => [], listCheckpoints: async () => [],
          getDiagnostics: async () => null,
          getProjectContext: async () => ({ instructionSources: [], skills: [], warnings: [],
            counts: { instructions: 0, skills: 0, warnings: 0 } }),
        };
        createRoot(document.getElementById('root')).render(<App />);
      `,
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    outfile: "workbench-chrome.js", loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  js = bundle.outputFiles.find(file => file.path.endsWith(".js"))!.text;
  css = bundle.outputFiles.find(file => file.path.endsWith(".css"))!.text;
  browser = await chromium.launch({ headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE } : {}),
  });
}, 30000);

afterAll(async () => { await browser?.close(); });

async function mount(emptyServices = false, options: { hasTouch?: boolean; pointerCoarse?: boolean } = {}) {
  const page = await browser.newPage({
    viewport: { width: 1172, height: 800 },
    reducedMotion: "reduce",
    hasTouch: options.hasTouch,
  });
  if (options.pointerCoarse) {
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setEmulatedMedia", {
      features: [{ name: "pointer", value: "coarse" }],
    });
  }
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://forge.test/**", route => route.fulfill({
    contentType: "text/html", body: '<!doctype html><html><body><div id="root"></div></body></html>',
  }));
  await page.goto("https://forge.test/");
  await page.evaluate(value => { Reflect.set(window, "emptyServices", value); }, emptyServices);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: js });
  await page.getByRole("button", { name: "正在加载配置", exact: true }).waitFor();
  expect(await page.locator('.sidebar-model-status').getAttribute('data-state')).toBe('loading');
  expect(await page.locator('.wb-status-warning').count()).toBe(0);
  await page.evaluate(() => Reflect.get(window, "releaseSettings")());
  return { page, errors };
}

async function assertFooterFits(page: Page) {
  const metrics = await page.locator('.sidebar-footer').evaluate(footer => {
    const bounds = footer.getBoundingClientRect();
    return {
      overflow: footer.scrollWidth > footer.clientWidth + 1,
      labels: [...footer.querySelectorAll('button span')].map(label => {
        const rect = label.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(label);
        return { wrap: getComputedStyle(label).whiteSpace, lines: range.getClientRects().length,
          inside: rect.left >= bounds.left && rect.right <= bounds.right + 1,
          fits: label.scrollWidth <= label.clientWidth + 1 };
      }),
    };
  });
  expect(metrics.overflow).toBe(false);
  expect(metrics.labels).toHaveLength(3);
  for (const label of metrics.labels) {
    expect(label).toEqual({ wrap: "nowrap", lines: 1, inside: true, fits: true });
  }
}

it("keeps session-specific configuration honest, compact and navigable in both themes", async () => {
  const { page, errors } = await mount();
  try {
    const status = page.getByRole('button', { name: '模型服务已添加', exact: true });
    await status.waitFor();
    expect(await status.getAttribute('title')).toContain('不是网络连接状态');
    expect(await page.getByRole('region', { name: '设置工作区' }).count()).toBe(0);
    await page.getByRole('button', { name: '你好', exact: true }).click();
    await page.getByText('你好！有什么我可以帮你的吗？', { exact: true }).waitFor();
    const prompt = page.getByRole('textbox', { name: '继续任务' });
    await prompt.fill('验证会话模型可以使用');
    expect(await page.getByRole('button', { name: '运行', exact: true }).isEnabled()).toBe(true);
    await prompt.fill('');
    expect(await page.getByRole('button', { name: '展开详情', exact: true }).getAttribute('aria-expanded')).toBe('false');
    expect(await page.locator('.workbench-inspector').isVisible()).toBe(false);

    for (const width of [1172, 1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        if (width === 390) await page.getByRole('button', { name: '打开会话列表' }).click();
        await assertFooterFits(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: resolve(output, `workbench-${width}-${theme}.png`), animations: 'disabled' });
        if (width === 390) await page.getByRole('button', { name: '关闭侧边栏' }).click();
        await page.getByRole('button', { name: '展开详情', exact: true }).click();
        await page.getByRole('tab', { name: '计划与进度', exact: true }).waitFor();
        expect(await page.locator('.inspector-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        if (width === 390) {
          await page.getByRole('button', { name: '收起详情，返回任务', exact: true }).click();
        } else {
          // Open details forces the 232px compact sidebar at the screenshot's width.
          await assertFooterFits(page);
          await page.locator('.wb-inspector-close').click();
          expect(await page.getByRole('button', { name: '展开详情', exact: true }).evaluate(el => el === document.activeElement)).toBe(true);
        }
      }
    }
    await page.setViewportSize({ width: 1172, height: 800 });
    expect(await page.getByRole('button', { name: '展开详情', exact: true }).getAttribute('aria-expanded')).toBe('false');
    await status.click();
    await page.locator('.settings-status').getByText('模型服务已添加', { exact: true }).waitFor();
    await page.getByRole('button', { name: '返回工作台' }).click();
    await status.waitFor();
    expect(errors).toEqual([]);
  } finally { await page.close(); }
}, 30000);

it("still guides a genuinely empty setup into settings without pretending to be disconnected", async () => {
  const { page, errors } = await mount(true);
  try {
    await page.getByRole('region', { name: '设置工作区' }).waitFor();
    await page.locator('.settings-status').getByText('添加模型服务', { exact: true }).waitFor();
    await page.getByRole('button', { name: '返回工作台' }).click();
    await page.getByRole('button', { name: '添加模型服务', exact: true }).waitFor();
    await assertFooterFits(page);
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

it("still reveals a newly pending background approval when details start collapsed", async () => {
  const { page } = await mount();
  try {
    await page.getByRole('button', { name: '模型服务已添加', exact: true }).waitFor();
    await page.evaluate(() => Reflect.get(window, 'emit')({
      runId: '33333333-3333-4333-8333-333333333333',
      event: { type: 'approval_requested', sessionId: '22222222-2222-4222-8222-222222222222',
        timestamp: '2026-10-29T00:01:00Z', request: {
          id: '44444444-4444-4444-8444-444444444444',
          sessionId: '22222222-2222-4222-8222-222222222222', toolCallId: 'call-1',
          toolName: 'run_command', command: ['pwd'], description: 'fixture approval',
        } },
    }));
    await expect.poll(() => page.locator('.wb-app').getAttribute('class')).not.toContain('inspector-collapsed');
    await page.getByRole('button', { name: '待批准 1 项，打开执行详情' }).waitFor();
  } finally { await page.close(); }
});

it("maintains accessible touch targets on coarse pointer devices without layout overflow", async () => {
  const { page, errors } = await mount(false, { hasTouch: true, pointerCoarse: true });
  try {
    await page.getByRole('button', { name: '模型服务已添加', exact: true }).waitFor();
    const isCoarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    expect(isCoarse).toBe(true);

    const refreshBox = await page.locator('.sidebar-refresh-btn').boundingBox();
    expect(refreshBox).not.toBeNull();
    expect(refreshBox!.width).toBeGreaterThanOrEqual(44);
    expect(refreshBox!.height).toBeGreaterThanOrEqual(44);

    const statusBox = await page.locator('.sidebar-model-status').boundingBox();
    expect(statusBox).not.toBeNull();
    expect(statusBox!.height).toBeGreaterThanOrEqual(44);

    const settingsBox = await page.getByRole('button', { name: '设置', exact: true }).boundingBox();
    expect(settingsBox).not.toBeNull();
    expect(settingsBox!.height).toBeGreaterThanOrEqual(44);
    expect(settingsBox!.width).toBeGreaterThanOrEqual(44);

    await assertFooterFits(page);
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});
