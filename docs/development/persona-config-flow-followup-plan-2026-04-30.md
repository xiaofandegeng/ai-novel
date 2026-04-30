# 写作人格配置闭环二次修复文档

日期：2026-04-30  
范围：项目人格配置入口、AI 场景注入、训练集分析状态、流式错误协议。  
背景：`persona-flow-remediation-plan-2026-04-30.md` 已完成一轮开发后，`pnpm check` 和 `pnpm db:migrate` 已通过，但复核发现写作人格从“生成”到“项目生效”的闭环仍有断点。

---

## 1. 当前验收状态

已确认通过：

```bash
pnpm db:migrate
pnpm check
```

已修复的旧问题：

1. AI 未配置时，`POST /api/ai/chat` 已返回结构化 `400`。
2. 知识库 AI 未配置时不再伪装分析完成。
3. 知识库搜索已覆盖 `title/content/summary/techniques`。
4. 章节更新时已校验同卷章节序号重复。
5. persona 迁移已可执行。
6. `/persona/work/:workId` 作品详情路由已注册。

仍需修复的问题：

1. 项目设置页缺少写作人格绑定与启用配置。
2. AI 调用未正确传递 scene，场景开关会被 `chat` 默认值绕过。
3. `project_persona_configs` 的布尔开关类型与数据库 integer 字段不一致。
4. 训练集页面无法区分“已拆分、已分析、已生成报告”。
5. 部分章节分析失败时，作品仍被持久化为 `completed`。
6. AI 流式运行时错误仍可能被当成可应用文本。

---

## 2. 修复优先级

### P1：必须先修

1. 项目人格配置入口。
2. AI scene 传递与后端场景开关。
3. persona config 类型一致性。
4. 训练集分析与报告生成状态。

### P2：随后修复

1. 部分失败状态持久化。
2. 流式运行时错误协议。

---

## 3. P1：补齐项目人格配置入口

### 问题

位置：

- `apps/web/src/views/ProjectSettingsView.vue`
- `apps/web/src/api/persona.ts`
- `apps/api/src/routes/persona.ts`

当前项目设置页只有基础信息、风格配置和 AI 服务配置。用户即使已经生成并发布写作人格，也没有入口把人格绑定到项目。后端 `buildPersonaPromptForProject()` 只有在 `project_persona_configs` 存在时才会生效，因此普通用户无法真正启用写作人格。

### 修复目标

项目设置页新增「写作人格配置」面板：

1. 读取已发布写作人格列表。
2. 读取当前项目的 `persona-config`。
3. 允许选择人格。
4. 允许设置强度 `0-100`。
5. 允许开启或关闭大纲、正文、润色、质量评估场景。
6. 允许填写项目级覆盖说明 `projectOverrides`。
7. 保存后调用 `updateProjectPersonaConfig(projectId, payload)`。
8. 支持预览注入提示，调用 `getPersonaPreview(projectId)`。

### UI 建议

在 `ProjectSettingsView.vue` 的「风格配置」之后、「AI 服务配置」之前加入：

```text
NPanel: 写作人格
  NSelect: 选择已发布人格
  range/input: 人格强度
  checkbox/toggle group:
    - 应用于大纲
    - 应用于正文
    - 应用于润色
    - 应用于质量评估
  NTextArea: 项目覆盖说明
  buttons:
    - 保存人格配置
    - 预览注入规则
```

空状态：

```text
尚无已发布写作人格。请先到写作人格库生成并发布人格。
```

### 实现要求

1. 不要把 persona HTTP 请求写在 view 里散落 `fetch`，使用 `apps/web/src/api/persona.ts`。
2. 已发布人格列表只展示 `status === 'published'`。
3. 未选择人格时禁用保存按钮。
4. 保存失败时展示中文 toast。
5. 预览内容只能展示，不得直接写入项目风格字段。

---

## 4. P1：修复 AI scene 传递与场景开关

### 问题

位置：

