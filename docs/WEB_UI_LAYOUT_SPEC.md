# Forge Web UI 设计规范与组件约定

本规范是 `forge-web-ui` 的唯一视觉与交互设计准则。所有代理（Agent）和开发者在新增或修改任何 React 组件、样式表或弹窗前，**必须先阅读并遵守本规范**，严禁脱离本规范自行发明配色、堆叠边框或退回浏览器原生简陋控件。

启动与进程边界见 [WEB_DEV.md](WEB_DEV.md)；内置浏览器插件见 [PLUGINS_AND_BROWSER.md](PLUGINS_AND_BROWSER.md)；某个 token 或尺寸的当前生效值、以及本文与实现的已知偏差，见 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)。

---

## 1. 核心美学与样式加载层级

Forge Web 采用 **浅色「暖纸墨色（Warm Paper & Ink）」/ 深色「石墨暗色（Graphite Dark）」** 工作台美学，克制、温润、高信息密度，强调长时阅读与多任务协作的秩序感。

### 1.1 样式文件分工

生产入口由 [main.tsx](../src/renderer/main.tsx) 按顺序装配样式。Token 只有一个来源：刻度在 `tokens.css`，颜色在 `workspace-theme.css`，两者不再互相覆盖：

1. [tokens.css](../src/renderer/styles/tokens.css)：字体栈、字号阶梯（`--text-2xs` 11px 起）、行高、4px 间距刻度、圆角刻度（`--radius-2xs` … `--radius-full`）、布局尺寸与动效时长。不放任何颜色。
2. [workspace-theme.css](../src/renderer/styles/workspace-theme.css)：唯一的颜色来源（浅色 / 深色两套：表面、五级墨色、边框、主强调、焦点、状态色、阴影、图表色），其后是工作台级的组件覆盖规则。
3. [sidebar-compact.css](../src/renderer/styles/sidebar-compact.css) 与 [app.css](../src/renderer/components/workbench/app.css)：负责主框架、侧栏紧凑密度与响应式断点。
4. [design-foundation.css](../src/renderer/styles/design-foundation.css)：共享动画和基础控件外观，只引用上述 token，不再覆盖 token。
5. 组件级样式（`composer-*.css`、`inspector.css`、`settings.css`、`usage-popover.css`、`tool-disclosure.css` 等）：负责具体业务区域的细节呈现。
6. 已迁移区域的新样式在 `styles/surfaces/*.css`（UI 迁移阶段 2a 起，目前是 `composer.css`）：由 `ui.css` 内联，落在 Tailwind 的 `@layer components`，按层序压过 `@layer legacy` 的旧规则；被替换的旧规则同步删除，避免未覆盖的属性漏过来。新的组件 JSX 优先直接写 Tailwind 工具类；受保护文件（如 `Composer.tsx`）通过原有 class 钩子在 surfaces 里换皮。

---

## 2. 色彩与 Token 铁律（最高频踩坑点）

修改样式时**必须使用 CSS 变量或基于变量的 `color-mix()`**，严禁硬编码脱离主题的十六进制/RGB 颜色。

### 2.1 主强调色 vs 完成/成功色

> 调色板：**雾紫 Iris**（UI 迁移阶段 1，2026-11-10 起）。交互控件边框 `--border-control` 浅 `#85878f` / 深 `#6a6b73`，对画布、侧栏、卡片、内嵌槽位均 ≥ 3:1（WCAG 1.4.11）；装饰分隔线 `--border-subtle` 保持淡色。

| 语义场景 | 必须使用的 Token | 浅色实际值 | 深色实际值 | 严禁使用的错误写法 |
| :--- | :--- | :--- | :--- | :--- |
| **主强调 / 进行中 / 激活** | `var(--accent)`、`var(--accent-soft)`、`var(--on-accent)` | `#4f45db`（雾紫 Iris） | `#9ba0ff` | 只经 token 引用；严禁硬编码 Tailwind 蓝 `#3b82f6` / `#2563eb` / `rgba(59, 130, 246, ...)` |
| **键盘焦点 / 输入聚焦** | `var(--focus-ring)`、`var(--focus-halo)` | `#696bf4`（亮雾紫） | `#8d90ff` | 焦点只用 `--focus-ring`，不要用 `--error` 系；与错误红不同色相，对所有底色 ≥ 3:1 |
| **已完成 / 成功 / 正常 / 缓存命中** | `var(--success)`、`var(--success-bg)`、`var(--success-border)` | `#027e47` | `#59c886` | 严禁硬编码刺眼亮绿 `#16a34a` |
| **警告 / 待确认 / 队列提示** | `var(--warning)`、`var(--warning-bg)`、`var(--warning-border)` | `#925601` | `#eeb154` | 严禁使用无对比度的纯黄 `#ffff00` |
| **错误 / 失败 / 危险操作** | `var(--error)`、`var(--error-bg)`、`var(--error-border)` | `#d61b2a` | `#f0555b` | 严禁使用纯红 `#ff0000`；`--danger` 已移除 |

