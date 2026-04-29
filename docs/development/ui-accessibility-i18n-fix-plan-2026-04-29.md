# UI 可访问性与中文化收尾修复文档（2026-04-29）

本文档用于指导后续 AI 或开发者修复当前 UI 复查中仍存在的问题。当前 `pnpm check` 已通过，本轮修复目标不是重构业务流程，而是收敛主产品 UI 的可访问性、设计系统一致性和中文文案完整度。

## 0. 执行原则

1. 保持应用始终可构建，修改后必须运行 `pnpm check`。
2. 不新增原生 `alert / confirm / prompt`。
3. 主产品页面不得出现英文状态文案，模型名称、技术专有名词除外。
4. 可交互控件必须键盘可达，并有清晰的 `focus-visible` 状态。
5. 表单、搜索、选择器优先使用 `packages/ui` 中的设计系统组件；如必须使用原生控件，需要补齐 label、aria 属性和焦点态。
6. 不改变现有数据结构、API 行为和 AI 确认边界。

## 1. 修复范围与优先级

### P1-1 大纲编辑输入控件收敛

涉及文件：

- `apps/web/src/views/OutlineView.vue`
- `apps/web/src/features/outline/components/ChapterOutlineEditor.vue`

当前问题：

- 章节标题使用原生 `input`。
- 标题输入关闭了 `outline/ring`，键盘焦点不可见。
- 状态文案仍显示英文 `Status`。
- `OutlineView.vue` 与 `ChapterOutlineEditor.vue` 存在相似 UI，容易继续分叉。

修改要求：

1. 将章节标题输入统一为一个可复用组件，建议命名：
   - `apps/web/src/features/outline/components/ChapterTitleField.vue`
2. 组件需要支持：
   - `v-model`
   - `placeholder`
   - `aria-label="章节标题"`
   - `focus-visible:ring-2 focus-visible:ring-primary/20`
   - 保持标题视觉风格，但不要使用完全不可见的焦点态
3. 状态选择区域文案改为中文：
   - `Status` -> `状态`
4. 状态选择器优先使用 `NSelect`。如果暂时保留原生 `select`，必须补充：
   - `aria-label="章节状态"`
   - `focus-visible:ring-2 focus-visible:ring-primary/20`
5. 避免在 `OutlineView.vue` 与 `ChapterOutlineEditor.vue` 中复制两套标题/状态 UI。

验收标准：

- 使用键盘 Tab 到章节标题时可见焦点状态。
- 页面内不再出现英文 `Status`。
- `rg -n "focus:outline-none focus:ring-0|Status" apps/web/src/views/OutlineView.vue apps/web/src/features/outline/components/ChapterOutlineEditor.vue` 无产品 UI 命中。

### P1-2 冲突矩阵标题输入补齐可访问性

涉及文件：

- `apps/web/src/views/ConflictMatrixView.vue`

当前问题：

- 冲突名称输入是核心编辑字段，但使用无边框原生 `input`。
- 当前类名包含 `focus:outline-none focus:ring-0`，键盘焦点不可见。

修改要求：

1. 优先使用设计系统输入组件的标题变体；如组件暂不支持，可保留原生 `input`，但必须补齐：
   - `aria-label="矛盾名称"`
   - `focus-visible:ring-2 focus-visible:ring-primary/20`
   - `focus-visible:rounded-md`
2. 不要破坏当前大标题视觉层级。
3. 删除 `focus:ring-0`。

验收标准：

- 键盘 Tab 到“矛盾名称”输入框时有清晰焦点态。
- `rg -n "focus:outline-none focus:ring-0" apps/web/src/views/ConflictMatrixView.vue` 无命中。

### P2-1 角色搜索框与全局搜索样式统一

涉及文件：

- `apps/web/src/views/CharactersView.vue`

当前问题：

- 角色列表搜索框仍使用原生 `input`。
- 没有显式 label。
- 焦点反馈弱于项目列表搜索框。

修改要求：

