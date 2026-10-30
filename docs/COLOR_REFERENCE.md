# Forge Web UI 颜色参考（Color Reference）

本文件是 `forge-web-ui` 的**颜色事实清单**：把所有携带颜色的 CSS 自定义属性、它们在浅色/深色下**层叠后的生效值**、每个值的胜出与落败位置、组件作用域内的局部变量、从未定义的变量，以及组件样式表里的字面量颜色全部列出来。

它回答的是「现在到底是什么颜色、这个值从哪一行来」，不是「应该怎么写」。规范（必须怎么做）见 [WEB_UI_LAYOUT_SPEC.md](WEB_UI_LAYOUT_SPEC.md)；更宽的设计系统叙述见 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)。

> **测量口径**
>
> - 源码根：`src/renderer`
> - 基线提交：`bb47644`
> - 测量日期：2026-10-28
> - 「生效值」= CSS 层叠解析后的最终值，不是任一文件单独声明的值。
> - 计数口径：CSS 中形如 `#rgb` / `#rrggbb` / `#rrggbbaa` / `rgb()` / `rgba()` / `hsl()` / `hsla()` 的记号，按出现次数计；`transparent` 与命名色（`white` / `black`）不计（全库 CSS 中没有命名色作颜色值，只出现 `mask-image` 里的 `#000`）。
> - 构建产物核对：`dist/renderer/assets/index-DP7_ruyt.css`（同日构建）。产物随源码重建会换文件名，重建后需重新取样。

---

## 1. 层叠：谁覆盖谁

### 1.1 源码里的装配顺序

样式按模块图分三段进入层叠，后进入者覆盖先进入者：

```
① src/renderer/main.tsx
   L3  import { App } from "./components/workbench/App"   ← 注意：App 在前
   L5  import "./styles/global.css"
   L6  import "./styles/workspace-theme.css"
   L7  import "./styles/sidebar-compact.css"

   src/renderer/styles/global.css
   L1  @import "./tokens.css"

② src/renderer/components/workbench/App.tsx
   L14 workbench.css → L15 app.css → L16 workbench-header.css
   L17 new-session.css → L18 inspector.css → L19 styles/motion.css

③ 各组件自行 import 自己的表（Composer、Transcript、UsagePopover、Settings…）
   Settings / UsageDashboard / PrimitiveShowcase 由 DeferredPanel 懒加载，
   首次打开时才把各自的 chunk CSS 追加进文档
```

### 1.2 构建产物里的真实顺序与源文件读序不一致

`main.tsx:3` 先 import `App`，`main.tsx:5` 才 import `global.css`。ESM 求值按依赖顺序展开，因此**产出的 CSS 里组件表排在 token 表之前**。以下是 `dist/renderer/assets/index-DP7_ruyt.css` 中各类的字节偏移（越小越先）：

| 段 | 偏移 | 证据选择器/声明 |
| :--- | ---: | :--- |
| `usage-popover.css` | 31771 | `.composer-usage{--context-instructions:…` |
| `inspector.css` | 118164 | `.wb-app .wb-inspector` |
| `app.css` | 201327 | `.wb-app{` |
| `workbench.css` | 188764 | `.workbench-container` |
| `workbench-header.css` | 233002 | `.workbench-panes` |
| `new-session.css` | 237339 | `.wb-new-session-intro[hidden]` |
| `motion.css` | 241591 | `.modal-backdrop` |
| **`tokens.css` 浅色块** | **252133** | `:root,[data-theme=light]{color-scheme:light;--canvas-bg:#fff…` |
| `tokens.css` 深色块 | 253220 | `[data-theme=dark]{color-scheme:dark;--canvas-bg:#0d1117…` |
| `tokens.css` 别名块 | 254191 | `:root,[data-theme]{--surface-body:var(--canvas-bg)…` |
| **`workspace-theme.css` 浅色块** | **256405** | `:root,[data-theme=light]{--canvas-bg:#faf9f6…` |
| `workspace-theme.css` 深色块 | 257352 | `[data-theme=dark]{--canvas-bg:#171716…` |
| `workspace-theme.css` 规则段 | 258079 | `.wb-app .workbench-task-header{padding-inline:…}` |
| `sidebar-compact.css` | 262816 | `.wb-app .sidebar-sessions-list` |

对颜色 token 无害：组件表虽然在前，但它们只是**引用** `var(--x)`，自定义属性的解析发生在计算值阶段，与声明先后无关；唯一会互相覆盖的是「同选择器、同属性」的声明。

实测例子：`.wb-app .workbench-task-header` 在两个文件各声明一次——`workbench-header.css:11-23`（产物 233105）与 `workspace-theme.css:75-78`（产物 258079）。同特异性下后者更晚，因此 `padding-inline: var(--space-6)` 取到工作台版本。注意 `workspace-theme.css:76` 的 `border-bottom-color: transparent` 是**空操作**：全库没有任何规则给该元素声明 `border-bottom-width` 或 `border-bottom-style`，只改颜色不会产生边框——这是一处看似生效、实际无效果的声明。

### 1.3 三条从层叠推出的结论

1. **两套主题的四个块叠成一条链**：`:root` 永远匹配 `<html>`，所以 `tokens.css:84-145`（`:root, [data-theme="light"]`）与 `workspace-theme.css:1-42` 的同款选择器**在深色主题下也匹配**，只是随后被 `[data-theme="dark"]` 覆盖。实际优先级：`tokens 浅色 < tokens 深色 < workspace 浅色 < workspace 深色`。
2. **只有 light 块、没有 dark 对应项的属性会漏进深色主题**。实测 `tokens.css` 没有这种颜色属性（0 个）；`workspace-theme.css` 有 9 个纯几何属性（`--rail-width`、`--header-height`、`--control-height*`、`--reading-measure`、`--welcome-title-size`、`--radius-composer`、`--composer-inset`，L33–41），其中没有颜色。
3. **工作台主题赢**。`--canvas-bg` 在产物里出现 4 次：252177 `#fff`、253256 `#0d1117`、256430 `#faf9f6`、257370 `#171716`。最后一个赢 → 浅色 `#faf9f6` / 深色 `#171716`。

### 1.4 主题属性由谁写入

