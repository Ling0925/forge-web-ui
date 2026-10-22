# 本仓库的代理工作约定

- 子代理固定使用 `cn:deepseek-v4.1-flash`，除非用户明确指定其他模型；失败不自动切换模型或重放任务。

## 范围

- 本仓库是独立的 Forge Web UI 仓库，只负责 `src/renderer` 的 React 界面、renderer 测试，以及 `scripts/dev.mjs` / `scripts/serve.mjs` 的薄启动装配。
- 不复制、不修改 Core 的 HTTP/WebSocket 服务、RPC、存储、provider、工具运行时实现；这些属于 `@forge/core`。
- 本轮是仓库与构建依赖拆分，不做 Rust、单实例架构、多工作区语义或 UI 设计重写。

## 依赖与导入

- `@forge/core` 使用相邻的 `file:../forge-core`；改完 Core 后先 `pnpm build`，再构建/运行本仓库。本仓库自带 `pnpm-workspace.yaml`，避免 pnpm 向上进入父仓库 workspace；Core 重建后如仍解析旧副本，执行 `pnpm install --no-frozen-lockfile`。
- renderer、测试、动态 import、`import type` 和内嵌 esbuild 字符串里，跨目录引用一律使用 `@forge/core/...` 子路径；不要恢复 `src/shared`、`src/core`、`src/web` 等相对源码引用，也不要用 Vite/TS alias 隐藏未解耦引用。
- 新增依赖必须写进本仓库 `package.json`，不要依赖父仓库或 Core 的 `node_modules` 传递依赖。
- 生产构建保持 `src/renderer/index.html` 的原 CSP；同源 `connect-src` 放宽由 Core 静态宿主完成。不要为了本地 HMR 修改生产 HTML 的 CSP。

## 常用命令

```sh
cd ../forge-core && pnpm build
cd ../forge-web-ui
pnpm install
pnpm build
pnpm dev -- --host 127.0.0.1 --port 5173 --workspace /absolute/path
pnpm serve -- --host 127.0.0.1 --port 5173 --workspace /absolute/path
```

- 只改文档时不需要重新构建 Core 或 UI。
- 本机更新默认走“改代码 → Core build → UI build → 重开服务”，不要默认执行桌面打包、Electron 安装、Android 构建或完整发布验收。

## 测试

- 优先跑与改动相关的聚焦测试；不要默认跑全量 UI 套件。
- 全量 `pnpm typecheck` / `pnpm lint` 尚未通过，不是默认前置门槛。本轮以构建、聚焦测试和真实浏览器烟测验证；后续发现失败时要对照基线区分既有问题与拆分回归，不得未经比较就一概声称“不是本轮导致”。
- 浏览器测试使用临时目录/临时状态，不读取真实 `FORGE_HOME`、密钥或外部 provider；可以模型未配置状态验证渲染与导航。
- 现有 Playwright 可用时不要重新安装浏览器；需要时用 `FORGE_BROWSER_EXECUTABLE` 指定本机浏览器。
- 真实浏览器烟测前先 `pnpm build`；没有构建产物时浏览器入口不能声称已验证。

## 修改与提交

- 保留用户已有修改（包括原库未提交的 `ModelPicker.tsx` / `settings-models.css`），不要移植、覆盖或回退。
- 每一轮有仓库改动时，只暂存本轮自己改的文件并做本地 commit；默认不 `git push`，不 `--amend` 他人提交。
