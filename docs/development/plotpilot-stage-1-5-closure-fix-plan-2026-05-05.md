# PlotPilot 阶段 1-5 闭环修复文档

日期：2026-05-05  
状态：待执行  
关联文档：

1. [plotpilot-remaining-adoption-roadmap-2026-05-04.md](./plotpilot-remaining-adoption-roadmap-2026-05-04.md)
2. [plotpilot-p0-followup-fix-plan-2026-05-04.md](./plotpilot-p0-followup-fix-plan-2026-05-04.md)
3. [chapter-elements-transaction-fix-plan-2026-05-04.md](./chapter-elements-transaction-fix-plan-2026-05-04.md)

范围：章后分析建议、AI 上下文快照、图谱推理、写作任务引擎、混合检索 RAG。  
目标：修复当前阶段 1-5 “有表和页面，但缺少真实闭环”的问题，让 PlotPilot 借鉴路线进入可用产品流程。

---

## 1. 当前结论

当前项目已经通过：

```bash
pnpm check
pnpm db:migrate
```

说明基础类型、构建、迁移已经可运行。  
但阶段 1-5 仍存在关键闭环缺口：

1. 章后分析只写章节记忆，不会生成待确认建议。
2. AI 上下文快照表和读取路由已存在，但 AI 请求不会写入快照。
3. 图谱推理会用空 `chapterId` 创建建议，可能触发外键失败。
4. 写作任务只切换状态，没有真正执行步骤。
5. 知识库混合检索仍只有关键词匹配，没有使用 embedding 或融合排序。

这些问题不一定阻塞 build，但会阻塞产品验收。

---

## 2. 修复顺序

必须按以下顺序修复：

| 顺序 | 问题 | 优先级 | 原因 |
| --- | --- | --- | --- |
| 1 | 图谱推理空 `chapterId` | P1 | 会造成运行时外键错误 |
| 2 | 章后分析不生成建议 | P1 | 阶段 1 核心闭环缺失 |
| 3 | AI 上下文快照不写入 | P1 | 阶段 2 调试器没有数据来源 |
| 4 | 写作任务只是状态切换 | P1 | 阶段 5 自动流程不可用 |
| 5 | 混合检索未用 embedding | P2 | 阶段 4 目前只是关键词增强 |

---

## 3. 问题 1：图谱推理会写入空 chapterId

### 3.1 问题位置

文件：

```text
apps/api/src/services/story-graph-inference.service.ts
```

问题代码：

```ts
await createSuggestion(projectId, '', null, 'fact_triple', ...)
```

`chapter_postprocess_suggestions.chapterId` 当前是 `notNull`，并且外键指向 `chapters.id`。  
传入空字符串会导致外键失败。

### 3.2 修复方案

推荐方案：让推理建议必须绑定真实来源章节。

修改推理逻辑：

1. 对共场推理，继续使用对应 `chapterId`。
2. 对传递推理，优先使用参与三元组的 `sourceChapterId`。
3. 如果两个三元组都没有 `sourceChapterId`，不要创建 `chapter_postprocess_suggestions`，改为跳过或后续设计项目级建议表。

示例：

```ts
const sourceChapterId = t1.sourceChapterId || t2.sourceChapterId
if (!sourceChapterId)
  continue

await createSuggestion(projectId, sourceChapterId, null, 'fact_triple', ...)
```

为了实现这一点，`tripleMap` 中必须保留 `sourceChapterId`：

```ts
const tripleMap = new Map<string, Array<{
  predicate: string
  objectName: string
  sourceChapterId: string | null
}>>()
```

### 3.3 验收标准

1. `/api/projects/:projectId/inference/run` 不会写入空 `chapterId`。
2. 没有来源章节的推理不会进入章节建议表。
3. `pnpm check` 通过。

---

## 4. 问题 2：章后分析不会生成待确认建议

### 4.1 问题位置

文件：

```text
apps/api/src/services/chapter-postprocess.service.ts
```

当前 `runChapterPostprocess` 只做：

1. 调 AI 生成 JSON。
2. upsert `chapter_memories`。
3. 标记 `chapter_postprocess_runs.status = completed`。

