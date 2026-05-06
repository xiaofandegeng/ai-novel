# 前端结构重构回归修复计划

日期：2026-05-06
适用范围：`apps/web`
背景：前端已按 `frontend-structure-adjustment-plan-2026-05-06.md` 做了一轮结构拆分，`OutlineView`、`ProjectSettingsView`、`WritingJobView` 已明显瘦身。但拆分后出现 3 个流程语义回归，需要优先修复后再继续下一阶段拆分。

## 1. 修复目标

本轮只修复以下问题：

1. 项目设置页 AI 配置加载完成前可能被默认值覆盖。
2. 大纲 AI 的“存为备选”按钮没有实际保存内容。
3. 写作任务等待审查时可能同时展示多个已完成确认步骤的操作面板。

不在本轮处理：

- 后端数据库 schema。
- AI provider 能力扩展。
- 写作任务后端状态机。
- 人物、关系、冲突等后续页面拆分。

## 2. 问题一：AI 配置可能被默认值覆盖

### 2.1 问题位置

```text
apps/web/src/views/ProjectSettingsView.vue
apps/web/src/features/settings/composables/useAIProviderSettings.ts
apps/web/src/features/settings/composables/useProjectPersonaSettings.ts
```

当前设置页只用基础项目 composable 的 `loading` 控制整体展示：

```vue
<NLoadingState v-if="loading" />
<template v-else>
  <ProjectAIProviderSettings ... />
</template>
```

但 AI 配置在 `useAIProviderSettings` 的独立 `onMounted` 中异步加载，初始值是：

```ts
provider: 'openai-compatible'
baseUrl: 'https://api.openai.com/v1'
model: 'gpt-4o-mini'
```

如果基础项目先加载完成，页面会显示默认 AI 表单。用户此时点击“保存 AI 配置”，可能覆盖已有 provider/baseUrl/model。

### 2.2 修复要求

必须给设置页三个配置模块建立明确加载状态：

```ts
basicLoading
aiLoading
personaLoading
```

并在 `ProjectSettingsView.vue` 中使用组合 loading：

```ts
const settingsLoading = computed(() =>
  basicLoading.value || aiLoading.value || personaLoading.value
)
```

页面只有在三组配置都加载完成后，才允许展示可保存表单。

### 2.3 具体修改

#### 修改 `useAIProviderSettings.ts`

新增：

```ts
const loading = ref(true)
const loaded = ref(false)
const loadError = ref('')
```

`onMounted` 中：

```ts
onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const [aiSettings, providers] = await Promise.all([
      settingsApi.fetchAISettings(),
      settingsApi.fetchAIProviderPresets(),
    ])
    aiProviderPresets.value = providers
    aiForm.value = ...
    loaded.value = true
  }
  catch {
    loadError.value = 'AI 配置加载失败'
    toast.add('AI 配置加载失败', 'error')
  }
  finally {
    loading.value = false
  }
})
```

`handleSaveAI` 前增加保护：

```ts
if (!loaded.value) {
  toast.add('AI 配置仍在加载，请稍后再保存', 'warning')
  return
}
```

返回：

```ts
return {
  loading,
  loaded,
  loadError,
  ...
}
```

#### 修改 `useProjectPersonaSettings.ts`

新增：

```ts
const loading = ref(true)
const loaded = ref(false)
```

无论是否有已发布人格，都必须等 `listPublishedPersonas` 和 `getProjectPersonaConfig` 完成后再将 `loaded` 置为 true。

返回：

```ts
return {
  loading,
  loaded,
  ...
}
```

#### 修改 `ProjectSettingsView.vue`

重命名基础配置 loading，避免语义混淆：

```ts
const {
  loading: basicLoading,
  ...
} = useProjectBasicSettings(projectId)
```

接入 AI 和 persona loading：

```ts
const {
  loading: aiLoading,
  loaded: aiLoaded,
  ...
} = useAIProviderSettings(projectId)

const {
  loading: personaLoading,
  loaded: personaLoaded,
  ...
} = useProjectPersonaSettings(projectId)
```

新增：

```ts
const settingsLoading = computed(() =>
  basicLoading.value || aiLoading.value || personaLoading.value
)

const canSaveBasic = computed(() => !basicLoading.value)
```

模板中：

```vue
<NLoadingState v-if="settingsLoading" />
<template v-else>
  ...
</template>
```

顶栏保存按钮只保存基础配置，所以禁用逻辑应使用 `basicLoading`：

