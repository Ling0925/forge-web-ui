# Forge Web UI 设计规范与组件约定

本规范是 `forge-web-ui` 的唯一视觉与交互设计准则。所有代理（Agent）和开发者在新增或修改任何 React 组件、样式表或弹窗前，**必须先阅读并遵守本规范**，严禁脱离本规范自行发明配色、堆叠边框或退回浏览器原生简陋控件。

启动与进程边界见 [WEB_DEV.md](WEB_DEV.md)；内置浏览器插件见 [PLUGINS_AND_BROWSER.md](PLUGINS_AND_BROWSER.md)。

---

## 1. 核心美学与样式加载层级

Forge Web 采用 **浅色「暖纸墨色（Warm Paper & Ink）」/ 深色「石墨暗色（Graphite Dark）」** 工作台美学，克制、温润、高信息密度，强调长时阅读与多任务协作的秩序感。

### 1.1 样式文件优先级（严禁只看 `tokens.css`）

生产入口由 [main.tsx](../src/renderer/main.tsx) 按顺序装配样式，**最终视觉效果以工作台主题覆盖后的计算值为准**：

1. [tokens.css](../src/renderer/styles/tokens.css)：定义字体栈、字号阶梯、4px 间距刻度、圆角刻度，以及基础语义状态色（`--success`、`--warning`、`--error`）。
2. [workspace-theme.css](../src/renderer/styles/workspace-theme.css)：**工作台最终生效的主题覆盖**，将背景、文字、边框、主强调色（`--accent`）及控件高度覆盖为暖纸/石墨体系。
3. [sidebar-compact.css](../src/renderer/styles/sidebar-compact.css) 与 [app.css](../src/renderer/components/workbench/app.css)：负责主框架、侧栏紧凑密度与响应式断点。
4. 组件级样式（`composer-*.css`、`inspector.css`、`settings.css`、`usage-popover.css`、`tool-disclosure.css` 等）：负责具体业务区域的细节呈现。

---

## 2. 色彩与 Token 铁律（最高频踩坑点）

修改样式时**必须使用 CSS 变量或基于变量的 `color-mix()`**，严禁硬编码脱离主题的十六进制/RGB 颜色。

### 2.1 主强调色 vs 完成/成功色（严禁误用 `--accent-sage`）

| 语义场景 | 必须使用的 Token | 浅色实际值 | 深色实际值 | 严禁使用的错误写法 |
| :--- | :--- | :--- | :--- | :--- |
| **主强调 / 进行中 / 激活 / 焦点** | `var(--accent)`、`var(--accent-subtle)` | `#a54f35`（赤陶色） | `#dc9477`（暖赤陶） | 严禁使用蓝色 `#3b82f6` / `#2563eb` / `rgba(59, 130, 246, ...)` |
| **已完成 / 成功 / 正常 / 缓存命中** | `var(--success)`、`var(--success-bg)`、`var(--success-border)` | `#226d40`（森林鼠尾草绿） | `#34d399`（柔翠绿） | **严禁使用 `var(--accent-sage)`**（在工作台主题中它等于赤陶色！）；严禁硬编码刺眼亮绿 `#16a34a` |
| **警告 / 待确认 / 队列提示** | `var(--warning)`、`var(--warning-bg)`、`var(--warning-border)` | `#975a06` | `#fbbf24` | 严禁使用无对比度的纯黄 `#ffff00` |
| **错误 / 失败 / 危险操作** | `var(--error)` 或 `var(--danger)`、`var(--error-bg)` | `#b82420` / `#c84b31` | `#f87171` / `#e06c53` | 严禁使用纯红 `#ff0000` |

> **关键陷阱说明**：`workspace-theme.css` 将 `--accent-sage` 重映射为了赤陶主色（`#a54f35` / `#dc9477`）。如果你需要「绿色」来表示步骤完成、任务成功或连接正常，**只能使用 `var(--success)` 或 `color-mix(in srgb, var(--success, #226d40) XX%, transparent)`**。

### 2.2 严禁出现原生蓝（Off-Brand Blue）与脏渐变