- `index.html:2` 硬编码 `<html lang="zh-CN" data-theme="dark">`。
- `state/workbench-context.tsx:321-334` 在设置加载后写入 `document.documentElement.dataset.theme`；`settings.theme === "system"` 时跟随 `prefers-color-scheme`（L322、L326-328），否则用设置值，设置缺失时回落 `"dark"`（L329）。
- Core 侧默认设置是 `theme: "system"`（`repos/forge-core/src/shared/schemas.ts:155`，枚举见 `:75`）。
- 组件展示页另有自己的开关：`showcase/PrimitiveShowcase.tsx:49,79` 读写 `localStorage["forge:theme"]`，缺省 `"dark"`（`:52-53`），并直接 `setAttribute("data-theme", …)`（`:83,86,92`）。
- CSS 中**没有任何 `prefers-color-scheme` 媒体查询**（全库 grep 为 0），主题切换完全靠属性选择器。

---

## 2. 两套调色板，以及它们各自还剩什么

`tokens.css` 里是锌灰 + 翡翠（zinc / emerald）配色，`workspace-theme.css` 里是暖纸 + 赤陶（warm paper / terracotta）。二者并非「一个基础、一个微调」——它们对同一批属性各自声明了**完整且互不相关**的值。

### 2.1 颜色属性按定义位置统计

全库共定义 157 个自定义属性，其中 75 个携带颜色（字面色值，或纯 `var()` 指向颜色属性）。按定义文件分组：

| 定义位置组合 | 属性数 | 说明 |
| :--- | ---: | :--- |
| 仅 `styles/tokens.css` | 31 | 14 个真实色值 + 17 个别名（见 2.2） |
| `tokens.css` + `workspace-theme.css` | 26 | 两者都声明，`workspace-theme.css` 全胜 |
| 仅 `styles/workspace-theme.css` | 2 | `--chart-series`、`--chart-heat` |
| 仅 `components/workbench/usage-popover.css` | 8 | 7 个 `--context-*` + `--usage-run-color` |
| 仅 `components/workbench/usage-dashboard.css` | 6 | `--chart-completion / cached / uncached / cost / speed / failed` |
| 仅 `components/workbench/inspector.css` | 2 | `--surface-card`、`--border-default`（无消费者） |

### 2.2 谁拥有什么

**26 个争用属性 —— `workspace-theme.css` 全胜，`tokens.css` 的对应声明是死值：**

`--canvas-bg`、`--sidebar-bg`、`--surface-shell`、`--surface-elevated`、`--surface-soft`、`--surface-hover`、`--surface-active`、`--surface-selected`、`--text-primary`、`--text-secondary`、`--text-muted`、`--text-tertiary`、`--text-disabled`、`--border-subtle`、`--border-control`、`--border-hover`、`--accent`、`--accent-sage`、`--accent-sage-soft`、`--focus-ring`、`--link`、`--run-bg`、`--run-ink`、`--run-hover`、`--run-active`、`--shadow-composer`

因此 `tokens.css` 中下列值**从不渲染**：

| 属性 | 死的浅色值（tokens.css） | 死的深色值（tokens.css） |
| :--- | :--- | :--- |
| `--canvas-bg` | `#ffffff` (L89) | `#0d1117` (L151) |
| `--sidebar-bg` | `#f8f9fa` (L90) | `#090d12` (L152) |
| `--surface-elevated` | `#ffffff` (L92) | `#161b22` (L154) |
| `--surface-soft` | `#f3f4f6` (L93) | `#161b22` (L155) |
| `--text-primary` | `#111827` (L99) | `#f0f6fc` (L161) |
| `--text-secondary` | `#4b5563` (L100) | `#8b949e` (L162) |
| `--border-subtle` | `#e5e7eb` (L106) | `#30363d` (L168) |
| `--accent` | `#059669` (L113) | `#34d399` (L175) |
| `--focus-ring` | `#10b981` (L114) | `#34d399` (L176) |
| `--link` | `#059669` (L115) | `#34d399` (L177) |
| `--run-bg` | `#111827` (L134) | `#f0f6fc` (L193) |

**14 个只属于 `tokens.css` 的真实颜色（仍生效，且是唯一的绿色来源）：**

`--success` / `--success-bg` / `--success-border`（L121-123、L180-182）、`--warning` / `--warning-bg` / `--warning-border`（L125-127、L184-186）、`--error` / `--error-bg` / `--error-border`（L129-131、L188-190）、`--shadow-sm` / `--shadow-card` / `--shadow-overlay` / `--shadow-dropdown`（L140-144、L199-203）、`--inset-highlight`（L225，值 `transparent`）。

注意这里 `--success` 的浅色 `#226d40`、深色 `#34d399` 与 `tokens.css` 的翡翠强调色**数值不同**（强调色浅色是 `#059669`），文件内的注释（L117-120）说明这是为了避免低对比度的亮翡翠作状态文字。

**17 个别名（`tokens.css:206-237`，`tokens.css` 独占）：** 它们自身不带颜色，全部指向上面两层，因此解析结果仍是工作台色。详见 §3.8。

**2 个只属于 `workspace-theme.css`：** `--chart-series`（L30 / L71）、`--chart-heat`（L32 / L72）。

**结论：** 想改任何一个界面颜色，改 `workspace-theme.css`（26 个争用项 + 2 个图表项）或 `tokens.css` 的语义状态块（9 个 `--success*` / `--warning*` / `--error*`）。改 `tokens.css` 的表面、文字、边框、强调、run、shadow 块不会有任何可见效果。

---

## 3. 全局颜色 token 全表（层叠后的生效值）

「被覆盖（负）」列出失效声明所在文件与行；「生效（胜）」列出最终生效的声明。行号格式为 `光块 / 暗块`。

### 3.1 表面 Surfaces

8 个表面变量全部由 `workspace-theme.css` 接管。

| 变量 | 浅色生效值 | 深色生效值 | 被覆盖（负） | 生效（胜） |
| :--- | :--- | :--- | :--- | :--- |
| `--canvas-bg` | `#faf9f6` | `#171716` | `tokens.css:89` / `:151` | **`workspace-theme.css:3` / `:45`** |
| `--sidebar-bg` | `#f2f1ed` | `#121211` | `tokens.css:90` / `:152` | **`workspace-theme.css:4` / `:46`** |
| `--surface-shell` | `#eae9e4` | `#191918` | `tokens.css:91` / `:153` | **`workspace-theme.css:5` / `:47`** |
| `--surface-elevated` | `#ffffff` | `#222221` | `tokens.css:92` / `:154` | **`workspace-theme.css:6` / `:48`** |
| `--surface-soft` | `#f0efeb` | `#252524` | `tokens.css:93` / `:155` | **`workspace-theme.css:7` / `:49`** |
| `--surface-hover` | `#e8e6e0` | `#30302e` | `tokens.css:94` / `:156` | **`workspace-theme.css:8` / `:50`** |
| `--surface-active` | `#dedbd3` | `#3a3936` | `tokens.css:95` / `:157` | **`workspace-theme.css:9` / `:51`** |
| `--surface-selected` | `#e6e3dc` | `#343330` | `tokens.css:96` / `:158` | **`workspace-theme.css:10` / `:52`** |