```vue
<NButton
  variant="primary"
  size="sm"
  :disabled="basicLoading"
  :loading="saving"
  @click="handleSave"
>
```

### 2.4 验收标准

1. 打开项目设置页时，AI 表单不会在真实配置加载前显示默认 OpenAI 配置。
2. AI 配置加载失败时，页面显示错误或 toast，不允许误保存默认值。
3. 已保存 Kimi/GLM/Gemini/火山等配置时，刷新页面后表单展示真实配置。
4. `pnpm typecheck` 通过。

## 3. 问题二：大纲 AI“存为备选”没有实际保存

### 3.1 问题位置

```text
apps/web/src/features/outline/composables/useOutlineWorkspace.ts
apps/web/src/features/outline/components/OutlineAIPanel.vue
```

当前 `backup` 分支只弹 toast：

```ts
else if (action === 'backup') {
  toast.add('AI 建议已保存为备选', 'success')
}
```

然后清空 `aiSuggestion`，导致内容实际丢失。

### 3.2 修复方案

本轮先实现前端本地备选列表，不新增后端表。

原因：

1. 当前目标是修复结构拆分回归，不扩大后端 schema。
2. “保存为备选”至少应保证当前页面会话内可见、可再次插入。
3. 后续可再升级为持久化 AI 候选建议。

### 3.3 具体修改

#### 修改 `useOutlineWorkspace.ts`

新增：

```ts
const outlineAlternatives = ref<string[]>([])
```

`backup` 分支改为：

```ts
else if (action === 'backup') {
  outlineAlternatives.value.unshift(aiSuggestion.value)
  toast.add('AI 建议已保存为备选', 'success')
}
```

新增方法：

```ts
function applyOutlineAlternative(index: number, action: 'insert' | 'replace') {
  const text = outlineAlternatives.value[index]
  if (!text)
    return

  if (action === 'insert') {
    outlineForm.value.events = (outlineForm.value.events ? `${outlineForm.value.events}\n\n` : '') + text
    toast.add('备选方案已插入关键事件', 'success')
  }
  else {
    outlineForm.value.events = text
    toast.add('备选方案已替换关键事件', 'success')
  }
}

function removeOutlineAlternative(index: number) {
  outlineAlternatives.value.splice(index, 1)
  toast.add('备选方案已移除', 'info')
}
```

返回：

```ts
return {
  outlineAlternatives,
  applyOutlineAlternative,
  removeOutlineAlternative,
}
```

#### 修改 `OutlineAIPanel.vue`

新增 props：

```ts
defineProps<{
  aiSuggestion: string | null
  isBrainstorming: boolean
  theme?: string
  alternatives: string[]
}>()
```

新增 emits：

```ts
applyAlternative: [index: number, action: 'insert' | 'replace']
removeAlternative: [index: number]
```

在 AI 建议区下方增加“备选方案”列表：

```vue
<div v-if="alternatives.length > 0" class="space-y-3">
  <h3 class="text-xs text-text-muted font-bold tracking-wider uppercase">
    备选方案
  </h3>
  <div
    v-for="(item, index) in alternatives"
    :key="`${index}-${item.slice(0, 16)}`"
    class="border border-border-light rounded-lg bg-bg-surface p-3"
  >
    <p class="line-clamp-4 whitespace-pre-wrap text-xs text-text-secondary leading-relaxed">
      {{ item }}
    </p>
    <div class="mt-2 flex gap-2">
      <NButton size="sm" variant="ghost" @click="emit('applyAlternative', index, 'insert')">
        插入
      </NButton>
      <NButton size="sm" variant="ghost" @click="emit('applyAlternative', index, 'replace')">
        替换
      </NButton>
      <NButton size="sm" variant="ghost" @click="emit('removeAlternative', index)">
        移除
      </NButton>
    </div>
  </div>
</div>
```

#### 修改 `OutlineView.vue`

接入：

```ts
const {
  outlineAlternatives,
  applyOutlineAlternative,
  removeOutlineAlternative,
} = useOutlineWorkspace(projectId)
```

传给面板：

```vue
<OutlineAIPanel
  :alternatives="outlineAlternatives"
  @apply-alternative="applyOutlineAlternative"
  @remove-alternative="removeOutlineAlternative"
/>
```

### 3.4 验收标准

1. 点击“存为备选”后，AI 建议出现在右侧“备选方案”列表。
2. 备选方案可以插入到关键事件。
3. 备选方案可以替换关键事件。
4. 备选方案可以移除。
5. 点击“存为备选”不再导致内容无处可找。

