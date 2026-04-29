# UI Polish Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 UI 专业审查后的 5 个剩余问题，让 AI 侧栏、写作编辑器、AI 确认区、知识库控件和调试页文案符合当前设计系统与可访问性规范。

**Architecture:** 本轮只做 UI 收尾，不改数据库、不改业务流程、不做大页面重构。优先使用 `packages/ui` 已有组件，保留页面结构，只替换局部控件和文案，确保每一步后 `pnpm check` 通过。

**Tech Stack:** Vue 3, TypeScript, UnoCSS, `packages/ui`, `NButton`, `NInput`, `NSelect`

---

## 0. 当前问题摘要

本轮需要处理 5 个 UI finding：

1. `apps/web/src/components/AIAssistantSidebar.vue:163`  
   “Apply to Editor” 按钮依赖 hover 才出现，键盘不可发现，且英文混入。

2. `apps/web/src/features/writing/components/EditorPane.vue:72`  
   写作编辑器仍有 `Loading...` 英文文案、`text-4xl` 大标题、textarea 无可见 focus 状态。

3. `apps/web/src/features/writing/components/AIPendingResultPanel.vue:21`  
   AI 确认区使用 `rounded-2xl`、`shadow-xl`、`backdrop-blur-sm`，视觉过重。

4. `apps/web/src/views/KnowledgeBaseView.vue:223`  
   知识库搜索和筛选仍使用原生 input/select，未使用设计系统组件。

5. `apps/web/src/views/DataViewer.vue:667`  
   `/debug` 调试页仍大量英文文案，至少需要明确标记为开发调试页并中文化关键弹窗。

## 1. 修改范围

### 必改文件

- `apps/web/src/components/AIAssistantSidebar.vue`
- `apps/web/src/features/writing/components/EditorPane.vue`
- `apps/web/src/features/writing/components/AIPendingResultPanel.vue`
- `apps/web/src/views/KnowledgeBaseView.vue`
- `apps/web/src/views/DataViewer.vue`

### 可能需要修改

- `packages/ui/src/components/NInput.vue`
- `packages/ui/src/components/NSelect.vue`

只有当 `NInput/NSelect` 无法支持搜索图标或当前用法时，才修改 UI 包。不要为了本轮需求扩展复杂 API。

## 2. Task A：修复 AI 侧栏应用按钮

**File:** `apps/web/src/components/AIAssistantSidebar.vue`

目标：AI 消息的应用按钮始终可见、中文化、键盘可聚焦。

- [ ] **Step 1: 引入 NButton**

在 import 中加入：

```ts
import { NButton } from '@ai-novel/ui'
```

- [ ] **Step 2: 替换 hover-only 原生 button**

将当前：

```vue
<button
  v-if="msg.role === 'assistant' && msg.content && !isStreaming"
  class="absolute flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] text-white opacity-0 shadow-sm transition-opacity -bottom-2 -right-2 group-hover/msg:opacity-100"
  @click="emit('apply', msg.content)"
>
  Apply to Editor
</button>
```

替换为始终可见的操作区，例如：

```vue
<div v-if="msg.role === 'assistant' && msg.content && !isStreaming" class="mt-2 flex justify-end">
  <NButton
    variant="secondary"
    size="sm"
    aria-label="应用 AI 回复到编辑器"
    @click="emit('apply', msg.content)"
  >
    应用到编辑器
  </NButton>
</div>
```

注意：

- 不使用 `opacity-0`
- 不依赖 hover
- 不保留英文 `Apply`
- 保持按钮在消息内部或消息下方，避免绝对定位造成遮挡

- [ ] **Step 3: 修复输入 textarea 可访问性**

同文件中的聊天输入 textarea 增加：

```vue
aria-label="输入给 AI 助手的消息"
```

并将 placeholder 改成中文：

```vue
placeholder="输入你的问题或写作指令..."
```

把：

```css
focus:outline-none
```

替换为可见 focus：

```text
focus-visible:ring-2 focus-visible:ring-ai/30 focus:outline-none
```

- [ ] **Step 4: 发送按钮补 aria-label**

发送按钮增加：

```vue
aria-label="发送消息"
```

### 验收

```bash
rg -n "Apply to Editor|opacity-0.*group-hover|Type your message" apps/web/src/components/AIAssistantSidebar.vue
pnpm check
```

Expected:

- 无英文 `Apply to Editor`
- 应用按钮不再依赖 hover
- `pnpm check` 通过

## 3. Task B：修复写作编辑器可访问性和视觉层级

**File:** `apps/web/src/features/writing/components/EditorPane.vue`

目标：写作页仍保持文学感，但符合工作台标题层级、中文文案和键盘可访问性。

- [ ] **Step 1: 中文化 loading**

把：

```text
Loading...
```

改为：

```text
加载章节中…
```

- [ ] **Step 2: 降低章节标题字号**

把：

```text
text-4xl
```

改为：

```text
text-3xl
```

如果移动端需要更稳，可以使用：

```text
text-2xl md:text-3xl
```

- [ ] **Step 3: textarea 补可访问性**

给正文 textarea 增加：

```vue
aria-label="章节正文编辑器"
```

把 placeholder 改成中文：

```vue
placeholder="从这里开始写作..."
```

- [ ] **Step 4: 修复 focus 状态**

当前：

```text
focus:outline-none focus:ring-0
```

建议替换为：

```text
focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20
```

如果视觉上不希望编辑器出现完整外框，可给 textarea 包一层容器，在容器上做 focus-within 边界：

```vue
<div class="rounded-lg focus-within:ring-2 focus-within:ring-primary/20">
  <textarea ... />
</div>
```

本轮优先简单修复，不要重构编辑器。

- [ ] **Step 5: 浮动工具条关闭按钮补 aria-label**

将关闭按钮增加：

```vue
aria-label="关闭浮动工具栏"
```

### 验收

```bash
rg -n "Loading\\.\\.\\.|Once upon a time|text-4xl|focus:ring-0" apps/web/src/features/writing/components/EditorPane.vue
pnpm check
```

Expected: 无结果或只剩明确可接受项。

## 4. Task C：降低 AI 确认区视觉重量

**File:** `apps/web/src/features/writing/components/AIPendingResultPanel.vue`

目标：让 AI 确认区像工作台中的审阅面板，而不是悬浮营销卡片。

- [ ] **Step 1: 降低容器装饰**

把：

```text
rounded-2xl
shadow-xl
backdrop-blur-sm
```

改为：

```text
rounded-lg
shadow-sm
```

建议容器类：

```text
border border-ai/20 rounded-lg bg-ai-soft/30 p-5 shadow-sm space-y-4
```

- [ ] **Step 2: 内容区圆角收敛**

把结果内容区：

```text
rounded-xl
```

改为：

```text
rounded-md
```

- [ ] **Step 3: 风险说明中文更明确**

当前：

```vue
将替换: "{{ result.originalText.substring(0, 40) }}..."
```

改为：

```vue
将替换当前选中的文字：{{ result.originalText.substring(0, 40) }}{{ result.originalText.length > 40 ? '…' : '' }}
```

### 验收

```bash
rg -n "rounded-2xl|shadow-xl|backdrop-blur-sm|rounded-xl" apps/web/src/features/writing/components/AIPendingResultPanel.vue
pnpm check
```

Expected: 不再出现高装饰组合。

## 5. Task D：知识库搜索和筛选接入设计系统

**File:** `apps/web/src/views/KnowledgeBaseView.vue`

目标：搜索和筛选控件使用 `NInput/NSelect`，高度、圆角、focus 状态与其他页面统一。

- [ ] **Step 1: 引入 NInput 和 NSelect**

当前 import 中已有 `NAppLayout`、`NLoadingState`、`useToast`。补充：

```ts
NInput,
NSelect,
```

- [ ] **Step 2: 增加筛选选项**

在 script 中增加：

```ts
const typeOptions = [
  { label: '全部类别', value: 'all' },
  { label: '角色管理', value: 'character' },
  { label: '世界设定', value: 'setting' },
  { label: '冲突线索', value: 'conflict' },
]
```

- [ ] **Step 3: 替换搜索 input**

把原生搜索 input 替换为：

```vue
<NInput
  v-model="searchQuery"
  label="知识搜索"
  placeholder="搜索角色、世界规则、冲突..."
/>
```

如果不希望 label 占视觉空间，优先扩展 `NInput` 支持 `hide-label`；不要使用无 label 的裸 input。

短期可接受写法：

```vue
<div class="min-w-0 flex-1">
  <NInput
    v-model="searchQuery"
    label="知识搜索"
    placeholder="搜索角色、世界规则、冲突..."
  />
</div>
```