### 3.2 文字墨色 Text inks

浅色下 muted / tertiary / disabled 三者同为 `#716e66`；深色下 secondary / muted / tertiary / disabled 四者同为 `#aaa79f`。五级墨色实际只有 3 级（浅）/ 2 级（深）。

| 变量 | 浅色生效值 | 深色生效值 | 被覆盖（负） | 生效（胜） |
| :--- | :--- | :--- | :--- | :--- |
| `--text-primary` | `#292824` | `#eeede8` | `tokens.css:99` / `:161` | **`workspace-theme.css:11` / `:53`** |
| `--text-secondary` | `#68665f` | `#aaa79f` | `tokens.css:100` / `:162` | **`workspace-theme.css:12` / `:54`** |
| `--text-muted` | `#716e66` | `#aaa79f` | `tokens.css:101` / `:163` | **`workspace-theme.css:13` / `:55`** |
| `--text-tertiary` | `#716e66` | `#aaa79f` | `tokens.css:103` / `:165` | **`workspace-theme.css:14` / `:56`** |
| `--text-disabled` | `#716e66` | `#aaa79f` | `tokens.css:102` / `:164` | **`workspace-theme.css:15` / `:57`** |

### 3.3 边框 Borders

| 变量 | 浅色生效值 | 深色生效值 | 被覆盖（负） | 生效（胜） |
| :--- | :--- | :--- | :--- | :--- |
| `--border-subtle` | `#e5e3dc` | `#2b2b28` | `tokens.css:106` / `:168` | **`workspace-theme.css:16` / `:58`** |
| `--border-control` | `#d1cec5` | `#3d3c37` | `tokens.css:107` / `:169` | **`workspace-theme.css:17` / `:59`** |
| `--border-hover` | `#aba69a` | `#706d64` | `tokens.css:108` / `:170` | **`workspace-theme.css:18` / `:60`** |

只有三级边框，没有 `--border-strong`（该名字被 3 处引用，但从未定义，见 §5）。

### 3.4 强调 / 焦点 / 链接 Accent

`--accent-sage` 与 `--accent` 在两套主题下**逐字节相等**：它不再是绿色别名，而是赤陶的第二个名字。`--accent-sage-soft` 是配套的浅染底。

| 变量 | 浅色生效值 | 深色生效值 | 被覆盖（负） | 生效（胜） |
| :--- | :--- | :--- | :--- | :--- |
| `--accent` | `#a54f35` | `#dc9477` | `tokens.css:113` / `:175` | **`workspace-theme.css:19` / `:61`** |
| `--accent-sage` | `#a54f35` | `#dc9477` | `tokens.css:111` / `:173` | **`workspace-theme.css:20` / `:62`** |
| `--accent-sage-soft` | `#f3e6df` | `#3b2b24` | `tokens.css:112` / `:174` | **`workspace-theme.css:21` / `:63`** |
| `--focus-ring` | `#a54f35` | `#dc9477` | `tokens.css:114` / `:176` | **`workspace-theme.css:22` / `:64`** |
| `--link` | `#a54f35` | `#dc9477` | `tokens.css:115` / `:177` | **`workspace-theme.css:23` / `:65`** |

`--accent-sage` 在 CSS 里被引用 60 次（另有 `--accent-sage-soft` 25 次），分布在 16 个表；其中多数表达「进行中 / 激活」（正确结果），少数表达「完成 / 成功」（错误结果，会渲染成赤陶）。已知错用位置举例：`mcp-panel.css:126-129`（「已启用」图标）、`composer-live-input.css:118-125`（队列转向按钮，fallback 写的是绿色 `#2f6f5e`）、`usage-popover.css:52`（运行态色）、`usage-dashboard.css:1741-1743`、`:1772-1774`（速度指标）。

### 3.5 语义状态 Semantic states

这一组**只**在 `tokens.css` 定义，`workspace-theme.css` 完全不碰。它们是当前唯一还在生效的暖色以外色相，也是唯一的绿色来源。

| 变量 | 浅色生效值 | 深色生效值 | 被覆盖（负） | 生效（胜） |
| :--- | :--- | :--- | :--- | :--- |
| `--success` | `#226d40` | `#34d399` | — | **`tokens.css:121` / `:180`** |
| `--success-bg` | `#edf7ef` | `#064e3b` | — | **`tokens.css:122` / `:181`** |
| `--success-border` | `#aee4be` | `#065f46` | — | **`tokens.css:123` / `:182`** |
| `--warning` | `#975a06` | `#fbbf24` | — | **`tokens.css:125` / `:184`** |
| `--warning-bg` | `#fef7e9` | `#451a03` | — | **`tokens.css:126` / `:185`** |
| `--warning-border` | `#fedf89` | `#78350f` | — | **`tokens.css:127` / `:186`** |
| `--error` | `#b82420` | `#f87171` | — | **`tokens.css:129` / `:188`** |
| `--error-bg` | `#fef3f2` | `#450a0a` | — | **`tokens.css:130` / `:189`** |
| `--error-border` | `#fecdca` | `#7f1d1d` | — | **`tokens.css:131` / `:190`** |

### 3.6 主操作按钮 Run CTA

浅色近黑底白字、深色近白底黑字，均非赤陶：主按钮刻意不跟随强调色。

| 变量 | 浅色生效值 | 深色生效值 | 被覆盖（负） | 生效（胜） |
| :--- | :--- | :--- | :--- | :--- |
| `--run-bg` | `#35332e` | `#e9e6de` | `tokens.css:134` / `:193` | **`workspace-theme.css:24` / `:66`** |
| `--run-ink` | `#ffffff` | `#242320` | `tokens.css:135` / `:194` | **`workspace-theme.css:25` / `:67`** |
| `--run-hover` | `#49463f` | `#ffffff` | `tokens.css:136` / `:195` | **`workspace-theme.css:26` / `:68`** |
| `--run-active` | `#24221e` | `#d4d0c5` | `tokens.css:137` / `:196` | **`workspace-theme.css:27` / `:69`** |

