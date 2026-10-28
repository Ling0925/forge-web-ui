# Forge Web UI 设计系统

本文件是 `forge-web-ui` 的**设计与实现对照参考**：记录当前真实生效的视觉系统，以及实现与系统之间的已知偏差。

它与 [WEB_UI_LAYOUT_SPEC.md](WEB_UI_LAYOUT_SPEC.md) 的分工：

| 文档 | 性质 | 何时读 |
| :--- | :--- | :--- |
| **WEB_UI_LAYOUT_SPEC.md** | 规范。规定**必须怎么做**，是评审与验收的依据 | 动手改界面前的强制阅读 |
| **本文档（DESIGN_SYSTEM.md）** | 事实。记录**实际是什么**，含已测量到的偏差 | 需要知道某个值到底是多少、某处为什么这样时 |

两者冲突时，以规范为准，并应把偏差当作待修项记录到本文档的「已知偏差」小节。

> **测量口径**：本文所有颜色、对比度、字号与计数均从当前工作区源码计算，基线提交 `bb47644`。对比度按 WCAG 2.x sRGB 相对亮度公式计算。凡是「生效值」，指 CSS 层叠之后的最终结果，不是任一文件单独声明的值。
>
> **怎么用**：先读 §1（样式怎么装配）再读 §2–§5（颜色、排版、空间、布局），这四节定义一个界面的骨架；写具体组件时查 §6；动效与无障碍见 §7–§8；改动前对照 §9 的偏差表和 §10 的自检清单。

---

## 1. 样式如何装配（先读这一节）

### 1.1 载入顺序

样式不是单点引入，而是跟随模块图分三段加载。**后加载者覆盖先加载者**：

```
① main.tsx
   styles/global.css
     └─ @import styles/tokens.css          ← 字号 / 间距 / 圆角 / 语义色 / 别名
   styles/workspace-theme.css               ← 工作台最终主题：颜色、控件高度、阅读宽度
   styles/sidebar-compact.css

② components/workbench/App.tsx
   workbench.css → app.css → workbench-header.css
   → new-session.css → inspector.css → styles/motion.css

③ 各组件自行 import（Composer、Settings、UsagePopover、PluginPanel…）
   运行时按需追加；Settings / UsageDashboard / PrimitiveShowcase 是懒加载 chunk
```

**由此产生两个必须知道的事实：**

1. `tokens.css` 和 `workspace-theme.css` 对同一批变量各自声明了值。**生效的是 `workspace-theme.css`**，因为它在模块图中后执行。
2. 懒加载 chunk 在运行时追加，所以设置页、用量看板的样式表在首次打开后才进入层叠——这使它们内部的特异性更脆弱，改动时不能只按静态顺序推断。

### 1.2 单一颜色的来源并不单一

当前颜色被**两个文件共同拥有**，且分工随意：

| 归 `workspace-theme.css` | 归 `tokens.css` |
| :--- | :--- |
| `--canvas-bg`、`--sidebar-bg`、`--surface-*` | `--success*`、`--warning*`、`--error*` |
| `--text-*`、`--border-*` | `--shadow-*` |
| `--accent`、`--focus-ring`、`--link`、`--run-*` | 全部字号、间距、圆角刻度 |
| `--chart-series`、`--chart-heat` | `--inspector-width`、`--rail-width-compact`、`--touch-min-target` |
| `--header-height`、`--control-height*`、`--reading-measure`、`--composer-inset` | — |

`tokens.css` 中仍保留着一套**不会被渲染的**锌灰/翡翠色值（`--canvas-bg: #ffffff`、`--accent: #059669`、深色 `#0d1117` / `#34d399`）。修改颜色时必须改 `workspace-theme.css`，改 `tokens.css` 的颜色块不会生效。

> 这是当前系统最大的结构性问题，已列为待修项。在新结构确定前，**新增颜色 token 一律写入 `workspace-theme.css`**。

### 1.3 主题切换

- `<html data-theme="light|dark">`，由 `state/workbench-context.tsx:322-331` 在设置加载后写入；`system` 时监听 `prefers-color-scheme`。
- `index.html` 硬编码 `data-theme="dark"`，因此**浅色用户会先看到一帧深色**。CSP 禁止内联脚本，消除闪烁需要一个同源的小脚本 + 本地缓存上次解析结果（服务端设置仍是权威）。
- 图表不读 CSS，而是用 `getComputedStyle` 采样变量并在 `data-theme` 变化时重建（`charts/theme.ts`）。新增图表颜色必须走这条链路，不能写死在 ECharts option 里。

---

## 2. 颜色

### 2.1 表面层级

**规则：父子容器交替使用不同明度的表面，靠明度差建立秩序，不要靠叠边框。**

| 层级 | Token | 浅色 | 深色 | 用途 |
| :--- | :--- | :--- | :--- | :--- |
| 画布 | `--canvas-bg` | `#faf9f6` | `#171716` | 主阅读区、设置主背景 |
| 侧栏 | `--sidebar-bg` | `#f2f1ed` | `#121211` | 会话栏、设置左导航 |
| 外壳 | `--surface-shell` | `#eae9e4` | `#191918` | `html/body/#root` |
| 一级卡片 | `--surface-elevated` | `#ffffff` | `#222221` | 卡片、浮层、输入框主体 |
| 二级槽位 | `--surface-soft` | `#f0efeb` | `#252524` | 卡片内嵌块、代码块、用户消息块 |
| 悬停 | `--surface-hover` | `#e8e6e0` | `#30302e` | 列表项悬停 |
| 按下 | `--surface-active` | `#dedbd3` | `#3a3936` | — |
| 选中 | `--surface-selected` | `#e6e3dc` | `#343330` | 当前会话、当前选项 |

浅色下 `elevated` 与 `soft` 的 L\* 差为 5.58，`canvas` 与 `soft` 为 3.50；深色下 `elevated` 与 `soft` 仅差 **1.45**——深色的两级卡片几乎无法靠明度区分，实际依赖 1px 边框。作为对照，深色 `canvas` 与 `elevated` 差 5.49，说明这个值本身足够，问题出在两级卡片之间。

### 2.2 文字墨色

