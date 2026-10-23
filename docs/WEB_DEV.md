# Web 开发与启动

日常启动步骤见 [README](../README.md#快速开始)。本文说明 Web 与 Core 的进程边界，以及修改不同部分后如何加载新版本。

## 两个进程，各自持有自己的生命周期

- **Core** 持有 Harness、任务、审批、会话和事件恢复记录，通过 HTTP/WebSocket 提供能力。
- **Web** 提供 React 页面并转发请求，不创建 Harness、不读写 Core 会话。开发入口使用 Vite，静态入口使用 `@forge/core/web/gateway`。

Web 断开或重启不取消 Core 已接受的任务；Core 停止会停止它持有的任务。不要将两者配置成 Web 重启时会一起停止的服务单元。

## 准备本地依赖

两个仓库放在同一级。先构建 Core，再安装 Web 的 `file:../forge-core` 依赖：

```sh
cd ../forge-core
pnpm install
pnpm build
cd ../forge-web-ui
pnpm install
```

本仓独立的 `pnpm-workspace.yaml` 阻止 pnpm 向上发现其他 workspace。Core 重建后，用 `pnpm install --no-frozen-lockfile` 刷新本仓的文件包；浏览器代码仍只通过 `@forge/core/shared/*` 导入安全契约。

## 开发入口

以下命令均在 Web 仓根目录执行，两个终端分别运行：

```sh
# 终端 A
node ../forge-core/dist/web/serve.js --host 127.0.0.1 --port 5175 \
  --workspace /absolute/path/to/project --multi-workspace
```

```sh
# 终端 B
pnpm dev -- --host 127.0.0.1 --port 5173 --core-url http://127.0.0.1:5175
```

打开 `http://127.0.0.1:5173`。`scripts/dev.mjs` 为本仓 `src/renderer` 提供 React Fast Refresh 和 CSS HMR，并用 Vite HTTP/WebSocket 代理连接独立 Core。

- `--core-url` 必填，只接受不同于 Web origin 的回环 IPv4 HTTP 地址，需带显式端口且无路径、查询或凭据。
- `--workspace`、`--multi-workspace`、`--socket` 和 `FORGE_HOME` 属于 Core，不传给 Web。
- `--host` 为具体 IPv4，不接受 `0.0.0.0`；端口范围为 `1024–65535`。
- `/__forge_hmr` 用于 HMR，`/api/events` 用于对话事件。

修改 React/CSS 通常无需重启；不能 Fast Refresh 的模块可能整页刷新。修改开发启动脚本需要重启 Web，Vite 客户端恢复连接后会重载页面。后端任务仍由原 Core 持有。

## 静态入口

保留同一个 Core，停止开发 Web 后使用静态入口：

```sh
pnpm build
pnpm serve -- --host 127.0.0.1 --port 5173 --core-url http://127.0.0.1:5175
```

默认输出和服务目录为 `dist/renderer`；可用 `--renderer /absolute/path/to/build` 指定另一份构建。静态入口不支持 HMR，修改界面后需要重新构建。

源 HTML 保留 `connect-src 'none'`，静态服务将其调整为同源 HTTP/WS。开发入口另外允许 React Refresh 与 HMR 所需的脚本/worker；这些开发放宽不写回生产 HTML。

## 验证入口

```sh
pnpm exec vitest run tests/web-bridge.test.ts tests/renderer/session-pages.test.ts
pnpm exec vitest run tests/web-dev-proxy.test.ts
pnpm build
pnpm test:browser
```

浏览器测试需要 Playwright Chromium，或 `FORGE_BROWSER_EXECUTABLE` 指定的 Chrome/Chromium。fixture 使用临时状态、离线模型，不读取真实配置。

- `tests/web-smoke-browser.test.ts`：静态网关、CSP/RPC、设置和分享地址，以及 Web 中断后同一 Core 继续执行、页面恢复事件。
- `tests/web-dev-browser.test.ts`：React/CSS HMR、草稿保留、Web 重启后恢复同一 Core 对话。
- 两个浏览器入口均检查 50 MiB 发布文件经网关下载。
- `tests/web-dev-proxy.test.ts`：拒绝不符合约定的 Host、Origin 与 WebSocket 升级。

## 网络边界

网关先校验外部 Host / Origin，再改写为内部 Core 地址；它不是通用代理。局域网分享使用浏览器访问的 Web 地址，不使用内部 Core 地址。当前直连入口信任可达客户端、HTTP 不加密，公网部署需另行配置 HTTPS 与访问控制。