### 3.7 阴影 Shadows

只有 `--shadow-composer` 被工作台主题改写（暖棕调）；其余四个仍是冷黑 `rgba(0, 0, 0, …)`，与暖纸底色不完全同调。

| 变量 | 浅色生效值 | 深色生效值 | 被覆盖（负） | 生效（胜） |
| :--- | :--- | :--- | :--- | :--- |
| `--shadow-sm` | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | `0 1px 2px 0 rgba(0, 0, 0, 0.4)` | — | **`tokens.css:140` / `:199`** |
| `--shadow-card` | `0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08)` | `0 1px 3px 0 rgba(0, 0, 0, 0.5)` | — | **`tokens.css:141` / `:200`** |
| `--shadow-overlay` | `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)` | `0 20px 25px -5px rgba(0, 0, 0, 0.7)` | — | **`tokens.css:143` / `:202`** |
| `--shadow-dropdown` | `0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05)` | `0 10px 15px -3px rgba(0, 0, 0, 0.6)` | — | **`tokens.css:144` / `:203`** |
| `--shadow-composer` | `0 2px 8px rgb(35 30 20 / 4%)` | `0 2px 8px rgb(0 0 0 / 8%)` | `tokens.css:142` / `:201` | **`workspace-theme.css:28` / `:70`** |

### 3.8 别名层 Aliases

全部定义在 `tokens.css` 的 `:root, [data-theme]` 块（L206–237），浅深主题共用同一份声明——它们自身不带颜色，只是把语义名映射到上面某一层。别名块在 `workspace-theme.css` 之前，但它们指向的目标变量在之后被覆盖，因此解析结果是工作台主题色。引用次数统计范围为全部 `.css` + `.ts` + `.tsx`。

| 变量 | 声明值 | 定义处 | 引用次数 |
| :--- | :--- | :--- | ---: |
| `--surface-body` | `var(--canvas-bg)` | `tokens.css:208` | 8 |
| `--surface-panel` | `var(--surface-soft)` | `tokens.css:209` | 1 |
| `--surface-control` | `var(--surface-elevated)` | `tokens.css:210` | 6 |
| `--neutral-0` | `var(--surface-elevated)` | `tokens.css:211` | 1 |
| `--neutral-1` | `var(--sidebar-bg)` | `tokens.css:212` | 1 |
| `--neutral-2` | `var(--surface-soft)` | `tokens.css:213` | 10 |
| `--neutral-3` | `var(--surface-hover)` | `tokens.css:214` | 3 |
| `--neutral-4` | `var(--border-subtle)` | `tokens.css:215` | 1 |
| `--neutral-5` | `var(--text-secondary)` | `tokens.css:216` | 6 |
| `--neutral-6` | `var(--text-secondary)` | `tokens.css:217` | 1 |
| `--neutral-7` | `var(--text-primary)` | `tokens.css:218` | 0 |
| `--neutral-8` | `var(--text-primary)` | `tokens.css:219` | 0 |
| `--hover-bg` | `var(--surface-hover)` | `tokens.css:220` | 4 |
| `--active-bg` | `var(--surface-active)` | `tokens.css:221` | 3 |
| `--selection-bg` | `var(--surface-selected)` | `tokens.css:222` | 1 |
| `--info` | `var(--accent-sage)` | `tokens.css:223` | 0 |
| `--info-bg` | `var(--accent-sage-soft)` | `tokens.css:224` | 0 |
| `--inset-highlight` | `transparent` | `tokens.css:225` | 0 |

`--neutral-3` 的三处引用在 TSX 内联样式里：`components/primitives/ApprovalPanel.tsx:60`、`components/primitives/ErrorState.tsx:47`、`showcase/PrimitiveShowcase.tsx:1027`。`--neutral-7`、`--neutral-8`、`--info`、`--info-bg`、`--inset-highlight` 零引用。

---

## 4. 组件作用域内的颜色变量

这些变量不进全局 token，只在某个选择器子树内定义，因此不受 §2 的两套调色板影响，也**从不参与** §3 的覆盖链。

### 4.1 上下文分段 `--context-*`（`usage-popover.css`，作用域 `.composer-usage`）

默认块（L1–14，无主题前缀）装的是**深色**值；`[data-theme="light"] .composer-usage`（L15–23）是浅色覆盖。也就是说它用「默认=深色 + light 覆盖」，与 §4.2 的约定相反。

| 变量 | 浅色（L16–22） | 深色（L2–8） | 引用次数 |
| :--- | :--- | :--- | ---: |
| `--context-instructions` | `#005faf` | `#5fafff` | 1 |
| `--context-memory` | `#870087` | `#d787ff` | 1 |
| `--context-conversation` | `#005f5f` | `#87d7af` | 1 |
| `--context-tools` | `#875f00` | `#ffaf5f` | 1 |
| `--context-reserve-border` | `var(--error, #b82420)` | `var(--error, #f87171)` | 2 |
| `--context-reserve-stripe-1` | `rgba(184, 36, 32, 0.5)` | `rgba(248, 113, 113, 0.5)` | 4 |
| `--context-reserve-stripe-2` | `rgba(184, 36, 32, 0.15)` | `rgba(248, 113, 113, 0.15)` | 4 |

消费者：`usage-popover.css:143-146`（`.usage-instructions` / `.usage-memory` / `.usage-conversation` / `.usage-tools` 的 `background`）、`:157-163` 与 `:204-210`（预留区条纹）。消费点由 `UsagePopover.tsx:344`、`:440` 用 `` `usage-${key}` `` 动态拼出，`key` 来自 `UsagePopover.tsx:55-60` 的 `categories`（instructions / memory / conversation / tools）。

浅色值 `#005faf` 蓝 / `#870087` 紫 / `#005f5f` 青 / `#875f00` 橄榄，是全库唯一一组蓝紫色，不来自任何主题 token。

### 4.2 用量看板 `--chart-*`（`usage-dashboard.css`，作用域 `.usage-dashboard-overlay`）

默认块（L6–12）装的是**浅色**值，`[data-theme="dark"] .usage-dashboard-overlay`（L30–37）覆盖为深色。

