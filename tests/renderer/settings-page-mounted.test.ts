import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { selectValue } from "./select-helpers";

it("settings page saves real fields, retains failed drafts and fits desktop/mobile themes", async () => {
  const bundle = await build({ stdin: { resolveDir: resolve("."), loader: "tsx", contents: `
    import {createRoot} from 'react-dom/client';
    import {Settings} from './src/renderer/components/workbench/Settings';
    import {TestProvider} from './src/renderer/state/workbench-context';
    import './src/renderer/styles/global.css';
    window.calls=[]; window.reads=0; window.fail=false;
    window.forge={listModels:async()=>{window.reads++;return ['fixture/model']},listMcpServers:async()=>[]};
    createRoot(document.getElementById('root')).render(<TestProvider><Settings/></TestProvider>);
  ` }, bundle: true, write: false, format: "iife", jsx: "automatic", outfile: "settings.js", loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "settings-test-host", setup(api) {
      api.onLoad({ filter: /workbench-context\.tsx$/ }, () => ({ loader: "tsx", resolveDir: resolve("."), contents: `
      import {createContext,useContext,useState} from 'react';
      import {defaultPublicSettings} from '@forge/core/shared/schemas';
      const C=createContext(null); export const useWorkbench=()=>useContext(C);
      export function TestProvider({children}) {
        const [settings,setSettings]=useState({...defaultPublicSettings,hasApiKey:true,browserAllowedOrigins:['http://localhost:3000'],browserExecutablePath:'/usr/bin/chromium'});
        const [isSettingsOpen,openSettings]=useState(true);
        const updateSettings=async input=>{window.calls.push(input); await new Promise(r=>setTimeout(r,50));if(window.fail)return {ok:false,error:'保存失败，草稿已保留。请检查连接或稍后重试。'};
          let next;
          setSettings(old=>{next={...old,...input.settings,hasApiKey:input.apiKey===undefined?old.hasApiKey:!!input.apiKey};return {...next,isConfigured:!!next.baseUrl&&!!next.model}});
          return {ok:true,settings:next}};
        return <C.Provider value={{state:{settings,isSettingsOpen},updateSettings,openSettings}}><button onClick={()=>openSettings(true)}>重开设置</button>{children}</C.Provider>
      }` }));
    } }] });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({ content: bundle.outputFiles.find(f => f.path.endsWith('.css'))!.text });
    await page.addScriptTag({ content: bundle.outputFiles.find(f => f.path.endsWith('.js'))!.text });
    const nav = (name: string) => page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name, exact: true });
    const save = page.getByRole('button', { name: '保存设置', exact: true });
    // The legacy global browser section is gone: browser access is configured
    // only through the browser plugin, so there is no standalone category or field.
    expect(await nav('浏览器').count()).toBe(0);
    expect(await nav('插件').count()).toBe(1);
    await page.getByLabel('搜索设置').fill('浏览器');
    await page.getByText('找到 1 个相关分区').waitFor();
    expect(await page.getByRole('region', { name: '插件配置' }).count()).toBe(1);
    expect(await page.getByRole('region', { name: '浏览器配置' }).count()).toBe(0);
    expect(await page.locator('#setting-origins').count()).toBe(0);
    expect(await page.locator('#setting-browserAllowedOrigins').count()).toBe(0);
    expect(await page.locator('#setting-browserExecutablePath').count()).toBe(0);
    await page.getByLabel('搜索设置').fill('');
    // Appearance can be configured before any provider, and only edited keys are sent.
    await nav('外观').click();
    await page.getByRole('button', { name: '深色', exact: true }).click();
    await save.click();
    await page.getByText('设置已保存。执行配置用于新的运行；当前运行不会被中断。').waitFor();
    expect(await page.evaluate(() => Reflect.get(window, 'calls')[0])).toEqual({ settings: { theme: 'dark' } });
    await nav('模型连接').click();
    expect(await page.getByRole('button', { name: '从 /models 拉取' }).count()).toBe(0);
    expect(await page.evaluate(() => Reflect.get(window, 'reads'))).toBe(0);
    await page
      .getByRole('group', { name: '全局默认思考等级快捷选择' })
      .getByRole('button', { name: /medium/ })
      .click();
    expect(await selectValue(page.getByLabel('默认思考强度'))).toBe('medium');
    await page
      .getByRole('group', { name: '全局默认思考等级快捷选择' })
      .getByRole('button', { name: /^high/ })
      .click();
    expect(await selectValue(page.getByLabel('默认思考强度'))).toBe('high');
    await nav('执行与权限').click();
    await page
      .getByRole('group', { name: '权限策略选择' })
      .getByRole('button', { name: /无限制模式/ })
      .click();
    expect(await page.getByText(/无限制模式允许直接执行命令/).count()).toBe(1);
    await page
      .getByRole('group', { name: '权限策略选择' })
      .getByRole('button', { name: /只读模式/ })
      .click();
    expect(await selectValue(page.getByLabel('默认权限'))).toBe('readonly');
    await page
      .getByRole('group', { name: '空闲超时快捷档位' })
      .getByRole('button', { name: /2 分钟/ })
      .click();
    expect(await page.getByLabel('请求空闲超时（毫秒）').inputValue()).toBe('120000');
    await nav('上下文与记忆').click();
    await page
      .getByRole('group', { name: '压缩预算快捷档位' })
      .getByRole('button', { name: /64K/ })
      .click();
    expect(await page.getByLabel('上下文 token 上限').inputValue()).toBe('64000');
    await page.getByLabel('上下文 token 上限').fill('32000');
    await page.getByRole('button', { name: '添加模型窗口' }).click();
    await page.getByLabel('模型 ID', { exact: true }).fill('fixture/model');
    await page
      .getByRole('group', { name: '模型 1 常用窗口容量' })
      .getByRole('button', { name: '200K', exact: true })
      .click();
    expect(await page.getByLabel('窗口 tokens').inputValue()).toBe('200000');
    await page.getByLabel('窗口 tokens').fill('128000');
    await nav('语言服务').click();
    await page.getByRole('button', { name: '添加语言服务' }).click();
    await page.getByLabel('服务 ID', { exact: true }).fill('ts');
    await page.getByLabel('启动命令').fill('typescript-language-server');
    await page.getByLabel('参数（JSON 字符串数组）').fill('["--stdio"]');
    await page.getByLabel('文件扩展名（逗号分隔）').fill('.ts, .tsx');
    await page.evaluate(() => { Reflect.set(window, 'fail', true); });
    await save.click();
    await page.getByText('保存失败，草稿已保留。请检查连接或稍后重试。').waitFor();
    expect(await page.getByLabel('服务 ID', { exact: true }).inputValue()).toBe('ts');
    await page.evaluate(() => { Reflect.set(window, 'fail', false); });
    await save.click();
    await page.getByText('设置已保存。执行配置用于新的运行；当前运行不会被中断。').waitFor();
    const last = await page.evaluate(() => Reflect.get(window, 'calls').at(-1));
    expect(last.apiKey).toBeUndefined();
    expect(last.settings).toMatchObject({ contextBudgetTokens: 32000, modelContextWindows: { 'fixture/model': 128000 }, reasoningEffort: 'high', lspServers: [{ id: 'ts', args: ['--stdio'], extensions: ['.ts', '.tsx'] }] });
    expect(last.settings.theme).toBeUndefined();
    // Regular settings saves never carry the removed global browser fields.
    expect(last.settings).not.toHaveProperty('browserAllowedOrigins');
    expect(last.settings).not.toHaveProperty('browserExecutablePath');
    expect(
      await page.evaluate(() => (Reflect.get(window, 'calls') as { settings?: Record<string, unknown> }[])
        .every(input => !('browserAllowedOrigins' in (input.settings ?? {})) && !('browserExecutablePath' in (input.settings ?? {})))),
    ).toBe(true);
    await page.getByLabel('搜索设置').fill('token');
    expect(await page.getByLabel('上下文 token 上限').inputValue()).toBe('32000');
    await page.getByLabel('搜索设置').fill('no-match');
    expect(await page.getByText('没有找到相关设置，试试“模型”“token”或“权限”。').count()).toBe(1);
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const name of ['模型连接', '外观', '执行与权限', '上下文与记忆', '语言服务', 'MCP 扩展']) {
        await nav(name).click();
        const rect = await page.locator('.settings-page').boundingBox();
        expect(rect!.width).toBeLessThanOrEqual(width);
        expect(await page.locator('.settings-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await page.locator('.settings-page-scroll').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
    }
    await page.getByRole('button', { name: '返回工作台' }).click();
    expect(await page.locator('.settings-page').isVisible()).toBe(false);
    await page.getByRole('button', { name: '重开设置' }).click();
    await nav('模型连接').click();
    await page.getByRole('button', { name: '添加来源' }).click();
    expect(await page.getByRole('textbox', { name: '凭据密钥 默认', exact: true }).inputValue()).toBe('');
  } finally { await browser.close(); }
}, 30000);