| Token | 浅色 | 深色 | 用途 |
| :--- | :--- | :--- | :--- |
| `--text-primary` | `#292824` | `#eeede8` | 正文、标题 |
| `--text-secondary` | `#68665f` | `#aaa79f` | 次要说明、作者行 |
| `--text-muted` | `#716e66` | `#aaa79f` | 元数据、占位符 |
| `--text-tertiary` | `#716e66` | `#aaa79f` | 同 muted |
| `--text-disabled` | `#716e66` | `#aaa79f` | 同 muted |

**已知缺陷：五级墨色实际只有三级。** 浅色下 muted / tertiary / disabled 完全相同，且与 secondary 只差 9 个单位；深色下 secondary 与 muted 也是同一个值。这意味着「禁用」在视觉上与「次要」无法区分。

### 2.3 强调与语义色

| 语义 | Token | 浅色 | 深色 | 铁律 |
| :--- | :--- | :--- | :--- | :--- |
| 进行中 / 激活 / 焦点 | `--accent`、`--focus-ring`、`--link` | `#a54f35` | `#dc9477` | 只用赤陶；**禁止任何蓝** |
| 完成 / 成功 / 缓存命中 | `--success` | `#226d40` | `#34d399` | 只能用 `--success` |
| 警告 / 待确认 | `--warning` | `#975a06` | `#fbbf24` | — |
| 错误 / 失败 / 危险 | `--error` | `#b82420` | `#f87171` | 没有 `--danger`（见 §2.6） |
| 主按钮 | `--run-bg` / `--run-ink` | `#35332e` / `#ffffff` | `#e9e6de` / `#242320` | 近黑，不是赤陶 |

**`--accent-sage` 是陷阱。** 名字听起来是绿色，但在两套主题里它都被重映射为赤陶。这带来两类问题：

- **多数用法其实是对的。** 全库 78 处引用里，绝大多数表达的是「进行中 / 激活」（`tool-disclosure.css:197` 的 running 状态、`tool-live.css:33` 的 spinner、`app.css:82`、`workbench.css:76`、`settings-models.css` 的进度刻度）——解析成赤陶正是想要的结果。它们能正确渲染纯属巧合：名字和语义不一致，任何人下次调整 `--accent-sage` 都会同时改变一大批无关组件。

- **少数用法确实错了。** 真正需要绿色却写成 `--accent-sage` 的地方会渲染成赤陶：
  | 位置 | 期望 | 实际 |
  | :--- | :--- | :--- |
  | `mcp-panel.css:126-129` 「已启用」卡图标 | 绿底绿字 | 赤陶底赤陶字，只有边框用 `--success-border`——**同一元素上两种语义色** |
  | `composer-live-input.css:118-125` 队列「立即转向」主按钮 | 绿（fallback 写的是 `#2f6f5e`） | 赤陶 |
  | `usage-popover.css:52` `--usage-run-color` | 绿（fallback `#2f6f5e`） | 赤陶，于是「运行中」与「已完成」无法区分 |
  | `usage-dashboard.css:1743,1775` 速度指标 | 绿 | 赤陶 |

**规则**：需要绿色时只写 `--success`。看到 `--accent-sage` 一律按「赤陶」理解；如果那处语义是「完成」，那是 bug，改成 `--success`。`--info` 别名指向它且**当前没有任何消费者**，可以直接删除。

各语义色在自身染色底上的对比度（全部达标）：

| | 浅色 | 深色 |
| :--- | :--- | :--- |
| success | 5.75 | 5.06 |
| warning | 5.21 | 8.97 |
| error | 5.83 | 5.84 |

### 2.4 图表色

```css
/* 浅色 */
--chart-series: #a54f35, #55684d, #975a06, #7d5a7c, #68665f, #226d40, #6b5439;
--chart-heat:   #f6f3ee, #dc9477, #7a3520;
/* 深色 */
--chart-series: #dc9477, #8fad82, #f0be65, #c39bc1, #aaa79f, #56b881, #b89b7c;
--chart-heat:   #1c1b1a, #dc9477, #f2c4ae;
```

七色序列是土系、无蓝。热力图是单色相三段，避免红绿跨色相。序列内最接近的一对 ΔE76 为 15.0（浅色第 2/5 色）、17.3（深色第 5/7 色）——**相邻序列需要额外编码区分（形状、标签或直接标注），不能只靠颜色**。

用量看板另有一套 `--chart-completion / cached / uncached / cost / speed / failed`，其中 uncached 为蓝色 `#3b6998` / `#6ca6d9`，与上表不共享。这是待修项。

### 2.5 对比度实测

**正文门槛 4.5:1；UI 边界与大字号 3:1。**

浅色，墨色 × 表面：

| 墨色 \ 表面 | canvas | sidebar | elevated | soft | hover | active | selected |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| primary | 14.01 | 13.05 | 14.75 | 12.82 | 11.82 | 10.66 | 11.51 |
| secondary | 5.46 | 5.08 | 5.75 | 4.99 | 4.60 | **4.15** | **4.48** |
| muted | 4.84 | 4.51 | 5.09 | **4.43** | **4.08** | **3.68** | **3.97** |

深色，墨色 × 表面：

| 墨色 \ 表面 | canvas | sidebar | elevated | soft | hover | active | selected |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| primary | 15.30 | 15.99 | 13.58 | 13.09 | 11.28 | 9.85 | 10.78 |
| secondary / muted | 7.46 | 7.80 | 6.63 | 6.38 | 5.50 | 4.80 | 5.26 |

**结论**：深色全部达标；浅色的 `muted` 在 `soft` 及更深的表面上、`secondary` 在 `active` / `selected` 上均低于 4.5:1。而详情栏大量使用 10–11.5px 的 muted 文本叠在 `soft` 上——这是当前最集中的可读性问题。

其他实测（括号内为位置）：

| 组合 | 比值 | 判定 |
| :--- | ---: | :--- |
| 深色下白字压 `--accent`（权限卡选中勾）`settings-page.css:949` | **2.46** | 失败 |
| `--accent` 压 `--surface-selected` | **4.35** | 失败 |
| 黑字压 `--warning`（详情页签警示徽章）`inspector.css:236` | **3.78** | 失败 |
| `#16a34a` 回退压白底 `inspector.css:2002,2027` | **3.30** | 失败，且是禁用的亮绿 |
| `--text-muted` × 0.85（`.usage-dd-sub`） | **3.74** | 失败 |
| `#c86343`（`--accent-hover` 回退）压浅色画布 | **3.75** | 失败 |
| `#e06c53`（`--danger` 回退）压浅色取消按钮底 | **2.76** | 失败 |
| `--border-subtle` 对 elevated / canvas | 1.28 / 1.22 | 远低于 3:1 |
| `--border-control` 对 elevated / canvas | 1.57 / 1.49 | 低于 3:1 |
| `--border-hover` 对 elevated / canvas | 2.43 / 2.31 | 低于 3:1 |