但没有调用：

```ts
createSuggestion(...)
```

因此章后分析页没有来自章节正文的待确认结构化建议。

### 4.2 修复目标

章后处理必须生成以下待确认建议：

1. `newFacts` -> `fact_triple`
2. `foreshadowingAdded` -> `foreshadowing_add`
3. `foreshadowingResolved` -> `foreshadowing_payoff`
4. `characterStateChanges` -> `character_state`
5. `relationshipChanges` -> `continuity_note` 或后续关系建议
6. `keyEvents` -> `chapter_element`
7. `styleNotes` -> `style_note`

### 4.3 推荐实现

#### 4.3.1 调整 AI 返回格式

当前 prompt 让 AI 返回字符串，不利于结构化写入。  
建议改成：

```json
{
  "summary": "章节摘要",
  "keyEvents": [
    { "title": "事件名", "description": "事件说明", "importance": "major" }
  ],
  "facts": [
    {
      "subjectType": "character",
      "subjectName": "林岚",
      "predicate": "发现",
      "objectType": "item",
      "objectName": "空白信",
      "confidence": 80,
      "reason": "正文明确写到林岚发现空白信"
    }
  ],
  "foreshadowingAdded": [
    {
      "title": "空白信来源",
      "description": "空白信可能关联身份反转",
      "importance": "major",
      "confidence": 75
    }
  ],
  "foreshadowingPayoffs": [
    {
      "title": "已回收伏笔标题",
      "description": "回收说明",
      "confidence": 70
    }
  ],
  "characterStateChanges": [
    {
      "characterName": "顾临川",
      "change": "开始怀疑自己的记忆",
      "confidence": 80
    }
  ],
  "styleNotes": [
    {
      "title": "节奏变化",
      "description": "本章由调查转入压迫",
      "confidence": 70
    }
  ]
}
```

#### 4.3.2 新增建议写入函数

在 `runChapterPostprocess` 成功解析后调用：

```ts
await createSuggestion(projectId, chapterId, runId, 'fact_triple', payload, confidence, reason)
```

写入要求：

1. 所有建议初始状态必须是 `pending`。
2. 不直接写入 `story_fact_triples / foreshadowing_items / chapter_elements`。
3. `payload` 必须是 JSON 字符串可解析对象。
4. 对缺字段建议要跳过，不要写入半残数据。

#### 4.3.3 兼容旧字符串格式

为了降低风险，可以先支持旧字段：

```ts
if (parsed.newFacts) {
  await createSuggestion(projectId, chapterId, runId, 'continuity_note', {
    title: '新事实待整理',
    description: parsed.newFacts,
  }, 50, 'AI 返回了非结构化事实描述')
}
```

### 4.4 前端联动

文件：

```text
apps/web/src/views/PostChapterAnalysisView.vue
```

要求：

1. 页面需要能展示 `fact_triple / foreshadowing_add / foreshadowing_payoff / chapter_element / character_state / continuity_note / style_note`。
2. payload 解析失败时不要让页面崩溃，应显示“无法解析建议内容”。
3. 接受和拒绝后刷新当前章节建议。
4. 批量应用后刷新建议和相关 store。

### 4.5 验收标准

1. 手动调用章节 postprocess 后，`chapter_postprocess_suggestions` 出现 pending 建议。
2. 章后分析页可以看到建议。
3. 接受建议后状态变 `accepted`。
4. 批量应用后，已接受建议写入对应正式表并变 `applied`。
5. 拒绝建议不会进入正式表。

---

## 5. 问题 3：AI 上下文快照没有写入链路

### 5.1 问题位置

文件：

```text
apps/api/src/routes/ai.ts
apps/api/src/routes/ai-context-snapshots.ts
apps/api/src/db/schema/ai.ts
```

当前已有：

1. `ai_context_snapshots` 表。
2. `GET /api/projects/:projectId/context-snapshots`
3. `GET /api/projects/:projectId/context-snapshots/:id`

缺少：

1. AI 请求时创建快照。
2. 前端页面入口。
3. requestId 在响应或流式协议中的暴露。