| 变量 | 浅色（L7–12） | 深色（L31–36） | 引用次数 |
| :--- | :--- | :--- | ---: |
| `--chart-completion` | `#a54f35` | `#dc9477` | 3 |
| `--chart-cached` | `#226d40` | `#56b881` | 3 |
| `--chart-uncached` | `#3b6998` | `#6ca6d9` | 4 |
| `--chart-cost` | `#975a06` | `#f0be65` | 2 |
| `--chart-speed` | `#55684d` | `#8fad82` | 1 |
| `--chart-failed` | `var(--error, #b82420)` | `var(--error, #f87171)` | 2 |

`--chart-uncached` = `#3b6998` / `#6ca6d9` 是蓝色。`--chart-failed` 正确跟随 `--error`，其余 5 个是字面量。CSS 消费点：`usage-dashboard.css:702,707,712,717,722,1025,1046,1144,1150,1295,1299,1303`；SVG 属性消费点：`UsageDashboard.tsx:1148,1161,1174`（`stroke="var(--chart-…)"`）。这些消费者都在 `.usage-dashboard-overlay` 子树内，因此能取到局部值。

### 4.3 运行态 `--usage-run-color`（`usage-popover.css`）

| 状态选择器 | 声明 | 行 |
| :--- | :--- | ---: |
| `.usage-track`（默认 / 运行中） | `var(--accent-sage, #2f6f5e)` | `usage-popover.css:52` |
| `.usage-track.is-awaiting` / `.is-retrying` | `var(--warning, #d97706)` | `usage-popover.css:65` |
| `.usage-track.is-cancelling` | `var(--error, #c2410c)` | `usage-popover.css:68` |

三个 fallback（`#2f6f5e` 绿 / `#d97706` 橙 / `#c2410c` 橙红）**永远不会渲染**——`--accent-sage`、`--warning`、`--error` 都已在 `:root` 定义。默认态实际取到赤陶 `#a54f35`，所以「运行中」和「已完成」在进度条上同色。消费点：`usage-popover.css:79,96-98`。

### 4.4 图表序列 `--chart-series` / `--chart-heat`（`workspace-theme.css`）

| 变量 | 浅色 | 深色 |
| :--- | :--- | :--- |
| `--chart-series`（L30 / L71） | `#a54f35, #55684d, #975a06, #7d5a7c, #68665f, #226d40, #6b5439` | `#dc9477, #8fad82, #f0be65, #c39bc1, #aaa79f, #56b881, #b89b7c` |
| `--chart-heat`（L32 / L72） | `#f6f3ee, #dc9477, #7a3520` | `#1c1b1a, #dc9477, #f2c4ae` |

这两个变量在 CSS 里的 `var()` 引用数是 **0**：ECharts 画在 canvas 上读不到 CSS 变量，由 `components/charts/theme.ts:37-48` 用 `getComputedStyle` 采样后按逗号拆成数组（`:39`、`:45`），并在 `data-theme` / `class` / `style` 变化时重建（`:80-85`）。所以它们是「被 JS 消费」而非「被 CSS 消费」。

### 4.5 组件内别名（`inspector.css`）

| 变量 | 值 | 定义处 | 引用次数 |
| :--- | :--- | :--- | ---: |
| `--surface-card` | `var(--surface-elevated)` | `inspector.css:6` | 0 |
| `--border-default` | `var(--border-control)` | `inspector.css:7` | 0 |

两个声明在 `.wb-app .wb-inspector` 作用域内，全仓库**没有任何消费者**，是纯遗留。

---

## 5. 被引用但从未定义的属性

方法：从全部 `.css` 收集 `^\s*--x\s*:` 形式的声明（157 个），再与全部 `.css` / `.ts` / `.tsx` 里的 `var(--x)` 引用（151 个不同名字）求差，也在构建产物里复核过（`--danger:` 等字符串出现 0 次）。结果 **18 个**，共 **76 处**引用；其中 12 个是颜色相关，6 个是排版/动效/间距。

「无 fallback」意味着整条声明失效（浏览器丢弃该声明），「有 fallback」意味着用回退值渲染。

| 属性 | 引用数 | 有无 fallback | 全部引用点 |
| :--- | ---: | :--- | :--- |
| `--danger` | 21 | 14 有 / **7 无** | 无：`tool-disclosure.css:1414,1415,1490,1638,1639,1727,1729`；有：`inspector.css:1188,1346,1433,1635,1636,1834,2006,2033`、`phone-pairing.css:113,114,115`、`settings-page.css:2301,2304,2309` |
| `--accent-subtle` | 12 | 12 有 / 0 无 | `inspector.css:223,506,677,855,948,1135,1388,1415,1576,1740,1825`、`workbench-header.css:121` |
| `--leading-normal` | 16 | 0 有 / **16 无** | `tool-disclosure.css:1121,1355,1744,1805,1815,1822,1860`、`inspector.css:2731,2781`、`settings-page.css:2024,2152,2172,2270,2282,2379`、`transcript.css:148` |
| `--duration-fast` | 4 | 4 有 / 0 无 | `tool-disclosure.css:776,854,855,856` |
| `--ease-out` | 4 | 4 有 / 0 无 | `tool-disclosure.css:776,854,855,856` |
| `--border-strong` | 3 | 0 有 / **3 无** | `tool-disclosure.css:1472`、`app.css:1263,1267` |
| `--shadow-xs` | 2 | 0 有 / **2 无** | `browser-panel.css:409`、`transcript.css:137` |
| `--leading-none` | 2 | 0 有 / **2 无** | `tool-disclosure.css:690,838` |
| `--surface-raised` | 2 | 1 有 / **1 无** | `tool-disclosure.css:835`（有）、`:1921`（无） |
| `--surface-sunken` | 2 | 2 有 / 0 无 | `phone-pairing.css:48,174` |
| `--accent-hover` | 1 | 1 有 / 0 无 | `transcript.css:287` |
| `--accent-primary` | 1 | 0 有 / **1 无** | `tool-disclosure.css:1939` |
| `--accent-terracotta` | 1 | 1 有 / 0 无 | `usage-dashboard.css:1734` |
| `--border` | 1 | 1 有 / 0 无 | `slash-menu.css:6` |
| `--danger-text` | 1 | 1 有 / 0 无 | `published-files.css:23` |
| `--leading-tight` | 1 | 0 有 / **1 无** | `tool-disclosure.css:774` |
| `--space-3-5` | 1 | 1 有 / 0 无 | `app.css:811` |
| `--surface` | 1 | 1 有 / 0 无 | `slash-menu.css:8` |

**会产生可见后果的 4 类：**

