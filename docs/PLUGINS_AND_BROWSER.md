# 插件与浏览器 / OfficeCLI 预览

本文说明 Web 工作台里的插件管理、同会话浏览器预览/接管，以及交付 HTML 附件的直接预览。Core 侧契约和宿主实现见 Core 仓的插件文档；这里只描述界面行为与边界。

## 状态属于已连接的 Core

- 插件清单、配置、启停、健康检查都来自 `@forge/core/shared/plugins` 契约；Web 不维护插件副本，也不在本地持久化。
- 只有连接到支持 `listPlugins` / `configurePlugin` / `checkPlugin` / `browser` 的 Core 的客户端才有状态。旧 Core 或离线页面显示不可用说明，而不是伪造空列表或“已就绪”。
- 页面打开**不会**自动执行健康检查，也不会安装、下载、启动浏览器或 OfficeCLI。检查依赖健康必须由用户点击“检查依赖健康”。

## 插件管理（设置 → 插件）

- 内置插件只有一个产品入口：设置中的“插件”分区。旧版设置里的独立“浏览器”分区（`browserAllowedOrigins`、全局 `browserExecutablePath`）已移除，普通设置的保存不会携带这两个字段；浏览器访问范围、agent-browser 可执行路径和可选 Chrome/Chromium 路径都只写进插件配置。
- 内置浏览器插件的 manifest id 固定为 `browser`；`agent-browser` 只是默认的 `executablePath` 与可选依赖名。不要按 `agent-browser` 查找插件记录。
- 内置 OfficeCLI 插件的 manifest id 固定为 `officecli`，与 `executablePath` 默认值 `officecli` 同名但含义不同。它声明 `tools`、`instructions`、`process`；没有新的 capability 枚举，也不代表已授予权限。
- 首版只有两个专用编辑器：`browser`（`executablePath`、`browserExecutablePath`、`allowedDomains`）与 `officecli`（`executablePath`、`timeoutMs`）。`browserExecutablePath` 与 `timeoutMs` 都属于插件 `config`，不是全局设置。没有任意插件 JS 注入，也没有任意插件的通用配置表单；未知插件仍展示清单、能力和启停，但只有说明文字，不会出现伪表单或伪造的“未保存”标记。
- 保存配置与启用/禁用是分开的显式操作。保存只写配置，不探测依赖。
- `status: "configured"` 仅表示配置已持久化，界面写作“已配置 · 未检查”；它**不是** `ready`。只有用户点击检查并通过时才显示“依赖检查通过”。
- 浏览器检查只探测 agent-browser 工具协议，不代表 Chrome 能启动或站点可访问；OfficeCLI 检查只执行 `officecli --version`，不代表文档转换或 HTML 渲染可用。两者都不安装依赖。
- 权限能力、`allowedDomains` 主机名限制（HTTP(S) 主机名，可含 `*.` 子域，不接受协议/路径/凭据）、运行级隔离会话与临时登录态都在面板中明示。启用能力不授予权限，也不绕过运行权限与审批。

## OfficeCLI 配置与预览

- 插件默认禁用，且不会自动安装、下载或升级 OfficeCLI。程序缺失时健康检查返回 `unavailable`，界面显示“依赖不可用”和 Core 的原始说明；不会 fallback 到其他 Office 后端，也不会静默改写配置。
- `executablePath` 默认 `officecli`（在本机 `PATH` 中查找），也可填写绝对路径；可执行文件是本机受信程序，不是 OS 沙箱。`timeoutMs` 由 Core 约束为整数毫秒，范围 `1000–300000`（默认 `120000`）。
- 界面按**秒**编辑超时，`step=0.001`，最多 3 位小数（即精确到毫秒）。这是因为 Core 存整数毫秒：`1501 ms` 显示为 `1.501`，保存后仍是 `1501`，不会被悄悄四舍五入；超过 3 位小数（如 `1.5001`）在本地被拒绝，不会发给 Core，也不会被替换成默认值。
- 启用只影响**新的运行**：插件工具在运行时注册，当前会话与已启动的运行不热更新；需要新开一次运行才会出现 `officecli_*` 工具。启用不改变模型或 provider。
- `officecli_preview` 通过 OfficeCLI 生成一份不可变的 HTML 快照作为普通 `PublishedFile` 附件（最大 8 MiB），不是实时预览，也不是像素级 Office 渲染。修改文档后需要重新生成预览；原文件仍用 `publish_file` 交付下载。

