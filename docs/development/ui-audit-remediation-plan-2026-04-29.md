# AI 小说创作工作台 UI 专业审查与修改文档

日期：2026-04-29  
用途：交给其他 AI 或前端开发者执行 UI 收敛、设计系统一致性修复和可访问性补强。

## 1. 审查依据

本次 UI 审查基于：

1. 项目 UI 设计规格：`docs/design/ai-novel-workbench-ui-design-spec.md`
2. 项目 UI 规则：`docs/development/ui-implementation-rules.md`
3. 架构重构文档：`docs/development/architecture-refactor-plan-2026-04-29.md`
4. Web Interface Guidelines：`https://github.com/vercel-labs/web-interface-guidelines`

当前页面整体方向已经接近“现代创作工作台”，但实现仍存在明显设计分叉：局部页面像专业工具，局部页面像调试页或 AI 临时生成页；部分控件绕过设计系统；视觉层级、圆角、间距、焦点态和响应式策略还不统一。

## 2. 总体结论

当前 UI 最大问题不是“丑”，而是“不稳定”：同一个产品里同时存在工作台风格、卡片型仪表盘风格、调试后台风格、AI 面板风格。用户在不同模块之间切换时，会感到信息密度、按钮样式、面板边界、标题层级、交互反馈都在变化。

需要优先解决：

1. 页面布局不统一：有些页面使用 `NAppLayout`，有些页面自己手写三栏或双栏。
2. 设计系统未完全落地：很多原生 `button/input/select/textarea` 仍直接写 class。
3. 视觉过度装饰：`rounded-xl/2xl/3xl`、`shadow-lg/xl`、大标题、卡片堆叠使界面偏“展示页”，不够工作台。
4. 可访问性不足：icon-only 按钮缺 `aria-label`，表单控件缺 label/name，`outline-none` 多处没有明确 `focus-visible` 替代。
5. 响应式不完整：桌面三栏有雏形，但平板折叠、移动底部导航、右侧上下文抽屉尚未形成统一规则。
6. AI 确认区 UI 不一致：写作页已有确认区，大纲页和 AI 侧栏仍未统一到同一套交互语言。

## 3. 重点 UI 问题清单

### P0：当前 UI 验收被构建问题阻塞

在做视觉修改前，必须先修复当前 review 中的构建问题：

- API route build 问题
- `DataViewer.vue` 模板结束标签问题
- `DataViewer.vue` slot 名称问题
- 原生 `confirm()` 残留

原因：只要 `pnpm check` 不通过，就无法可靠验证 UI 修改有没有引入新问题。UI 修复必须以可构建为前提。

验收：

```bash
pnpm check
```

### P1：布局系统没有真正统一

相关文件：

- `packages/ui/src/components/NAppLayout.vue`
- `apps/web/src/components/AppSidebar.vue`
- `apps/web/src/views/CharactersView.vue`
- `apps/web/src/views/OutlineView.vue`
- `apps/web/src/views/WritingView.vue`
- `apps/web/src/views/RelationshipsView.vue`
- `apps/web/src/views/ConflictMatrixView.vue`
- `apps/web/src/views/KnowledgeBaseView.vue`
- `apps/web/src/views/QualityReviewView.vue`
- `apps/web/src/views/VersionHistoryView.vue`

问题：

1. `NAppLayout` 已提供 `nav/main/context` 区域，但多个页面仍自己写 `h-full flex overflow-hidden bg-bg-page`。
2. `NAppLayout` 的左侧 aside 已有边框，`AppSidebar` 根节点也有 `border-r`，容易产生双边框。
3. 页面 header 高度、padding、返回按钮位置不一致。
4. 右侧上下文面板有时是 `context` slot，有时是页面内部 aside，有时是隐藏面板。

修改要求：

1. 所有项目内业务页统一使用 `NAppLayout`。
2. `AppSidebar` 根节点去掉 `border-r`，边框由 `NAppLayout` 控制。
3. 业务页顶部统一使用：
   - 左：返回书库 / 项目名 / 当前模块
   - 右：当前页面主操作
4. 写作、大纲、知识库、质量评估统一使用右侧 context 或 drawer，不再各自发明侧栏结构。

验收：

```bash
rg -n "h-full flex overflow-hidden bg-bg-page|border-r border-border-light bg-bg-surface" apps/web/src/views apps/web/src/components
```

允许 `NAppLayout` 和少数 feature component 存在，业务 view 中应逐步减少。

### P1：页面视觉层级过重，不够工作台

