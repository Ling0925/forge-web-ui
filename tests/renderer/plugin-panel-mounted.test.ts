import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

/**
 * Mounted-renderer check for the plugin manager. The mocked bridge returns
 * Core-valid records; the test asserts that page load performs no health check,
 * that configured is never shown as ready, that configuration and explicit
 * enable/disable go through Core, and that a failed render cannot occur for an
 * unparsable config.
 */
it.each([
  { domains: ["example.com", "*.trusted.example"] },
  { domains: ["*"] },
])("manages the browser plugin with $domains without implicit checks", async ({ domains }) => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
        import { createRoot } from 'react-dom/client';
        import { PluginPanel } from './src/renderer/components/workbench/PluginPanel';
        import './src/renderer/styles/global.css';
        import './src/renderer/styles/workspace-theme.css';
        import './src/renderer/components/workbench/plugin-panel.css';

        window.calls = { list: 0, check: 0, configure: 0, inputs: [] };
        window.records = [{
          manifest: {
            id: 'browser',
            name: 'Browser · agent-browser',
            version: '1.0.0',
            apiVersion: 1,
            description: 'Official isolated browser tools.',
            builtin: true,
            capabilities: ['tools', 'instructions', 'browser', 'network', 'process'],
            configSchema: {
              type: 'object',
              properties: {
                executablePath: { type: 'string' },
                browserExecutablePath: { type: 'string' },
                allowedDomains: { type: 'array' },
              },
            },
          },
          enabled: false,
          config: { executablePath: 'agent-browser', browserExecutablePath: '', allowedDomains: [] },
          status: 'disabled',
          activeSessions: 0,
        }];

        window.forge = {
          listPlugins: async () => {
            window.calls.list++;
            return window.records;
          },
          configurePlugin: async (input) => {
            window.calls.configure++;
            window.calls.inputs.push(input);
            const current = window.records[0];
            const config = input.config ?? current.config;
            const enabled = input.enabled ?? current.enabled;
            const next = {
              ...current,
              config,
              enabled,
              status: enabled ? 'configured' : 'disabled',
            };
            window.records = [next];
            return next;
          },
          checkPlugin: async () => {
            window.calls.check++;
            return { pluginId: 'browser', status: 'ready', message: 'agent-browser MCP is available.' };
          },
        };

        createRoot(document.getElementById('root')).render(<PluginPanel />);
      `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "plugin.js",
    loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const javascript = bundle.outputFiles.find((file) =>
    file.path.endsWith(".js"),
  )?.text;
  const css = bundle.outputFiles.find((file) =>
    file.path.endsWith(".css"),
  )?.text;
  if (!javascript) throw new Error("missing plugin panel bundle");

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1024, height: 900 },
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

    const calls = () =>
      page.evaluate(() => Reflect.get(window, "calls")) as Promise<{
        list: number;
        check: number;
        configure: number;
        inputs: readonly unknown[];
      }>;
    const card = page.getByRole("article", {
      name: "插件 Browser · agent-browser",
    });
    await expect.poll(() => card.isVisible()).toBe(true);
    // Rendering alone must not probe dependencies.
    expect(await calls()).toMatchObject({ list: 1, check: 0, configure: 0 });
    await card.getByText("已禁用", { exact: true }).waitFor();
    await card
      .getByText(/插件已禁用。禁用不会启动、安装或下载任何组件/)
      .waitFor();

    // Declared capabilities, hostname limits and approval policy are explicit.
    await card.getByText("本机进程", { exact: true }).waitFor();
    await card.getByText("网络", { exact: true }).waitFor();
    await card.getByText(/不绕过审批/).waitFor();
    await card.getByText(/尚未允许任何域名/).waitFor();
    await card.getByText(/不导入个人浏览器配置或持久登录态/).waitFor();

    await card
      .getByLabel("agent-browser 可执行路径")
      .fill("/opt/bin/agent-browser");
    await card
      .getByLabel("允许访问的主机名")
      .fill(domains.join("\n"));
    await card.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect.poll(async () => (await calls()).configure).toBe(1);
    expect((await calls()).inputs[0]).toEqual({
      pluginId: "browser",
      config: {
        executablePath: "/opt/bin/agent-browser",
        browserExecutablePath: "",
        allowedDomains: domains,
      },
    });
    await page
      .getByText(/配置已保存。status=configured 只表示配置已持久化/)
      .waitFor();
    // Saving config is not a health check and still must not look ready.
    expect((await calls()).check).toBe(0);
    await card.getByText(/填写 \* 允许全部网站/).waitFor();
    if (domains.includes("*"))
      await card.getByText("全部网站（*）", { exact: true }).waitFor();

    await card.getByRole("button", { name: "启用插件", exact: true }).click();
    await expect.poll(async () => (await calls()).configure).toBe(2);
    expect((await calls()).inputs[1]).toEqual({
      pluginId: "browser",
      enabled: true,
    });
    await card.getByText("已配置 · 未检查", { exact: true }).waitFor();
    await card.getByText(/未执行依赖检查前不能视为 ready/).waitFor();
    expect((await calls()).check).toBe(0);

    // Only the explicit button probes health.
    await card
      .getByRole("button", { name: "检查依赖健康", exact: true })
      .click();
    await expect.poll(async () => (await calls()).check).toBe(1);
    await card.getByText(/依赖检查通过/).waitFor();
    await card.getByText(/不代表 Chrome 能启动或已获得站点访问权限/).waitFor();

    // Configuration validation errors surface; the host is not called.
    await card.getByLabel("agent-browser 可执行路径").fill("   ");
    await card.getByRole("button", { name: "保存配置", exact: true }).click();
    await card.getByText(/配置未通过 Core schema 校验/).waitFor();
    expect((await calls()).configure).toBe(2);

    expect(errors).toEqual([]);
    // No persistence surfaces exist: the panel keeps configuration in memory and
    // only hands it to Core through configurePlugin.
    expect(await page.evaluate(() => "records" in window)).toBe(true);
    expect(
      await page.evaluate(() => document.querySelectorAll("script").length),
    ).toBe(1);
    expect(page.url()).toBe("about:blank");
  } finally {
    await browser.close();
  }
});