**边框不足以独立承担控件边界。** 输入框在静止态几乎看不到边。当前系统缺一个 `--border-strong`（见 §2.6），补上后应用于需要明确边界的控件。

### 2.6 未定义的 token（引用即失效）

以下 18 个变量被引用，但全仓库没有任何定义。**这是当前最该先修的一类问题**：其中两个正在产生错误的渲染结果。

| Token | 有 fallback | 无 fallback | 后果 |
| :--- | ---: | ---: | :--- |
| `--accent-subtle` | 12 | 0 | `workbench-header.css:121` 取到 `rgba(59,130,246,.1)`——**调色板里唯一真实出现的蓝**；`inspector.css` 11 处取赤陶透明度 |
| `--danger` | 14 | **7** | 无 fallback 的 7 处声明失效：失败任务徽章、失败 agent 边条、`agent-error-box` 全部退化为普通正文色 |
| `--leading-normal` | 0 | **16** | 行高声明被丢弃 |
| `--border-strong` | 0 | **3** | 2.5px 状态边条取 `currentColor` |
| `--leading-none` | 0 | **2** | 同上 |
| `--shadow-xs` | 0 | **2** | 卡片无阴影 |
| `--accent-primary` | 0 | **1** | 悬停色不生效 |
| `--surface-raised` | 1 | **1** | chip 透明 |
| `--leading-tight` | 0 | **1** | — |
| `--accent-hover` | 1 | 0 | 回退值 `#c86343` 对浅色仅 3.75:1 |
| `--duration-fast` / `--ease-out` | 4 / 4 | 0 | 第三套动效词汇 |
| `--accent-terracotta`、`--danger-text`、`--border`、`--surface`、`--space-3-5`、`--surface-sunken` | 各 1–2 | 0 | 回退值各自为政 |

**修复方向**：在 `workspace-theme.css`（或统一后的单一颜色文件）中补齐这些定义，然后把无 fallback 与有 fallback 的引用统一到同一语义。`--danger` 应定义为 `var(--error)`，`--border-strong` 需要一个真正可见的中性边框值，`--leading-normal/tight/none` 应并入现有的 `--leading-*` 刻度。

---

## 3. 字体与排版

### 3.1 字体

```css
--font-sans: "Geist Variable", "Geist", -apple-system, BlinkMacSystemFont,
             "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
--font-mono: "Geist Mono Variable", "Geist Mono", "SFMono-Regular",
             "Cascadia Mono", Menlo, Consolas, monospace;
```

自托管（`@fontsource-variable`），11 个 woff2，无远程字体请求；生产 CSP 不放宽。**中文没有自带字形**，落到系统 PingFang / 微软雅黑 / 思源，跨平台字面宽度会有差异——中文文案的换行与截断必须在目标平台上验证。

**数值与标识一律用等宽 + 表格数字**：模型 ID、路径、分支、步骤序号、token 数、价格、TPS、耗时、百分比。当前 137 处使用 `--font-mono`，但只有 38 处同时声明了 `font-variant-numeric: tabular-nums`；缺失时数字会随内容抖动。

### 3.2 声明的刻度与真实使用

`tokens.css` 声明的刻度：

| Token | 字号 / 行高 | 使用次数 |
| :--- | :--- | ---: |
| `--text-2xs` | 11 / 16 | 31 |
| `--text-xs` | 12 / 18 | 154 |
| `--text-sm` | 13 / 20 | 30 |
| `--text-base` | 14 / 22 | 26 |
| `--text-md` | 15 / 24 | 9 |
| `--text-lg` | 18 / 26 | 3 |
| `--text-xl` | 20 / 28 | **0（未使用）** |
| `--text-2xl` | 24 / 32 | **0（未使用）** |

行高：`--leading-2xs`(6) / `xs`(29) / `sm`(17) / `base`(10) / `md`(3) / `lg`(0) / `xl`(0) / `2xl`(0)。

### 3.3 三套密度，但没写成规则

| 区域 | 基准 | 用途 | 评价 |
| :--- | :--- | :--- | :--- |
| 对话区 | **16px / 1.75**（≤768px 为 17px / 1.75） | 长时阅读 | 系统里最好的一层 |
| 设置页 | 13–14px，标题 22px/700 | 表单 | 合理 |
| 详情栏 | **11.5px / 1.4**，大量 9.5–10.5px，最小 8px | ？ | 承载的是要读的文本 |

详情栏的问题最突出：它展示计划理由、advisor 问答、记忆摘要，却按「调试元数据」排版。`inspector.css` 一处就有 **74 处**小于 11px 的字号。规范 §3.1 明确「禁止通过缩小正文字号塞内容」。

### 3.4 各区域的真实字号（抽样）

| 区域 | 角色 | 字号 / 行高 / 字重 |
| :--- | :--- | :--- |
| 全局 | 默认 | 14 / 22 / 400 |
| 对话 | 用户与助手正文 | 16 / 1.75 / 400 |
| 对话 | 作者行 | 12 / — / 600，`--text-muted` |
| 对话 | Markdown 标题 | 26 / 21 / 18 / 16 / 15，行高 1.35，600 |
| 输入框 | 文本域 | 15 / 1.6，最小高 36px，自动增长至 6 行 |
| 顶栏 | 当前会话标题 | 14 / 24 / 600 |
| 侧栏 | 品牌 | 18 / 700，字距 `-0.04em` |
| 侧栏 | 会话标题 | 13 / 18 / **450**（激活 500） |
| 侧栏 | 文件夹 / 计数 / 时间 | 11 / 600、10 / 500 |
| 详情栏 | 基准 | **11.5 / 1.4** |
| 详情栏 | 卡片标题 | 11 / 600，大写，字距 `0.04em` |
| 详情栏 | advisor 字段标签 | **9.5 / 600** |
| 代码块 | — | 13 / 20（等宽） |
| 差异视图 | — | 12（等宽） |
| 工具条目 | 标签 / 目标 / 耗时 | 11 / 600、11 等宽、11 等宽 |
| 用量看板 | 页面标题 / KPI | 16 / 600、22 / 700 |