1. **`--accent-subtle` 的蓝色回退真的在渲染。** `workbench-header.css:121` 的 `var(--accent-subtle, rgba(59, 130, 246, 0.1))` 在详情按钮 `is-active` 时生效（`WorkbenchHeader.tsx:70` 的 `wb-details-toggle is-active`），这是全库唯一一处**真正显示出来的蓝**。
2. **`--danger` 无 fallback 的 7 处声明被丢弃。** 受影响：`.command-task-badge.status-failed`（`tool-disclosure.css:1412-1416`）、`.agent-report-card` 失败/中断的 2.5px 左状态条（`:1486-1490`）、`.child-status-badge.is-failed`（`:1635-1639`）、`.agent-error-box`（`:1721-1729`）。消费者存在（`tool-disclosure/commands.tsx:46`、`tool-disclosure/agents.tsx:298`），因此这些失败态目前只显示 `background`，前景色与边条退化为继承色。
3. **`--danger` 有 fallback 的 14 处各用各的红。** `#c84b31`（inspector:1188,1346；settings-page:2301,2304,2309）、`#e06c53`（inspector:1433,1834）、`#e76b6b`（inspector:1635,1636）、`#dc2626`（inspector:2006,2033）、`#b4423a`（phone-pairing:113-115），深浅主题下都不跟随 `--error`。
4. **`--leading-normal` 的 16 处行高声明整条失效**（不影响颜色，列入此表是为完整性）。同类还有 `--leading-none` 2 处、`--leading-tight` 1 处、`--shadow-xs` 2 处、`--accent-primary` 1 处、`--border-strong` 3 处（导致 `app.css:1263` 的 `agent-reconciliation-card` 2.5px 左边条取 `currentColor`）。

---

## 6. 组件样式表里的字面量颜色

### 6.1 分文件计数

`styles/tokens.css` 有 82 处、`styles/workspace-theme.css` 有 72 处（合计 154），属定义色板，是这些字面量合法的归宿。其余 **278 处**分布在 21 个文件。按性质拆分：

- **回退生效**（变量未定义，回退值真的渲染）
- **回退失效**（变量已定义，回退值永不生效）
- **mask**（`mask-image` 的 `#000`，不是可见颜色）
- **`--*` 声明**（组件内声明颜色变量，见 §4，属于合法局部定义）
- **主题预览**（`settings-page.css` 的主题缩略图，画的是另一套调色板的示意）
- **黑色阴影/遮罩**（`rgba(0,0,0,…)`，与主题无关的通用阴影/模态遮罩）
- **调色板硬编码**（真正意义上的 drift：绕开 token 写死某个主题色）

| 文件 | 合计 | 回退生效 | 回退失效 | mask | `--*` 声明 | 主题预览 | 黑色阴影/遮罩 | **调色板硬编码** |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `components/workbench/inspector.css` | 90 | 19 | 32 | 0 | 0 | 0 | 10 | **29** |
| `components/workbench/usage-dashboard.css` | 23 | 1 | 3 | 0 | 10 | 0 | 0 | **9** |
| `components/workbench/settings-page.css` | 30 | 3 | 0 | 0 | 0 | 25 | 1 | **1** |
| `components/workbench/phone-pairing.css` | 7 | 3 | 3 | 0 | 0 | 0 | 0 | **1** |
| `components/primitives/html-preview.css` | 3 | 0 | 0 | 0 | 0 | 0 | 2 | **1** |
| `components/primitives/tool-disclosure.css` | 3 | 1 | 1 | 0 | 0 | 0 | 0 | **1** |
| `components/workbench/slash-menu.css` | 2 | 1 | 0 | 0 | 0 | 0 | 0 | **1** |
| `components/workbench/transcript.css` | 2 | 1 | 0 | 0 | 0 | 0 | 0 | **1** |
| `styles/settings-models.css` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | **1** |
| `components/workbench/workspace-picker.css` | 31 | 0 | 26 | 0 | 0 | 0 | 5 | 0 |
| `components/workbench/usage-popover.css` | 17 | 0 | 5 | 0 | 12 | 0 | 0 | **0** |
| `components/workbench/plugin-panel.css` | 15 | 0 | 15 | 0 | 0 | 0 | 0 | 0 |
| `components/workbench/composer-live-input.css` | 14 | 0 | 14 | 0 | 0 | 0 | 0 | 0 |
| `components/workbench/browser-panel.css` | 11 | 0 | 11 | 0 | 0 | 0 | 0 | 0 |
| `components/workbench/workbench.css` | 10 | 0 | 2 | 8 | 0 | 0 | 0 | 0 |
| `components/workbench/composer-layout.css` | 6 | 0 | 6 | 0 | 0 | 0 | 0 | 0 |
| `components/workbench/app.css` | 5 | 0 | 1 | 0 | 0 | 0 | 4 | 0 |
| `components/workbench/published-files.css` | 3 | 1 | 2 | 0 | 0 | 0 | 0 | 0 |
| `components/workbench/workbench-header.css` | 3 | 1 | 0 | 0 | 0 | 0 | 2 | 0 |
| `components/workbench/mcp-panel.css` | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| `showcase/showcase.css` | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| **合计** | **278** | **31** | **122** | **8** | **22** | **25** | **25** | **45** |

另有 1 处颜色写在 data-URI 内，按定义算合法但**不随主题变化**：`components/primitives/forms.css:67` 的下拉箭头 SVG `fill='%23697586'`（解码为 `#697586`，冷蓝灰，来自旧锌灰体系）。

### 6.2 调色板硬编码明细（45 处）

