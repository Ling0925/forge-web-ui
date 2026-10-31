import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { chooseOption, selectValue } from "./select-helpers";

it("settings page auto-saves simple preferences, rolls back failures, confirms risky choices and fits desktop/mobile themes", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
    import {createRoot} from 'react-dom/client';
    import {Settings} from './src/renderer/components/workbench/Settings';
    import {TestProvider} from './src/renderer/state/workbench-context';
    import './src/renderer/styles/global.css';
    window.calls=[]; window.reads=0; window.fail=false;
    window.forge={listModels:async()=>{window.reads++;return ['fixture/model']},listMcpServers:async()=>[]};
    createRoot(document.getElementById('root')).render(<TestProvider><Settings/></TestProvider>);
  `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "settings.js",
    loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "settings-test-host",
        setup(api) {
          api.onLoad({ filter: /workbench-context\.tsx$/ }, () => ({
            loader: "tsx",
            resolveDir: resolve("."),
            contents: `
      import {createContext,useContext,useState} from 'react';
      import {defaultPublicSettings} from '@forge/core/shared/schemas';
      const C=createContext(null); export const useWorkbench=()=>useContext(C);
      let current={...defaultPublicSettings,hasApiKey:true,browserAllowedOrigins:['http://localhost:3000'],browserExecutablePath:'/usr/bin/chromium'};
      export function TestProvider({children}) {
        const [settings,setSettings]=useState(current);
        const [isSettingsOpen,openSettings]=useState(true);
        const updateSettings=async input=>{window.calls.push(input); await new Promise(r=>setTimeout(r,50));if(window.fail)return {ok:false,error:'连接已断开'};
          const next={...current,...input.settings,hasApiKey:input.apiKey===undefined?current.hasApiKey:!!input.apiKey};
          current={...next,isConfigured:!!next.baseUrl&&!!next.model};
          setSettings(current);
          return {ok:true,settings:current}};
        return <C.Provider value={{state:{settings,isSettingsOpen},updateSettings,openSettings}}><button onClick={()=>openSettings(true)}>重开设置</button>{children}</C.Provider>
      }`,
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({
      content: bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text,
    });
    await page.addScriptTag({
      content: bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text,
    });
    const nav = (name: string) =>
      page
        .getByRole("navigation", { name: "设置分类" })
        .getByRole("button", { name, exact: true });
    const calls = () =>
      page.evaluate(() => Reflect.get(window, "calls")) as Promise<
        { settings?: Record<string, unknown>; apiKey?: unknown }[]
      >;
    const setFail = (value: boolean) =>
      page.evaluate((v) => Reflect.set(window, "fail", v), value);
    const row = (id: string) => page.locator(`[data-setting="${id}"]`);

    // Grouped navigation; no global save bar.
    for (const name of [
      "通用",
      "模型服务",
      "推理与上下文",
      "智能体",
      "MCP 服务器",
      "插件",
      "语言服务",
      "手机连接",
    ])
      expect(await nav(name).count()).toBe(1);
    expect(await nav("浏览器").count()).toBe(0);
    expect(
      await page.getByRole("button", { name: "保存设置", exact: true }).count(),
    ).toBe(0);

    // Browser access is configured only through the browser plugin.
    await page.getByLabel("搜索设置").fill("浏览器");
    const results = page.getByRole("list", { name: "搜索结果" });
    await results.getByRole("button", { name: /^插件/ }).waitFor();
    expect(await page.getByRole("region", { name: "浏览器配置" }).count()).toBe(
      0,
    );
    expect(await page.locator("#setting-origins").count()).toBe(0);
    expect(await page.locator("#setting-browserAllowedOrigins").count()).toBe(
      0,
    );
    expect(await page.locator("#setting-browserExecutablePath").count()).toBe(
      0,
    );
    await page.getByLabel("搜索设置").fill("");

    // Theme saves on click and sends only that key.
    await nav("通用").click();
    await page.getByRole("button", { name: "深色", exact: true }).click();
    await row("theme").getByText("已保存", { exact: true }).waitFor();
    expect((await calls())[0]).toEqual({ settings: { theme: "dark" } });
    expect(
      await page
        .getByRole("button", { name: "深色", exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    // Unrestricted permission asks first; cancelling sends nothing.
    const permission = page.getByRole("group", { name: "默认权限" });
    await permission.getByRole("button", { name: /无限制模式/ }).click();
    const confirm = page.getByRole("dialog", {
      name: "将默认权限设为无限制？",
    });
    await confirm.waitFor();
    await confirm.getByRole("button", { name: "取消", exact: true }).click();
    await confirm.waitFor({ state: "hidden" });
    expect(await calls()).toHaveLength(1);
    await permission.getByRole("button", { name: /无限制模式/ }).click();
    await confirm
      .getByRole("button", { name: "设为无限制", exact: true })
      .click();
    await expect
      .poll(async () => (await calls()).at(-1))
      .toEqual({ settings: { defaultPermission: "unrestricted" } });
    // Safer choices apply without a prompt.
    await permission.getByRole("button", { name: /只读模式/ }).click();
    await expect
      .poll(async () => (await calls()).at(-1))
      .toEqual({ settings: { defaultPermission: "readonly" } });
    expect(await page.getByRole("dialog").count()).toBe(0);

    // Timeout presets and a custom value in seconds.
    await page
      .getByRole("group", { name: "空闲超时" })
      .getByRole("button", { name: "2 分钟", exact: true })
      .click();
    await expect
      .poll(async () => (await calls()).at(-1))
      .toEqual({ settings: { requestTimeoutMs: 120000 } });
    await page
      .getByRole("group", { name: "空闲超时" })
      .getByRole("button", { name: "自定义", exact: true })
      .click();
    const seconds = page.getByLabel("自定义空闲超时（秒）");
    await seconds.fill("90");
    await seconds.press("Enter");
    await expect
      .poll(async () => (await calls()).at(-1))
      .toEqual({ settings: { requestTimeoutMs: 90000 } });

    // A failed save shows the error and restores the last saved value.
    await nav("推理与上下文").click();
    const effort = page.getByLabel("默认思考等级", { exact: true });
    const before = await selectValue(effort);
    await setFail(true);
    await chooseOption(effort, "high");
    await row("reasoningEffort")
      .getByRole("alert")
      .filter({ hasText: "保存失败，已恢复原值" })
      .waitFor();
    expect(await selectValue(effort)).toBe(before);
    await setFail(false);
    await chooseOption(effort, "high");
    await row("reasoningEffort").getByText("已保存", { exact: true }).waitFor();
    expect((await calls()).at(-1)).toEqual({
      settings: { reasoningEffort: "high" },
    });
    expect(await selectValue(effort)).toBe("high");

    // Compression budget: preset, then a custom token count.
    const budget = page.getByLabel("压缩预算", { exact: true });
    await chooseOption(budget, "64000");
    await expect
      .poll(async () => (await calls()).at(-1))
      .toEqual({ settings: { contextBudgetTokens: 64000 } });
    await chooseOption(budget, "custom");
    const tokens = page.getByLabel("自定义压缩预算（tokens）");
    await tokens.fill("32000");
    await tokens.press("Enter");
    await expect
      .poll(async () => (await calls()).at(-1))
      .toEqual({ settings: { contextBudgetTokens: 32000 } });
    // Per-model windows live only in each model's parameters now.
    expect(
      await page.getByRole("button", { name: "添加模型窗口" }).count(),
    ).toBe(0);

    // Language servers stay an explicit editor: a failed save keeps the draft.
    await nav("语言服务").click();
    await page.getByRole("button", { name: "添加语言服务" }).click();
    await page.getByLabel("服务 ID", { exact: true }).fill("ts");
    await page.getByLabel("启动命令").fill("typescript-language-server");
    await page.getByLabel("启动参数").fill('["--stdio"]');
    await page.getByLabel("文件扩展名（逗号分隔）").fill(".ts, .tsx");
    expect(await page.getByLabel("有未保存的修改").count()).toBe(1);
    const callsBeforeLsp = (await calls()).length;
    await setFail(true);
    await page.getByRole("button", { name: "保存语言服务" }).click();
    await page.getByRole("alert").filter({ hasText: "连接已断开" }).waitFor();
    expect(await page.getByLabel("服务 ID", { exact: true }).inputValue()).toBe(
      "ts",
    );
    await setFail(false);
    await page.getByRole("button", { name: "保存语言服务" }).click();
    await page.getByText("已保存", { exact: true }).waitFor();
    const all = await calls();
    expect(all).toHaveLength(callsBeforeLsp + 2);
    const last = all[all.length - 1] ?? {};
    expect(last.apiKey).toBeUndefined();
    expect(last.settings).toMatchObject({
      lspServers: [
        { id: "ts", args: ["--stdio"], extensions: [".ts", ".tsx"] },
      ],
    });
    expect(Object.keys(last.settings ?? {})).toEqual(["lspServers"]);
    expect(await page.getByLabel("有未保存的修改").count()).toBe(0);
    // No save ever carries the removed global browser fields.
    expect(
      all.every(
        (input) =>
          !("browserAllowedOrigins" in (input.settings ?? {})) &&
          !("browserExecutablePath" in (input.settings ?? {})),
      ),
    ).toBe(true);

    // Search matches individual settings and jumps to them.
    await page.getByLabel("搜索设置").fill("超时");
    await results.getByRole("button", { name: /请求空闲超时/ }).click();
    await expect
      .poll(() =>
        row("requestTimeoutMs").evaluate((el) =>
          el.classList.contains("is-highlighted"),
        ),
      )
      .toBe(true);
    expect(await page.getByLabel("搜索设置").inputValue()).toBe("");
    await page.getByLabel("搜索设置").fill("no-match");
    expect(
      await page
        .getByText("没有找到相关设置，试试“主题”“上下文窗口”或“权限”。")
        .count(),
    ).toBe(1);
    await page.getByLabel("搜索设置").fill("");

    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        for (const name of [
          "通用",
          "模型服务",
          "推理与上下文",
          "语言服务",
          "MCP 服务器",
        ]) {
          await nav(name).click();
          const rect = await page.locator(".settings-page").boundingBox();
          expect(rect!.width).toBeLessThanOrEqual(width);
          expect(
            await page
              .locator(".settings-page")
              .evaluate((el) => el.scrollWidth <= el.clientWidth),
          ).toBe(true);
          expect(
            await page
              .locator(".settings-page-scroll")
              .evaluate(
                (el) => el.clientHeight > 0 && el.scrollWidth <= el.clientWidth,
              ),
          ).toBe(true);
        }
      }
    await page.getByRole("button", { name: "返回工作台" }).click();
    expect(await page.locator(".settings-page").isVisible()).toBe(false);
    await page.getByRole("button", { name: "重开设置" }).click();
    await nav("模型服务").click();
    await page.getByRole("button", { name: "添加来源" }).click();
    expect(
      await page
        .getByRole("textbox", { name: "凭据密钥 默认", exact: true })
        .inputValue(),
    ).toBe("");
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 30000);
