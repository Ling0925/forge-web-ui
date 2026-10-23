# @forge/web-ui

Forge 工作台的独立 Web UI 仓库：只包含 React renderer、renderer 测试，以及把已构建界面挂到 Core Web host 的薄启动装配。

## 边界

- **Core owns** 所有 HTTP/WebSocket 服务、RPC、会话存储、provider 和工具运行时实现。
- 本仓库只依赖 `@forge/core` 的公开子路径，不复制 Core 源码：
  - 浏览器安全契约：`@forge/core/shared/*`
  - 生产 Node 适配：`@forge/core/web/gateway`（静态 UI + HTTP/WebSocket 代理，不持有运行时）
  - 开发/测试适配：`@forge/core/core/harness`、`@forge/core/web/server`
- 生产 Web 与 Core 是独立进程，重启 Web 不终止 Core 对话；不做 Rust、全局单实例或 UI 设计重写。
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

本仓库自带 `pnpm-workspace.yaml`，pnpm 不会继续向上发现父仓库的 workspace 并改写父锁文件。Core 重新构建后，如 UI 仍解析到 `file:` 依赖的旧副本，执行 `pnpm install --no-frozen-lockfile` 刷新 `@forge/core`。

`pnpm build` 使用独立 Vite 配置输出到 `dist/renderer`。源 `src/renderer/index.html` 的 CSP 保持原样（`connect-src 'none'`，面向 file-origin 桌面语义）；生产 Web host 由 Core 只放宽同源 HTTP/WS 的 `connect-src`，其余指令不变。

## 启动

生产（先构建 Core、刷新本仓 `@forge/core` 依赖并 `pnpm build`）：

```sh
# 独立终端/服务 A：Core 持有所有任务，--multi-workspace 为可选
node ../forge-core/dist/web/serve.js --host 127.0.0.1 --port 5175 --workspace /absolute/path/to/project --multi-workspace
# 独立终端/服务 B：本仓 Web 网关，只暴露页面和同源转发
pnpm serve -- --host 127.0.0.1 --port 5173 --core-url http://127.0.0.1:5175
```

`--core-url` 必填（本机具体 IPv4 的 HTTP 地址），不提供时立即报错，不会隐式创建 Core。
工作区、数据目录 `FORGE_HOME` 和可选 `--socket` 只在 Core 进程配置；Web 无运行时状态。
重启/终止 Web 只让浏览器短暂断线，Core 继续执行，页面自动重连并补齐事件。
不要把两者放进同一个会被整体停止的 supervisor 单元，也不要在只更新 UI 时重启 Core。

开发（Vite middleware 挂到 Core host，保留 HMR）：

```sh
pnpm dev -- --host 127.0.0.1 --port 5173 --workspace /absolute/path/to/project
```

默认监听 `127.0.0.1:5173`。`pnpm serve` 默认服务本仓库的 `dist/renderer`，
也可用 `--renderer` 指向其他构建输出。分享/二维码使用浏览器访问的 Web 地址，而非内部 Core 地址。
开发入口仍把 Vite middleware 挂到 Core host（工作区默认当前目录），属于单进程开发模式，
**不能**用于需要“重启 Web 不停任务”的常驻服务；常驻服务请用上面的独立生产入口。
这不等于 CLI、桌面和 Web 已统一到全局单实例 daemon。

HTTP 不提供传输加密；不要把这个个人局域网入口无保护地暴露到公网。

## 测试

```sh
# 聚焦单元测试
pnpm exec vitest run tests/web-bridge.test.ts tests/renderer/session-pages.test.ts

# 真实浏览器烟测（需要先 pnpm build，且本机有 Playwright Chromium）
pnpm test:browser
```

浏览器测试使用临时状态目录、fixture/未配置模型状态，不读取真实 `FORGE_HOME`、密钥或外部 provider。现有 Playwright 可用时无需重新安装浏览器；可用 `FORGE_BROWSER_EXECUTABLE` 指定本机 Chromium/Chrome。

`tests/web-smoke-browser.test.ts` 通过真实 `scripts/serve.mjs` 网关入口和独立 Core fixture 进程，
检查页面/CSP/RPC/分享地址/设置页往返，以及流式对话中 SIGKILL Web → Core 离线继续执行 →
启动 Web → 原页面自动补发事件并完成，断言 Core PID/hostId 不变、对话推理只执行一次。
同一浏览器检查还通过真实 `publish_file` 发布 50 MiB 文件，经 Core RPC/网关下载并核对字节数和 SHA-256。
最初仓库拆分时曾验证 103 项聚焦单元/渲染/浏览器测试；那是历史记录，不是每轮全量验收。
`pnpm typecheck` / `pnpm lint` 仍未通过，涉及提取代码中的严格类型与格式问题；本轮未完成逐条修复和全量回归归因，不把构建通过当作全量验证。

## 历史

本仓库从原库 `e089acbcf1c3fe10a71a9ce0fce5f9309305db3b` 提取，保留 `src/renderer`、`tests/renderer`、Web/browser 测试、fixtures 和必要配置的路径历史。

公开仓库为 `Ling0925/forge-web-ui`，`origin` 指向该仓库。既可单独克隆，也作为
主仓 `Ling0925/forge` 的 `repos/forge-web-ui` 子模块使用；同级仍需有 `forge-core`。
代码变更独立提交在本仓。同步主仓版本时，先提交并推送本仓，再由主仓维护者
提交子模块指针；各仓历史不会因子模块关联而合并。