### 3.5 字号刻度漂移

**433 处硬编码 px 字号**，对应 261 处使用 `var(--text-*)`。21 个不同取值：

```
8(2) 9(2) 9.5(16) 10(66) 10.5(46) 11(144) 11.5(44) 12(53) 12.5(11)
13(22) 13.5(5) 14(3) 14.5(2) 15(4) 16(3) 17(1) 18(2) 19(1) 21(1) 22(3) 26(1)
```

**不在任何刻度上的值比在刻度上的还多。** 最集中的文件：`inspector.css` 116 处、`usage-dashboard.css` 58、`settings-page.css` 52、`model-access.css` 43、`tool-disclosure.css` 43。

建议的收敛目标（4 档 + 代码档）：`11 / 12 / 13 / 14 / 16 / 22`，其余舍入到最近档。

### 3.6 其他排版规则

- **`<dl>` 防挤压**：必须 `grid-template-columns: auto minmax(0, 1fr)`；`<dt>` 必须 `white-space: nowrap`；`<dd>` 必须 `min-width: 0; text-align: right; overflow-wrap: anywhere`。
  - 合规：`.usage-panel dl`（`usage-popover.css:259-272`）、`.session-hover-info dl`（`sidebar-compact.css:52-55`）
  - 不合规：详情栏用固定 `62px minmax(0,1fr)`（`inspector.css:449`）与 `72px … !important`（`:617`），且 `dt` 没有 `nowrap`（`:462-468`）
  - **缺失规则**：`.usage-context-dl` 在 JSX 中被使用（`UsagePopover.tsx:406`），但没有任何 CSS——用量弹窗头部是浏览器默认的块级 `<dl>`
- **单行截断**：54 处 `text-overflow: ellipsis`、6 处 `-webkit-line-clamp`。截断元素应保留 `title`（当前 222 处 `title=`，覆盖不完整）。
- **中文字距**：`-0.04em` 用在侧栏品牌（18px）上偏紧，会让汉字粘连；大字号标题的负字距建议不低于 `-0.02em`。

---

## 4. 空间与形状

### 4.1 间距

4px 刻度（`tokens.css:28-39`）：`0 / 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32 / 40 / 48`。

实测：**1013 处硬编码 padding / gap / margin px**，分布为

```
1(88) 1.5(1) 2(108) 3(49) 3.5(1) 4(136) 5(58) 6(169) 7(19) 8(142) 9(17)
10(64) 11(8) 12(58) 13(4) 14(36) 16(23) 18(8) 20(7) 22(1) 24(5) 28(3)
30(1) 32(3) 34(1) 44(1) 46(1) 136(1)
```

刻度外的值（5 / 7 / 9 / 11 / 13 / 14 / 18…）合计约 200 处。`--space-*` 的实际使用率远低于硬编码。

> 实践建议：新代码一律用 `var(--space-*)`；修旧代码时把 5→4 或 6、7→8、9→8 或 10 顺手收敛。

### 4.2 圆角

| Token | 值 | 使用 | 归属 |
| :--- | :--- | ---: | :--- |
| `--radius-xs` | 4px | 36 | 小徽章、内联 chip |
| `--radius-sm` | 6px | 142 | **控件默认**：按钮、输入、页签 |
| `--radius-md` | 8px | 87 | **卡片默认**：详情卡、设置条目、智能体卡 |
| `--radius-card` | 12px | 29 | 代码块、差异、工具条目、审批、MCP/插件卡 |
| `--radius-lg` | 14px | 3 | 仅用户消息块 |
| `--radius-xl` | 18px | 1 | — |
| `--radius-composer` | 18px | 4 | 输入卡 |
| `--radius-full` | 9999px | 52 | 胶囊 |
| `--radius-quiet` | `var(--radius-sm)` | 3 | 图标按钮 |
| `--radius-user` | `var(--radius-lg)` | **0（未使用）** | — |

**同一层级出现六种圆角。** 另有两类漂移：

- 胶囊有三种写法：`999px`(33)、`9999px`(29)、`var(--radius-full)`(50)，另有 `50%`(7)。
- 组件里散落 14 个字面值：1/2/3/4/5/6/7/8/9/10/11/12/16px。其中 10px（12 处）、11px（5 处）、16px（4 处）不属于任何 token。

**收敛建议**：控件 6 / 卡片 8 / 大面 12 / 输入卡 18 / 胶囊 `--radius-full`。删除 `--radius-lg` 与 `--radius-xl` 的孤立用法，让用户消息块回到 12 或 8。

### 4.3 阴影