- `apps/web/src/components/AIAssistantSidebar.vue`
- `apps/web/src/features/writing/components/WritingContextPanel.vue`
- `apps/web/src/views/WritingView.vue`
- `apps/web/src/views/OutlineView.vue`
- `apps/api/src/services/persona-prompt.service.ts`
- `apps/api/src/routes/ai.ts`

`chatStream()` 已支持 `scene`，但实际调用只有 `projectId/context/model`。后端默认 `scene || 'chat'`，而 `buildPersonaPromptForProject()` 对 `chat` 不检查 `enabledForDraft/enabledForOutline/enabledForPolish/enabledForQualityReview`。结果：

1. 写作页续写、润色都以 `chat` 场景进入。
2. 大纲灵感也以 `chat` 场景进入。
3. 用户关闭某个场景开关后，仍可能注入人格规则。

### 修复目标

所有 AI 生成调用必须明确 scene：

```ts
type AIScene = 'outline' | 'draft' | 'polish' | 'quality' | 'chat'
```

映射规则：

```text
大纲页灵感风暴 -> outline
写作页续写 -> draft
写作页扩写 -> draft
写作页精简 -> polish
写作页润色 -> polish
质量评估 -> quality
普通自由聊天 -> chat
```

### 推荐实现

#### Step 1：给 AIAssistantSidebar 增加 scene prop

```ts
const props = defineProps<{
  projectId: string
  context?: string
  scene?: AIScene
}>()
```

调用：

```ts
chatStream(messages, {
  projectId: props.projectId,
  context: props.context,
  model: selectedModel.value,
  scene: props.scene || 'chat',
})
```

#### Step 2：WritingContextPanel 暴露带 scene 的发送方法

```ts
function sendMessageToAI(prompt: string, scene: AIScene = 'chat') {
  pendingScene.value = scene
  ...
}
```

模板传入：

```vue
<AIAssistantSidebar
  :scene="pendingScene"
/>
```

#### Step 3：WritingView 按动作传 scene

```ts
const sceneMap = {
  continue: 'draft',
  expand: 'draft',
  polish: 'polish',
  shorten: 'polish',
} as const

contextPanelRef.value.sendMessageToAI(prompt, sceneMap[type])
```

#### Step 4：OutlineView 明确传 outline

```ts
chatStream(messages, {
  projectId,
  context,
  scene: 'outline',
})
```

#### Step 5：后端不要让 chat 绕过所有开关

`chat` 是自由聊天，不应默认注入写作人格。建议：

```ts
if (scene === 'chat')
  return null
```

如后续需要“AI 助手聊天也使用人格”，应新增独立字段：

```text
enabledForChat
```

不要复用其他场景开关。

---

## 5. P1：统一 persona config 开关类型

### 问题

位置：

- `packages/shared/src/types/persona.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/src/routes/persona.ts`

shared 中 `UpdateProjectPersonaConfigInput` 使用 boolean：

```ts
enabledForOutline?: boolean
enabledForDraft?: boolean
enabledForPolish?: boolean
enabledForQualityReview?: boolean
```

数据库中对应字段是 integer：

```ts
enabledForOutline: integer(...).default(1)
```

当前 route 直接写入：

```ts
enabledForOutline: body.enabledForOutline ?? 1
```

前端一旦发送 `true/false`，可能导致 integer 字段写入失败或类型漂移。

### 推荐修复

短期采用 integer 存储，route 显式转换：

```ts
function boolToInt(value: unknown, fallback: number) {
  if (value === undefined)
    return fallback
  return value ? 1 : 0
}
```

保存时：

```ts
enabledForOutline: boolToInt(body.enabledForOutline, existing?.enabledForOutline ?? 1),
enabledForDraft: boolToInt(body.enabledForDraft, existing?.enabledForDraft ?? 1),
enabledForPolish: boolToInt(body.enabledForPolish, existing?.enabledForPolish ?? 0),
enabledForQualityReview: boolToInt(body.enabledForQualityReview, existing?.enabledForQualityReview ?? 0),
```