## 交付附件的 HTML 预览（对话中的文件卡片）

- HTML 附件点击“HTML 预览”会先读取该快照，然后**直接**打开既有的隔离 HTML 预览弹窗；不再先弹原始源码对话框、再点第二个按钮。渲染仍由宿主 `previewHtml` 提供同源文档 URL，框架固定 `sandbox="allow-scripts"`，不含 `allow-same-origin`，文档 CSP 继续禁止网络；界面从不使用 `srcdoc`、`data:` 或 `blob:` 文档，也不放宽 CSP。
- “查看源码”是独立动作，以纯文本显示原始 HTML；它与预览弹窗互斥，一次只会出现一个弹窗，避免叠层对话框。“下载”仍以不透明字节保存，不会被当作可导航文档打开。
- 处理上限分两类：文本附件的源码/文本预览仍是 **1 MiB**（`PUBLISHED_PREVIEW_MAX_BYTES`）；HTML 附件的隔离预览与源码视图使用 **8 MiB**（`PUBLISHED_HTML_PREVIEW_MAX_BYTES`，与 Core 的 `HTML_PREVIEW_MAX_BYTES` 一致）。更大的 HTML 只保留下载，并明确显示“超过 8 MiB 预览上限，请下载查看”。
- 宿主没有 `previewHtml` / `previewFile`（例如桌面 bridge）时，卡片显示“当前宿主不支持隔离 HTML 预览；可查看源码或下载原文件”，不渲染死按钮，也不回退到本地 `srcdoc`。
- 读取、加载和解码都是异步的：组件卸载或弹窗关闭会作废迟到的响应；同一 HTML 卡片的预览与源码动作互斥，加载期间按钮禁用并显示进行中文案，宿主错误显示为 `role="alert"` 文本。

## 同会话浏览器预览与接管（执行详情 → 会话信息 → 浏览器）

- 面板只绑定当前 Forge 会话。`browser({sessionId, action: 'status'})` 是只读元数据，面板只在对应子页可见时查询一次，用户也可以再次“查询状态”或“刷新面板状态”。
- 只有 Agent 在该会话一次运行中首次使用浏览器后，Core 才报告 `available: true`；运行结束或取消时 Core 关闭浏览器，面板在下次查询状态时显示“未可用”，不在后台轮询。界面不会替你启动浏览器。
- 首版预览是**用户点击刷新截图**：一次 `execute {action:'screenshot'}`，把返回的 `result.image`（`data`/`mimeType`）作为临时 `data:` URL 显示。`data` 必须通过 Core schema 的 base64 字形、最短长度与 `%4` 校验；渲染测试还断言浏览器解码后的 `naturalWidth > 0`，“存在 `<img>` 元素”不等于截图可显示。它是单帧快照，不是实时视频；不暴露裸 CDP 或上游 WebSocket，也不把图像 base64 写入日志或持久状态。Agent 的 `browser_screenshot` 走的是另一条路径：Core 发布 `PublishedFile` 附件，历史对话里以附件回放。
- 面板记录每张截图的来源会话；切换会话会立即清空上一会话的截图、快照与控制横幅，迟到的旧会话响应也会被丢弃，不会串显。
- 接管必须显式开启。人工动作由用户点击直接授权，不另弹一轮 Agent 审批，但仍检查当前运行权限和允许域名；接管不会授予 Agent 额外权限。接管后可使用 `navigate` / `snapshot` / `click` / `fill` / `press` / `scroll`；`snapshot` 以纯文本渲染，页面内容不会被当作 HTML 或脚本执行。截图不需要接管，其他 execute 都需要接管。
- “归还控制权”发 `takeover {enabled:false}`。Core 会串行化并等待释放，之后 Agent 继续；它必须重新获取 snapshot，页面变化后的旧 refs 不会被沿用。接管期间待执行的 Agent 变更动作会被拒绝并要求 fresh snapshot。
- 运行降为 `readonly` 或取消后，浏览器动作被 Core 拒绝；归还控制权不需要页面动作，仍可用于释放阻塞的 Agent 队列。面板在只读模式下明示这一点。
- 运行结束关闭浏览器，Web 断线重连不改变 run-scoped 生命周期；客户端连接的 Core 不提供浏览器 RPC 时，面板显示不可用而不是回退到本地模拟。