| Token | 浅色 | 深色 |
| :--- | :--- | :--- |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.05)` | `0 1px 2px rgba(0,0,0,.4)` |
| `--shadow-card` | 两层（1px 3px + 1px 2px） | **单层**（深色丢了第二层） |
| `--shadow-composer` | `0 2px 8px rgb(35 30 20 / 4%)` | `0 2px 8px rgb(0 0 0 / 8%)` |
| `--shadow-overlay` | 两层（20px 25px + 8px 10px） | **单层** |
| `--shadow-dropdown` | 两层 | **单层** |

**18 处**组件级投影不走 token（另有 18 处 `box-shadow: 0 0 0 Npx …` 是焦点环/选中光晕，属另一种约定，不在此列）。深色主题丢失阴影层会使抬升层级不一致。

值得注意的是这些投影的**数值高度分散**：`0 1px 2px rgba(0,0,0,.02)`、`…,.03`、`…,.04`、`…,.06`，以及 `0 2px 5px`、`0 2px 6px`、`0 2px 8px rgba(0,0,0,.18)`、`0 24px 48px -12px rgba(0,0,0,.25)`。其中 `.02` 与 `.03` 在屏幕上不可分辨，只是产生了四种几乎相同的「卡片微投影」。

输入卡的阴影刻意极淡（4%），在浅色下几乎与画布融为一体——这是有意的克制，配合 1px `--border-control` 使用。

### 4.4 层级（z-index）

使用值：`0(2) 1(8) 2(5) 10(3) 20(4) 25(1) 28(1) 30(1) 40(1) 50(5) 60(1) 79(1) 80(1) 100(2) 120(1)`。

**没有刻度。** 参考既有约定：侧栏 20、移动端抽屉 30、输入区 20、选择器 80、浮层/对话框 100。新增浮层前先确认最近邻的既有值，不要发明新数字。

---

## 5. 布局

### 5.1 骨架

```
┌──────────────┬──────────────────────────────────────┬──────────────┐
│              │ 顶栏 44px（透明，无下边框）            │              │
│ 侧栏         ├──────────────────────────────────────┤ 详情栏        │
│ 264 / 232    │ 阅读列 760px                          │ 380 / 320    │
│              │                                       │              │
│ 品牌         │ 用户块 ─ 执行过程 ─ 助手正文           │ 44px 头部     │
│ 新任务       │                                       │              │
│ 搜索         │                                       │ 卡片区        │
│ 会话列表      │                                       │              │
│              ├──────────────────────────────────────┤              │
│ 底部状态      │ 输入卡 760px + 上下文条                │              │
└──────────────┴──────────────────────────────────────┴──────────────┘
```

DOM 与 CSS：

```
.wb-app                                    flex, 100dvh
├─ .wb-sidebar-backdrop                    仅 ≤1000px
├─ .workbench-sidebar                      Sidebar.tsx
└─ .workbench-content
   ├─ .workbench-task-header               WorkbenchHeader.tsx
   └─ .workbench-panes                     ≥1001px 时 display:contents
      ├─ main.workbench-main
      │  ├─ .transcript-region → .workbench-conversation-scroll → .conversation-inner
      │  └─ form.workbench-composer
      └─ aside.workbench-inspector