> 旧的 `--accent-sage`（名为绿、值为赤陶）已移除。需要「绿色」表示步骤完成、任务成功或连接正常时，使用 `var(--success)` 或 `color-mix(in srgb, var(--success) XX%, transparent)`；token 均全局定义，`var()` 不需要写十六进制 fallback。

### 2.2 严禁出现原生蓝（Off-Brand Blue）与脏渐变

- **禁止硬编码蓝色**：Iris 调色板的蓝紫只通过 `--accent` / `--focus-ring` / `--info` 等 token 出现。严禁在边框、阴影、徽章或 fallback 中写入 `rgba(59, 130, 246, ...)`、`#2563eb`、`#3b82f6` 等字面量。半透明主色边框统一写为 `color-mix(in srgb, var(--accent) 24%, transparent)`。
- **禁止跨色相红绿渐变**：严禁编写 `linear-gradient(90deg, var(--accent) 0%, var(--success) 100%)`（主色到绿色会在中间产生浑浊的过渡色）。多状态进度条必须采用**分段拼接（Segmented Track）**：已完成段使用 `var(--success)`，进行中/缓存段紧随其后使用 `var(--accent)`。

### 2.3 表面层级（Surface Hierarchy）与反套娃原则

| 层级 | Token | 浅色值 | 深色值 | 典型用途 |
| :--- | :--- | :--- | :--- | :--- |
| 外壳 | `var(--surface-shell)` | `#eef0f4` | `#0a0b0f` | 应用最外层背景 |
| 画布底色 | `var(--canvas-bg)` | `#f9fafc` | `#0d0e12` | 主对话阅读区、设置主背景 |
| 侧栏底色 | `var(--sidebar-bg)` | `#f5f6f8` | `#090a0e` | 左侧会话栏、设置左侧导航 |
| 一级卡片 / 浮层 | `var(--surface-elevated)` | `#ffffff` | `#14151a` | 卡片、Popover、输入框主体 |
| 抬升层 | `var(--surface-raised)` | `#ffffff` | `#1b1c23` | 卡片上的悬停态、浮层内的突出块 |
| 二级内嵌槽位 | `var(--surface-soft)` | `#f1f2f6` | `#1d1e23` | 卡片内子块、代码块、空状态底框 |
| 下沉槽位 | `var(--surface-sunken)` | `#f3f4f7` | `#0f1015` | 输入槽、进度条底轨 |
| 悬停 / 按下 / 选中 | `--surface-hover` / `--surface-active` / `--surface-selected` | `#edeffc` / `#e3e5f7` / `#e7e9f3` | `#23243a` / `#292b44` / `#1b1d2c` | 列表项、菜单项、幽灵按钮 |

- **边框**：`--border-subtle`（分隔线、卡片描边）→ `--border-control`（输入框、次按钮）→ `--border-hover`（悬停）→ `--border-strong`（强调），统一取 Iris 冷灰阶，不写死灰色。
- **阴影**：只用 `--shadow-xs / sm / card / composer / dropdown / overlay` 六档；浮层（下拉、Popover）用 `--shadow-dropdown`，对话框用 `--shadow-overlay`。卡片顶部可叠加 `var(--edge-highlight)`。
- **主色衍生**：浅底 `--accent-subtle`（9%）、选中底 `--accent-soft`、描边 `--accent-border`、光晕 `--accent-glow`，都由 Iris `--accent` 经 `color-mix` 派生。主色按钮用 `.btn-accent`（`--accent` 底 + `--on-accent` 字）。

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

- **禁止原生 `<select>`**：原生下拉菜单会弹出操作系统级菜单，完全脱离工作台主题与字体。所有下拉选择必须使用 `components/primitives/Select.tsx`（基于 Radix Select：触发器 `role="combobox"`、选项 `role="option"`，样式在 `select.css`），或底部栏 `ComposerDropdown`；复选框同理使用 `Checkbox`（Radix，`checkbox.css`）。二者均支持：
  - `role="listbox"` / `role="option"` 与 `aria-expanded`
  - 当前选中项勾选标记与可选副标题/描述
  - 点击外部关闭、`Escape` 关闭（且不误关外层 Modal）、方向键导航