| 文件 | 行 | 字面量 | 声明 |
| :--- | ---: | :--- | :--- |
| `components/primitives/html-preview.css` | 114 | `#ffffff` | `background: #ffffff;` |
| `components/primitives/tool-disclosure.css` | 795 | `#e5a93b` | `color: #e5a93b;`（目录图标黄，无对应 token） |
| `components/workbench/inspector.css` | 237 | `#000` | `color: #000;`（配 `var(--warning, #eab308)` 底，深色下不换色） |
| `components/workbench/inspector.css` | 846 | `#faf9f6` | `color: #faf9f6;`（写死浅色画布色作反白字） |
| `components/workbench/inspector.css` | 851 | `#171716` | `color: #171716;`（写死深色画布色作反白字） |
| `components/workbench/inspector.css` | 1189 | `rgba(200, 75, 49, 0.08)` | `background: …` |
| `components/workbench/inspector.css` | 1190 | `rgba(200, 75, 49, 0.22)` | `border-color: …` |
| `components/workbench/inspector.css` | 1387 | `rgba(165, 79, 53, 0.28)` | `border-color: …` |
| `components/workbench/inspector.css` | 1393 | `rgba(47, 111, 94, 0.25)` | `border-color: …`（旧鼠尾草绿） |
| `components/workbench/inspector.css` | 1394 | `rgba(47, 111, 94, 0.08)` | `background: …`（旧鼠尾草绿） |
| `components/workbench/inspector.css` | 1417 | `rgba(165, 79, 53, 0.26)` | `border-color: …` |
| `components/workbench/inspector.css` | 1421 | `rgba(47, 111, 94, 0.24)` | `border-color: …` |
| `components/workbench/inspector.css` | 1432 | `rgba(200, 75, 49, 0.12)` | `background: …` |
| `components/workbench/inspector.css` | 1434 | `rgba(200, 75, 49, 0.28)` | `border: 1px solid …` |
| `components/workbench/inspector.css` | 1440 | `rgba(200, 75, 49, 0.2)` | `background: …` |
| `components/workbench/inspector.css` | 1441 | `rgba(200, 75, 49, 0.42)` | `border-color: …` |
| `components/workbench/inspector.css` | 1622 | `rgba(165, 79, 53, 0.45)` | `border-left-color: …` |
| `components/workbench/inspector.css` | 1626 | `rgba(47, 111, 94, 0.45)` | `border-left-color: …` |
| `components/workbench/inspector.css` | 1709 | `rgba(165, 79, 53, 0.35)` | `border-color: …` |
| `components/workbench/inspector.css` | 1741 | `rgba(165, 79, 53, 0.22)` | `border: 1px solid …` |
| `components/workbench/inspector.css` | 1824 | `rgba(165, 79, 53, 0.3)` | `border-color: …` |
| `components/workbench/inspector.css` | 1835 | `rgba(200, 75, 49, 0.08)` | `background: …` |
| `components/workbench/inspector.css` | 1836 | `rgba(200, 75, 49, 0.2)` | `border-top: 1px solid …` |
| `components/workbench/inspector.css` | 2022 | `rgba(217, 119, 6, 0.08)` | `background: …` |
| `components/workbench/inspector.css` | 2023 | `rgba(217, 119, 6, 0.2)` | `border-color: …` |
| `components/workbench/inspector.css` | 2028 | `rgba(22, 163, 74, 0.08)` | `background: …`（`#16a34a` 的 rgba 形式，规范禁用亮绿） |
| `components/workbench/inspector.css` | 2029 | `rgba(22, 163, 74, 0.2)` | `border-color: …`（同上） |
| `components/workbench/inspector.css` | 2034 | `rgba(220, 38, 38, 0.08)` | `background: …` |
| `components/workbench/inspector.css` | 2035 | `rgba(220, 38, 38, 0.2)` | `border-color: …` |
| `components/workbench/inspector.css` | 2060 | `rgba(234, 179, 8, 0.06)` | `background: …` |
| `components/workbench/inspector.css` | 2061 | `rgba(234, 179, 8, 0.25)` | `border: 1px solid …` |
| `components/workbench/usage-dashboard.css` | 1738 | `#dc9477` | `color: #dc9477;`（深色赤陶写死） |
| `components/workbench/usage-dashboard.css` | 1794 | `rgba(85, 104, 77, 0.08)` | `radial-gradient` 色标 |
| `components/workbench/usage-dashboard.css` | 1806 | `rgba(143, 173, 130, 0.12)` | `radial-gradient` 色标 |
| `components/workbench/usage-dashboard.css` | 1808 | `#181b17` | 深色舞台底色 |
| `components/workbench/usage-dashboard.css` | 1857 | `#a54f35` | `.usage-3d-dot.is-forge` 背景 |
| `components/workbench/usage-dashboard.css` | 1861 | `#55684d` | `.usage-3d-dot.is-provider` 背景 |
| `components/workbench/usage-dashboard.css` | 1865 | `#8c7362` | `.usage-3d-dot.is-model` 背景 |
| `components/workbench/usage-dashboard.css` | 1869 | `#a54f35` | `.usage-3d-dot.is-session` 背景 |
| `components/workbench/usage-dashboard.css` | 1873 | `#226d40` | `.usage-3d-dot.is-subagent` 背景 |
| `components/workbench/phone-pairing.css` | 145 | `#fff` | `.phone-pairing-qr` 背景（二维码静区需纯白） |
| `components/workbench/settings-page.css` | 950 | `#ffffff` | `color: #ffffff;`（压 `--accent` 的勾选标记） |
| `components/workbench/slash-menu.css` | 19 | `#8882` | 悬停底色（`#8888` + 13% alpha） |
| `components/workbench/transcript.css` | 92 | `#ffffff` | `color-mix(in srgb, var(--accent) 72%, #ffffff)` 色标 |
| `styles/settings-models.css` | 242 | `rgb(255 255 255 / 0.5)` | 滑条 shimmer 高光 |

### 6.3 合法但不跟随主题的字面量（需要知道，但不算 drift）

| 类别 | 数量 | 位置举例 | 说明 |
| :--- | ---: | :--- | :--- |
| 变量回退（生效） | 31 | `inspector.css` 19、`phone-pairing.css` 3、`published-files.css` 1、`workbench-header.css` 1、`tool-disclosure.css` 1、`usage-dashboard.css` 1、`usage-popover.css` 0（其回退全失效）、`slash-menu.css` 1、`transcript.css` 1 | 因为对应变量未定义才渲染，见 §5 |
| 变量回退（失效） | 122 | `inspector.css` 32、`workspace-picker.css` 26、`plugin-panel.css` 15、`composer-live-input.css` 14、`browser-panel.css` 11、… | 纯噪音，删掉不影响渲染 |
| `mask-image` 的 `#000` | 8 | `workbench.css:270,273,458,461,471,474,558,561` | 遮罩色，与视觉颜色无关 |
| 组件内 `--*` 声明 | 22 | `usage-popover.css` 12、`usage-dashboard.css` 10 | 见 §4，属局部定义 |
| 主题预览 | 25 | `settings-page.css:504-635` | 设置页三张主题缩略图，刻意画 zinc/emerald 与深色两套参照图 |
| 黑色阴影/模态遮罩 | 25 | `inspector.css:146,197,297,354,397,403,532,537,1302,1327`、`app.css:410,416,509,1221`、`workspace-picker.css:21,32,95,118,119`、`workbench-header.css:112,118`、`html-preview.css:18,27`、`settings-page.css:1570`、`showcase.css:92` | 通用黑色透明，浅深通用 |
| data-URI | 1 | `forms.css:67` | 下拉箭头 `#697586` |