```

桌面（≥1001px）由 `workbench-header.css:67-90` 切到 grid：

```css
.workbench-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: var(--header-height) minmax(0, 1fr);
}
.workbench-panes { display: contents; }
.workbench-inspector { grid-column: 2; grid-row: 1 / span 2; }
```

设置页与用量看板**不是子路由**，而是渲染到同一 root 的同级浮层，通过 `DeferredPanel` 懒加载。

### 5.2 关键尺寸（生效值）

| 名称 | 生效值 | 被覆盖的旧值 |
| :--- | :--- | :--- |
| `--rail-width` | 264px | — |
| `--rail-width-compact` | 232px | — |
| `--header-height` | **44px** | `tokens.css:53` 的 52px |
| `--inspector-width` | 380px | — |
| `--inspector-width-compact` | 320px | — |
| `--reading-measure` | **760px** | `tokens.css:59` 的 780px |
| `--control-height` | **28px** | `tokens.css:56` 的 34px |
| `--control-height-sm` | **24px** | `tokens.css:57` 的 28px |
| `--control-height-lg` | **32px** | `tokens.css:58` 的 40px |
| `--touch-min-target` | 44px | — |
| `--composer-inset` | **6px 32px 16px** | `tokens.css:236` 的 16px 36px 20px |

**六项在 `tokens.css` 与 `workspace-theme.css` 中各有一个不同的值。** 只读 `tokens.css` 会得到错误答案。

阅读列 760px 的**每行字符数取决于语言**，用实际 Geist 字体在 16px 下测得：

| 文本 | 每字符宽 | 760px 每行字符数 |
| :--- | ---: | ---: |
| 纯西文 | 7.47px | **约 102** |
| 纯中文 | 16px | **约 47** |
| 中英混排 | 11.09px | 约 69 |

中文 47 字正好落在舒适区间；西文 102 字符则**明显超出**常见的 45–75 字符排版建议。因为产品以中文为主（`lang="zh-CN"`），760px 是为中文校准的——这本身是合理选择，但意味着**大段英文内容会读起来偏宽**。如果将来要照顾英文，应考虑按语言或按容器宽度分档，而不是全局改小。

### 5.3 断点

实测 21 个不同宽度断点，出现频次：

```
640(12) 768(12) 480(8) 600(6) 1000(4) 1001(4) 900(2) 720(2)
380 420 460 560 760 820 860 980 1024 1060 1200 1366 1920（各 1–2）
```

**22 个不同宽度取值，其中 4 个承担结构性职责：**

| 断点 | 出现次数 | 变化 |
| :--- | ---: | :--- |
| `1001px` | 4 | 双栏 → 单栏；侧栏变抽屉；`--inspector-width-compact` 生效（1001–1366） |
| `768px` | 12 | 输入工具栏允许换行；触控目标放大；正文升到 17px |
| `640px` | 12 | 对话框、代码块、差异视图、表单行、用量面板转单列/可换行 |
| `480px` | 8 | 输入区选项、队列提示、智能体工具网格转单列 |

其余 18 个（380 / 420 / 460 / 560 / 600 / 720 / 760 / 820 / 860 / 900 / 980 / 1000 / 1024 / 1060 / 1200 / 1366 / 1920）合计出现约 20 次，多为一次性微调。**新增响应式规则前，先确认能否复用 480 / 640 / 768 / 1001 四个之一。**

> 已知缺陷：`composer-layout.css:146` 的 `.wb-app .composer-split .composer-toolbar { flex-wrap: nowrap }`（特异性 0,3,0）压过 `app.css:1407` 在 `≤768px` 下的 `.composer-toolbar { flex-wrap: wrap }`（0,1,0）。**规范要求的窄屏换行实际不会发生。**

### 5.4 各区域内边距

| 区域 | 水平内边距 | 说明 |
| :--- | :--- | :--- |
| 顶栏 | 24px | `workspace-theme.css:77` |
| 对话滚动区 | 32px | `app.css:46` |
| 输入区 | 32px | `--composer-inset` 中段 |
| 详情栏 | **10px** | `inspector.css:331` |
| 设置页 | 44px | `settings-page.css:277` |
| 用量看板 | 28px | `usage-dashboard.css:458` |

五个不同的水平内边距，视觉上表现为各区域的文字左边缘不对齐。详情栏的 10px 尤其小——它是造成「详情栏像侧边注释」的原因之一。

另外：工作台侧栏 264px，设置页左导航 **248px**（`settings-page.css:5`），切换视图时左列会横跳 16px。

---

## 6. 组件

### 6.1 原语清单

`src/renderer/components/primitives/`：

| 组件 | 用途 | 生产环境使用 |
| :--- | :--- | :--- |
| `Button` | 按钮 | **34 处** |
| `IconButton` | 图标按钮（强制 `aria-label` + `title`） | **0 处（仅 showcase）** |
| `Field` / `Input` / `Textarea` | 表单字段 | 9 处 |
| `Select` | **原生 `<select>` 封装** | 5 个文件 |
| `SettingsSelect` | 自定义无障碍下拉 | 6 处 |
| `SettingsToggleCard` | 开关卡片 | 2 处 |
| `EmptyState` / `ErrorState` | 空 / 错状态 | 2 / 3 处 |
| `StatusBadge` | 状态徽章 | 3 处 |
| `Tabs` | 分段控件 | 2 处 |
| `ToolDisclosure` | 工具调用折叠卡 | 3 处 |
| `CodeBlock` / `DiffViewer` | 代码 / 差异 | 2 / 2 处 |
| `ApprovalPanel` | 审批卡 | 2 处 |
| `Collapsible` | 折叠动画 | 3 处 |
| `Dialog`（在 workbench/） | 原生 `<dialog>` 封装 | 8 处 |

**注意 `IconButton` 在生产代码里一次都没用**——生产使用的是 `.wb-icon-btn`（`app.css:1434-1470`）加十来种自制按钮类。`IconButton` 的 `label` 强制约束因此没有惠及真实界面。

### 6.2 卡片：同一个对象，六种处理

| 对象 | 圆角 | 边框 | 填充 | 阴影 | 内边距 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `.inspector-section` / `.inspector-card` | 8 | 1px subtle | elevated | `0 1px 2px rgba(0,0,0,.02)` | 8 / 10 |
| `.inspector-plan-summary-card` | 8 | 1px subtle | **soft** | — | 8 / 10 |
| `.settings-card` | 12 | 1px subtle | elevated | `--shadow-sm` | 头部 16/20 |
| `.settings-entry` | 8 | 1px subtle | — | — | 16 |
| `.agent-profile-card` | 8 | 1px subtle | elevated | — | 14 / 16 |
| `.agent-editor-section` | 8 | 1px subtle | soft | — | 14 / 16 |
| `.mcp-card` | 12 | 1px subtle | — | `--shadow-sm` | 16 |
| `.plugin-card` | 12 | 1px subtle | elevated | `--shadow-sm` | 18 |
| `.inspector-advisor-card` | 8 + **3px 左边条** | 1px subtle | elevated | — | 10 / 12 |
| `.child-session-card` | — + **2.5px 左边条** | — | elevated | — | 0 |
| `.tool-disclosure-header` | 12 | 1px transparent | transparent | — | 2 / 8 |
| `.code-block` / `.diff-viewer` | 12 | 1px subtle | soft / elevated | — | — |
| `.approval-panel` | 12 | 1px **warning-border** | elevated | `--shadow-card` | 16 / 18 |
| `.chart-card` | — | none | transparent | — | — |
| `.message-user` | **14** | none | soft | none | 12 / 16 |
| `.composer-surface` | **18** | 1px control | elevated | `--shadow-composer` | 12 / 12 / 8 |

**约定（建议遵守）**：

1. 详情栏卡片用 **8**，设置/内容型卡片用 **12**，输入区用 **18**。不要新增第 7 种。
2. 一级卡片 `--surface-elevated`，卡内分组用 `--surface-soft`，**不要靠叠边框分组**。
3. 左侧状态边条当前存在 **5 种宽度、共 22 处**：1px(5)、1.5px(1)、2px(6)、2.5px(5)、3px(5)。新增时从中选一个，不要再引入第 6 种。

### 6.3 状态徽章

基础（`status-badge.css`）：圆角 6、字号 12、行高 18、内边距 `2px 8px`，`<output>` 元素，带 `aria-label`。

**同一状态有三种形状**：

| 位置 | 字号 | 高度 | 圆角 |
| :--- | ---: | ---: | :--- |
| 基础 `.status-badge` | 12 | auto | 6 |
| 详情栏子任务卡 `.child-card-badges .status-badge` | 10 | 20 | 9999 |
| `.child-status-badge` | 11 | — | full |

另有 **113 个** `*badge* / *pill* / *chip* / *tag*` 类名，圆角在 4 / 6 / 999 / 9999 之间随机分布。

**约定**：同一语义状态全应用只应有一种形状。建议徽章统一为 **圆角 6、字号 11、内边距 2/6**，胶囊仅用于可点击的筛选控件。

### 6.4 空 / 错 / 载

| 状态 | 变体数 | 现状 |
| :--- | ---: | :--- |
| 空 | ~10 | 标准 `EmptyState`（440px，48px 图标）、对话区 22px 特大号、详情栏虚线卡、设置页实线卡、侧栏裸文本、看板居中文本… |
| 错 | ~7 | `ErrorState` 卡、`.form-error` 行内、`.provider-error`、`.usage-error-banner`、诊断徽章、分页 pill、**无样式的 `.composer-error`** |
| 载 | 10 种 spinner keyframe | `btn-spin`、`badge-spin`、`tool-spin`、`tool-live-spin`、`agent-spin`、`usage-spin`、`workspace-picker-spin`、`html-preview-spin`、`image-attachment-spin`、`transcript-history-spin` |

另有 **31 处** `dashed` 边框用于空状态，分散在 11 个文件。

**约定**：

- 空状态用「主说明 + 次级引导」，容器按区域选择：详情栏用虚线卡（`surface-soft` + dashed），列表类用 `EmptyState`，不要用裸 `<p>`。
- 错误文案只说**发生了什么 + 下一步**，不道歉、不模糊。
- 加载用 `--font-mono` 的静态文本或统一 spinner，不要新增第 11 种。

### 6.5 控件

| 控件 | 现状 | 规范要求 |
| :--- | :--- | :--- |
| 下拉 | 原生 `<select>` 通过 `Select` 用在 5 个文件；`SettingsSelect` 6 处；`ComposerDropdown` 2 处 | **禁止原生**，全部用自定义下拉 |
| 复选 | **14 处裸 `<input type="checkbox">`**（`ModelAccessPanels.tsx` 13、`ProviderSources.tsx` 1），仅用 `accent-color` 着色 | 用 `.settings-toggle-card` 或自定义开关 |
| 内联样式 | 97 处 `style={{…}}` | 除计算宽度/偏移外禁止 |

### 6.6 按钮

| 类 | 高度 | 圆角 | 字号 |
| :--- | ---: | ---: | ---: |
| `.btn` | 28（`min-height`） | 6 | 14 |
| `.btn-sm` | 28 | 6 | 12 |
| `.btn-md` | 28 | 6 | 14 |
| `.btn-lg` | 44 | 6 | 15 |
| `.btn-icon` | 28 | 6 | — |
| `.btn-icon.btn-sm` | **36** | 6 | — |
| `.btn-icon.btn-lg` | 44 | 6 | — |

**尺寸 API 已失效**：`--control-height` 被压到 28px 后，`.btn-sm` 与 `.btn-md` 完全同高；而 `.btn-icon.btn-sm` 是 36px，比默认 `.btn-icon`（28）还大。`size` 属性目前不表达任何东西。

变体：`primary`（`--run-bg` 近黑）、`secondary`（`--surface-soft`）、`ghost`（透明）、`danger`（`--error-bg` 底 + `--error` 字）。

**约定**：低于 28px 的控件只在密集列表中出现，且必须配合 44px 的触控替代（`@media (pointer: coarse)`）。

---

## 7. 动效

### 7.1 三套并行词汇

```css
/* tokens.css */
--transition-fast:   120ms cubic-bezier(0.16, 1, 0.3, 1);
--transition-normal: 180ms cubic-bezier(0.16, 1, 0.3, 1);