相关位置示例：

- `apps/web/src/views/ProjectHomeView.vue`
- `apps/web/src/views/ProjectListView.vue`
- `apps/web/src/views/KnowledgeBaseView.vue`
- `apps/web/src/features/knowledge/components/KnowledgeSourceDrawer.vue`
- `apps/web/src/features/writing/components/AIPendingResultPanel.vue`
- `apps/web/src/views/ConflictMatrixView.vue`
- `apps/web/src/views/RelationshipsView.vue`

问题：

1. 大量 `rounded-xl`、`rounded-2xl`、`rounded-3xl` 超出专业工具的克制感。
2. `shadow-lg`、`shadow-xl`、`shadow-primary/20` 分散出现，造成模块像营销卡片。
3. `text-3xl`、`text-4xl` 在内页过多，和“信息密度适中”的工作台目标冲突。
4. 有些页面同时使用大标题、大卡片、大圆角、强阴影，视觉焦点过多。

修改要求：

1. 业务页面内常规卡片圆角统一为 `rounded-lg` 或设计系统默认圆角。
2. 页面级卡片阴影统一使用 `shadow-sm` 或取消阴影，用边框区分层级。
3. 内页标题控制在：
   - 页面标题：`text-xl` 或 `text-2xl`
   - 面板标题：`text-sm` 到 `text-base`
   - 写作正文标题可保留文学字体，但避免在工具面板里使用 `text-4xl`
4. 只保留少量 AI 相关强调色，不让整页被 AI 紫色或大面积色块主导。

验收：

```bash
rg -n "rounded-2xl|rounded-3xl|shadow-lg|shadow-xl|text-4xl|text-3xl" apps/web/src/views apps/web/src/features
```

目标不是归零，而是只保留确有必要的视觉焦点。

### P1：设计系统组件没有完全替代原生控件

相关文件：

- `apps/web/src/views/ProjectListView.vue`
- `apps/web/src/views/CharactersView.vue`
- `apps/web/src/views/OutlineView.vue`
- `apps/web/src/views/ConflictMatrixView.vue`
- `apps/web/src/views/RelationshipsView.vue`
- `apps/web/src/views/KnowledgeBaseView.vue`
- `apps/web/src/components/AIAssistantSidebar.vue`
- `apps/web/src/features/outline/components/ChapterOutlineEditor.vue`
- `apps/web/src/features/writing/components/EditorPane.vue`

问题：

1. 多处直接使用 `<button>`、`<input>`、`<select>`、`<textarea>` 并手写 class。
2. 原生控件样式不完全一致，focus、disabled、error、loading 状态分散。
3. 有些 icon-only button 只有 `title` 或没有 `aria-label`。
4. 表单字段的 label/name/autocomplete 不完整。

修改要求：

1. 常规按钮改用 `NButton` 或 `NIconButton`。
2. 表单输入改用 `NInput`、`NTextArea`、`NSelect`。
3. 如果需要特殊编辑器 textarea，可以保留原生 textarea，但必须补：
   - `aria-label`
   - 明确 focus-visible 样式
   - 长文本 overflow 策略
4. icon-only 按钮必须使用 `NIconButton` 或补齐：
   - `aria-label`
   - tooltip/title
   - visible focus state

验收：

```bash
rg -n "<button|<input|<select|<textarea" apps/web/src/views apps/web/src/features apps/web/src/components
rg -n "aria-label" apps/web/src/views apps/web/src/features apps/web/src/components
```

剩余原生控件必须有明确理由。

### P1：焦点态和键盘可访问性不足

相关位置示例：

- `apps/web/src/views/ProjectListView.vue`
- `apps/web/src/views/CharactersView.vue`
- `apps/web/src/views/OutlineView.vue`
- `apps/web/src/views/ConflictMatrixView.vue`
- `apps/web/src/features/outline/components/ChapterOutlineEditor.vue`
- `apps/web/src/features/writing/components/EditorPane.vue`

问题：

1. 多处出现 `focus:outline-none`，但没有 `focus-visible:ring-*` 替代。
2. 自定义卡片按钮、章节树按钮、人物列表按钮 hover 明显，但键盘 focus 不明显。
3. 一些 clickable card 使用按钮语义不稳定，内部还嵌套小按钮，容易造成键盘操作混乱。

修改要求：