1. 优先改为 `NInput`，并支持左侧搜索图标。
2. 如果 `NInput` 暂不支持左图标，则使用当前原生结构，但必须补齐：
   - `<label class="sr-only" for="character-search">搜索角色</label>`
   - `id="character-search"`
   - `focus-visible:ring-2 focus-visible:ring-primary/20`
   - `focus:border-primary`
3. 与 `ProjectListView.vue` 的搜索框视觉保持一致，包括高度、圆角、背景、placeholder 颜色。

验收标准：

- 角色搜索框可被屏幕阅读器识别。
- 键盘焦点清晰可见。
- 项目列表搜索与角色列表搜索在视觉上不割裂。

### P2-2 核心页面英文文案中文化

涉及文件优先级：

1. `apps/web/src/views/WritingView.vue`
2. `apps/web/src/views/OutlineView.vue`
3. `apps/web/src/views/DataViewer.vue`
4. `apps/web/src/features/knowledge/composables/useKnowledgeUpload.ts`
5. `apps/web/src/views/HealthCheck.vue`

当前残留示例：

- `Failed to load writing workspace`
- `Snapshot saved to history`
- `Failed to save snapshot`
- `AI ${type} started...`
- `Loading...`
- `Failed to load outline data`
- `Failed to save`
- `Project created`
- `Delete Project`
- `Failed to read file`
- `Checking...`

修改要求：

1. 主产品页面全部改为中文：
   - `Failed to load writing workspace` -> `写作工作区加载失败`
   - `Snapshot saved to history` -> `快照已保存到版本历史`
   - `Failed to save snapshot` -> `快照保存失败`
   - `AI continue started...` 等动态文案改为中文映射：
     - `continue` -> `续写`
     - `polish` -> `润色`
     - `expand` -> `扩写`
     - `shorten` -> `精简`
     - 示例：`AI 续写已开始`
   - `Loading...` -> `加载中...`
2. `DataViewer.vue` 如仍作为开发调试页保留：
   - 页面顶部必须明确显示 `开发调试页`
   - 删除确认标题、描述、toast 尽量中文化
   - 低优先级英文可保留在技术字段名中，但不应出现在用户操作反馈里
3. `HealthCheck.vue` 如是开发页，也建议中文化状态反馈。

验收标准：

- `rg -n "Failed to|Loading\\.\\.\\.|Project created|Project deleted|Delete Project|Checking\\.\\.\\.|Snapshot saved|AI .*started" apps/web/src` 不应在主产品页面命中。
- 允许模型名称、API 路径、枚举 key、开发注释保留英文。

## 2. 建议实施顺序

1. 先修 `OutlineView.vue` 与 `ChapterOutlineEditor.vue`，因为这是 P1 且存在重复 UI。
2. 再修 `ConflictMatrixView.vue` 标题输入焦点态。
3. 再统一 `CharactersView.vue` 搜索框。
4. 最后做英文文案扫尾，优先 `WritingView.vue` 和 `OutlineView.vue`。

## 3. 回归检查清单

完成后运行：

```bash
pnpm check
```

额外扫描：

```bash
rg -n "focus:outline-none focus:ring-0|Status|Failed to|Loading\\.\\.\\.|Project created|Project deleted|Delete Project|Checking\\.\\.\\.|Snapshot saved|AI .*started" apps/web/src
```

浏览器人工检查：

1. 项目列表页：确认搜索和项目卡片操作仍正常。
2. 大纲页：Tab 到章节标题、状态选择、AI 按钮，焦点态清晰。
3. 冲突矩阵页：Tab 到矛盾名称，焦点态清晰。
4. 角色页：搜索框视觉与项目搜索一致。
5. 写作页：加载、保存快照、AI 操作 toast 均为中文。

## 4. 不在本轮处理的事项

以下内容本轮不强制处理，避免扩大范围：

- 后端 API 结构调整。
- 数据库 schema 与迁移。
- AI 生成逻辑变更。
- 质量评估算法。
- 新增页面或大规模布局重做。

本轮完成后，项目 UI 应达到“主流程中文一致、键盘可达、焦点可见、核心输入不再明显绕过设计规范”的验收状态。
