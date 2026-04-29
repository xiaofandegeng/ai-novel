# Project List and Global UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复项目列表页截图中的操作区冲突、搜索框不一致、卡片信息密度不足，并顺手收敛全局 hover-only 操作、英文文案和过重视觉装饰。

**Architecture:** 本轮只做 UI polish，不改业务数据结构、不改 API、不改路由。优先复用 `packages/ui` 组件；如果组件能力不足，只做小型向后兼容扩展。

**Tech Stack:** Vue 3, TypeScript, UnoCSS, `packages/ui`, `NInput`, `NIconButton`, `NButton`

---

## 0. 当前问题摘要

本轮处理 5 个 review finding：

1. `apps/web/src/views/ProjectListView.vue:229`  
   项目卡片右上角删除按钮与“打开项目” hover overlay 冲突，截图里出现漂浮和挤压。

2. `apps/web/src/views/ProjectListView.vue:147`  
   搜索框仍是原生 input，焦点态不足，和设计系统不一致。

3. `apps/web/src/views/ProjectListView.vue:215`  
   单项目场景下卡片信息密度偏低，页面右侧大面积空白。

4. `apps/web/src/components/AIAssistantSidebar.vue:163`  
   全局仍残留 hover-only 操作和英文文案，例如 `Apply`、`Loading...`、`Failed to...`。

5. `apps/web/src/features/knowledge/components/KnowledgeSourceDrawer.vue:21`  
   全局仍有偏重装饰，例如 `rounded-2xl/3xl`、`shadow-lg/xl`、`text-4xl`。

## 1. 修改范围

### 必改文件

- `apps/web/src/views/ProjectListView.vue`
- `apps/web/src/components/AIAssistantSidebar.vue`
- `apps/web/src/features/knowledge/components/KnowledgeSourceDrawer.vue`
- `apps/web/src/features/writing/components/EditorPane.vue`
- `apps/web/src/features/writing/components/AIPendingResultPanel.vue`

### 可能修改

- `packages/ui/src/components/NInput.vue`
- `packages/ui/src/components/NIconButton.vue`
- `apps/web/src/features/knowledge/components/KnowledgeSourceList.vue`
- `apps/web/src/features/knowledge/components/KnowledgeSearchResults.vue`
- `apps/web/src/views/ProjectHomeView.vue`
- `apps/web/src/views/QualityReviewView.vue`
- `apps/web/src/views/DataViewer.vue`

### 不做

- 不改 API/store/db/schema
- 不新增 UI 框架
- 不做整站重绘
- 不重构大页面结构

## 2. Task A：修复项目卡片右上角操作冲突

**File:** `apps/web/src/views/ProjectListView.vue`

目标：删除按钮不再漂浮，不再和“打开项目”抢占同一区域；卡片操作可鼠标和键盘稳定访问。

### A1. 移除“打开项目” hover overlay

- [ ] 删除以下块：

```vue
<div class="absolute right-4 top-4 flex items-center gap-1 text-xs text-primary underline decoration-2 underline-offset-4 opacity-0 transition-all group-hover:opacity-100">
  打开项目 <ExternalLink :size="10" />
</div>
```

原因：整张卡片已经点击进入项目，不需要额外 hover 文案。该元素会和删除按钮抢右上角空间。

### A2. 删除按钮改为固定、清晰的图标按钮

- [ ] 引入 `NIconButton`：

```ts
import { NIconButton } from '@ai-novel/ui'
```

- [ ] 把当前 hover-only 删除区域：

```vue
<div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
  <button ...>
    <Trash2 :size="14" />
  </button>
</div>
```

替换为：

```vue
<NIconButton
  label="删除项目"
  variant="ghost"
  size="sm"
  class="text-text-muted hover:text-semantic-error"
  @click.stop="confirmDelete(project.id)"
>
  <Trash2 :size="14" />
</NIconButton>
```

注意：

- 不使用 `opacity-0`
- 不依赖 hover 才出现
- 有明确 label
- 使用 `@click.stop`

### A3. 卡片打开行为增加可访问性

当前整卡是 `div @click`。建议改为语义更清楚的 `<article>` + 内部主链接，或最小修复为：

```vue
<div
  role="button"
  tabindex="0"
  @click="router.push(...)"
  @keydown.enter.prevent="router.push(...)"
  @keydown.space.prevent="router.push(...)"
>
```

更推荐：

```vue
<router-link :to="`/project/${project.id}`" class="...">
```

但如果内部有删除按钮，要避免嵌套交互冲突。最稳做法是：

```vue
<article class="...">
  <router-link :to="..." class="block focus-visible:ring-2 focus-visible:ring-primary/20">
    卡片主要内容
  </router-link>
  <NIconButton ... />
</article>
```

本轮如果时间有限，使用 `role="button"` 方案可接受。

### A4. 验收

```bash
rg -n "打开项目|opacity-0.*group-hover|ExternalLink" apps/web/src/views/ProjectListView.vue
pnpm check
```