- **禁止任何蓝色残留**：工作台调色板中**没有任何蓝色**。严禁在边框、阴影、徽章或 fallback 中写入 `rgba(59, 130, 246, ...)`、`#2563eb`、`#3b82f6`。半透明主色边框统一写为 `color-mix(in srgb, var(--accent) 24%, transparent)`。
- **禁止跨色相红绿渐变**：严禁编写 `linear-gradient(90deg, var(--accent) 0%, var(--success) 100%)`（赤陶红到绿色会在中间产生浑浊的褐色）。多状态进度条必须采用**分段拼接（Segmented Track）**：已完成段使用 `var(--success)`，进行中/缓存段紧随其后使用 `var(--accent)`。

### 2.3 表面层级（Surface Hierarchy）与反套娃原则

| 层级 | Token | 浅色值 | 深色值 | 典型用途 |
| :--- | :--- | :--- | :--- | :--- |
| 画布底色 | `var(--canvas-bg)` | `#faf9f6` | `#171716` | 主对话阅读区、设置主背景 |
| 侧栏底色 | `var(--sidebar-bg)` | `#f2f1ed` | `#121211` | 左侧会话栏、设置左侧导航 |
| 一级卡片 / 浮层 | `var(--surface-elevated)` | `#ffffff` | `#222221` | Inspector 顶层卡片、Popover 面板、输入框主体、独立子任务卡 |
| 二级内嵌槽位 | `var(--surface-soft)` | `#f0efeb` | `#252524` | 卡片内部的概览子卡、代码块底色、空状态底框、表头或统计槽 |
| 悬停 / 选中 | `var(--surface-hover)` / `var(--surface-selected)` | `#e8e6e0` / `#e6e3dc` | `#30302e` / `#343330` | 列表项悬停、当前激活会话或选项 |

- **表面交替铁律**：当卡片内部需要再分组时，外层用 `--surface-elevated`，内层子块必须用 `--surface-soft`（反之亦然），通过明度差建立秩序。
- **反套娃铁律**：严禁出现「外层带边框大卡片 → 中层带边框分组卡 → 内层带边框表单卡」的 3 层以上无意义边框套娃（尤其是在 `SettingsModal` 中，右侧页面级容器不得再包裹多余的外层 `.settings-card`）。

---

## 3. 字体、排版与数据对齐规范

### 3.1 字体与字号

- **正文与标题（`--font-sans`）**：界面标题、按钮、说明文案使用无衬线字体。
- **技术标识与数值（`--font-mono`）**：模型 ID、工作区路径、Git 分支、步骤序号（`01`、`#1`）、Token 数量、价格（`$0.0124`）、速率（`42.5 tok/s`）、耗时与百分比，**一律使用 `var(--font-mono)` 并搭配 `font-variant-numeric: tabular-nums`**，保证数字纵向对齐且更新时不抖动。
- **禁止通过缩小正文字号塞内容**：窄屏或高密度区域通过折叠次要信息、优化布局换行来适配，不得将阅读正文缩得小于规范值。

### 3.2 键值列表（`<dl>` / `<dt>` / `<dd>`）防挤压铁律

在弹窗（如 `UsagePopover`）或详情栏（`Inspector` `.wb-kv`）中使用 `<dl>` 渲染左右对齐的「指标名 + 指标值」时：

- **严禁使用 `grid-template-columns: minmax(0, 1fr) auto`**：当右侧 `<dd>` 包含较长的费用拆解或速率文本时，`auto` 列会无限扩张，将左侧 `<dt>` 挤压成 1 个汉字宽度的竖排（如「上 / 下 / 文 / 占 / 用」）。
- **必须使用 `grid-template-columns: auto minmax(0, 1fr)`**：
  - `<dt>` 必须设置 `white-space: nowrap`，保证左侧标签永远单行完整显示。
  - `<dd>` 设置 `min-width: 0; text-align: right; overflow-wrap: anywhere`。
  - 当 `<dd>` 同时包含「主数值」和「次级公式/拆解说明」（例如 `$0.0042` 与 `$3/M · 1,400 tok`）时，必须使用纵向堆叠容器（如 `.usage-dd-stack` + `.usage-dd-sub`），将主数值放在第一行加粗，次级说明放在第二行弱化显示，不得强行拼成超长单行。

### 3.3 弹性盒与网格防溢出