- **禁止裸 `<input type="checkbox">`**：布尔配置项统一使用结构化的开关卡片（`.settings-toggle-card`）或自定义胶囊切换器，左侧展示标题与功能解释，右侧展示开关状态。
- **避免内联样式（Inline Styles）**：除动态计算的宽度百分比（如 `style={{ width: `${percent}%` }}`）或虚拟列表偏移量外，严禁在 JSX 中堆砌 `style={{ display: "flex", fontSize: "11px", ... }}`，一律写入对应 CSS 模块并复用语义类名。

### 4.2 会话输入框（`Composer`）与执行态表现

- **阶段 2a 重做（2026-11-10）**：新会话页（`Welcome`）与输入区的外观在 `styles/surfaces/composer.css` 与组件内 Tailwind 工具类中；行为、键盘、ARIA 与测试依赖的 class/几何（续写输入框 36px、新会话输入框 100px、发送键 44px、新会话输入框距底 24px）保持不变。上下文分段色使用 `--context-instructions` / `--context-memory` / `--context-conversation` / `--context-tools` token。
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

### 4.4 右侧详情栏（`Inspector`：概要 + 下钻视图）

- **默认收起**：桌面端优先展示对话区，通过标题栏「详情」打开；改变窗口宽度不主动展开空面板。后台任务出现新的待批准操作时仍自动揭示详情。
- **一页概要，没有标签页**：详情栏首屏是一张可滚动的概要卡（`.inspector-summary`），依次是「进度」「子任务」「父任务」「文件」「会话」几个分区。**没有内容的分区不渲染**（没有计划就不显示进度，没有子任务就不显示子任务）。不再使用主 Tab 与二级 SubTab。
- **统一分区头**：每个分区用 `SummarySection`，头部是「标题 计数 ⌄」（`.inspector-summary-toggle`，按钮的可访问名称即「标题 计数」，例如 `进度 1/3`），右侧可带一个文字链接（`.inspector-summary-link`，如「说明与历史」「详情」「查看变更」）进入对应下钻视图。
- **统一行结构**：分区内的列表一律用 `SummaryRow`：`图标 文字 元信息 ›`（`.inspector-row`），行高 32px，13px 字号；可点击的行悬停显示 `›`。计划步骤、子任务、变更文件、更多工具都用这一种行，不另造卡片样式。
  - 计划步骤：左侧 14×14px 状态圆（已完成绿底 `<Check />`、进行中赤陶外环 + 中心点、待处理空心环，**圆圈内不放 `○` 字符**），已完成步骤文字划线并降为 muted；概要里不显示序号与「当前步骤」标签。
  - 子任务：左侧 7px 状态点（完成 `--success`、运行中 `--accent` 呼吸、失败 `--error`），右侧元信息为智能体角色名；点击打开子会话。
  - 变更文件：只显示文件名，路径放在 `title`；元信息为 `+N -N`，无 diff 统计时显示「新增 / 已改 / 已删」。
- **会话事实**：「会话」分区用 `<dl class="inspector-facts">`（`auto minmax(0, 1fr)`，`dt` 不换行）只列模型、权限、工作区三项；工作区显示末级目录名，完整路径放在 `title`。
- **更多工具**：概要底部的「更多」列表提供工作区文件、变更与检查点、上下文与用量、浏览器、项目资源，以及「刷新记录」。下钻时头部显示返回按钮（`aria-label="返回概要"`，打开后获得焦点）和视图标题；**视图标题只出现一次**，下钻内容自身不再重复同名标题。计划说明与历史计划、子任务详情（智能体快照、答疑与协调）也是下钻视图，从对应分区头的链接进入。
- **工作区资源**：工作区文件、项目资源打开独立 `WorkspaceResourcesDialog`；其中「查看变更」仍能定位到当前会话的变更下钻。
- **状态与协作**：分区展开状态按会话保留，未操作时使用运行中/已结束的默认值；需要处理区置顶展示失败子任务、超级智能体发送队列与建议，Router 的工作项在子任务区展示。
- **按需加载**：上下文统计（`getDiagnostics`）与浏览器状态探测只在对应下钻视图打开时请求；概要页不触发这些请求。切换会话时保持当前视图，下钻内容跟随新会话重新读取。
- **待批准**：待批准汇总（`.wb-approvals-summary`）始终置顶于概要之上，不收进任何分区。当前会话的请求只提供「定位到消息流」，其他会话与子代理的请求在此给出完整审批面板。
- **空状态**：没有任何分区内容时显示一行说明「执行计划、子任务和文件变更出现后会显示在这里」；下钻视图内的空列表沿用虚线引导卡片（`.inspector-plan-empty` / `.inspector-empty-card` / `.inspector-subagents-empty`），不只渲染一行裸 `<p>`。
- **子任务下钻（`SubAgentsPanel` / `SubAgentActivity`）**：子任务卡左侧语义状态边条、`#1` 序号、角色徽章、等待答疑胶囊（仅当父运行活跃且 `run_started.budget.rootRunId` 与请求 `parentRunId` 匹配时为动态脉冲；这是 Core 协调身份，不能与 Web 传输 `runId` 比较）、状态徽章与运行中取消按钮保持不变；集中答疑区域如实区分“已在主会话保存，等待子代理同步确认”与“已投递到子代理”。