1. 所有可交互元素必须有 `focus-visible:ring-2` 或同等可见状态。
2. 不允许单独使用 `focus:outline-none`。
3. 列表项如可点击，优先用 `<button>`；如果是导航，用 `<router-link>`。
4. 避免 button 内嵌 button；需要拆成独立操作区。

验收：

```bash
rg -n "focus:outline-none" apps/web/src
rg -n "transition-all" apps/web/src
```

`transition-all` 也应收敛为 `transition-colors`、`transition-shadow`、`transition-transform` 等明确属性。

### P1：AI 交互视觉语言不统一

相关文件：

- `apps/web/src/features/writing/components/AIPendingResultPanel.vue`
- `apps/web/src/features/outline/components/OutlineAIPanel.vue`
- `apps/web/src/components/AIAssistantSidebar.vue`
- `apps/web/src/views/OutlineView.vue`
- `apps/web/src/views/WritingView.vue`

问题：

1. 写作页已有 AI pending result panel，但大纲页 AI 面板仍是单独样式。
2. AI 建议的操作命名不统一：有的叫 Apply，有的叫 应用到大纲，有的是悬浮按钮。
3. AI 结果区缺少统一的“输入依据 / 结果 / 去向 / 风险说明”结构。
4. AI 侧栏消息里的“Apply”按钮 hover 才出现，键盘用户不容易发现。

修改要求：

1. 抽出统一组件，例如：

```text
apps/web/src/features/ai/components/AIResultReviewPanel.vue
```

统一支持：

- 来源说明
- 上下文说明
- 结果内容
- 插入
- 替换
- 保存为备选
- 丢弃

2. 写作页和大纲页都使用该组件。
3. AI 侧栏中的“应用”操作必须始终可键盘访问，不只依赖 hover。
4. 替换类操作必须显示风险说明。

验收：

```bash
rg -n "Apply|应用到大纲|插入|替换|保存为备选|丢弃" apps/web/src
```

操作命名应统一，不出现中英文混杂。

### P1：响应式策略没有完整落地

相关文件：

- `packages/ui/src/components/NAppLayout.vue`
- `apps/web/src/components/AppSidebar.vue`
- `apps/web/src/views/WritingView.vue`
- `apps/web/src/views/OutlineView.vue`
- `apps/web/src/views/KnowledgeBaseView.vue`

问题：

1. `NAppLayout` 在 `md` 以下隐藏左侧导航，但没有提供移动底部导航或抽屉入口。
2. 右侧 context 在 `xl` 以下隐藏，但没有统一打开方式。
3. 一些页面内部使用固定宽度侧栏，如 `w-80`、`w-90`、`w-96`，在中等屏幕容易挤压主工作区。
4. 项目设计规格要求移动端底部 4-5 个主导航入口，目前未实现。

修改要求：

1. `NAppLayout` 增加移动导航 slot 或内置 bottom nav。
2. `NAppLayout` 增加 context drawer 触发入口。
3. 页面不要自己写固定宽度右栏，统一走 context slot。
4. 移动端优先保证写作编辑区可用。

验收：

使用浏览器检查：

- 1440px
- 1024px
- 390px

检查点：

- 没有横向滚动
- 主操作可见
- 导航可达
- AI/context 面板可打开和关闭
- 正文编辑不被遮挡

### P2：内容状态和文案不统一

相关文件：

- `apps/web/src/views/DataViewer.vue`
- `apps/web/src/views/ProjectListView.vue`
- `apps/web/src/views/HealthCheck.vue`
- `apps/web/src/components/AIAssistantSidebar.vue`
- 多个业务 view

问题：

1. 中英文混杂明显，例如 `Loading...`、`Failed to load`、`Apply`、`Create New Project` 与中文主界面混用。
2. Loading 文案使用 `...` 而不是中文省略号或 `…`。
3. 错误提示多为“Failed to ...”，缺少用户下一步。
4. 空状态视觉和文案有些页面使用 `NEmptyState`，有些手写。

修改要求：

1. 主产品 UI 统一中文。
2. loading 使用：
   - `加载中…`
   - `保存中…`
   - `生成中…`
3. 错误文案包含下一步，例如：
   - `加载失败，请检查后端服务后重试`
   - `保存失败，当前草稿仍保留在编辑器中`
4. 空状态统一使用 `NEmptyState`。
5. 调试页 `/debug` 可以保留英文，但必须标记为开发工具页，不进入主流程。

验收：

```bash
rg -n "Loading\\.\\.\\.|Failed to|Apply|Create New|Delete|No .* yet" apps/web/src
```

### P2：DataViewer 不应继续影响主产品 UI 质量