- 所有包含可变文本（会话标题、文件路径、模型名称、计划步骤）的 Flex/Grid 子元素，**必须设置 `min-width: 0`**。
- 单行省略使用 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`（或 `-webkit-line-clamp: 1`），并保留 `title` 属性供悬停查看完整内容。

---

## 4. 核心区域与组件设计规范

### 4.1 表单与选择器（严禁使用浏览器原生 `<select>` 与裸复选框）

- **禁止原生 `<select>`**：原生下拉菜单会弹出操作系统级菜单，完全脱离工作台主题与字体。所有下拉选择必须使用工作台自定义无障碍下拉组件（如 `SettingsSelect`：`.settings-select-trigger` + `.settings-select-popover` + `.settings-select-option`，或底部栏 `ComposerDropdown`），并支持：
  - `role="listbox"` / `role="option"` 与 `aria-expanded`
  - 当前选中项勾选标记与可选副标题/描述
  - 点击外部关闭、`Escape` 关闭（且不误关外层 Modal）、方向键导航
- **禁止裸 `<input type="checkbox">`**：布尔配置项统一使用结构化的开关卡片（`.settings-toggle-card`）或自定义胶囊切换器，左侧展示标题与功能解释，右侧展示开关状态。
- **避免内联样式（Inline Styles）**：除动态计算的宽度百分比（如 `style={{ width: `${percent}%` }}`）或虚拟列表偏移量外，严禁在 JSX 中堆砌 `style={{ display: "flex", fontSize: "11px", ... }}`，一律写入对应 CSS 模块并复用语义类名。

### 4.2 会话输入框（`Composer`）与执行态表现

- **垂直高度稳定铁律**：当会话在「空闲 ↔ 正在执行」之间切换时，**严禁在输入框上方动态挂载/卸载独立的文字提示横幅行**（会导致上方对话流与输入框整体上下跳动）。
- **执行态动画合成到上下文进度条**：
  - 会话执行状态直接体现在底部工具栏的**上下文用量胶囊（`UsagePopover` `.usage-trigger-pill`）**上。
  - 当 `isRunning` 为真时，`.usage-trigger-pill.is-running` 与 `.usage-mini-track.is-running` 启动平滑流光/脉冲动画（即使新会话上下文占用为 `0%`，空进度槽也会呈现赤陶色往返流光动画），无需额外占用一行文字高度。
- **运行中插话（Steer）与队列（Queue）交互**：
  - 会话运行中且输入框有内容时，右侧操作区同时提供语义清晰的**「插话转向」**与**「加入队列」**按钮（及快捷键提示），不再把次要操作藏入难以发现的二级小箭头。
  - 待发送队列展示在输入框上方的内嵌折叠托盘（`.composer-queue-tray`）中，每条队列消息支持**「立即转向」**、**「编辑」**与**「移除」**。

### 4.3 上下文与用量详情弹窗（`UsagePopover`）

- **结构层次**：
  1. **顶部标题栏**：左侧标题 + 模型名称胶囊，右侧模型价格档位徽章（输入/缓存/输出每百万 Token 单价）或未配置提示。
  2. **双色分段进度条**：直观区分「未缓存输入（赤陶色 `--accent`）」与「缓存命中输入（鼠尾草绿 `--success`）」占上下文窗口的比例，并配图例。
  3. **四宫格核心指标卡（`.usage-stat-grid`）**：总 Token、本轮/累计估算费用、输出生成速率（TPS，`tok/s`）、最近响应耗时（自动格式化 `ms` / `s` / `Xm Ys`）。
  4. **分项明细列表**：按「上下文与缓存」「Token 与费用拆解」「执行性能」分组，严格遵守 3.2 节的 `<dl>` 防挤压规范。

### 4.4 右侧详情栏（`Inspector`：计划与进度 / 子任务 / 文件 / 会话信息）

- **顶层与二级导航**：
  - 顶部主 Tab（`计划与进度`、`文件`、`会话信息`）与二级胶囊 SubTab（`.inspector-subtabs`）使用滑块指示器，激活态徽章（`.inspector-tab-badge-num`）采用赤陶浅底与半透明赤陶边框。
- **统一卡片骨架（`.inspector-section`）**：
  - 顶层区域使用 `.inspector-section`（`--surface-elevated` 底色 + `1px solid var(--border-subtle)` 边框 + `8px` 圆角）。
  - 卡片头部 `.inspector-card-header` 包含左侧 `.inspector-title-row`（`14px` 粗体图标 + `h3` 标题 + 可选计数胶囊）与右侧状态徽章/操作按钮，底部带 `1px` 分隔线。
- **计划与进度（`PlanProgressPanel` / `PlanDocumentPanel` / `PlanSteps`）**：
  - **概览子卡片（`.inspector-plan-summary-card`）**：使用 `--surface-soft` 底色，顶部展示 `当前计划` 标签、计划标题与对齐的百分比；中部为分段进度条（已完成 `--success` + 进行中 `--accent`）；底部为 `已完成` / `进行中` / `待处理` 状态胶囊。
  - **步骤时间线（`ol.wb-plan-progress`）**：
    - 保持 `gap: 0`，左侧 `14×14px` 状态圆点（`.plan-status`）通过 `li::before` 竖线连接。
    - **严禁在 `.plan-pending` 圆圈内放置 `○` 字符**（会导致边框圆圈内再套一个字符圆圈，形成靶心伪影）：已完成使用矢量 `<Check />` 图标（绿底 `--success`），进行中使用外环 + 中心实心圆点 `.plan-status-dot`（赤陶色 `--accent`），待处理保持干净的 `1.5px` 空心圆环。
    - 右侧 `.plan-step-row` 包含等宽两位序号（`01`、`02`）、步骤文本及进行中步骤的暖色高亮底框与 `当前步骤` 标签。
  - **历史计划（`.inspector-plan-history-card`）**：在 `Plan` 视图底部以结构化折叠卡片展示，`<summary>` 左侧展示 `计划 N` 徽章与标题，右侧展示完成进度胶囊；展开内容中步骤列表与 Markdown 说明之间用虚线分隔。
- **子任务区域（`SubAgentsPanel` / `SubAgentActivity`）**：
  - 每张子任务卡（`.child-session-card`）左侧带 `2.5px` 语义状态边条（运行中 `--accent`、已完成 `--success`、失败/中断 `--danger`）。
  - 头部包含 `#1` 等宽序号徽章、带外链图标的单行可点击标题按钮、智能体角色徽章（`.child-role-badge`）、等待答疑胶囊（`.child-advisor-pill`，仅在父运行活跃且 `run_started.budget.rootRunId` 与请求 `parentRunId` 匹配时为动态脉冲；这是 Core 协调身份，不能与 Web 传输 `runId` 比较，历史或缺失活跃运行身份时显示不可控制状态）、语义状态徽章及运行中取消按钮。
  - 内容区展示模型胶囊、Token 消耗、更新时间、职责范围（Ownership）、最新报告摘要，以及带脉冲圆点的实时进展和可折叠过程记录。
  - 查看子会话时，上下文卡片（`.inspector-agent-profile-card`）展示完整智能体角色快照（名称、ID、权限上限、工作树隔离、模型策略、工具策略）。
  - 集中答疑区域（`.inspector-advisor-section`）：集中展示该父任务下所有子代理发起的答疑与协调请求（`pending`/`answered`/`cancelled`/`expired`/`interrupted`），如实区分“已在主会话保存，等待子代理同步确认”与“已投递到子代理（带 deliveredAt 时间戳）”，真实反映在线与历史不可控制状态，并附带主代理自动答复的实事求是说明。