## 检查

```sh
pnpm build
pnpm exec vitest run \
  tests/renderer/settings-draft.test.ts \
  tests/renderer/settings-page-mounted.test.ts \
  tests/renderer/plugin-browser-state.test.ts \
  tests/renderer/plugin-panel-mounted.test.ts \
  tests/renderer/officecli-plugins.test.ts \
  tests/renderer/officecli-preview-mounted.test.ts \
  tests/renderer/officecli-timeline.test.ts \
  tests/renderer/browser-panel-mounted.test.ts \
  tests/published-files-ui.test.tsx \
  tests/web-plugins-browser.test.ts
```

- 状态测试覆盖配置 draft/schema 映射、`configured ≠ ready`、截图图像校验、refs 解析与接管/变更判定。
- `officecli-plugins` 覆盖 OfficeCLI 配置映射：Core 默认值、schema 边界与界面秒数范围一致、`1501 ms ↔ 1.501 s` 往返不丢精度、超 3 位小数在本地拒绝、未知插件不生成 draft 也不显示“未保存”，以及文本 1 MiB / HTML 8 MiB 两个上限。
- `settings-draft` 与 `settings-page-mounted` 覆盖移除后的设置入口：设置分类和搜索里只剩“插件”入口，普通设置保存不带 `browserAllowedOrigins` / `browserExecutablePath`，即使界面内存中还留有旧字段也不会重新提交；`web-plugins-browser` 在生产构建入口上重复确认旧分类不存在。
- 两个 mounted 测试用 esbuild 打包真实组件，在 Chromium 中验证：加载不触发检查或截图、保存/启停走 Core、显式检查、接管门控、截图仅点击刷新、快照纯文本、只读下降后归还，以及无控制台错误。截图使用真实可解码 PNG，断言 `naturalWidth/naturalHeight`；切换会话后上一会话的截图与快照不再出现。
- `officecli-preview-mounted` 在 Chromium 中同时挂载插件面板和附件卡片：OfficeCLI 可执行路径 + 超时保存、`90 s → 90000 ms`、`1.501 s → 1501 ms`、超精度本地报错、显式启用与 `unavailable` 健康结果；浏览器与未知插件仍可渲染且未知插件没有通用表单。随后一次点击 HTML 卡片直接打开沙箱弹窗（断言 `sandbox=allow-scripts`、无 `srcdoc`、只有一个 dialog），关闭后“查看源码”才以纯文本显示，> 8 MiB 文档只保留下载，卸载期间的迟到响应不会抛错或重开弹窗。
- `published-files-ui` 覆盖 `browser_screenshot` 成功附件在历史与实时事件中的回放，并确认失败或非宿主工具的同形 payload 不会变成附件；桌面式 bridge 无预览端点时 HTML 卡片明确显示不支持并保留源码/下载。
- 真实浏览器烟测前先执行 `pnpm build`。Core 更新后先构建 Core，再刷新 Web 依赖。
