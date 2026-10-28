<p align="center">
  <img src="src/renderer/public/forge-mark-v3.png" width="112" height="112" alt="Forge 锻造图标" />
</p>

# Forge Web

Forge 的浏览器工作台。在一个界面中管理工作区与会话、与模型协作、审批工具操作，并检查文件和任务进度。

Web 与 Core 独立运行：**更新界面不打断 Core 中已接受的任务**。本仓负责 React 界面、开发服务器与静态页面入口；模型、凭据、会话和工具执行都由 Core 管理。

[Forge 主仓](https://github.com/Ling0925/forge) · [Core](https://github.com/Ling0925/forge-core) · [CLI](https://github.com/Ling0925/forge-cli) · [Android](https://github.com/Ling0925/forge-android)

## 工作台能做什么

- 按工作区组织会话，搜索、恢复、重命名与归档任务。
- 流式对话、图片输入、思考与工具折叠，运行中排队或插话。
- 审批操作、查看计划与子任务，浏览文件、差异和检查点。
- 管理模型来源、路由、插件、MCP 和智能体角色，查看用量与诊断。
- 配置探索、前端、后端、代码审查等角色供主代理调用，在子任务详情中查看 advisor 问答与投递状态。
- 在桌面和手机布局间自适应，支持浅色、深色主题。
- 将助手回复中的 `chart` 围栏渲染为交互图表，可切换数据表、复制 JSON、导出 PNG；卡片右上角可重新绘制。

## 快速开始

需要 **Node.js `>=22.23.1 <23`** 和 **pnpm `11.18.0`**。浏览器构建目标为 **Chrome 132**；建议使用对应版本或更新的 Chrome/Chromium，其他浏览器需自行验证。

### 1. 构建 Core 和界面

两个仓库必须位于同一级，本仓通过 `file:../forge-core` 依赖 Core：

```sh
git clone https://github.com/Ling0925/forge-core.git
git clone https://github.com/Ling0925/forge-web-ui.git

cd forge-core
pnpm install --frozen-lockfile
pnpm build

cd ../forge-web-ui
pnpm install
pnpm build
```

Web 构建输出到 `dist/renderer`。以下命令均从 `forge-web-ui` 根目录执行。

### 2. 启动独立 Core

将工作区替换成实际存在的绝对路径，在第一个终端启动：

```sh
node ../forge-core/dist/web/serve.js \
  --host 127.0.0.1 --port 5175 \
  --workspace /absolute/path/to/project --multi-workspace
```

去掉 `--multi-workspace` 可将客户端限制在启动工作区。`FORGE_HOME`、工作区和可选 `--socket` 都配置在 **Core 进程**，不传给 Web。

### 3. 启动 Web 并打开页面

在第二个终端启动：

```sh
pnpm serve -- --host 127.0.0.1 --port 5173 \
  --core-url http://127.0.0.1:5175
```

打开 `http://127.0.0.1:5173`，首次使用在设置中配置模型来源、凭据和模型，再开始会话。实际发送消息会调用所选模型，可能产生费用。

`--core-url` 必填且必须是另一个本机回环 IPv4 HTTP origin，带显式端口，不带路径、查询或凭据。缺少 Core 时 Web 不会自行创建运行时。

## 配置智能体与查看协作

1. 打开 **设置 → 智能体**，选择「新建智能体」或「从模板添加」。探索、前端、后端和代码审查模板均可编辑；不会自动写入你的配置。
2. 填写稳定 ID、名称、职责、适用场景和角色指令。**适用场景供主代理选择角色，角色指令只加载到被选中的子代理**。
3. 选择继承主模型，或切换为「固定绑定模型」，选择 Provider 后直接从「已配置模型」下拉中选取模型，无需重复输入 ID。可选项与该来源在「模型连接」中的配置一致；未列出的模型可选「手动输入模型 ID…」。已有角色的未列出模型会保留原值，不自动替换。再配置权限上限、共享工作区 / worktree，以及工具组和 MCP 白名单。
4. 保存后，在主会话中描述任务，也可以明确要求主代理使用某个角色。主代理通过 `list_agent_profiles` 发现角色，再通过 `spawn_agent` 派发；创建角色不会立即启动任务。

在 **执行详情 → 子任务** 查看角色、进展及集中答疑记录，打开子会话可查看启动时的角色快照。子代理通过 `advisor` 提问，主代理通过 `answer_advisor` 回答并给出下一步指导；不是要求用户逐条审批的弹窗。「答复已保存」和「已投递到子代理」分别展示，历史或已中断运行不会伪装成仍在实时等待。

- 编辑、停用或删除角色仅影响后续派发，不修改已有任务的角色快照，也不会自动取消正在运行的子任务。
- 未保存草稿离开前会提示；版本冲突不会覆盖另一窗口的改动。按提示刷新最新配置后再决定下一次操作，刷新本身不重放保存、启停或删除。
- 切换 Provider 会重新选择新来源的可选模型，请保存前确认；不会因模型不可用而自动换模型或回退到主模型。
- 角色和 advisor 指导都不能提升宿主权限。`worktree` 与职责路径用于协作，不是操作系统沙箱。
- 配置由 Core 持久化，不以浏览器本地存储作为唯一来源。刷新页面会恢复已持久化的协作状态，不会重新派发任务。

## 开发界面：使用 HMR

保留上面的 Core，把第二个终端换成开发入口，无需先构建 UI：

```sh
pnpm dev -- --host 127.0.0.1 --port 5173 \
  --core-url http://127.0.0.1:5175
```

修改 `src/renderer` 中的 React/CSS 后由 Vite 热更新。无法 Fast Refresh 的模块变更可能整页刷新；修改 `scripts/dev.mjs` 需重启 Web。两种情况都不需要重启 Core。

Core 代码变化时，先在 Core 仓重新构建，再在本仓执行 `pnpm install --no-frozen-lockfile` 刷新文件包。是否需要重启 Core 取决于后端改动；正在执行的任务不会自动迁移到新进程。

## 局域网与运行生命周期

要让手机访问，将 **Web 的 `--host`** 换成服务器实际局域网 IPv4，例如 `192.168.1.10`，然后访问 `http://192.168.1.10:5173`。Core 仍可保持 `127.0.0.1:5175`；分享与二维码应使用 Web 地址，不是内部 Core 地址。

- Web 的监听地址必须是具体 IPv4，不支持 `0.0.0.0`；端口范围为 `1024–65535`。默认是 `127.0.0.1:5173`。
- 当前入口是可信个人网络直连，**可访问该地址的人就能使用工作台**。HTTP 不加密，公网接入必须另外提供 HTTPS 与访问控制。
- 浏览器 Host / Origin 会被检查；反向代理需正确处理外部地址和 WebSocket，不能仅替换访问域名。
- Web 停止只关闭页面连接，Core 继续执行任务。重连后恢复事件；超出保留窗口时重新读取持久化状态。
- 停止 Core 会停止它持有的任务。进程管理器应让两者独立，不配置会因 Web 重启而停止 Core 的联动关系。

## 常见问题

**打开 Core 端口是 404**：API-only Core 不提供页面。浏览器应打开 Web 端口，本例为 `5173`。

**提示缺少 `--core-url`**：先独立启动 Core，再把它的回环地址传给 `pnpm serve` / `pnpm dev`；Web 不接受旧的 `--workspace` 启动方式。

**提示找不到 renderer 或 Core 模块**：先构建 Core，再安装 Web 依赖。静态入口还需要 `pnpm build`；也可通过 `--renderer /absolute/path/to/build` 指向另一份构建输出。

**改界面后没有更新**：开发时修改本仓的 `src/renderer`；静态部署需要重新构建。Forge 主仓根目录没有另一份有效的 renderer 源码。

**图表空白或显示绘制失败**：先使用卡片右上角「重新绘制图表」。普通图表仍可切到「数据」查看原始数值；自定义 `raw` 配置若不能绘制，会在卡片内提示，不影响其余对话。若提示图表库加载失败且页面刚更新，请刷新页面以获取新的资源。

## 开发检查

```sh
# 聚焦单元与渲染测试
pnpm exec vitest run tests/web-bridge.test.ts tests/renderer/session-pages.test.ts

# 插件管理与同会话浏览器预览/接管
pnpm exec vitest run tests/renderer/plugin-browser-state.test.ts \
  tests/renderer/plugin-panel-mounted.test.ts \
  tests/renderer/browser-panel-mounted.test.ts

# 图表：编译配置、实际绘制与持久化会话恢复（先构建页面）
pnpm build
pnpm exec vitest run tests/renderer/chart-build-option.test.ts \
  tests/renderer/chart-sanitize.test.ts tests/renderer/chart-markdown-mounted.test.ts \
  tests/web-chart-browser.test.ts

# 智能体：设置交互、advisor 状态和真实 Core 离线协作（先构建页面）
pnpm build
pnpm exec vitest run tests/renderer/agent-profiles-mounted.test.ts \
  tests/renderer/agent-profile-models-mounted.test.ts \
  tests/renderer/agent-advisor-mounted.test.ts \
  tests/renderer/agent-visual-verification.test.ts tests/web-agents-browser.test.ts

# 开发/生产入口的浏览器烟测
pnpm test:browser
```

浏览器测试需要 Playwright Chromium，或通过 `FORGE_BROWSER_EXECUTABLE` 指定本机 Chrome/Chromium。测试用临时状态和离线 fixture，不读取真实 `FORGE_HOME`、密钥或调用外部 Provider。

烟测覆盖页面、RPC、设置、HMR，以及 Web 中断后 Core 继续运行、页面恢复同一对话；也检查 50 MiB 文件经 Core 和网关下载。修改代理边界可单独运行 `pnpm exec vitest run tests/web-dev-proxy.test.ts`。

`pnpm test`、`pnpm typecheck`、`pnpm lint` 是更大范围的检查入口，可按改动范围选用。

## 代码与设计

```text
src/renderer/           React 工作台、样式与浏览器 bridge
src/renderer/public/    品牌图标等静态资源
scripts/dev.mjs        Vite HMR + 独立 Core 代理
scripts/serve.mjs      静态页面 + 独立 Core 网关入口
tests/renderer/        组件与交互回归
tests/web-*.test.ts     Web 传输、代理和浏览器检查
```

浏览器只导入 `@forge/core/shared/*` 安全契约；生产入口使用 `@forge/core/web/gateway`。Web 不维护运行时或存储副本，只有离线测试 fixture 会创建模拟运行环境。

源 HTML 保持 `connect-src 'none'`；Web 服务按入口开放同源 HTTP/WebSocket，开发入口额外支持 HMR，不应为连通后端而随意放宽源文件 CSP。

首页和侧栏使用 [256px 锻造图标](src/renderer/public/forge-mark-v3.png)，由 `ForgeMark` 组件呈现；标签页使用 [64px favicon](src/renderer/public/forge-favicon-v3.png)。布局、主题与组件约定见 [Web UI 设计规范](docs/WEB_UI_LAYOUT_SPEC.md)，启动细节见 [Web 开发说明](docs/WEB_DEV.md)。

本仓包名为 `@forge/web-ui`，在 Forge 主仓中位于 `repos/forge-web-ui` 子模块，独立维护提交历史。作者与历史来源见 [作者说明](docs/AUTHORSHIP.md)。