- **空状态规范（Empty States）**：
  - 当计划、子任务、记忆或说明文档为空时，**严禁只渲染一行裸 `<p className="wb-muted">`**。
  - 统一使用虚线柔和容器（`.inspector-plan-empty` / `.inspector-subagents-empty`：`background: var(--surface-soft); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md)`），包含主状态说明与次级引导提示。

### 4.5 工作区选择弹窗（`WorkspacePicker`）与设置中心（`SettingsModal`）

- **工作区选择弹窗**：提供「最近使用工作区」一键切换、可点击路径面包屑、实时目录过滤、内联新建文件夹输入行，以及底部清晰的当前选中路径确认栏。
- **设置中心（模型连接、外观、执行与权限、智能体、上下文与记忆、语言服务）**：
  - 左侧分类导航与右侧内容区分离；右侧直接展示章节标题与功能面板卡（`.settings-panel-card`），**不套最外层冗余大框**。
  - 批量导入/导出、路由组列表、策略矩阵与压缩阈值均采用结构化卡片网格、状态徽章与自定义下拉/分段控件。
  - **智能体管理（`AgentProfilesPanel`）**：
    - 提供角色列表、一键新建、从预置模板添加（探索/前端/后端/代码审查）、编辑、复制、启停与带安全二次确认的删除。
    - 字段包含 ID、名称、简要描述、适用场景（whenToUse）、系统指令（instructions）、模型绑定（继承主模型或绑定已配置 Provider 来源与精确模型 ID，禁止虚构 fallback）、权限上限（readonly/workspace/unrestricted，明确提示权限绝不突破宿主）、工作树隔离（shared/worktree，明确提示非 OS 沙箱）、工具组限定策略（inherit/restricted）及 MCP 白名单。
    - 固定模型优先通过「已配置模型」下拉选择，复用 `selectableModelIds` 与所选来源的 `modelSelection` 可见性规则；模型与来源必须成对保存。仅在显式选择手动、无可选模型或保留旧未列出绑定时显示 ID 输入，不得要求用户重复录入已有模型。切换来源重新选择新来源可选值，读取已有配置则保留原绑定，不按远端目录或主模型静默回退。
    - 具备版本冲突保护（保留草稿，提供拉取最新配置与放弃修改选项）、未保存草稿全局离开拦截（分类切换、搜索、关闭防护）、保存繁忙态锁定保护，以及旧配置缺省兼容。禁止使用原生 select 与裸 checkbox，采用全键盘与读屏支持的 `SettingsSelect` 与 `SettingsToggleCard`。