### 5.2 后端修复方案

新增服务：

```text
apps/api/src/services/ai-context-snapshot.service.ts
```

接口：

```ts
export async function createAIContextSnapshot(input: {
  projectId: string
  chapterId?: string | null
  scene: AIScene
  requestId: string
  modelProvider?: string | null
  modelName?: string | null
  contextPayload: unknown
  renderedPromptPreview: string
  tokenEstimate?: number | null
})
```

写入时必须：

1. 不保存 API Key。
2. 不保存参考作品原文。
3. `renderedPromptPreview` 最多保留前 8000 字。
4. `contextPayload` 需要 JSON.stringify。

### 5.3 接入 /ai/generate

文件：

```text
apps/api/src/routes/ai.ts
```

在 `renderAIContext(context)` 后写入：

```ts
const requestId = crypto.randomUUID()
await createAIContextSnapshot({
  projectId,
  chapterId,
  scene,
  requestId,
  contextPayload: context,
  renderedPromptPreview: renderedPrompt,
  tokenEstimate: estimateTokens(renderedPrompt),
})
```

流式响应需要暴露 requestId，推荐两种方式：

1. 响应 header：`X-AI-Request-Id`
2. 或改为 SSE，第一条事件是 `{ type: 'meta', requestId }`

第一版推荐 header，改动小。

### 5.4 前端入口

新增页面：

```text
apps/web/src/views/AIContextSnapshotsView.vue
```

新增路由：

```ts
{
  path: '/project/:id/context-snapshots',
  name: 'context-snapshots',
  component: () => import('@/views/AIContextSnapshotsView.vue'),
}
```

侧边栏新增：

```text
上下文调试
```

页面展示：

1. 快照列表。
2. 场景。
3. 章节。
4. 请求时间。
5. prompt 预览。
6. contextPayload JSON 折叠显示。

### 5.5 验收标准

1. 调用 `/api/projects/:projectId/ai/generate` 后，快照表新增记录。
2. 快照列表页能看到记录。
3. 快照详情能看到本次携带的项目设定、人物、章节、记忆、知识库、人格等内容。
4. 快照中不包含 API Key。

---

## 6. 问题 4：写作任务仍只是状态切换

### 6.1 问题位置

文件：

```text
apps/api/src/routes/writing-jobs.ts
apps/api/src/db/schema/ai.ts
apps/web/src/views/WritingJobView.vue
```

当前 `start` 只做：

```ts
status = 'running'
```

但没有创建或执行 `writing_job_steps`。

### 6.2 修复目标

把“生成下一章”拆成真实步骤：

1. `prepare_context`
2. `generate_outline`
3. `wait_outline_review`
4. `generate_draft`
5. `consistency_check`
6. `wait_draft_review`
7. `save_snapshot`
8. `run_postprocess`
9. `wait_suggestion_review`
10. `complete`

第一版不需要完全自动跑完，但必须至少创建步骤并推进到第一个需要用户确认的节点。

### 6.3 后端新增服务

文件：

```text
apps/api/src/services/writing-job.service.ts
```

职责：

1. 创建 job 时初始化 step。
2. start job 时执行 `prepare_context` 和 `generate_outline`。
3. AI 结果写入 step.output。
4. job 进入 `waiting_review`。
5. continue job 时从当前等待节点继续。
6. pause/cancel/failed 状态可控。

### 6.4 Step 写入规范

每个 step 必须包含：

1. `stepType`
2. `status`
   - `pending`
   - `running`
   - `waiting_review`
   - `completed`
   - `failed`
   - `skipped`
3. `input`
4. `output`
5. `error`
6. `startedAt`
7. `finishedAt`

任何 AI 输出不得直接写入正文，必须保存在 step.output，等待用户确认。

### 6.5 API 调整

新增：

```http
GET /api/projects/:projectId/writing-job/:id/steps
POST /api/projects/:projectId/writing-job/:id/steps/:stepId/approve
POST /api/projects/:projectId/writing-job/:id/steps/:stepId/reject
POST /api/projects/:projectId/writing-job/:id/retry
```

### 6.6 前端调整

