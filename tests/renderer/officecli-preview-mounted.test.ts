import { resolve } from "node:path";
import { PUBLISHED_HTML_PREVIEW_MAX_BYTES } from "@forge/core/shared/published-files";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

declare global {
  interface Window {
    filesRoot: { unmount: () => void };
    records: { config: { timeoutMs?: number } }[];
    preview: string;
    pwned?: boolean;
    originalGetPublishedFile: typeof window.forge.getPublishedFile;
  }
}

/**
 * Mounted interaction check for the two Web UI changes:
 *
 * 1. The OfficeCLI plugin card edits executable + timeout, saves through the
 *    host, then enables; health is explicit and an unavailable dependency is
 *    shown as such. The browser and an unknown plugin keep working.
 * 2. An HTML attachment opens the existing host-served, sandboxed preview on
 *    the first click; the raw source and the download stay separate actions.
 *    No `srcdoc`/data document is ever created.
 */
it("edits OfficeCLI config, keeps other plugins, and previews HTML directly", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
        import { createRoot } from 'react-dom/client';
        import { PluginPanel } from './src/renderer/components/workbench/PluginPanel';
        import { PublishedFiles } from './src/renderer/components/workbench/PublishedFiles';
        import './src/renderer/styles/global.css';
        import './src/renderer/styles/workspace-theme.css';
        import './src/renderer/components/workbench/plugin-panel.css';

        window.calls = { list: 0, check: 0, configure: 0, inputs: [] };
        const record = (id, name, config, capabilities, description) => ({
          manifest: {
            id, name, version: '1.0.0', apiVersion: 1, description, builtin: true,
            capabilities,
            configSchema: { type: 'object', properties: {} },
          },
          enabled: false,
          config,
          status: 'disabled',
          activeSessions: 0,
        });
        window.records = [
          record('browser', 'Browser · agent-browser', {
            executablePath: 'agent-browser', browserExecutablePath: '', allowedDomains: ['example.com'],
          }, ['tools', 'instructions', 'browser', 'network', 'process'], 'Official isolated browser tools.'),
          record('officecli', 'OfficeCLI · Office documents', {
            executablePath: 'officecli', timeoutMs: 120000,
          }, ['tools', 'instructions', 'process'], 'Official OfficeCLI document tools.'),
          record('vendor-plugin', 'Vendor plugin', { opaque: true }, ['tools'], 'Unknown third-party plugin.'),
        ];
        const hash = 'a'.repeat(64);
        window.htmlBody = '<h1>Delivered preview</h1><script>parent.pwned = true</scr' + 'ipt>';
        window.published = [
          { id: '11111111-1111-4111-8111-111111111111', name: 'page.html',
            size: new TextEncoder().encode(window.htmlBody).length, sha256: hash,
            mimeType: 'text/html', previewKind: 'html', createdAt: '2026-01-01T00:00:00Z' },
          { id: '22222222-2222-4222-8222-222222222222', name: 'huge.html',
            size: ${PUBLISHED_HTML_PREVIEW_MAX_BYTES + 1}, sha256: hash,
            mimeType: 'text/html', previewKind: 'html', createdAt: '2026-01-01T00:00:00Z' },
          { id: '33333333-3333-4333-8333-333333333333', name: 'notes.md', size: 17, sha256: hash,
            mimeType: 'text/plain', previewKind: 'text', createdAt: '2026-01-01T00:00:00Z' },
        ];
        window.preview = '';
        window.forge = {
          listPlugins: async () => {
            window.calls.list++;
            return window.records;
          },
          configurePlugin: async (input) => {
            window.calls.configure++;
            window.calls.inputs.push(input);
            const index = window.records.findIndex((item) => item.manifest.id === input.pluginId);
            const current = window.records[index];
            const next = {
              ...current,
              config: input.config ?? current.config,
              enabled: input.enabled ?? current.enabled,
              status: (input.enabled ?? current.enabled) ? 'configured' : 'disabled',
            };
            window.records = window.records.map((item, at) => (at === index ? next : item));
            return next;
          },
          checkPlugin: async (id) => {
            window.calls.check++;
            return {
              pluginId: id,
              status: 'unavailable',
              message: 'OfficeCLI could not complete --version. No installation or fallback was attempted.',
            };
          },
          getPublishedFile: async (_, id) => {
            const file = window.published.find((item) => item.id === id);
            if (file.name === 'huge.html') throw new Error('附件内容不完整。');
            const body = file.previewKind === 'html' ? window.htmlBody : 'plain source text';
            return { file, base64: btoa(body) };
          },
          previewHtml: async (value) => {
            window.preview = value;
            return { url: '/preview/document?id=' + 'd'.repeat(48) };
          },
          previewFile: async () => ({ url: '/preview/document?id=' + 'd'.repeat(48) }),
        };
        createRoot(document.getElementById('plugins')).render(<PluginPanel />);
        window.filesRoot = createRoot(document.getElementById('files'));
        window.filesRoot.render(
          <PublishedFiles sessionId="00000000-0000-4000-8000-000000000000" files={window.published} />,
        );
      `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "officecli.js",
    loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const javascript = bundle.outputFiles.find((file) =>
    file.path.endsWith(".js"),
  )?.text;
  const css = bundle.outputFiles.find((file) =>
    file.path.endsWith(".css"),
  )?.text;
  if (!javascript) throw new Error("missing officecli bundle");

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1180, height: 900 },
    });
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setContent('<div id="plugins"></div><div id="files"></div>');
    if (css) await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: javascript });

    const calls = () =>
      page.evaluate(() => Reflect.get(window, "calls")) as Promise<{
        list: number;
        check: number;
        configure: number;
        inputs: readonly unknown[];
      }>;

    // OfficeCLI card: explicit editor with executable + timeout, still disabled.
    const office = page.getByRole("article", {
      name: "插件 OfficeCLI · Office documents",
    });
    await expect.poll(() => office.isVisible()).toBe(true);
    expect(await calls()).toMatchObject({ list: 1, check: 0, configure: 0 });
    await office.getByText("已禁用", { exact: true }).waitFor();
    await office.getByText(/不自动安装、不下载、不升级/).waitFor();
    await office.getByText(/不会修改模型或 provider/).waitFor();
    await office.getByLabel("OfficeCLI 可执行路径").fill("/opt/officecli");
    await office.getByLabel("单次执行超时（秒）").fill("90");
    await office.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect.poll(async () => (await calls()).configure).toBe(1);
    expect((await calls()).inputs[0]).toEqual({
      pluginId: "officecli",
      config: { executablePath: "/opt/officecli", timeoutMs: 90000 },
    });
    await page.getByText(/OfficeCLI 插件配置已保存/).waitFor();
    // Saving is not a dependency check.
    expect((await calls()).check).toBe(0);

    // A non-integer millisecond value round-trips: 1.501 s == 1501 ms.
    await office.getByLabel("单次执行超时（秒）").fill("1.501");
    await office.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect.poll(async () => (await calls()).configure).toBe(2);
    expect(await page.evaluate(() => window.records[1]?.config.timeoutMs)).toBe(
      1501,
    );

    // Excessive precision is rejected locally; no extra host call happens.
    await office.getByLabel("单次执行超时（秒）").fill("1.5001");
    await office.getByRole("button", { name: "保存配置", exact: true }).click();
    await office.getByText(/超时需为秒数，最多 3 位小数/).waitFor();
    expect((await calls()).configure).toBe(2);

    // Enabling is explicit; health stays untouched until its own button.
    await office.getByRole("button", { name: "启用插件", exact: true }).click();
    await expect.poll(async () => (await calls()).configure).toBe(3);
    expect((await calls()).inputs[2]).toEqual({
      pluginId: "officecli",
      enabled: true,
    });
    await office.getByText("已配置 · 未检查", { exact: true }).waitFor();
    await page.getByText(/不会自动安装 OfficeCLI/).waitFor();
    expect((await calls()).check).toBe(0);
    await office
      .getByRole("button", { name: "检查依赖健康", exact: true })
      .click();
    await expect.poll(async () => (await calls()).check).toBe(1);
    await office.getByText(/依赖不可用/).waitFor();
    await office.getByText(/不代表文档转换或 HTML 渲染可用/).waitFor();

    // Browser and unknown plugins survive the change untouched.
    const browserPanel = page.getByRole("article", {
      name: "插件 Browser · agent-browser",
    });
    await browserPanel.getByLabel("agent-browser 可执行路径").waitFor();
    await browserPanel
      .locator(".plugin-domains code", { hasText: "example.com" })
      .waitFor();
    const unknown = page.getByRole("article", { name: "插件 Vendor plugin" });
    await unknown.getByText("vendor-plugin", { exact: true }).waitFor();
    await unknown.getByText(/不提供该插件的可视化配置编辑器/).waitFor();
    // Unknown plugins keep rendering but never receive a generic config form.
    expect(
      await unknown
        .getByRole("button", { name: "保存配置", exact: true })
        .count(),
    ).toBe(0);
    expect(await unknown.locator("input, textarea").count()).toBe(0);

    // Focused: no native select/checkbox controls were introduced.
    expect(await page.locator("select, input[type=checkbox]").count()).toBe(0);

    // HTML attachment: one click loads the snapshot and opens the sandboxed dialog.
    const card = page.getByRole("article", {
      name: "附件 page.html",
      exact: true,
    });
    // Delay the very first read so the in-flight state is observable.
    const startState = await page.evaluate(async () => {
      const original = window.forge.getPublishedFile;
      window.originalGetPublishedFile = original;
      window.forge.getPublishedFile = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return original(...args);
      };
      const actions = () =>
        Array.from(document.querySelectorAll(".published-file-actions button"))
          .filter(
            (button) =>
              button.closest("article")?.getAttribute("aria-label") ===
              "附件 page.html",
          )
          .map((button) => ({
            label: button.textContent?.trim() ?? "",
            disabled: (button as HTMLButtonElement).disabled,
          }));
      const preview = Array.from(
        document.querySelectorAll(".published-file-actions button"),
      ).find(
        (button) =>
          button.closest("article")?.getAttribute("aria-label") ===
            "附件 page.html" && button.textContent?.trim() === "HTML 预览",
      );
      if (!(preview instanceof HTMLElement))
        throw new Error("missing preview button");
      preview.click();
      // React commits the busy state after the delegated click handler returns.
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(undefined)),
      );
      const inFlight = actions();
      await new Promise((resolve) => setTimeout(resolve, 900));
      return { inFlight, settled: actions() };
    });
    expect(startState.inFlight).toEqual([
      { label: "正在准备…", disabled: true },
      { label: "查看源码", disabled: true },
      { label: "下载", disabled: true },
    ]);
    expect(startState.settled).toEqual([
      { label: "HTML 预览", disabled: false },
      { label: "查看源码", disabled: false },
      { label: "下载", disabled: false },
    ]);
    const dialog = page.getByRole("dialog");
    await expect.poll(() => dialog.count()).toBe(1);
    await dialog.getByText("HTML 预览 · page.html").waitFor();
    await page.evaluate(() => {
      window.forge.getPublishedFile = window.originalGetPublishedFile;
    });
    const frame = page.locator('iframe[title="HTML 预览"]');
    await expect.poll(() => frame.count()).toBe(1);
    expect(await frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(await frame.getAttribute("srcdoc")).toBeNull();
    // The raw source is never rendered as a second, stacked modal.
    expect(await page.getByRole("dialog").count()).toBe(1);
    expect(await dialog.locator("pre").count()).toBe(0);
    // The framed document comes from the host, not an injected string.
    expect(await page.evaluate(() => window.preview)).toContain(
      "Delivered preview",
    );

    // Source is a separate action after the preview dialog closes.
    await page.getByRole("button", { name: "关闭 HTML 预览" }).click();
    await expect.poll(() => page.locator("dialog").count()).toBe(0);

    // The layout contract: no horizontal overflow at 390 px, in both themes,
    // and the new number input is a themed control (no native select/checkbox).
    for (const width of [1180, 390]) {
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((value: string) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${width}/${theme} horizontal overflow`,
        ).toBe(true);
        const box = await office
          .locator("#plugin-officecli-timeout")
          .boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(40);
        expect(
          await office.locator("input[type=number]").getAttribute("step"),
        ).toBe("0.001");
      }
    }
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });

    await card.getByRole("button", { name: "查看源码", exact: true }).click();
    await expect
      .poll(() => page.locator(".published-file-text").innerText())
      .toContain("<h1>Delivered preview</h1>");
    expect(await page.locator("dialog script").count()).toBe(0);
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
    await page.getByRole("button", { name: "关闭面板" }).click();

    // A document above the 8 MiB budget is download-only with clear wording.
    const huge = page.getByRole("article", {
      name: "附件 huge.html",
      exact: true,
    });
    await huge.getByText(/超过 8 MiB 预览上限/).waitFor();
    expect(
      await huge
        .getByRole("button", { name: "HTML 预览", exact: true })
        .count(),
    ).toBe(0);
    expect(
      await huge.getByRole("button", { name: "查看源码", exact: true }).count(),
    ).toBe(0);
    await huge.getByRole("button", { name: "下载", exact: true }).click();
    await huge.getByText(/附件内容不完整/).waitFor();

    // Unmounting during an in-flight preview must not throw or reopen a dialog.
    await page.evaluate(() => {
      const original = window.forge.getPublishedFile;
      window.forge.getPublishedFile = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return original(...args);
      };
      const buttons = Array.from(
        document.querySelectorAll(".published-file-actions button"),
      );
      const preview = buttons.find(
        (button) => button.textContent?.trim() === "HTML 预览",
      );
      if (preview instanceof HTMLElement) preview.click();
      window.filesRoot.unmount();
    });
    await page.waitForTimeout(700);
    expect(await page.locator("dialog").count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
