# 本仓库的代理工作约定

- 子代理固定使用 `cn:deepseek-v4.1-flash`，除非用户明确指定其他模型；失败不自动切换模型或重放任务。

## 范围

- 本仓库是独立的 Forge Web UI 仓库，只负责 `src/renderer` 的 React 界面、renderer 测试，以及 `scripts/dev.mjs` / `scripts/serve.mjs` 的薄启动装配。
- 不复制、不修改 Core 的 HTTP/WebSocket 服务、RPC、存储、provider、工具运行时实现；这些属于 `@forge/core`。
- **修改任何界面组件、弹窗或 CSS 前，必须先阅读并严格遵守 [Web UI 设计规范与组件约定](docs/WEB_UI_LAYOUT_SPEC.md)**；启动与进程边界见 [docs/WEB_DEV.md](docs/WEB_DEV.md)；不把一次性拆分任务或旧验收结果写成永久限制。需要查某个 token 或尺寸的真实生效值、或确认某处实现是否为已知偏差时，查 [设计系统参考](docs/DESIGN_SYSTEM.md)——它记录事实，规范记录要求，冲突时以规范为准。

## 设计规范与视觉约束（修改 UI 必读）

完整规范见 [`docs/WEB_UI_LAYOUT_SPEC.md`](docs/WEB_UI_LAYOUT_SPEC.md)，修改时必须遵守以下核心红线：

- **主题与色彩 Token**：颜色只在 `src/renderer/styles/workspace-theme.css` 定义（浅色暖纸 `#faf9f6` / 深色石墨 `#171716`，赤陶主色 `--accent: #a54f35` / `#dc9477`）；字号、间距、圆角、布局、动效刻度只在 `tokens.css` 定义。组件只引用语义 token：主强调用 `var(--accent)` / `var(--accent-soft)`，成功语义用 `var(--success)`，错误用 `var(--error)`，焦点用 `var(--focus-ring)` / `var(--focus-halo)`（中性墨色，不与错误色混淆）。`--accent-sage`、`--danger` 已移除，不要再引入。严禁硬编码 Tailwind 亮绿 `#16a34a` 或任何蓝色（`#3b82f6`、`#2563eb`、`rgba(59, 130, 246, ...)`），严禁红绿跨色相渐变。字号与圆角禁止写字面 px，使用 `--text-*` / `--radius-*`。提交前运行 `pnpm lint:css` 与 `pnpm check:css-vars`。
- **禁止原生简陋控件与边框套娃**：严禁新增原生 `<select>` 或裸 `<input type="checkbox">`，统一使用工作台自定义无障碍下拉组件（如 `SettingsSelect`、`ComposerDropdown`）与开关卡片（`.settings-toggle-card`）。父子容器交替使用 `--surface-elevated` 与 `--surface-soft`，设置页与详情栏严禁 3 层以上无意义边框套娃；空状态统一使用虚线引导卡片。
- **防挤压与高度稳定**：`<dl>` 键值列表必须使用 `grid-template-columns: auto minmax(0, 1fr)` 并为 `<dt>` 设置 `white-space: nowrap`，严禁让右侧长公式把左侧标签挤成单字竖排；执行态动画合成在底部上下文进度条上，严禁在输入框上方动态增删文字提示行导致布局跳动。

## 依赖与导入

- `@forge/core` 声明为相邻的 `file:../forge-core`。独立克隆按 README 安装；Core 重建后如仍解析旧副本，用 `pnpm install --no-frozen-lockfile` 刷新并审阅锁文件。主仓 `setup` / `build:web` 会链接本地 Core，不用该命令刷新副本。本仓 `pnpm-workspace.yaml` 避免向上进入其他 workspace。
- renderer、测试、动态 import、`import type` 和内嵌 esbuild 字符串里，跨目录引用一律使用 `@forge/core/...` 子路径；不要恢复 `src/shared`、`src/core`、`src/web` 等相对源码引用，也不要用 Vite/TS alias 隐藏未解耦引用。
- 新增依赖必须写进本仓库 `package.json`，不要依赖父仓库或 Core 的 `node_modules` 传递依赖。
- 生产构建保持 `src/renderer/index.html` 的原 CSP；同源 `connect-src` 放宽由 Core 静态宿主完成。不要为了本地 HMR 修改生产 HTML 的 CSP。

## 常用命令

```sh
cd ../forge-core && pnpm build
cd ../forge-web-ui
pnpm install
pnpm build
# 独立终端启动 Core（已有 Core 时不要重复启动或重启）
node ../forge-core/dist/web/serve.js --host 127.0.0.1 --port 5175 --workspace /absolute/path --multi-workspace
# 开发 / 生产二选一，均不持有运行时
pnpm dev -- --host 127.0.0.1 --port 5173 --core-url http://127.0.0.1:5175
pnpm serve -- --host 127.0.0.1 --port 5173 --core-url http://127.0.0.1:5175
```

- 只改文档时不需要重新构建 Core 或 UI。
- 本机持续开发用 Vite：修改本仓 `src/renderer` 由 HMR 生效，不用编译 UI 或重启服务；修改 `scripts/dev.mjs` 只重启 Web，不重启独立 Core。不要恢复内嵌 harness 的单进程开发入口。
- 仅 Core 代码变动才重新构建 Core/刷新包依赖；生产静态 Web 仍需 UI build。不要默认执行桌面打包、Electron 安装、Android 构建或完整发布验收。

## 测试

- 优先跑与改动相关的聚焦测试；不要默认跑全量 UI 套件。
- 代码改动按风险选择构建、聚焦测试和真实浏览器检查；文档修改只检查内容和引用。检查失败时用当前证据区分既有问题与回归，不沿用旧轮次的失败数或通过结论。
- 浏览器测试使用临时目录/临时状态，不读取真实 `FORGE_HOME`、密钥或外部 provider；可以模型未配置状态验证渲染与导航。
- 现有 Playwright 可用时不要重新安装浏览器；需要时用 `FORGE_BROWSER_EXECUTABLE` 指定本机浏览器。
- 真实浏览器烟测前先 `pnpm build`；没有构建产物时浏览器入口不能声称已验证。

## 修改与提交

- 保留用户和并发任务已有修改；不从旧单体归档自动移植源码或恢复第二套实现。
- 每一轮有仓库改动时，只暂存本轮自己改的文件并做本地 commit；默认不 `git push`，不 `--amend` 他人提交。