读取返回时保持 number，前端表单转换成 boolean：

```ts
personaForm.enabledForOutline = Boolean(config.enabledForOutline)
```

长期方案可以改为 PostgreSQL boolean 字段，但必须同步 migration 和 shared 类型。

---

## 6. P1：训练集分析与报告生成状态拆分

### 问题

位置：

- `apps/web/src/views/TrainingSetDetailView.vue`
- `apps/web/src/views/ReferenceWorkDetailView.vue`
- `apps/web/src/api/persona.ts`
- `apps/api/src/routes/persona.ts`
- `apps/api/src/services/persona.service.ts`

当前「分析章节」和「生成报告」使用同一个条件：

```vue
v-if="work.status === 'completed' && !workHasReport[work.id]"
```

用户可能在没有章节分析时直接点「生成报告」，得到失败提示；分析完成后也无法从列表判断该作品是否已分析。

### 修复目标

作品训练流程应明确为：

```text
上传作品 -> 拆分章节 -> 分析章节 -> 生成作品报告 -> 生成人格
```

每一步 UI 只显示当前可执行动作。

### 推荐后端改造

新增接口：

```http
GET /api/persona/works/:workId/analysis-summary
```

返回：

```ts
interface WorkAnalysisSummary {
  chapterCount: number
  analyzedCount: number
  failedCount: number
  hasReport: boolean
  canAnalyze: boolean
  canGenerateReport: boolean
}
```

服务层统计：

1. `reference_chapters` count。
2. `chapter_analyses` count。
3. `work_style_reports` 是否存在。
4. 如采用部分失败状态，也返回失败数量。

### 推荐前端改造

`TrainingSetDetailView.vue` 使用 `workAnalysisSummaryMap` 替代 `workHasReport`：

```ts
const workAnalysisSummaryMap = ref<Record<string, WorkAnalysisSummary>>({})
```

按钮显示规则：

```text
拆分完成且 analyzedCount === 0 -> 显示「分析章节」
analyzedCount > 0 且 !hasReport -> 显示「生成报告」
hasReport -> 显示「查看报告」
failedCount > 0 -> 显示 warning tag
```

`ReferenceWorkDetailView.vue` 顶部按钮同样使用 summary 控制，不要同时显示「分析章节」和「生成报告」。

### 生成人格前校验

点击「生成人格」前：

1. 检查训练集中至少有一个 `work_style_report`。
2. 如果存在已上传但未分析/未生成报告的作品，展示确认弹窗：

```text
仍有参考作品未生成风格报告，当前人格只会基于已完成报告生成。是否继续？
```

不得直接静默忽略。

---

## 7. P2：部分章节分析失败状态持久化

### 问题

位置：

- `apps/api/src/db/schema.ts`
- `packages/shared/src/types/persona.ts`
- `apps/api/src/services/persona.service.ts`
- `apps/web/src/views/TrainingSetDetailView.vue`
- `apps/web/src/views/ReferenceWorkDetailView.vue`

`analyzeAllChapters()` 返回 `partial_failed`，但数据库 `reference_works.status` 只能存：

```ts
'uploaded' | 'splitting' | 'analyzing' | 'completed' | 'failed'
```

部分失败时实际写入 `completed`，列表页显示“已完成”。

### 推荐修复

扩展状态：

```ts
export type ReferenceWorkStatus =
  | 'uploaded'
  | 'splitting'
  | 'analyzing'
  | 'completed'
  | 'partial_failed'
  | 'failed'
```

同步修改：

1. `packages/shared/src/types/persona.ts`
2. `apps/api/src/db/schema.ts`
3. 新增 Drizzle migration。
4. `statusLabel()` 增加：

```ts
partial_failed: '部分失败'
```

5. `statusVariant()` 对 `partial_failed` 使用 `warning`。

写入逻辑：

```ts
status: allFailed ? 'failed' : allCompleted ? 'completed' : 'partial_failed'
```

报告生成策略：