`workspace-picker.css` 的 26 处回退全部指向已定义变量（`--accent`、`--accent-sage-soft`、`--warning*`、`--error*`），所以它们全部失效；`plugin-panel`、`composer-live-input`、`browser-panel`、`composer-layout` 的 46 处同理。

---

## 7. 规范禁用色（蓝 / 亮绿）的实际分布

| 值 | 位置 | 写法 | 是否渲染 |
| :--- | :--- | :--- | :--- |
| `rgba(59, 130, 246, 0.1)` | `workbench-header.css:121` | `var(--accent-subtle, …)` | **是**（`--accent-subtle` 未定义，回退生效，详情按钮激活态） |
| `#3b82f6` | `workbench.css:395` | `var(--accent, #3b82f6)` | 否（`--accent` 已定义） |
| `#16a34a` | `inspector.css:2002, 2027` | `var(--success, #16a34a)` | 否（`--success` 已定义） |
| `rgba(22, 163, 74, …)` | `inspector.css:2028, 2029` | 直接写字面量 | **是**（增量/新增的 8%/20% 染底） |
| `#3b6998` | `usage-dashboard.css:9` | `--chart-uncached` 浅色 | **是** |
| `#6ca6d9` | `usage-dashboard.css:33` | `--chart-uncached` 深色 | **是** |
| `#005faf` / `#870087` / `#005f5f` / `#875f00` | `usage-popover.css:16-19` | `--context-*` 浅色 | **是** |
| `#5fafff` / `#d787ff` / `#87d7af` / `#ffaf5f` | `usage-popover.css:2-5` | `--context-*` 深色 | **是** |

即：禁用的蓝紫并非只存在于死回退里——进度条上下文分段与用量看板的 `--chart-uncached` 是**当前实际渲染**的蓝/紫，`workbench-header` 的激活态蓝也在渲染。

---

## 8. 行外颜色：TS/TSX 里的字面量

canvas 绘制与二维码生成读不到 CSS 变量，因此另有写死的色板。它们不参与 CSS 层叠，修改主题色时**不会**跟着变。

| 文件 | 字面量数 | 位置 | 说明 |
| :--- | ---: | :--- | :--- |
| `components/charts/theme.ts` | 43 | `:40,45,50-62`（采样回退）+ `:91-103`（`FALLBACK_THEME`） | 回退值本身是暖色板数值；正常路径由 `--chart-series` / `--chart-heat` 覆盖 |
| `components/workbench/UsageOverview.tsx` | 33 | `:970-988`（深/浅两套完整色板）、`:1133,1259,1331,1456`（透明黑渐变端点）、`:1486-1492`（标签气泡底色与描边） | 3D 用量图，自成一套调色板 |
| `components/workbench/PhonePairing.tsx` | 2 | `:101` | QR `color: { dark: "#12100e", light: "#ffffff" }`，需实际黑白对比，不能跟主题 |

`UsageOverview.tsx` 的取样方式是读 `document.documentElement` 的 `data-theme` / `dataset.theme`（`:965-967`），因此与 CSS 主题同源，但色值独立。

---

## 9. 复现与核对

在 `repos/forge-web-ui/src/renderer` 下执行以下命令可复核本文数字。

列出所有颜色属性定义（含行号）：

```sh
grep -rnE '^\s*--[a-zA-Z0-9_-]+\s*:' --include='*.css' . | grep -E '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|var\(--'
```

求「被引用但从未定义」：

```sh
comm -23 \
  <(grep -rhoE 'var\(--[a-zA-Z0-9_-]+' --include='*.css' --include='*.ts' --include='*.tsx' . | sed 's/var(//' | sort -u) \
  <(grep -rhoE '^\s*--[a-zA-Z0-9_-]+\s*:' --include='*.css' . | sed -E 's/^\s*//; s/\s*:$//' | sort -u)
```

确认构建产物里谁赢（对任意属性替换 `--canvas-bg`）：

```sh
python3 - <<'PY'
import re
s=open('dist/renderer/assets/index-DP7_ruyt.css',encoding='utf-8').read()
print([(m.start(), m.group(1)) for m in
       re.finditer(r'--canvas-bg:\s*([^;}]+)', s)])
PY
```

末项即胜出者；如需连选择器一起看，把匹配起点向前截 200 字节打印。

统计字面量（按是否落在 `var(...)` 内、是否 `mask-image`、是否 `--*` 声明分类）：

```sh
grep -rnoE '#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)' --include='*.css' . | sort | uniq -c | sort -rn
```

---

## 10. 本文未覆盖 / 无法从源码确定的点

- **对比度**：本文只列色值，不计算对比度。实测对比度见 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) §2.5。
- **实际渲染后的 `color-mix()` 结果**：`color-mix(in srgb, …)` 的最终色值取决于两个操作数，本文只记录表达式与操作数。全库 CSS 共 136 处 `color-mix()`，分布在 15 个文件（`inspector.css`、`browser-panel.css`、`plugin-panel.css`、`composer-layout.css`、`composer-live-input.css`、`workspace-picker.css`、`transcript.css`、`settings-page.css`、`phone-pairing.css`、`provider-sources.css`、`model-access.css`、`tool-disclosure.css`、`usage-popover.css`、`usage-dashboard.css` 等），未按色值逐条展开。
- **浏览器实际取到的回退值**：当回退值本身语法无效时（如 `#8884` 4 位十六进制在旧引擎上），浏览器会丢弃整条声明。本文按现代 Chromium 语义认为 `#rgba` 合法。项目目标运行时（Electron / Chromium）支持该语法。
- **懒加载 chunk 的到达时序**：`Settings`、`UsageDashboard`、`PrimitiveShowcase` 的 CSS 在首次打开面板时才追加，追加位置永远在 `index-*.css` 之后。因此它们内部的规则在特异性相同时会赢过静态表。本文记录的变量都是选择器作用域内定义，不受该时序影响，但**新增同选择器规则时需要意识到这一点**。
- **`dist/` 产物可能落后于源码**：§1.2 与 §1.3 的产物偏移取自 2026-10-28 的构建；若源码已改而未重建，偏移与内容都会变。以源码为准，产物仅作层叠验证。