### 4.5 工作区选择弹窗（`WorkspacePicker`）与设置中心（`Settings`）

- **工作区选择弹窗**：提供「最近使用工作区」一键切换、可点击路径面包屑、实时目录过滤、内联新建文件夹输入行，以及底部清晰的当前选中路径确认栏。
- **模型连接页（v2，`settings-v2.css`）**：
  - 页头只有标题与一行说明；模型服务已保存时不显示状态胶囊，只在未添加或读取中时显示。左侧导航底部的本机说明是一行灰字，不是卡片。
  - 模型列表的来源切换是分段控件（`.provider-source-tabs`），仅显示来源名称。默认来源标记在来源列表中。
  - 来源摘要是标题加一行事实：端点（去掉协议头）· 协议 · 可选模型数量；只在多于一个凭据时显示凭据数。徽标只保留需要用户处理的状态：默认、无密钥、目录已过期。刷新是图标按钮（保留 `aria-label`），编辑是带文字的按钮；删除在来源编辑器内确认。
  - 模型列表是一张卡里的若干紧凑行（`.configured-model-card`）：每行「模型 ID　参数摘要　默认/设为默认 ×」。点击摘要行打开 `ModelEditDialog`，独立编辑参数并保存；保留来源修订冲突保护、旧窗口配置迁移与失败反馈。
  - 来源列表保留默认模型选择和编辑入口，模型列表上方用分段控件切换来源；来源刷新为图标按钮，删除在来源编辑器内确认。
  - 全局默认思考等级是一条分段控件，选择后自动保存并显示保存状态；不使用两行卡片网格。
- **设置中心（模型连接、外观、执行与权限、智能体、上下文与记忆、语言服务）**：
  - 左侧分类导航与右侧内容区分离；右侧直接展示章节标题与功能面板卡（`.settings-panel-card`），**不套最外层冗余大框**。
  - 批量导入/导出、路由组列表、策略矩阵与压缩阈值均采用结构化卡片网格、状态徽章与自定义下拉/分段控件。
  - **智能体管理（`AgentProfilesPanel`）**：
    - 提供角色列表、一键新建、从预置模板添加（探索/前端/后端/代码审查）、编辑、复制、启停与带安全二次确认的删除。
    - 字段包含 ID、名称、简要描述、适用场景（whenToUse）、系统指令（instructions）、模型绑定（继承主模型或绑定已配置 Provider 来源与精确模型 ID，禁止虚构 fallback）、权限策略（默认继承主会话权限，readonly 额外只读，workspace 工作区逐次审批，旧配置不自动放宽）、工作树隔离（shared/worktree，明确提示非 OS 沙箱）、工具组限定策略（inherit/restricted）及 MCP 白名单。
    - 固定模型优先通过「已配置模型」下拉选择，复用 `selectableModelIds` 与所选来源的 `modelSelection` 可见性规则；模型与来源必须成对保存。仅在显式选择手动、无可选模型或保留旧未列出绑定时显示 ID 输入，不得要求用户重复录入已有模型。切换来源重新选择新来源可选值，读取已有配置则保留原绑定，不按远端目录或主模型静默回退。
    - 具备版本冲突保护（保留草稿，提供拉取最新配置与放弃修改选项）、未保存草稿全局离开拦截（分类切换、搜索、关闭防护）、保存繁忙态锁定保护，以及旧配置缺省兼容。禁止使用原生 select 与裸 checkbox，采用全键盘与读屏支持的 `SettingsSelect` 与 `SettingsToggleCard`。