相关文件：

- `apps/web/src/views/DataViewer.vue`
- `apps/web/src/router/index.ts`

问题：

1. `DataViewer.vue` 是 824 行的大型调试页面，不符合主产品 UI 标准。
2. 页面中存在大量 CRUD 调试交互，和正式工作台风格不一致。
3. 只要 `/debug` 路由引用该页面，模板错误也会阻塞 Web build。

修改要求：

1. 明确 `/debug` 是开发工具，不进入产品侧边栏。
2. 页面顶部加“开发调试页”视觉标识。
3. 样式可以低优先级，但必须满足：
   - 能构建
   - 不使用原生 confirm
   - slot 正确
   - 基础可访问性达标
4. 后续可以拆成 `DebugDataViewer`，避免污染业务 UI。

## 4. 推荐修改顺序

### 阶段 1：恢复 UI 验收基线

目标：先确保项目可构建，避免 UI 修改无法验证。

任务：

1. 修复 API build 问题。
2. 修复 `DataViewer.vue` 模板和 slot。
3. 移除原生 `confirm()`。
4. 跑通：

```bash
pnpm check
```

### 阶段 2：统一布局外壳

目标：让所有业务页看起来属于同一个产品。

任务：

1. 调整 `NAppLayout`：
   - 统一 topbar 高度和 padding
   - 统一 nav/context 边框
   - 预留移动导航和 context drawer 能力
2. 调整 `AppSidebar`：
   - 去掉重复边框
   - 当前项 focus/active 状态统一
   - AI 协作守则区域缩小，避免抢主导航注意力
3. 将业务页自写布局逐步迁移到 `NAppLayout` slot。

验收：

```bash
pnpm check
```

并浏览：

- `/project/:id`
- `/project/:id/outline`
- `/project/:id/write`
- `/project/:id/knowledge`
- `/project/:id/quality`

### 阶段 3：收敛组件和可访问性

目标：减少页面手写控件，建立稳定交互语言。

任务：

1. icon-only 操作统一用 `NIconButton`。
2. 表单控件统一用 `NInput`、`NTextArea`、`NSelect`。
3. 所有裸 `button/input/select/textarea` 补齐理由或替换。
4. 所有 `focus:outline-none` 必须配套 `focus-visible`。
5. 所有危险操作统一 `NConfirmDialog`。

验收：

```bash
rg -n "alert\\(|confirm\\(|prompt\\(" apps/web/src
rg -n "focus:outline-none" apps/web/src
pnpm check
```

### 阶段 4：统一 AI 结果确认区

目标：让用户理解 AI 结果来自哪里、会去哪里、是否会覆盖内容。

任务：

1. 新建统一 AI 结果 review panel。
2. 写作页接入。
3. 大纲页接入。
4. AI 侧栏应用操作始终可见或可键盘访问。
5. 所有替换动作展示覆盖风险。

验收：

```bash
rg -n "Apply|应用到大纲" apps/web/src
pnpm check
```

### 阶段 5：视觉降噪和中文文案统一

目标：从“页面能用”提升到“专业工作台”。

任务：

1. 收敛 `rounded-2xl/3xl`。
2. 收敛强阴影。
3. 降低内页标题字号。
4. 统一中文文案。
5. 空/加载/错误状态统一组件。

验收：

```bash
rg -n "rounded-2xl|rounded-3xl|shadow-lg|shadow-xl|text-4xl|Loading\\.\\.\\.|Failed to|Apply" apps/web/src
pnpm check
```

## 5. 具体页面修改建议

### 项目列表页 `ProjectListView.vue`

问题：

- 项目卡片 hover 有轻营销感。
- 搜索 input 是原生控件。
- 删除按钮如果是 icon-only，需要明确 aria-label。
- 英文文案需统一中文。

建议：

- 项目卡片保留 `rounded-lg`、`shadow-sm`，去掉过强 hover 位移。
- 搜索改 `NInput`，左侧图标由组件 slot 或 wrapper 实现。
- 删除用 `NIconButton` + `NConfirmDialog`。

### 项目首页 `ProjectHomeView.vue`

问题：

- 顶部大色块和多个卡片视觉权重偏强。
- `text-3xl` 标题在工作台内偏大。
- AI 提示卡与主操作卡抢焦点。

建议：

- 主标题降到 `text-2xl`。
- 进度、最近章节、故事设定集使用同一 `NPanel`。
- AI 建议卡改为右侧 context 或次级提示。

