# Web 工作台界面约定

本文件描述独立 Web 仓库的设计来源和修改约束。启动步骤见 [WEB_DEV.md](WEB_DEV.md)；旧单体的布局迁移清单不再作为待执行任务。

## 设计来源与层级

生产入口是 [main.tsx](../src/renderer/main.tsx)，工作台由 [App.tsx](../src/renderer/components/workbench/App.tsx) 装配。

- [tokens.css](../src/renderer/styles/tokens.css) 定义字体、字号、间距、圆角和基础尺寸。
- [workspace-theme.css](../src/renderer/styles/workspace-theme.css) 提供工作台的暖白 / 石墨黑 / 赤陶色，以及更紧凑的尺寸覆盖。
- [sidebar-compact.css](../src/renderer/styles/sidebar-compact.css) 负责侧栏密度；[app.css](../src/renderer/components/workbench/app.css) 负责主布局和响应式行为。

判断样式以实际加载顺序、选择器和计算值为准，不把基础 token 当成最终颜色。复用现有 token 和组件，不为单个页面叠加另一套主题或壳。

桌面工作台主题使用 44px 标题栏、760px 阅读列、264px 侧栏；基础详情栏 380px，紧凑详情栏 320px。窄屏和触控覆盖以对应 CSS 为准，不通过缩小正文来容纳更多控件。

## 布局与对齐

- 标题、对话和输入区维持清晰的阅读轴；长会话名、路径和模型名可收缩/省略，完整信息仍可查看。
- 宽屏详情栏可收起；收起后不接收指针和焦点。1001–1366px 下展开详情时使用 232px 侧栏和 320px 详情栏；中间区域允许收缩，不承诺固定最小阅读宽度。
- 1000px 及以下转为纵向工作台，通过导航切换任务与详情，侧栏使用抽屉；768px 及以下另有输入工具栏换行和触控尺寸覆盖。
- 欢迎态、对话态、错误提示和队列出现时，避免输入区抖动及内外双重滚动。保留当前阅读位置，不能用滚动到底掩盖布局问题。
- 工具卡标题保持紧凑，图标、状态、文件名与展开按钮对齐。文件读取摘要只显示文件名，完整路径放详情；编辑卡同时检查变更预览、展开与失败状态。
- 模型来源新增/编辑使用独立弹窗；外层保留模型浏览入口和已有来源，不把多个来源压成一个全局配置表单。
- 键盘焦点、Escape 关闭后的焦点恢复、触控目标及 reduced-motion 行为都属于交互契约。

## 品牌资源

首页和侧栏共用 `ForgeMark` 与透明 [forge-mark-v3.png](../src/renderer/public/forge-mark-v3.png)：铁砧、负形 F、橙红锻痕与火星，不另加底板或滤镜。首页使用 40px，侧栏 32px；设置固有宽高并禁止收缩。与品牌文字并列时图片使用空 `alt`，避免重复播报。标签页使用独立的 [64px favicon](../src/renderer/public/forge-favicon-v3.png)。

## 修改后的检查

按受影响界面选用聚焦测试，例如：

```sh
pnpm exec vitest run tests/renderer/inspector-layout-mounted.test.ts \
  tests/renderer/new-session-mounted.test.ts tests/renderer/new-session-layout-mounted.test.ts
pnpm build
```

布局或交互改动还需查看真实浏览器：明暗主题、390px 手机、768/1024px 中屏、1440px 桌面；三栏改动补看 1920px。检查水平溢出、正文可读性、弹窗边缘、键盘操作，以及欢迎/发送/运行/失败状态。记录实际覆盖范围；构建通过不代替视觉验收。纯文档修改无需重建 UI。
