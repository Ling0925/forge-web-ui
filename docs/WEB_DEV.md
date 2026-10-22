# Web 开发与启动装配

本仓库只包含 Web UI（`src/renderer`）和薄启动装配。所有 HTTP/WebSocket、RPC、会话存储与 provider 逻辑来自 `@forge/core`，不属于本仓库。

## 前置：先构建 Core

```sh
cd ../forge-core
pnpm install
pnpm build
```

Core 的 `dist` 是 `@forge/core` 子路径导出的运行时来源；UI 的 `src` 只通过 `@forge/core/...` 引用共享契约，不依赖原库的相对源码路径。

## UI 安装、构建、测试

```sh
cd ../forge-web-ui
pnpm install
pnpm build      # 输出 dist/renderer
pnpm test       # 全量单元/浏览器测试，按需使用
```

本仓库自带 `pnpm-workspace.yaml`，不会让 pnpm 沿父目录进入原库 workspace。Core 重新 build 后如 UI 仍使用旧副本，执行 `pnpm install --force` 刷新 `file:` 依赖。

聚焦测试示例：

```sh
pnpm exec vitest run tests/web-bridge.test.ts tests/renderer/session-pages.test.ts
```

## 开发入口

```sh
pnpm dev -- --host 127.0.0.1 --port 5173 --workspace /absolute/path/to/project
```

`scripts/dev.mjs` 创建 Core Harness 和 `createWebHost(...)`，再把 Vite middleware 挂到同一个 HTTP server 上。Vite 只负责 renderer 的模块转换与 HMR；后端仍是 Core。开发插件只为本入口放宽 `script-src`/`connect-src` 以支持 HMR，生产 HTML 的 CSP 不变。

默认 `127.0.0.1:5173`，工作区为当前目录；只接受具体 IPv4（不接受 `0.0.0.0`）和 1024–65535 端口。

## 生产入口

```sh
pnpm build
pnpm serve -- --host 127.0.0.1 --port 5173 --workspace /absolute/path/to/project
```

`scripts/serve.mjs` 使用 `@forge/core/web/server` 的 `createWebHost({ service, workspace, host, port, rendererRoot })` 服务本仓库 `dist/renderer`。Core 提供静态资源压缩、缓存、安全头和同源 CSP 放宽；UI 仓库不复制这些实现。可用 `--renderer` 指向其他已构建目录。

## 浏览器烟测

```sh
pnpm build
pnpm test:browser
```

`tests/web-smoke-browser.test.ts` 使用临时 `stateDir` 和未配置模型状态，验证生产构建的渲染、CSP、Web bridge 会话读取以及设置页往返；不读取真实 `FORGE_HOME`、密钥或 provider。需要本机 Playwright Chromium 或通过 `FORGE_BROWSER_EXECUTABLE` 指定 Chrome/Chromium。

本轮验证了 `pnpm build`、103 项聚焦测试（含 2 项真实 Chromium 浏览器测试）。`pnpm typecheck` / `pnpm lint` 仍包含从原库提取的既有严格类型与格式问题，不代表本次拆分引入的回归。

## 安全边界

这是个人局域网直接访问入口，不是公网部署方案，也不是多租户服务。HTTP 不提供保密性；远程访问必须另行提供可信的身份验证、HTTPS 和访问控制。