### 大纲页 `OutlineView.vue`

问题：

- 章节树、编辑区、AI 面板之间视觉层级尚可，但控件手写多。
- 标题 input 使用 `text-3xl`，编辑器内过大。
- AI 建议面板操作不完整。

建议：

- 标题降到 `text-2xl`。
- 章节树按钮补 focus-visible。
- AI 面板接统一 `AIResultReviewPanel`。

### 写作页 `WritingView.vue`

问题：

- 方向最接近目标，但正文标题 `text-4xl` 和 AI pending panel `shadow-xl/rounded-2xl` 偏重。
- 浮动工具条按钮缺少 aria-label。
- textarea 是核心编辑器，可以保留原生，但要补可访问性。

建议：

- 正文标题桌面可 `text-3xl`，移动端 `text-2xl`。
- AI pending panel 改 `rounded-lg`、`shadow-sm`。
- 浮动工具按钮改 `NIconButton` 或补 `aria-label`。

### 人物 / 关系 / 冲突页

问题：

- 三个页面都在做“列表 + 详情编辑”，但布局和控件细节不完全一致。
- 多处 `rounded-xl/2xl` 和原生 select/range/input。
- 空状态有手写。

建议：

- 抽象统一的 `EntityEditorLayout`：
  - 左侧实体列表
  - 中间详情编辑
  - 右侧分析/提示
- select/input/textarea 统一设计系统。
- range 控件周围补 label 和数值说明。

### 知识库页

问题：

- header padding 偏大，搜索框 `rounded-2xl`、大输入框更像内容网站。
- 上传区 `rounded-2xl`、强按钮阴影偏重。
- source drawer 使用 `rounded-3xl` 和 `text-3xl`，与工作台不一致。

建议：

- 搜索框降到标准高度。
- 上传区改为紧凑工具条或 `NPanel`。
- source drawer 标题降级，圆角统一。

### 质量评估页

问题：

- 当前页面有较强仪表盘感，但质量报告属于分析工具，应更像“报告列表 + 评估结果 + 建议”。
- 大分数 `text-4xl` 可以保留一个，但其他大标题应收敛。
- 维度进度条没有异常/空值保护时可能视觉误导。

建议：

- 分数区作为唯一视觉焦点。
- 其他维度用紧凑列表或小型条形图。
- 空报告时用 `NEmptyState` 引导选择章节并运行评估。

### 版本历史页

问题：

- 版本卡片嵌套按钮，键盘和点击区域容易混乱。
- 对比模式视觉不错，但左右 pane 的信息标题偏小，状态说明不足。

建议：

- 版本列表项拆成主按钮 + 操作按钮组。
- 恢复/删除统一 `NConfirmDialog`。
- 对比区加入“当前草稿不会被修改，除非点击恢复”的说明。

## 6. 验收清单

完成 UI 修复后必须执行：

```bash
pnpm check
```

静态扫描：

```bash
rg -n "alert\\(|confirm\\(|prompt\\(" apps/web/src
rg -n "focus:outline-none" apps/web/src
rg -n "rounded-2xl|rounded-3xl|shadow-lg|shadow-xl|text-4xl" apps/web/src/views apps/web/src/features
rg -n "Loading\\.\\.\\.|Failed to|Apply|Create New|Delete" apps/web/src
```

浏览器验收页面：

```text
/
/project/:id
/project/:id/bible
/project/:id/characters
/project/:id/relationships
/project/:id/conflicts
/project/:id/outline
/project/:id/write
/project/:id/knowledge
/project/:id/quality
/project/:id/versions
```

尺寸：

```text
1440 x 900
1024 x 768
390 x 844
```

人工检查：

1. 页面之间 topbar、nav、主区域边距一致。
2. 没有双边框、错位、横向滚动。
3. 所有主操作可键盘聚焦。
4. 所有危险操作有确认弹窗。
5. 所有 AI 结果有确认区。
6. 主产品文案统一中文。
7. 长标题、长人物名、长章节名不会撑坏布局。

## 7. 建议提交顺序

```bash
git commit -m "fix(ui): restore buildable ui baseline"
git commit -m "refactor(ui): unify workbench layout shell"
git commit -m "refactor(ui): replace ad hoc controls with design system"
git commit -m "refactor(ui): unify ai result review experience"
git commit -m "polish(ui): reduce visual noise and normalize copy"
```

每个提交后都运行 `pnpm check`。不要把 UI 大改、架构修复、数据库迁移混在同一个提交里。