/* motion.css */
--motion-duration-fast: 120ms; --motion-duration-sm: 160ms;
--motion-duration-base: 180ms; --motion-duration-md: 200ms;
--motion-duration-dialog: 180ms;
--motion-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--motion-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--motion-distance-xs/sm/md/lg: 4 / 6 / 12 / 16px;
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.15);

/* 以及一批未定义的引用 */
--duration-fast / --ease-out  ← 见 §2.6
```

44 个 `@keyframes`，实际时长还有 0.15s(28)、140ms(12)、0.25s、0.32s 等散值。

**约定**：新代码用 `--transition-fast`（交互反馈）或 `--motion-duration-md`（容器过渡）。`--ease-spring` 只用于确认类反馈（如复制成功），不要用于布局过渡。

### 7.2 减弱动效

三层保障：

1. `global.css:33-42` 全局把所有 `animation-duration` / `transition-duration` 压到 0.01ms；
2. `motion.css:358-425` 定向覆盖，保留必要变换（页签指示器）、把闪烁光标冻结为静态、把 shimmer 换成实色；
3. 16 个组件样式表各自的 `@media (prefers-reduced-motion)` 块。

**缺口**：ECharts 的 `animationDuration: 300`（`charts/build-option.ts:40`）没有读取 `prefers-reduced-motion`。新增 Canvas/WebGL 动效时同样需要显式判断。

---

## 8. 可访问性

### 8.1 焦点

全局环：`outline: 2px solid var(--focus-ring)`，偏移 2px（`global.css:49-53`）。

实测偏移值：`2px`(9)、`1px`(17)、`-2px`(8)、`-1px`(4)——**四种内缩方向**。约定：

- 独立控件：`+2px`
- 容器内首尾贴边的控件：`+1px`
- 列表项 / 分段控件：`-2px`（避免被容器裁切）

### 8.2 被抹掉的焦点（需要修）

| 位置 | 后果 |
| :--- | :--- |
| `workbench.css:145-149` `.sidebar-search-input:focus` | `outline:none`，只有边框变色，且外层的 `:focus-within` 也被置为 transparent |
| `inspector.css:2217-2219` `.inspector-file-filter-input` | `outline: 0`，外层 `.inspector-file-filter-row` **没有** `:focus-within` → 完全没有焦点指示 |
| `settings-page.css:2135-2140` `.agent-template-item:focus-visible` | 显式 `outline: none` |
| `usage-dashboard.css:340-345` `.usage-ws-option` | `outline: none` |
| `app.css:345-350` `.composer-textarea:focus-visible` | `outline: none`；由 `.composer-surface:has(:focus-visible)` 改边框色补偿 |

### 8.3 键盘陷阱

`.session-action-btn` 常态 `opacity: 0; pointer-events: none`（`workbench.css:503-534`），只在 `.session-item:hover / .is-active / .is-menu-open` 时显示。

**`opacity: 0` 不会移出 Tab 序列**，也没有 `:focus-within` 规则——键盘用户会聚焦到一个看不见的按钮上。修复：增加 `.session-item:focus-within .session-action-btn { opacity: .85; pointer-events: auto }`。

对比：`.chart-card:focus-within .chart-card-actions` 是正确的做法，可直接照抄。

### 8.4 其他

- **图标按钮**：`aria-label` 覆盖良好（全库 241 处），但 `IconButton` 原语未被使用，保障是散落的约定而非强制。
- **触摸目标**：`--touch-min-target: 44px` 在 `≤768px` 与 `pointer: coarse` 下应用；但 `.session-action-btn` 在粗指针下只有 28px。
- **弹窗**：`Dialog` 与 `HtmlPreview` 使用原生 `<dialog>`（焦点陷阱与 Escape 由浏览器提供）。**用量看板是例外**：`role="dialog" aria-modal="true"` 但只是普通 `div`，没有焦点陷阱，`App.tsx:93-94` 的 `inert` 只覆盖设置页，不覆盖看板——Tab 会走进背后的工作台。
- **`aria-live`**：10 处 `role="status"`、41 处 `role="alert"`。**没有任何瞬态通知层**（无 toast），因此复制、保存等短反馈只能靠图标切换或行内文本。

---

## 9. 已知偏差总表

按影响排序。「修复方向」只给方向，不规定实现。

| # | 级别 | 偏差 | 证据 |
| :--- | :--- | :--- | :--- |
| 1 | **P0** | `--accent-subtle` 未定义 → 详情按钮取到蓝 `rgba(59,130,246,.1)` | `workbench-header.css:121` |
| 2 | **P0** | `--danger` 未定义 → 7 处错误态颜色失效 | `tool-disclosure.css:1414,1415,1490,1638,1639,1727,1729` |
| 3 | **P0** | 另有 16 个未定义 token，含 `--leading-normal`(16 处)、`--border-strong`(3 处) | §2.6 |
| 4 | **P0** | `.usage-context-dl`、`.form-notice`、`.composer-error` 有类名无规则 | `UsagePopover.tsx:406`、`AgentProfilesPanel.tsx:658`、`Composer.tsx:1163,1168` |
| 5 | **P1** | 颜色由两个文件共同拥有，`tokens.css` 中一套色值不生效 | §1.2 |
| 5b | **P2** | 760px 阅读列对西文偏宽（约 102 字符/行）；对中文合适 | §5.2 |
| 6 | **P1** | 浅色 muted 在 soft/hover/active/selected 上低于 4.5:1 | §2.5 |
| 7 | **P1** | 深色白字压赤陶 2.46:1（权限卡选中勾） | `settings-page.css:949` |
| 8 | **P1** | 主题预览画着旧色板（GitHub-dark + 翡翠） | `settings-page.css:575-635` |
| 9 | **P1** | 用量条用蓝/紫/绿/橙四个外来色相；看板图表含蓝 | `usage-popover.css:2-5,16-19`；`usage-dashboard.css:9,33` |
| 9b | **P1** | 绿语义写成 `--accent-sage`，渲染成赤陶（MCP 已启用卡、转向按钮、运行色） | §2.3 |
| 10 | **P1** | 五级墨色实际三级，禁用态不可区分 | `workspace-theme.css:13-15,55-57` |
| 11 | **P1** | 按钮尺寸 API 失效（sm = md；icon-sm > icon） | `buttons.css:31-45,179-183` |
| 12 | **P1** | 详情栏 11.5px 基准，74 处 < 11px | `inspector.css:8` |
| 13 | **P1** | 433 处硬编码字号对 21 个取值 | §3.5 |
| 14 | **P1** | 同一层级六种卡片圆角；14 个字面圆角 | §4.2 |
| 15 | **P1** | 状态徽章三种形状；113 个 badge/pill/chip 类 | §6.3 |
| 16 | **P1** | 14 处裸 checkbox；原生 select 用于 5 个文件 | §6.5 |
| 17 | **P1** | 焦点被抹掉 4 处，其中文件筛选完全无指示 | §8.2 |
| 18 | **P1** | 会话「⋯」`opacity:0` 但仍可聚焦，无 `:focus-within` | `workbench.css:503-534` |
| 19 | **P2** | 窄屏工具栏换行被特异性压掉 | `composer-layout.css:146` vs `app.css:1407` |
| 20 | **P2** | 用量看板无焦点陷阱，`inert` 未覆盖 | `App.tsx:93-94`、`UsageDashboard.tsx:547-551` |
| 21 | **P2** | 首帧主题闪烁（硬编码 dark） | `index.html:2` |
| 22 | **P2** | 详情栏 `<dl>` 用固定 62px 且 dt 无 nowrap | `inspector.css:449,617,462-468` |
| 23 | **P2** | 详情栏 3–4 层带边框嵌套 | §6.2 |
| 24 | **P2** | 侧栏 264 / 设置 248；五个水平内边距 | §5.4 |
| 25 | **P2** | 21 个断点，18 个是一次性微调 | §5.3 |
| 26 | **P2** | 深色主题丢失阴影层 | §4.3 |
| 27 | **P2** | ECharts 动画未响应 `prefers-reduced-motion` | `build-option.ts:40` |
| 28 | **P3** | 中英混排（Build/Plan、done、See more、CH） | §3.5 / 文案 |
| 29 | **P3** | 同一状态两种叫法（执行中/运行中、中断/已中断） | `SessionListItem.tsx:9-17` vs `StatusBadge.tsx:27-37` |
| 30 | **P3** | 规范引用不存在的 `DESIGN.md`；点名的 6 个类名不存在 | `tokens.css:72,117,227` 等 |

---

## 10. 安全改动清单

改这个界面时，按以下顺序自检：

1. **颜色是否只引用 token？** 检查是否误用 `--accent-sage` 表绿色、是否写死 `#16a34a` / 蓝色 / 红绿渐变。
2. **新 token 是否写进了正确的文件？** 颜色 → `workspace-theme.css`；字号/间距/圆角刻度 → `tokens.css`。
3. **是否引用了不存在的变量？** 提交前对照 §2.6 的名单。
4. **卡片是否引入第 7 种圆角？** 详情栏 8 / 内容 12 / 输入 18。
5. **是否新增了第 11 种 spinner、第 8 种错误态、第 11 种空状态？** 先找现成的。
6. **焦点是否可见？** 任何 `outline: none` 必须有替代指示。
7. **悬停才出现的控件是否有 `:focus-within`？**
8. **`<dl>` 是否满足 `auto minmax(0,1fr)` + `dt { nowrap }`？**
9. **中文长文本在 320px 紧凑详情栏里是否折行或截断得当？**
10. **深色主题是否重算过对比度？** 不要凭浅色的结果推断。

