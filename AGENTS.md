# 本仓库的代理工作约定

- 子代理固定使用 `cn:deepseek-v4.1-flash`，除非用户明确指定其他模型；失败不自动切换模型或重放任务。

## 范围

- 本仓库是独立的 Forge Web UI 仓库，只负责 `src/renderer` 的 React 界面、renderer 测试，以及 `scripts/dev.mjs` / `scripts/serve.mjs` 的薄启动装配。
- 不复制、不修改 Core 的 HTTP/WebSocket 服务、RPC、存储、provider、工具运行时实现；这些属于 `@forge/core`。
- 视觉约定见 `docs/WEB_UI_LAYOUT_SPEC.md`，启动与进程边界见 `docs/WEB_DEV.md`；不把一次性拆分任务或旧验收结果写成永久限制。

## 依赖与导入

- `@forge/core` 声明为相邻的 `file:../forge-core`。独立克隆按 README 安装；Core 重建后如仍解析旧副本，用 `pnpm install --no-frozen-lockfile` 刷新并审阅锁文件。主仓 `setup` / `build:web` 会链接本地 Core，不用该命令刷新副本。本仓 `pnpm-workspace.yaml` 避免向上进入其他 workspace。
- renderer、测试、动态 import、`import type` 和内嵌 esbuild 字符串里，跨目录引用一律使用 `@forge/core/...` 子路径；不要恢复 `src/shared`、`src/core`、`src/web` 等相对源码引用，也不要用 Vite/TS alias 隐藏未解耦引用。
- 新增依赖必须写进本仓库 `package.json`，不要依赖父仓库或 Core 的 `node_modules` 传递依赖。
- 生产构建保持 `src/renderer/index.html` 的原 CSP；同源 `connect-src` 放宽由 Core 静态宿主完成。不要为了本地 HMR 修改生产 HTML 的 CSP。

## 常用命令

```sh
cd ../forge-core && pnpm build
cd ../forge-web-ui
pnpm install
pnpm build
# 独立终端启动 Core（已有 Core 时不要重复启动或重启）
node ../forge-core/dist/web/serve.js --host 127.0.0.1 --port 5175 --workspace /absolute/path --multi-workspace
# 开发 / 生产二选一，均不持有运行时
pnpm dev -- --host 127.0.0.1 --port 5173 --core-url http://127.0.0.1:5175
pnpm serve -- --host 127.0.0.1 --port 5173 --core-url http://127.0.0.1:5175
```

- 只改文档时不需要重新构建 Core 或 UI。
- 本机持续开发用 Vite：修改本仓 `src/renderer` 由 HMR 生效，不用编译 UI 或重启服务；修改 `scripts/dev.mjs` 只重启 Web，不重启独立 Core。不要恢复内嵌 harness 的单进程开发入口。
- 仅 Core 代码变动才重新构建 Core/刷新包依赖；生产静态 Web 仍需 UI build。不要默认执行桌面打包、Electron 安装、Android 构建或完整发布验收。

## 测试

- 优先跑与改动相关的聚焦测试；不要默认跑全量 UI 套件。
- 代码改动按风险选择构建、聚焦测试和真实浏览器检查；文档修改只检查内容和引用。检查失败时用当前证据区分既有问题与回归，不沿用旧轮次的失败数或通过结论。
- 浏览器测试使用临时目录/临时状态，不读取真实 `FORGE_HOME`、密钥或外部 provider；可以模型未配置状态验证渲染与导航。
- 现有 Playwright 可用时不要重新安装浏览器；需要时用 `FORGE_BROWSER_EXECUTABLE` 指定本机浏览器。
- 真实浏览器烟测前先 `pnpm build`；没有构建产物时浏览器入口不能声称已验证。

## 修改与提交

- 保留用户和并发任务已有修改；不从旧单体归档自动移植源码或恢复第二套实现。
- 每一轮有仓库改动时，只暂存本轮自己改的文件并做本地 commit；默认不 `git push`，不 `--amend` 他人提交。