Expected:

- 不再出现“打开项目” hover overlay
- 删除按钮不再默认透明
- `pnpm check` 通过

## 3. Task B：项目列表搜索框接入设计系统

**Files:**

- `apps/web/src/views/ProjectListView.vue`
- Possibly `packages/ui/src/components/NInput.vue`

目标：搜索框使用设计系统组件，并有稳定 focus 状态。

### B1. 优先直接使用 NInput

将原生搜索框：

```vue
<div class="relative min-w-0 sm:w-72">
  <Search ... />
  <input ...>
</div>
```

替换为：

```vue
<div class="min-w-0 sm:w-72">
  <NInput
    v-model="searchQuery"
    label="搜索项目"
    placeholder="搜索项目..."
  />
</div>
```

如果显示 label 导致顶部栏变高，可使用更紧凑的布局：

```vue
<div class="min-w-0 sm:w-72">
  <label class="sr-only" for="project-search">搜索项目</label>
  <div class="relative">
    <Search class="pointer-events-none absolute left-3 top-1/2 text-text-muted -translate-y-1/2" :size="16" />
    <input
      id="project-search"
      v-model="searchQuery"
      type="text"
      placeholder="搜索项目..."
      class="h-10 w-full rounded-md border border-border-light bg-bg-surface pl-9 pr-3 text-sm text-text-primary transition-colors placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
    >
  </div>
</div>
```

但长期建议给 `NInput` 增加：

```ts
hideLabel?: boolean
leftIcon?: Component
```

本轮不强制扩展 UI 包，避免扩大范围。

### B2. 中文化创建成功/失败 toast

当前：

```ts
toast.add('Project created', 'success')
createError.value = e.message || 'Failed to create project'
toast.add('Project deleted', 'success')
toast.add('Failed to delete', 'error')
```

改为：

```ts
toast.add('项目已创建', 'success')
createError.value = e.message || '创建项目失败，请稍后重试'
toast.add('项目已删除', 'success')
toast.add('删除项目失败，请稍后重试', 'error')
```

### B3. 验收

```bash
rg -n "<input|Failed to|Project created|Project deleted|Failed to delete" apps/web/src/views/ProjectListView.vue
pnpm check
```

Expected:

- 不再有原生搜索 input，或原生 input 有 `sr-only` label 与 focus-visible
- 项目列表页关键 toast 中文化

## 4. Task C：提升项目卡片信息密度

**File:** `apps/web/src/views/ProjectListView.vue`

目标：单项目场景不显得空、散、像样板页。

### C1. 调整 grid 列数

当前：

```text
lg:grid-cols-3 md:grid-cols-2 xl:grid-cols-4
```

建议改为：

```text
md:grid-cols-2 2xl:grid-cols-3
```

原因：小说项目卡片是信息卡，不是商品卡。`xl:grid-cols-4` 会让单卡偏窄，右侧空白更突兀。

### C2. 降低卡片高度和留白

当前卡片：

```text
p-6 rounded-xl hover:-translate-y-0.5
```

建议：

```text
p-5 rounded-lg
```

并移除 hover 位移：

```text
hover:-translate-y-0.5
```

保留：

```text
hover:border-primary/30 hover:shadow-sm
```

### C3. 增加有效信息

在卡片中增加以下一到两项，不需要新增 API：

1. 项目状态：

```vue
<NTag size="sm" :variant="project.status === 'completed' ? 'success' : 'info'">
  {{ statusLabel(project.status) }}
</NTag>
```

2. 目标字数完整显示：

```vue
目标 {{ project.targetWords?.toLocaleString() || '未设定' }} 字
```

3. 最后更新时间和题材保留。

新增 helper：

```ts
function statusLabel(status: string) {
  const map: Record<string, string> = {
    planning: '规划中',
    writing: '写作中',
    paused: '已暂停',
    completed: '已完成',
    archived: '已归档',
  }
  return map[status] || '未设置'
}
```

### C4. 压缩顶部统计卡

当前三张统计卡信息很薄。建议本轮先降低高度：

```text
p-4 -> px-4 py-3
text-2xl -> text-xl
```

后续可考虑合并为 summary bar，但本轮不强制。

### C5. 验收

```bash
rg -n "xl:grid-cols-4|hover:-translate|rounded-xl bg-bg-surface p-6|text-2xl" apps/web/src/views/ProjectListView.vue
pnpm check
```

Expected:

- 项目卡片不再过窄
- 单项目页面信息更充实

## 5. Task D：全局 hover-only 操作和英文文案收敛

**Files:**

- `apps/web/src/components/AIAssistantSidebar.vue`
- `apps/web/src/features/writing/components/EditorPane.vue`
- `apps/web/src/views/VersionHistoryView.vue`
- `apps/web/src/views/ProjectHomeView.vue`
- `apps/web/src/views/CharactersView.vue`
- `apps/web/src/views/RelationshipsView.vue`
- `apps/web/src/views/ConflictMatrixView.vue`
- `apps/web/src/views/KnowledgeBaseView.vue`
- `apps/web/src/views/StoryBibleView.vue`
- `apps/web/src/views/DataViewer.vue`