- [ ] **Step 4: 替换筛选 select**

```vue
<NSelect
  v-model="selectedType"
  label="类别筛选"
  :options="typeOptions"
/>
```

- [ ] **Step 5: 调整布局**

原先：

```text
flex gap-4
```

建议：

```text
grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]
```

避免移动端挤压。

### 验收

```bash
rg -n "<input|<select|rounded-2xl|shadow-inner|focus:outline-none" apps/web/src/views/KnowledgeBaseView.vue
pnpm check
```

Expected:

- `KnowledgeBaseView.vue` 中不再有搜索原生 input/select
- 不再有 `rounded-2xl` 搜索框和 `shadow-inner`

## 6. Task E：调试页中文化和开发页标识

**File:** `apps/web/src/views/DataViewer.vue`

目标：不把 `/debug` 当成正式产品页重做，但至少让它清楚是开发调试页，并减少英文文案对 UI 验收的干扰。

- [ ] **Step 1: 顶部增加开发页标识**

在页面顶部显眼位置增加：

```vue
<NTag variant="warning">开发调试页</NTag>
```

或类似提示：

```text
此页面用于检查种子数据和 CRUD 接口，不属于正式创作流程。
```

- [ ] **Step 2: 中文化关键 modal 标题**

至少替换：

```text
Create New Project -> 创建新项目
Edit Project -> 编辑项目
Create Character -> 创建角色
Edit Character -> 编辑角色
Create Volume -> 创建分卷
Create Chapter -> 创建章节
Edit Story Bible -> 编辑故事设定集
Create Story Bible -> 创建故事设定集
Delete -> 删除
Confirm -> 确认
Cancel -> 取消
Save -> 保存
Create -> 创建
```

- [ ] **Step 3: 中文化关键 label**

至少替换：

```text
Title -> 标题
Genre -> 类型
Theme -> 主题
Target Word Count -> 目标字数
Name -> 姓名
Role -> 角色定位
Goal -> 目标
Personality -> 性格
Summary -> 摘要
Volume -> 分卷
Chapter Number -> 章节序号
Worldview -> 世界观
Main Conflict -> 主线冲突
System Rules -> 系统规则
Timeline -> 时间线
```

- [ ] **Step 4: 保留调试性质**

不要花大量时间把 DataViewer 做成正式页面。本轮只要求：

1. 能构建
2. 无原生 confirm
3. 有开发页标识
4. 关键弹窗中文化

### 验收

```bash
rg -n "Create New|Edit Project|Create Character|Delete|Confirm|Cancel|Target Word Count|Worldview|Main Conflict" apps/web/src/views/DataViewer.vue
pnpm check
```

Expected:

- 上述关键英文显著减少或消失
- `pnpm check` 通过

## 7. 最终验收

完成所有任务后运行：

```bash
pnpm check
```

静态 UI 扫描：

```bash
rg -n "Apply to Editor|Type your message|Loading\\.\\.\\.|Once upon a time" apps/web/src
rg -n "rounded-2xl|rounded-3xl|shadow-xl|backdrop-blur-sm" apps/web/src/components apps/web/src/features apps/web/src/views
rg -n "focus:outline-none focus:ring-0|opacity-0.*group-hover" apps/web/src
rg -n "<input|<select" apps/web/src/views/KnowledgeBaseView.vue
```

浏览器人工验收：

1. 写作页：
   - loading 文案中文
   - 编辑器可聚焦且有可见状态
   - AI 确认区视觉克制
2. AI 侧栏：
   - 应用按钮始终可见
   - 按钮中文
   - 键盘可聚焦
3. 知识库页：
   - 搜索和筛选控件与其他表单一致
   - 移动端不挤压
4. `/debug`：
   - 明确是开发调试页
   - 关键弹窗中文化

## 8. 建议提交顺序

```bash
git add apps/web/src/components/AIAssistantSidebar.vue apps/web/src/features/writing/components/EditorPane.vue apps/web/src/features/writing/components/AIPendingResultPanel.vue
git commit -m "fix(ui): improve writing ai accessibility"

git add apps/web/src/views/KnowledgeBaseView.vue
git commit -m "refactor(ui): use design controls in knowledge search"

git add apps/web/src/views/DataViewer.vue
git commit -m "polish(debug): label and localize data viewer"
```

每个提交后都运行 `pnpm check`。不要在本轮混入 store/API/数据库结构改动。