## 4. 问题三：写作任务重复显示旧确认步骤

### 4.1 问题位置

```text
apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue
apps/web/src/features/writing-jobs/composables/useWritingJobController.ts
```

当前确认面板判断：

```vue
v-if="CONFIRM_STEP_TYPES.has(step.stepType)
  && step.status === 'completed'
  && job.status === 'waiting_review'"
```

当任务进入第二个确认点时，前面已经完成的 `confirm_plan` 也会再次显示“确认继续/驳回”按钮。

### 4.2 修复方案

本轮采用前端推断当前待确认步骤，不改后端。

规则：

当前待确认步骤应满足：

1. 当前 job.status 是 `waiting_review`。
2. step 是 confirm step。
3. step.status 是 `completed`。
4. 它是所有已完成 confirm step 中最后一个。
5. 或者它之后的第一个未完成步骤仍是 pending，说明流程停在该确认点。

推荐先用“最后一个 completed confirm step”作为最小修复。

### 4.3 具体修改

#### 修改 `useWritingJobController.ts`

新增：

```ts
const currentReviewStepId = computed(() => {
  if (job.value?.status !== 'waiting_review')
    return null

  const completedConfirmSteps = steps.value.filter(step =>
    CONFIRM_STEP_TYPES.has(step.stepType) && step.status === 'completed',
  )

  return completedConfirmSteps.at(-1)?.id ?? null
})
```

返回：

```ts
return {
  currentReviewStepId,
}
```

#### 修改 `WritingJobView.vue`

传入：

```vue
<WritingJobStepTimeline
  :current-review-step-id="currentReviewStepId"
/>
```

#### 修改 `WritingJobStepTimeline.vue`

新增 prop：

```ts
defineProps<{
  job: WritingJob
  steps: WritingJobStep[]
  actionLoading: string | null
  currentReviewStepId: string | null
}>()
```

确认面板判断改为：

```vue
v-if="step.id === currentReviewStepId"
```

按钮也只在当前 review step 展示。

如果要展示旧确认结果，只显示只读摘要，不展示操作按钮。

### 4.4 验收标准

1. 任务停在 `confirm_plan` 时，只显示大纲确认按钮。
2. 批准后任务继续执行。
3. 任务停在 `confirm_apply` 时，只显示正文确认按钮，不再显示旧的 `confirm_plan` 操作按钮。
4. 任务停在 `confirm_suggestions` 时，只显示章后建议确认按钮。
5. 旧确认步骤可以保留只读状态，但不能再次批准或驳回。

## 5. 推荐修复顺序

必须按以下顺序执行：

1. 修复设置页加载门控，避免配置误覆盖。
2. 修复大纲 AI 备选方案，避免用户生成内容丢失。
3. 修复写作任务当前确认步骤，避免重复批准旧步骤。
4. 运行类型检查。
5. 修复本地依赖 native binding 后运行完整门禁。

## 6. 验收命令

优先运行：

```bash
pnpm typecheck
```

完整验收：

```bash
pnpm check
```

如果本地出现 `oxc-parser` 或 `@rollup/rollup-darwin-arm64` native binding 错误，先修复依赖环境：

```bash
pnpm install
```

然后重新运行：

```bash
pnpm check
```

## 7. 人工验收路径

### 项目设置页

路径：

```text
/project/:id/settings
```

检查：

1. 页面加载中不显示默认 AI 配置表单。
2. 加载完成后展示真实 AI provider/baseUrl/model。
3. 保存基础设置不会影响 AI 配置。
4. 保存 AI 配置不会依赖基础设置按钮。

### 大纲页

路径：

```text
/project/:id/outline
```

检查：

1. 点击 AI 灵感风暴。
2. 点击“存为备选”。
3. 备选方案出现在右侧面板。
4. 对备选方案执行插入、替换、移除。

### 写作任务页

路径：

```text
/project/:id/autopilot
```

检查：

1. 创建并启动写作任务。
2. 停在大纲确认时只显示一个确认面板。
3. 批准后进入后续步骤。
4. 停在正文确认或章后确认时，旧确认步骤不再出现可操作按钮。

## 8. 完成标准

本轮修复完成必须同时满足：

1. `pnpm typecheck` 通过。
2. 若依赖环境正常，`pnpm check` 通过。
3. 三个问题均按人工验收路径验证。
4. 不新增 native `alert`、`confirm`、`prompt`。
5. 不新增前端硬编码 `http://localhost:3000`。
6. 不把 AI 结果直接写入用户内容，仍保留确认动作。