文件：

```text
apps/web/src/views/WritingJobView.vue
```

要求：

1. 展示真实 steps，而不是静态流程说明。
2. 对 `waiting_review` step 展示 AI 输出。
3. 用户可以“确认继续 / 驳回 / 重试”。
4. step 失败时显示错误原因。

### 6.7 验收标准

1. 创建任务后能看到步骤列表。
2. 启动任务后至少执行到 `generate_outline`。
3. AI 生成结果不会直接写入章节正文。
4. 用户确认后任务能进入下一步。
5. 失败步骤可重试。

---

## 7. 问题 5：混合检索仍未使用 embedding

### 7.1 问题位置

文件：

```text
apps/api/src/services/ai-context.service.ts
apps/api/src/db/schema/knowledge.ts
```

当前检索逻辑：

```ts
ILIKE title / summary / techniques / content
```

虽然有 `knowledge_embeddings` 表，但未被写入或查询。

### 7.2 第一版修复目标

先完成“可用的混合检索”，不必一次做到完美 pgvector。

阶段 1：

1. 上传知识库 chunk 分析完成后，生成 embedding 文本记录。
2. 如果暂时没有 pgvector，先把 embedding 存为 JSON/text，并预留接口。
3. 查询时同时执行：
   - 关键词匹配
   - techniques/tag 匹配
   - 已确认事实图谱扩展
4. 做简单融合排序。

阶段 2：

1. 引入 PostgreSQL `pgvector`。
2. `knowledge_embeddings.embedding` 改为 vector 类型。
3. 使用余弦距离检索。

### 7.3 后端新增服务

文件：

```text
apps/api/src/services/knowledge-retrieval.service.ts
```

接口：

```ts
export async function retrieveKnowledgeForAI(input: {
  projectId: string
  terms: string[]
  characterNames: string[]
  conflictTitles: string[]
  factTriples: string[]
  limit: number
})
```

返回：

```ts
interface RetrievedKnowledge {
  title: string
  summary: string
  techniques?: string
  score: number
  reasons: string[]
}
```

### 7.4 替换 ai-context 查询

文件：

```text
apps/api/src/services/ai-context.service.ts
```

将当前内联 `ILIKE` 检索替换为：

```ts
knowledgeSnippets = await retrieveKnowledgeForAI(...)
```

要求：

1. 不返回没有 summary 的 chunk。
2. 不把原文 content 放入 prompt。
3. 上下文调试器能显示召回 reasons。

### 7.5 验收标准

1. 搜索“身份反转”能命中 summary/techniques 里相关内容。
2. AI 上下文中只出现摘要和技巧，不出现参考作品原文。
3. 调试快照能看到知识召回结果和原因。
4. 后续 pgvector 改造时不需要改 AI 上下文主流程。

---

## 8. 验证命令

普通验证：

```bash
pnpm check
```

数据库验证：

```bash
pnpm db:generate
pnpm db:migrate
```

如果修改 seed：

```bash
pnpm --filter @ai-novel/api db:seed
```

建议增加 smoke 验证：

```bash
curl -s http://localhost:3000/api/health
```

手动流程验证：

1. 创建或打开一个测试项目。
2. 进入大纲页，配置章节元素。
3. 进入写作页，保存章节正文。
4. 手动触发章后分析。
5. 进入章后分析页，确认出现 pending 建议。
6. 接受并应用建议。
7. 调用一次 AI 生成。
8. 进入上下文调试页，确认出现快照。
9. 创建自动写作任务，启动后确认出现真实步骤。
10. 检查知识库召回只包含摘要和技巧。

---

## 9. 完成标准

本修复完成后，必须满足：

1. 章后分析能产生待确认建议。
2. 待确认建议能接受、拒绝和应用。
3. 图谱推理不会产生无效 `chapterId`。
4. AI 请求能写入上下文快照。
5. 用户能查看上下文快照。
6. 写作任务至少能真实执行到第一个确认节点。
7. 知识库检索从内联关键词逻辑迁移到独立 retrieval service。
8. `pnpm check` 和 `pnpm db:migrate` 通过。

