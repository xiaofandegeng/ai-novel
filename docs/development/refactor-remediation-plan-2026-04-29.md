# Architecture Refactor Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复架构重构后的 5 个 review finding，让项目重新通过 `pnpm check`，并让 API 层、AI 确认区与 `architecture-refactor-plan-2026-04-29.md` 保持一致。

**Architecture:** 先修复 P0 类型检查阻塞，恢复基础验收门禁；再把 Pinia store 改为调用 `apps/web/src/api/*`，避免 HTTP 细节继续散落；最后收敛大纲 AI 调用和确认区，让 AI 结果进入统一可控流程。所有改动保持小步提交，不顺手做大页面重构。

**Tech Stack:** Vue 3, TypeScript, Pinia, Hono, Drizzle, pnpm workspace, `packages/shared`, `packages/ui`

---

## 0. 当前问题摘要

本次 review 发现 5 个问题：

1. `apps/web/src/views/ConflictMatrixView.vue:283`  
   `conflictForm.status = key` 中 `key` 被推断为 `string`，不能赋给 `ConflictStatus`。

2. `apps/web/src/views/QualityReviewView.vue:107`  
   `QualityReport` 的部分评分字段与 `chapterId` 是可选字段，页面直接参与计算或赋给必填 string，导致 `vue-tsc` 失败。

3. `apps/web/src/features/writing/composables/useAIResultConfirm.ts:38`  
   `toast.add` 类型写成 `(msg: string, type: string)`，比真实 `useToast` 类型更宽，导致 `WritingView` 传入真实 toast 后不兼容。

4. `apps/web/src/stores/chapter.store.ts:4`  
   已创建 `apps/web/src/api/*`，但 store 仍直接使用 `useApi()` 并拼接 `/api/...`，导致 API 层没有真正接入。

5. `apps/web/src/views/OutlineView.vue:198`  
   大纲 AI 仍直接 `fetch('/api/ai/chat')`，且 AI 建议只有“应用/放弃”，没有完整的插入、替换、保存为备选、丢弃确认动作。

验收基线：

```bash
pnpm check
```

当前失败位置：

```text
apps/web typecheck
```

## 1. 文件修改清单

### 必改文件

- `apps/web/src/views/ConflictMatrixView.vue`
- `apps/web/src/views/QualityReviewView.vue`
- `apps/web/src/features/writing/composables/useAIResultConfirm.ts`
- `apps/web/src/stores/*.store.ts`
- `apps/web/src/views/OutlineView.vue`
- `apps/web/src/api/ai.ts`

### 可能需要同步调整

- `apps/web/src/api/*.ts`
- `apps/web/src/composables/useApi.ts`
- `apps/web/src/features/outline/components/OutlineAIPanel.vue`
- `apps/web/src/features/writing/components/AIPendingResultPanel.vue`
- `packages/shared/src/types/quality.ts`
- `packages/shared/src/types/novel.ts`

### 不建议本轮修改

- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/*`
- 大规模拆分 `DataViewer.vue`

本轮目标是修复重构验收问题，不新增数据库字段，不做视觉大改。

## 2. Task A：修复 P0 类型检查阻塞

**Files:**

- Modify: `apps/web/src/views/ConflictMatrixView.vue`
- Modify: `apps/web/src/views/QualityReviewView.vue`
- Modify: `apps/web/src/features/writing/composables/useAIResultConfirm.ts`

### A1. 修复 ConflictMatrixView 的 status 类型

- [ ] **Step 1: 引入或复用 `ConflictStatus` 类型**

在 `ConflictMatrixView.vue` 顶部补充类型导入：

```ts
import type { ConflictStatus } from '@ai-novel/shared'
```

- [ ] **Step 2: 给 `statusMap` 明确类型**

把当前 `statusMap` 改成显式 `Record<ConflictStatus, ...>`。

示例：

```ts
const statusMap: Record<ConflictStatus, { label: string, icon: any, color: string, bg: string }> = {
  latent: { label: '潜伏', icon: HelpCircle, color: 'text-text-muted', bg: 'bg-bg-subtle' },
  forming: { label: '成形', icon: AlertCircle, color: 'text-warning', bg: 'bg-warning/10' },
  escalating: { label: '升级', icon: TrendingUp, color: 'text-accent', bg: 'bg-accent-soft' },
  exploding: { label: '爆发', icon: Flame, color: 'text-semantic-error', bg: 'bg-error/10' },
  resolved: { label: '解决', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  abandoned: { label: '废弃', icon: Trash2, color: 'text-text-muted', bg: 'bg-bg-subtle' },
}
```

如果图标类型不好表达，允许暂时使用 `Component` 或当前已有的 icon 类型，但不要把 `key` 继续留成普通 `string`。

- [ ] **Step 3: 模板赋值时收窄 key**

可选做法：

```vue
@click="conflictForm.status = key as ConflictStatus"
```

更推荐做法是把状态选项变成数组：

```ts
const statusOptions: Array<{ value: ConflictStatus, label: string, icon: any, color: string, bg: string }> = [...]
```

然后模板：

```vue
v-for="item in statusOptions"
:key="item.value"
@click="conflictForm.status = item.value"
```

推荐数组方案，类型更干净。

### A2. 修复 QualityReviewView 的可选评分字段

- [ ] **Step 1: 增加评分归一化 helper**

在 `QualityReviewView.vue` 中增加：

```ts
function dimensionScore(value?: number) {
  return (value ?? 0) * 10
}
```

- [ ] **Step 2: 替换直接计算**

把：

```ts
score: r ? r.rhythmScore * 10 : 0
```

改成：

```ts
score: r ? dimensionScore(r.rhythmScore) : 0
```

同样处理：

- `conflictScore`
- `logicScore`
- `characterScore`
- 如果页面使用 `styleScore`，也同样处理

- [ ] **Step 3: 修复 `chapterId` 可选值**

当前：

```ts
selectedChapterId.value = report.chapterId
```

改成：

```ts
if (report.chapterId)
  selectedChapterId.value = report.chapterId
```

如果质量报告未来支持全书报告，`chapterId` 为空时不要切换章节。

### A3. 修复 `useAIResultConfirm` 的 toast 类型

- [ ] **Step 1: 定义 Toast 类型**

在 `useAIResultConfirm.ts` 中增加局部类型：

```ts
type ToastType = 'success' | 'info' | 'warning' | 'error'
```

- [ ] **Step 2: 收窄 deps.toast**

把：

```ts
toast: { add: (msg: string, type: string) => void }
```

改成：

```ts
toast: { add: (message: string, type?: ToastType, duration?: number) => void }
```

- [ ] **Step 3: 确认调用不变**

以下调用应继续通过：

```ts
deps.toast.add('AI changes applied to draft', 'success')
deps.toast.add('Saved as backup version', 'success')
```

### A4. 验收 P0 修复

- [ ] **Step 1: 跑类型检查**

```bash
pnpm typecheck
```

Expected:

```text
apps/web typecheck: Done
```

- [ ] **Step 2: 跑完整门禁**

```bash
pnpm check
```

Expected:

```text
lint passed
typecheck passed
build passed
test passed
```

如果此阶段仍失败，不要继续做 Task B。

## 3. Task B：让 Pinia Store 真正接入 API 层

**Files:**

- Modify: `apps/web/src/stores/project.store.ts`
- Modify: `apps/web/src/stores/story-bible.store.ts`
- Modify: `apps/web/src/stores/character.store.ts`
- Modify: `apps/web/src/stores/volume.store.ts`
- Modify: `apps/web/src/stores/chapter.store.ts`
- Modify: `apps/web/src/stores/relationship.store.ts`
- Modify: `apps/web/src/stores/conflict.store.ts`
- Modify: `apps/web/src/stores/version.store.ts`
- Modify: `apps/web/src/stores/knowledge.store.ts`
- Modify: `apps/web/src/stores/quality.store.ts`
- Possibly Modify: `apps/web/src/api/*.ts`

目标：store 不再直接 `useApi()`，也不再拼接 `/api/...` 路径。HTTP endpoint 只存在于 `apps/web/src/api`。

### B1. 迁移 chapter store

- [ ] **Step 1: 修改 import**

当前：

```ts
import { useApi } from '../composables/useApi'
```

改成：

```ts
import * as chaptersApi from '../api/chapters'
```

- [ ] **Step 2: 删除 `useApi()`**

删除：

```ts
const { get, post, patch, del } = useApi()
```

- [ ] **Step 3: 替换调用**

```ts
chapters.value = await chaptersApi.fetchChapters(projectId)
const ch = await chaptersApi.createChapter(projectId, data)
const ch = await chaptersApi.updateChapter(projectId, id, data)
await chaptersApi.deleteChapter(projectId, id)
```

如果 `apps/web/src/api/chapters.ts` 里的函数名不同，优先统一为：

```ts
fetchChapters
createChapter
updateChapter
deleteChapter
```

### B2. 按同样模式迁移其他 store

- [ ] `project.store.ts` 使用 `../api/projects`
- [ ] `story-bible.store.ts` 使用 `../api/story-bibles`
- [ ] `character.store.ts` 使用 `../api/characters`
- [ ] `volume.store.ts` 使用 `../api/volumes`
- [ ] `relationship.store.ts` 使用 `../api/relationships`
- [ ] `conflict.store.ts` 使用 `../api/conflicts`
- [ ] `version.store.ts` 使用 `../api/versions`
- [ ] `knowledge.store.ts` 使用 `../api/knowledge`
- [ ] `quality.store.ts` 使用 `../api/quality`

### B3. 保留 `useApi` 的用途

`useApi` 可以暂时保留给少数直接页面或旧兼容代码，但新增 store 不得再引用它。

验收搜索：

```bash
rg -n "useApi\\(|/api/projects|/api/.*" apps/web/src/stores
```

Expected:

- `apps/web/src/stores/*.store.ts` 中没有 `useApi()`
- store 中没有直接拼接 `/api/...`
- API 路径只出现在 `apps/web/src/api/*.ts`

### B4. 验收 Task B

```bash
pnpm check
```

Expected: 全部通过。

## 4. Task C：收敛大纲 AI 调用和确认动作

**Files:**

- Modify: `apps/web/src/api/ai.ts`
- Modify: `apps/web/src/views/OutlineView.vue`
- Modify: `apps/web/src/features/outline/components/OutlineAIPanel.vue`
- Optionally Create: `apps/web/src/features/outline/composables/useOutlineAIResult.ts`

目标：大纲 AI 不再直接 fetch；AI 结果必须进入可控确认区，并提供插入、替换、保存为备选、丢弃。

### C1. 使用统一 AI API client

- [ ] **Step 1: 确认 `apps/web/src/api/ai.ts` 暴露 streaming 方法**

推荐接口：

```ts
export async function readChatStream(response: Response): Promise<string> {
  if (!response.body)
    throw new Error('AI response body is empty')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    result += decoder.decode(value)
  }

  return result
}
```

保留已有：

```ts
chatStream(messages, options)
```

- [ ] **Step 2: 修改 `OutlineView.vue`**

删除直接：

```ts
fetch('/api/ai/chat', ...)
```

改为：

```ts
import { chatStream, readChatStream } from '../api/ai'
```

调用：

```ts
const response = await chatStream(
  [{
    role: 'user',
    content: `Based on the context, brainstorm a detailed outline for this chapter...`,
  }],
  { projectId, context },
)

aiSuggestion.value = await readChatStream(response)
```

### C2. 扩展 OutlineAIPanel 确认动作

- [ ] **Step 1: 修改 emits**

当前：

```ts
apply: []
discard: []
```

改为：

```ts
confirm: [action: 'insert' | 'replace' | 'backup' | 'discard']
```

- [ ] **Step 2: UI 增加四个动作**

在 AI 建议区域提供：

- 插入到关键事件
- 替换关键事件
- 保存为备选
- 丢弃

示例：

```vue
<div class="grid grid-cols-2 gap-2">
  <NButton size="sm" variant="primary" @click="emit('confirm', 'insert')">插入</NButton>
  <NButton size="sm" variant="ghost" @click="emit('confirm', 'replace')">替换</NButton>
  <NButton size="sm" variant="ghost" @click="emit('confirm', 'backup')">存为备选</NButton>
  <NButton size="sm" variant="ghost" @click="emit('confirm', 'discard')">丢弃</NButton>
</div>
```

### C3. 实现大纲 AI 确认逻辑

- [ ] **Step 1: 新增备选结果状态**

在 `OutlineView.vue` 中增加：

```ts
const outlineAlternatives = ref<string[]>([])
```

- [ ] **Step 2: 实现确认函数**

```ts
function confirmOutlineAIResult(action: 'insert' | 'replace' | 'backup' | 'discard') {
  if (!aiSuggestion.value)
    return

  if (action === 'insert') {
    outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n\n` : '') + aiSuggestion.value
    toast.add('AI 建议已插入关键事件', 'success')
  }
  else if (action === 'replace') {
    outlineForm.value.events = aiSuggestion.value
    toast.add('AI 建议已替换关键事件', 'success')
  }
  else if (action === 'backup') {
    outlineAlternatives.value.unshift(aiSuggestion.value)
    toast.add('AI 建议已保存为备选', 'success')
  }
  else {
    toast.add('AI 建议已丢弃', 'info')
  }

  aiSuggestion.value = null
}
```

注意：`backup` 本轮可以先保存在页面状态，不强行新增数据库表。不要改 schema。

- [ ] **Step 3: 替换旧函数**

删除或停止使用：

```ts
applyAISuggestion()
discardAISuggestion()
```

改成：

```vue
@confirm="confirmOutlineAIResult"
```

### C4. 验收 Task C

```bash
rg -n "fetch\\('/api/ai/chat'|fetch\\(\"/api/ai/chat\"" apps/web/src/views apps/web/src/components
rg -n "applyAISuggestion|discardAISuggestion" apps/web/src/views/OutlineView.vue
pnpm check
```

Expected:

- `OutlineView.vue` 不再直接 fetch AI endpoint
- 旧的 apply/discard 函数不再存在
- `pnpm check` 通过

## 5. Task D：最终结构验收

**Files:** 无固定修改文件，按检查结果处理。

- [ ] **Step 1: 检查 store 不再绕过 API 层**

```bash
rg -n "useApi\\(" apps/web/src/stores
rg -n "/api/" apps/web/src/stores
```

Expected: 无结果，或只有明确注释的兼容文件。

- [ ] **Step 2: 检查前端 AI endpoint 直连**

```bash
rg -n "fetch\\('/api/ai/chat'|fetch\\(\"/api/ai/chat\"" apps/web/src
```

Expected:

- 只允许 `apps/web/src/api/ai.ts` 内存在。
- 如果 `AIAssistantSidebar.vue` 暂时保留直连，需要在最终回复中标明未完成；更推荐本轮也改为 `chatStream()`。

- [ ] **Step 3: 检查原生确认**

```bash
rg -n "alert\\(|confirm\\(|prompt\\(" apps/web/src
```

Expected: 无结果。

- [ ] **Step 4: 检查硬编码后端地址**

```bash
rg -n "http://localhost:3000" apps/web/src
```

Expected: 无结果。`vite.config.ts` proxy 中允许存在。

- [ ] **Step 5: 完整验收**

```bash
pnpm check
```

Expected: 通过。

## 6. 完成标准

本修改文档完成后，必须满足：

1. `pnpm check` 通过。
2. 3 个 P0 类型检查问题全部消失。
3. `apps/web/src/stores/*.store.ts` 不再直接拼 API URL。
4. `OutlineView.vue` 不再直接 fetch AI endpoint。
5. 大纲 AI 建议至少支持插入、替换、保存为备选、丢弃。
6. 不新增数据库 schema，不新增 migration。
7. 最终回复列出：
   - 修改文件
   - 验收命令
   - 剩余风险

## 7. 建议提交顺序

```bash
git add apps/web/src/views/ConflictMatrixView.vue apps/web/src/views/QualityReviewView.vue apps/web/src/features/writing/composables/useAIResultConfirm.ts
git commit -m "fix(web): restore refactor typecheck"

git add apps/web/src/stores apps/web/src/api
git commit -m "refactor(web): route stores through typed api modules"

git add apps/web/src/views/OutlineView.vue apps/web/src/features/outline apps/web/src/api/ai.ts
git commit -m "refactor(web): unify outline ai confirmation flow"
```

不要在同一个提交里混入大页面瘦身、UI 重绘或数据库迁移。