验证命令见 [WEB_UI_LAYOUT_SPEC.md §6](WEB_UI_LAYOUT_SPEC.md)：

```sh
pnpm exec vitest run tests/renderer/inspector-layout-mounted.test.ts \
  tests/renderer/new-session-mounted.test.ts \
  tests/renderer/new-session-layout-mounted.test.ts
pnpm build
```

真浏览器需覆盖 **浅色 + 深色 × 390px + 1440px**，关闭动画截图。

---

## 附：本文数据来源

所有数值来自当前工作区源码（提交 `bb47644`）与构建产物 `dist/renderer/assets/index-*.css`。对比度按 WCAG 2.x 公式计算，示例计算：

```
#716e66 相对亮度 L = 0.2126·lin(0x71/255) + 0.7152·lin(0x6e/255) + 0.0722·lin(0x66/255)
                  = 0.1562
#f0efeb 相对亮度 L = 0.8626
比值 = (0.8626 + 0.05) / (0.1562 + 0.05) = 4.43
```

其中 `lin(c) = c/12.92`（c ≤ 0.04045）或 `((c + 0.055)/1.055)^2.4`。

计数由 `grep -c` / `grep -o | wc -l` 在 `src/renderer` 范围内统计，排除 `node_modules`、`dist` 与 `showcase/`（除非另行注明）。字号与间距统计包含所有 `*.css`，不含 `.tsx` 内联样式。