目标：关键操作不能只靠 hover 出现；主产品文案统一中文。

### D1. AI 侧栏按钮

按 `docs/development/ui-polish-remediation-plan-2026-04-29.md` 中 Task A 执行：

- `Apply to Editor` -> `应用到编辑器`
- 不用 `opacity-0`
- 补 `aria-label`

### D2. Loading/Failed 文案中文化

全局替换思路：

```text
Loading... -> 加载中…
Failed to load ... -> 加载失败，请稍后重试
Failed to save -> 保存失败，请稍后重试
Failed to delete -> 删除失败，请稍后重试
Failed to create -> 创建失败，请稍后重试
```

注意：

- 不要机械替换变量名，只改用户可见 toast 或页面文案。
- `/debug` 可以低优先级，但关键弹窗仍建议中文化。

### D3. hover-only 操作处理

扫描：

```bash
rg -n "opacity-0.*group-hover|group-hover:opacity-100" apps/web/src
```

处理原则：

1. 关键操作：必须始终可见，或 focus-within 可见。
2. 装饰图标：可以 hover-only。
3. 删除/恢复/应用：不得 hover-only。

### D4. 验收

```bash
rg -n "Apply|Loading\\.\\.\\.|Failed to|opacity-0.*group-hover" apps/web/src
pnpm check
```

Expected:

- 主产品页面不再有英文用户可见文案
- 关键操作不再 hover-only

## 6. Task E：全局视觉装饰降噪

**Files:**

- `apps/web/src/features/knowledge/components/KnowledgeSourceDrawer.vue`
- `apps/web/src/features/knowledge/components/KnowledgeSourceList.vue`
- `apps/web/src/features/knowledge/components/KnowledgeSearchResults.vue`
- `apps/web/src/features/writing/components/AIPendingResultPanel.vue`
- `apps/web/src/views/ProjectHomeView.vue`
- `apps/web/src/views/RelationshipsView.vue`
- `apps/web/src/views/ConflictMatrixView.vue`
- `apps/web/src/views/QualityReviewView.vue`

目标：让产品更像稳定工作台，而不是卡片展示页。

### E1. 圆角收敛

替换原则：

```text
rounded-3xl -> rounded-lg
rounded-2xl -> rounded-lg
```

例外：

- 图标容器可以保留 `rounded-xl`
- 头像/圆形按钮可以保留 `rounded-full`
- 设计系统组件内部如果已有统一规则，本轮不强改

### E2. 阴影收敛

替换原则：

```text
shadow-xl -> shadow-sm 或移除
shadow-lg -> shadow-sm
shadow-primary/20 -> 移除
```

工具界面优先用边框，不用强阴影表达层级。

### E3. 大字号收敛

替换原则：

```text
text-4xl -> text-3xl 或 text-2xl
text-3xl -> text-2xl
```

例外：

- 质量评估总分可以保留一个 `text-4xl`
- 写作正文标题可保留文学感，但建议 `text-2xl md:text-3xl`

### E4. 验收

```bash
rg -n "rounded-2xl|rounded-3xl|shadow-lg|shadow-xl|text-4xl" apps/web/src/views apps/web/src/features
pnpm check
```

Expected:

- 剩余项必须能解释为核心视觉焦点

## 7. 最终验收

运行：

```bash
pnpm check
```

静态扫描：

```bash
rg -n "打开项目|ExternalLink|opacity-0.*group-hover" apps/web/src/views/ProjectListView.vue
rg -n "<input|Failed to|Project created|Project deleted|Failed to delete" apps/web/src/views/ProjectListView.vue
rg -n "Apply|Loading\\.\\.\\.|Failed to" apps/web/src
rg -n "rounded-2xl|rounded-3xl|shadow-lg|shadow-xl|text-4xl" apps/web/src/views apps/web/src/features
```

人工检查截图页：

1. 删除按钮位置稳定，不漂浮，不和打开入口重叠。
2. 搜索框 focus 状态明显。
3. 项目卡片单个项目时不显得孤立。
4. 卡片点击与删除操作不会互相误触。
5. 页面整体仍保持安静、专业、工作台风格。

## 8. 建议提交顺序

```bash
git add apps/web/src/views/ProjectListView.vue
git commit -m "polish(ui): fix project card actions and search"

git add apps/web/src/components/AIAssistantSidebar.vue apps/web/src/features/writing/components/EditorPane.vue
git commit -m "polish(ui): localize visible ai and loading actions"

git add apps/web/src/features apps/web/src/views
git commit -m "polish(ui): reduce heavy visual decoration"
```

每个提交后运行 `pnpm check`。不要把 API、store、数据库或迁移改动混入本轮 UI polish。