---

## 5. 空间尺度、响应式断点与品牌资源

- **桌面尺度**：标题栏高度 `44px`，主阅读列最大宽度 `760px`，左侧栏 `264px`（`1001–1366px` 紧凑模式下为 `232px`），右侧详情栏基础宽度 `380px`（紧凑模式 `320px`）。宽屏详情栏收起后不接收指针与焦点。
- **响应式断点**：
  - `<= 1000px`：转为单列纵向工作台，通过顶部/底部导航切换对话与详情，左侧栏转为抽屉。
  - `<= 768px`：输入工具栏允许换行，触控目标不小于规范尺寸。
  - `390px`（手机视口）：所有弹窗、Popover（含 `UsagePopover`）、Inspector 卡片与设置页不得出现水平截断或横向滚动条。
- **品牌图标**：首页（`40px`）和侧栏（`32px`）共用 `ForgeMark` 与透明 [forge-mark-v3.png](../src/renderer/public/forge-mark-v3.png)，不另加底板或滤镜；与品牌文字并列时图片使用空 `alt`；标签页使用 [64px favicon](../src/renderer/public/forge-favicon-v3.png)。

---

## 6. 修改 UI 后的必检清单（Agent 验收契约）

每次完成界面或样式修改后，必须在真实浏览器（Playwright Chromium）与聚焦测试中完成以下核对：

1. **色彩合规**：检查是否误用 `--accent-sage` 表示绿色、是否混入 `#16a34a` 亮绿或 `rgba(59, 130, 246, ...)` 蓝色、是否有红绿直接渐变。
2. **控件合规**：检查是否引入了原生 `<select>`、裸 `<input type="checkbox">`、无表面对比的同色卡片堆叠或冗余的 3 层边框套娃。
3. **极端文本防崩**：检查长工作区路径、长模型名、多段费用/TPS 公式下，`<dl>` 标签列是否保持 `nowrap` 不竖排、卡片是否无水平溢出。
4. **聚焦测试与构建**：
   ```sh
   pnpm exec vitest run tests/renderer/inspector-layout-mounted.test.ts \
     tests/renderer/new-session-mounted.test.ts tests/renderer/new-session-layout-mounted.test.ts
   pnpm build
   ```
5. **多视口与明暗主题实测**：在无头浏览器中检查 **浅色（Light）+ 深色（Dark）** 以及 **390px（手机）/ 1440px（桌面）** 的真实渲染截图（切换主题截图时关闭动画 `animations: "disabled"`），确认无布局崩坏后再提交。
