# @forge/web-ui

Forge 工作台的独立 Web UI 仓库：只包含 React renderer、renderer 测试，以及把已构建界面挂到 Core Web host 的薄启动装配。

## 边界

- **Core owns** 所有 HTTP/WebSocket 服务、RPC、会话存储、provider 和工具运行时实现。
- 本仓库只依赖 `@forge/core` 的公开子路径，不复制 Core 源码：
  - 浏览器安全契约：`@forge/core/shared/*`
  - Node 适配：`@forge/core/core/harness`、`@forge/core/host/runtime`、`@forge/core/web/server`、`@forge/core/web/lan`
- 本轮只做仓库与构建依赖拆分，**不是** Rust/单实例架构重写，也不改变原 Web 行为、UI 设计或工作区语义。
- 不包含桌面端、Electron 打包、Android 客户端或 CLI；这些仍由各自入口维护。
- 原库中未提交的 `ModelPicker.tsx` / `settings-models.css` 修改没有进入本仓库，也不应在迁移中覆盖它们。

## 先构建 Core

`@forge/core` 通过 `file:../forge-core` 作为本地包依赖；Core 的 `dist` 必须先存在：

```sh
cd ../forge-core
pnpm install
pnpm build
```

## 安装与构建

```sh
cd ../forge-web-ui
pnpm install
pnpm build
```

本仓库自带 `pnpm-workspace.yaml`，pnpm 不会继续向上发现父仓库的 workspace 并改写父锁文件。Core 重新构建后，如 UI 仍解析到 `file:` 依赖的旧副本，执行 `pnpm install --force` 刷新 `@forge/core`。

`pnpm build` 使用独立 Vite 配置输出到 `dist/renderer`。源 `src/renderer/index.html` 的 CSP 保持原样（`connect-src 'none'`，面向 file-origin 桌面语义）；生产 Web host 由 Core 只放宽同源 HTTP/WS 的 `connect-src`，其余指令不变。

## 启动

生产（先 `pnpm build`）：

```sh
pnpm serve -- --host 127.0.0.1 --port 5173 --workspace /absolute/path/to/project
```

开发（Vite middleware 挂到 Core host，保留 HMR）：

```sh
pnpm dev -- --host 127.0.0.1 --port 5173 --workspace /absolute/path/to/project
```

默认监听 `127.0.0.1:5173`，工作区为当前目录。两个入口都只创建 `createHarness()`、`createWebHost(...)` 并转发请求；服务实现不在本仓库。`pnpm serve` 默认服务本仓库的 `dist/renderer`，也可用 `--renderer` 指向其他构建输出。

HTTP 不提供传输加密；不要把这个个人局域网入口无保护地暴露到公网。

## 测试

```sh
# 聚焦单元测试
pnpm exec vitest run tests/web-bridge.test.ts tests/renderer/session-pages.test.ts

# 真实浏览器烟测（需要先 pnpm build，且本机有 Playwright Chromium）
pnpm test:browser
```

浏览器测试使用临时状态目录、fixture/未配置模型状态，不读取真实 `FORGE_HOME`、密钥或外部 provider。现有 Playwright 可用时无需重新安装浏览器；可用 `FORGE_BROWSER_EXECUTABLE` 指定本机 Chromium/Chrome。

本轮验证范围：`pnpm build`、103 项聚焦单元/渲染/浏览器测试（含 `tests/web-socket-browser.test.ts`、`tests/web-smoke-browser.test.ts` 两项真实 Chromium 测试）。`pnpm typecheck` / `pnpm lint` 仍会报告从原库提取的既有严格类型与格式问题，不是本次拆分新引入；不要把构建通过当作全量验证。

## 历史

本仓库从原库 `e089acbcf1c3fe10a71a9ce0fce5f9309305db3b` 提取，保留 `src/renderer`、`tests/renderer`、Web/browser 测试、fixtures 和必要配置的路径历史。`origin` 已移除，本仓库独立提交。