---

## 4.6 动画与动效（v2）

动画要流畅、可感知，但不抢内容。只使用 `tokens.css` 中的动效 token 和 `design-foundation.css` 中的关键帧，不在组件里另写曲线或时长。

| Token | 值 | 用途 |
| :--- | :--- | :--- |
| `--dur-micro` | 120ms | 悬停、按下、颜色变化 |
| `--dur-short` | 180ms | Popover、下拉、开关、Tooltip |
| `--dur-medium` | 260ms | 对话框、面板展开、折叠区、列表入场 |
| `--dur-long` | 380ms | 页面切换、侧栏/详情栏大幅位移 |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | 所有入场 |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | 状态互换、位置移动 |
| `--ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | 离场（离场时长取入场的 70%） |
| `--ease-spring` | `cubic-bezier(0.34, 1.32, 0.64, 1)` | 小元素的物理反馈（勾选、徽标弹出），过冲不超过 4% |

- **共享关键帧**：`fx-pop-in`（浮层：上移 6px + 缩放 0.97 → 1）、`fx-pop-in-down`（向下展开的浮层）、`fx-rise`（内容入场：上移 10px）、`fx-fade`、`fx-slide-in-right`（右侧面板）、`fx-shimmer`（骨架屏、思考中文字）、`fx-breathe`（执行中的主色呼吸光晕）。
- **工具类**：`.fx-pop-in`、`.fx-rise`、`.fx-fade`、`.fx-skeleton`；列表入场用 `.fx-stagger`，子元素设置 `--i` 序号，每项延迟 32ms，最多 8 项。
- **只动画 `transform` 与 `opacity`**（以及颜色、阴影）；不动画 `width`、`height`、`top`、`left`。折叠区用 `grid-template-rows: 0fr → 1fr`。
- **按下反馈**：按钮与可点击卡片 `:active` 缩放到 0.97–0.98；悬停只改颜色与阴影，不位移超过 1px。
- **焦点**：键盘焦点用 `outline: 2px solid var(--focus-ring)`；输入框聚焦用中性 `--focus-ring` 描边和 `--focus-halo` 光晕。程序设置焦点的非交互元素（`tabindex="-1"` 的标题、区域）不显示焦点环。
- **减少动态效果**：`prefers-reduced-motion: reduce` 时所有时长 token 归零，循环动画停止；新增的循环动画必须在该媒体查询中关闭。
- **固定定位浮层**：390px 手机视口的 `position: fixed` 浮层，其祖先不得带 `transform`，否则会改变定位参照。
- **模型选择器（`model-picker-v2.css`）**：面板从触发按钮一侧缩放淡入（`--dur-short`）；进入模型目录时新视图从右侧滑入，返回时设置视图从左侧滑入（`--dur-medium`），首次打开不滑动。思考等级填充条用 `transform: scaleX()` 而不是宽度，切换档位时平滑过渡；轨道上每个档位有刻度点，已达到的点放大点亮；档位读数每次变化重新入场；拖动滑块时手柄外圈出现主色光晕。目录项以 24ms 间隔依次入场（最多 8 项），当前项的勾弹出；触发按钮上的档位条依次填充。`prefers-reduced-motion` 下全部关闭。只有带厂商前缀的模型才在名称下重复完整 ID。

### 4.7 对话区（`Transcript`）

- **阅读模型**：用户请求是右对齐的柔和气泡（`--surface-active` 底色、无边框、最大宽度 `min(84%, 620px)`，390px 下 92%），不带「你」作者行；助手回复是左侧无框正文。已完成的回答不显示作者行，只有正在生成（「正在回复」，带流光文字）或未完成（「回复未完成」）时显示一行小字状态。
- **不显示轮次控件**：不渲染「第 N 轮」徽章与「收起本轮」按钮；一轮就是用户请求加随后的工作与回答。
- **执行摘要**：已完成的一轮把过程折叠在一行摘要后：`工作了 22s · 4 个操作 ⌄`（`.transcript-execution-summary`，13px，`--text-muted`，无边框无底色，悬停浅底）。「操作」只计工具调用。步数、工具次数、重试、总耗时口径与 `tok/s` 输出速度只放在摘要按钮的 `title` 里，不进入阅读流。运行中或未完成的一轮直接展示过程，不显示计数行。
- **工具行**：写成「动作 · 目标」（13px，动作 `--text-secondary`、目标 `--text-muted`，目标不用等宽字体），行内无边框。耗时与成功的勾只在悬停或展开时显示；运行中、失败（保留错误底色与「失败」字样）和 `+N -N` 始终可见。
- **复制**：整段回答的「复制」放在回答末尾（`.message-actions`），细指针设备悬停回答时出现，触屏常显。
- **字号**：对话正文 16px，用户气泡 15px，过程叙述与工具行 13–15px，状态小字 12px。等宽字体只用于代码、命令与路径值。

---

## 5. 空间尺度、响应式断点与品牌资源

- **桌面尺度**：标题栏高度 `44px`，主阅读列最大宽度 `760px`，左侧栏 `264px`（`1001–1366px` 紧凑模式下为 `232px`），右侧详情栏基础宽度 `380px`（紧凑模式 `320px`）。宽屏详情栏收起后不接收指针与焦点。
- **左侧会话栏**：工作区分组头是一行灰色小标题「名称 计数」（12px、`--text-muted`，无文件夹图标与计数胶囊），悬停或收起时显示折叠箭头。**每个会话行都带状态图标**（完成 `--success` 勾、运行中 `--accent` 旋转、待批准 `--warning`、失败 `--error`、中断/取消暂停、空闲聊天气泡），图标固定 16px 槽位，标题统一左对齐；选中行用 `--surface-active` 浅底，不加阴影。行高不超过 30px。
- **侧栏底部**：只放图标按钮（`.sidebar-icon-btn`，32px，触屏 44px）：设置、用量看板在左，刷新靠右；每个按钮都有 `aria-label` 与 `title`，不显示文字标签。**不单独显示模型服务状态行**：已保存服务端点时设置图标就是「设置」；尚未添加时设置按钮的名称为「添加模型服务」并带一个 `--warning` 小圆点；配置读取中名称为「正在加载配置」。这只表示是否保存了服务端点，不代表网络连通或全局默认模型就绪，不能用全局 `isConfigured` 把会话自带的来源误报为未连接。
- **响应式断点**：
  - `<= 1000px`：转为单列纵向工作台，通过顶部/底部导航切换对话与详情，左侧栏转为抽屉。
  - `<= 768px`：输入工具栏允许换行，触控目标不小于规范尺寸。
  - `390px`（手机视口）：所有弹窗、Popover（含 `UsagePopover`）、Inspector 概要与下钻视图、设置页不得出现水平截断或横向滚动条。
- **品牌图标**：首页（`40px`）和侧栏（`24px`）共用 `ForgeMark` 与透明 [forge-mark-v3.png](../src/renderer/public/forge-mark-v3.png)，不另加底板或滤镜；与品牌文字并列时图片使用空 `alt`；标签页使用 [64px favicon](../src/renderer/public/forge-favicon-v3.png)。

---

## 6. 修改 UI 后的必检清单（Agent 验收契约）

每次完成界面或样式修改后，必须在真实浏览器（Playwright Chromium）与聚焦测试中完成以下核对：

1. **Token 合规**：新增样式的颜色、阴影、圆角、动画时长与曲线全部来自 token；有新循环动画时已在 reduced-motion 中关闭。
1. **色彩与刻度合规**：运行 `pnpm lint:css` 与 `pnpm check:css-vars`，检查未定义变量和字面字号、圆角；确认没有红绿直接渐变。
2. **控件合规**：检查是否引入了原生 `<select>`、裸 `<input type="checkbox">`、无表面对比的同色卡片堆叠或冗余的 3 层边框套娃。
3. **极端文本防崩**：检查长工作区路径、长模型名、多段费用/TPS 公式下，`<dl>` 标签列是否保持 `nowrap` 不竖排、卡片是否无水平溢出。
4. **聚焦测试与构建**：
   ```sh
   pnpm exec vitest run tests/renderer/inspector-layout-mounted.test.ts \
     tests/renderer/new-session-mounted.test.ts tests/renderer/new-session-layout-mounted.test.ts
   pnpm build
   ```
5. **多视口与明暗主题实测**：在无头浏览器中检查 **浅色（Light）+ 深色（Dark）** 以及 **390px（手机）/ 1440px（桌面）** 的真实渲染截图（切换主题截图时关闭动画 `animations: "disabled"`），确认无布局崩坏后再提交。
