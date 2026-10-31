import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("model search requires selection and settings auto-save the request timeout", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
      import {createRoot} from 'react-dom/client';
      import {useState} from 'react';
      import {Settings} from './src/renderer/components/workbench/Settings';
      import {ModelPicker} from './src/renderer/components/workbench/ModelPicker';
      import {TestProvider, useWorkbench} from './src/renderer/state/workbench-context';
      window.modelReads = 0;
      window.forge = {listModels: async () => { window.modelReads++; return ['provider/alpha','provider/beta']; }};
      function Harness() {
        const [model,setModel] = useState('provider/alpha');
        const [models,setModels] = useState([]);
        const {openSettings, saves} = useWorkbench();
        return <>
          <ModelPicker value={model} models={models}
            onSelect={setModel} onRefresh={()=>{void window.forge.listModels().then(setModels)}} loading={false} error="" />
          <output id="selected">{model}</output><output id="saves">{saves}</output>
          <button onClick={()=>openSettings(true)}>打开设置</button>
          <Settings />
        </>;
      }
      createRoot(document.getElementById('root')).render(<TestProvider><Harness/></TestProvider>);
    `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    loader: { ".css": "empty" },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "settings-state-fixture",
        setup(api) {
          api.onLoad({ filter: /workbench-context\.tsx$/ }, () => ({
            loader: "tsx",
            contents: `
        import {createContext,useContext,useState} from 'react';
        import {defaultPublicSettings} from '@forge/core/shared/schemas';
        const Context=createContext(null);
        export const useWorkbench=()=>useContext(Context);
        export function TestProvider({children}) {
          const [settings,setSettings]=useState({...defaultPublicSettings,baseUrl:'http://localhost:8080/v1',model:'provider/alpha'});
          const [isSettingsOpen,openSettings]=useState(false);
          const [saves,setSaves]=useState(0);
          const updateSettings=async ({settings:patch})=>{
            setSaves(n=>n+1);
            await new Promise(resolve=>setTimeout(resolve,150));
            const next={...settings,...patch};
            setSettings(next);
            return {ok:true,settings:next};
          };
          return <Context.Provider value={{state:{settings,isSettingsOpen},openSettings,updateSettings,saves}}>{children}</Context.Provider>;
        }
      `,
            resolveDir: resolve("."),
          }));
        },
      },
    ],
  });
  const script = bundle.outputFiles[0]?.text;
  if (!script) throw new Error("Missing test bundle");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.FORGE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.FORGE_BROWSER_EXECUTABLE }
      : {}),
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: script });
    const trigger = page.locator(".composer-model-summary");
    const openCatalog = async () => {
      await trigger.click();
      expect(await page.locator(".model-catalog").count()).toBe(0);
      await page.getByRole("button", { name: /^选择模型：/ }).click();
    };
    await openCatalog();
    const search = page.getByLabel("搜索模型或输入精确 ID");
    await expect
      .poll(() => page.locator(".model-catalog-option[aria-pressed]").count())
      .toBe(2);
    expect(await search.inputValue()).toBe("");
    await search.fill("beta");
    expect(
      await page.locator(".model-catalog-option[aria-pressed]").count(),
    ).toBe(1);
    await search.fill("");
    expect(
      await page.locator(".model-catalog-option[aria-pressed]").count(),
    ).toBe(2);
    await search.fill("beta");
    expect(await page.locator("#selected").innerText()).toBe("provider/alpha");
    expect(
      await page.locator(".model-catalog-option[aria-pressed]").count(),
    ).toBe(1);
    await search.press("ArrowDown");
    await page.keyboard.press("Enter");
    expect(await page.locator("#selected").innerText()).toBe("provider/beta");
    expect(
      await trigger.evaluate((node) => node === document.activeElement),
    ).toBe(true);
    await openCatalog();
    expect(await search.inputValue()).toBe("");
    expect(await page.evaluate(() => Reflect.get(window, "modelReads"))).toBe(
      1,
    );
    await page.getByRole("button", { name: "刷新模型目录" }).click();
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, "modelReads")))
      .toBe(2);
    expect(
      await page.locator(".model-catalog-option[aria-pressed]").count(),
    ).toBe(2);
    await search.fill("custom/exact-model");
    await page.getByRole("button", { name: /使用此模型 ID/ }).click();
    expect(await page.locator("#selected").innerText()).toBe(
      "custom/exact-model",
    );
    await openCatalog();
    await search.press("Escape");
    expect(await page.locator("details[open]").count()).toBe(1);
    expect(await page.locator(".model-catalog").count()).toBe(0);
    expect(
      await page
        .getByRole("button", { name: /^选择模型：/ })
        .evaluate((node) => node === document.activeElement),
    ).toBe(true);
    await page.keyboard.press("Escape");
    expect(await page.locator("details[open]").count()).toBe(0);
    await page.getByRole("button", { name: "打开设置" }).click();
    await page.getByRole("button", { name: "通用", exact: true }).click();
    expect(await page.getByLabel("最大轮次", { exact: true }).count()).toBe(0);
    expect(await page.getByLabel("工具调用预算", { exact: true }).count()).toBe(
      0,
    );
    expect(await page.getByText(/不限制任务总时长/).count()).toBe(1);
    // A custom timeout saves on Enter; there is no draft to discard.
    const timeout = page.getByRole("group", { name: "空闲超时" });
    await timeout.getByRole("button", { name: "自定义", exact: true }).click();
    const seconds = page.getByLabel("自定义空闲超时（秒）", { exact: true });
    await seconds.fill("13");
    await seconds.press("Enter");
    await expect.poll(() => page.locator("#saves").innerText()).toBe("1");
    await page.keyboard.press("Escape");
    await expect
      .poll(() => page.locator(".settings-page").isVisible())
      .toBe(false);
    await page.getByRole("button", { name: "打开设置" }).click();
    expect(await seconds.inputValue()).toBe("13");
    await timeout.getByRole("button", { name: "1 分钟", exact: true }).click();
    await expect.poll(() => page.locator("#saves").innerText()).toBe("2");
    await page.getByRole("button", { name: "返回工作台" }).click();
    await page.getByRole("button", { name: "打开设置" }).click();
    expect(
      await timeout
        .getByRole("button", { name: "1 分钟", exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(await seconds.count()).toBe(0);
    await page.getByRole("button", { name: "模型服务", exact: true }).click();
    await page.getByRole("button", { name: "添加来源" }).click();
    expect(await page.getByLabel("来源名称", { exact: true }).count()).toBe(1);
  } finally {
    await browser.close();
  }
}, 20000);
