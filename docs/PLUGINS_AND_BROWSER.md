# 插件与浏览器预览

本文说明 Web 工作台里的插件管理与同会话浏览器预览/接管。Core 侧契约和宿主实现见 Core 仓的插件文档；这里只描述界面行为与边界。

## 状态属于已连接的 Core

- 插件清单、配置、启停、健康检查都来自 `@forge/core/shared/plugins` 契约；Web 不维护插件副本，也不在本地持久化。
- 只有连接到支持 `listPlugins` / `configurePlugin` / `checkPlugin` / `browser` 的 Core 的客户端才有状态。旧 Core 或离线页面显示不可用说明，而不是伪造空列表或“已就绪”。
- 页面打开**不会**自动执行健康检查，也不会安装、下载或启动浏览器。检查依赖健康必须由用户点击“检查依赖健康”。

## 插件管理（设置 → 插件）

- 内置浏览器插件的 manifest id 固定为 `browser`；`agent-browser` 只是默认的 `executablePath` 与可选依赖名。不要按 `agent-browser` 查找插件记录。
- 首版只提供浏览器插件的专用编辑器，字段为 Core schema 返回的 `executablePath`、`browserExecutablePath`、`allowedDomains`；没有任意插件 JS 注入，也没有任意插件的通用配置表单。
- 保存配置与启用/禁用是分开的显式操作。保存只写配置，不探测依赖。
- `status: "configured"` 仅表示配置已持久化，界面写作“已配置 · 未检查”；它**不是** `ready`。只有用户点击检查并通过时才显示“依赖检查通过”，且提示检查只覆盖 agent-browser 工具协议，不代表 Chrome 能启动或站点可访问。
- 权限能力、`allowedDomains` 主机名限制（HTTP(S) 主机名，可含 `*.` 子域，不接受协议/路径/凭据）、运行级隔离会话与临时登录态都在面板中明示。启用能力不授予权限，也不绕过运行权限与审批。

## 同会话浏览器预览与接管（执行详情 → 会话信息 → 浏览器）

- 面板只绑定当前 Forge 会话。`browser({sessionId, action: 'status'})` 是只读元数据，面板只在对应子页可见时查询一次，用户也可以再次“查询状态”或“刷新面板状态”。
- 只有 Agent 在该会话一次运行中首次使用浏览器后，Core 才报告 `available: true`；运行结束或取消时 Core 关闭浏览器，面板随之回到“未可用”。界面不会替你启动浏览器。
- 首版预览是**用户点击刷新截图**：一次 `execute {action:'screenshot'}`，把返回的 `result.image`（`data`/`mimeType`）作为临时 `data:` URL 显示。`data` 必须通过 Core schema 的 base64 字形、最短长度与 `%4` 校验；渲染测试还断言浏览器解码后的 `naturalWidth > 0`，“存在 `<img>` 元素”不等于截图可显示。它是单帧快照，不是实时视频；不暴露裸 CDP 或上游 WebSocket，也不把图像 base64 写入日志或持久状态。Agent 的 `browser_screenshot` 走的是另一条路径：Core 发布 `PublishedFile` 附件，历史对话里以附件回放。
- 面板记录每张截图的来源会话；切换会话会立即清空上一会话的截图、快照与控制横幅，迟到的旧会话响应也会被丢弃，不会串显。
- 接管必须显式开启。接管后可使用 `navigate` / `snapshot` / `click` / `fill` / `press` / `scroll`；`snapshot` 以纯文本渲染，页面内容不会被当作 HTML 或脚本执行。截图不需要接管，其他 execute 都需要接管。
- “归还控制权”发 `takeover {enabled:false}`。Core 会串行化并等待释放，之后 Agent 继续；它必须重新获取 snapshot，页面变化后的旧 refs 不会被沿用。接管期间待执行的 Agent 变更动作会被拒绝并要求 fresh snapshot。
- 运行降为 `readonly` 或取消后，浏览器动作被 Core 拒绝；归还控制权不需要页面动作，仍可用于释放阻塞的 Agent 队列。面板在只读模式下明示这一点。
- 运行结束关闭浏览器，Web 断线重连不改变 run-scoped 生命周期；客户端连接的 Core 不提供浏览器 RPC 时，面板显示不可用而不是回退到本地模拟。

## 检查

```sh
pnpm exec vitest run \
  tests/renderer/plugin-browser-state.test.ts \
  tests/renderer/plugin-panel-mounted.test.ts \
  tests/renderer/browser-panel-mounted.test.ts \
  tests/published-files-ui.test.tsx
pnpm build
```

- 状态测试覆盖配置 draft/schema 映射、`configured ≠ ready`、截图图像校验、refs 解析与接管/变更判定。
- 两个 mounted 测试用 esbuild 打包真实组件，在 Chromium 中验证：加载不触发检查或截图、保存/启停走 Core、显式检查、接管门控、截图仅点击刷新、快照纯文本、只读下降后归还，以及无控制台错误。截图使用真实可解码 PNG，断言 `naturalWidth/naturalHeight`；切换会话后上一会话的截图与快照不再出现。
- `published-files-ui` 覆盖 `browser_screenshot` 成功附件在历史与实时事件中的回放，并确认失败或非宿主工具的同形 payload 不会变成附件。
- 真实浏览器烟测前先执行 `pnpm build`。Core 更新后先构建 Core，再刷新 Web 依赖。