1. 如果 `partial_failed`，允许生成报告，但必须在 UI 提示“报告基于部分章节生成”。
2. 如果 `failed`，禁止生成报告。

---

## 8. P2：修复 AI 流式运行时错误协议

### 问题

位置：

- `apps/api/src/routes/ai.ts`
- `apps/web/src/api/ai.ts`
- `apps/web/src/components/AIAssistantSidebar.vue`

AI 未配置的 preflight 已修复，但 stream 内部出错时仍会：

```ts
await stream.write(`\n\n[Error: ${error.message}]`)
```

前端会把这段文本当成普通 AI 回复，并显示「应用到编辑器」。

### 推荐短期修复

前端在读取 stream 后识别错误文本，标记 message 为 error：

```ts
if (messages.value[lastIndex].content.includes('[Error:')) {
  messages.value[lastIndex].error = true
}
```

并在模板中禁止应用：

```vue
v-if="msg.role === 'assistant' && msg.content && !msg.error && !isStreaming"
```

当前模板已有 `!msg.error`，只需要确保 stream 错误会设置 `error = true`。

### 推荐长期修复

改为 SSE 或 NDJSON 协议：

```json
{"type":"delta","content":"..."}
{"type":"error","message":"模型调用失败"}
{"type":"done"}
```

前端只把 `delta` 追加到正文候选；收到 `error` 时：

1. 设置消息为错误状态。
2. 不显示「应用到编辑器」。
3. 展示中文错误说明。

---

## 9. 修改文件清单

建议涉及：

```text
packages/shared/src/types/persona.ts
apps/api/src/db/schema.ts
apps/api/drizzle/*.sql
apps/api/src/routes/persona.ts
apps/api/src/routes/ai.ts
apps/api/src/services/persona.service.ts
apps/api/src/services/persona-prompt.service.ts
apps/web/src/api/ai.ts
apps/web/src/api/persona.ts
apps/web/src/views/ProjectSettingsView.vue
apps/web/src/views/TrainingSetDetailView.vue
apps/web/src/views/ReferenceWorkDetailView.vue
apps/web/src/views/OutlineView.vue
apps/web/src/views/WritingView.vue
apps/web/src/components/AIAssistantSidebar.vue
apps/web/src/features/writing/components/WritingContextPanel.vue
```

---

## 10. 验收命令

普通验收：

```bash
pnpm check
```

涉及状态枚举或 schema 后：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

接口烟测：

```bash
curl -s -i -X POST http://127.0.0.1:3000/api/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"测试"}]}'
```

预期：未配置 AI 时返回结构化 `400`，而不是 200 stream 错误文本。

浏览器验收：

1. 打开 `/persona`。
2. 创建训练集。
3. 上传参考作品。
4. 拆分完成后只显示「分析章节」。
5. 分析完成后只显示「生成报告」。
6. 报告完成后显示「查看报告」。
7. 生成并发布人格。
8. 打开 `/project/:id/settings`。
9. 绑定已发布人格并保存。
10. 打开大纲页，确认 AI 灵感传 `scene: outline`。
11. 打开写作页，确认续写/扩写传 `scene: draft`，润色/精简传 `scene: polish`。
12. 关闭对应场景开关后，该场景不再注入人格提示。

---

## 11. 验收标准

修复完成必须满足：

1. 用户能从 UI 完成「训练集 -> 作品报告 -> 写作人格 -> 发布 -> 项目绑定 -> 生成生效」完整闭环。
2. `enabledForOutline/enabledForDraft/enabledForPolish/enabledForQualityReview` 对应场景真实生效。
3. `chat` 场景不会默认绕过所有开关注入人格。
4. 前后端 persona config 类型一致，不会把 boolean 直接写入 integer 字段。
5. 训练集按钮不会让用户提前触发必然失败的操作。
6. 部分失败状态在 UI 中可见，不会显示成“已完成”。
7. AI stream 错误不会显示「应用到编辑器」。
8. `pnpm check` 通过。
9. 如果改 schema，`pnpm db:migrate` 通过。

