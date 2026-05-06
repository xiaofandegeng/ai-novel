# PlotPilot 阶段 1-5 未完成项修复文档

日期：2026-05-05  
状态：待执行  
关联文档：

1. [plotpilot-stage-1-5-followup-fix-plan-2026-05-05.md](./plotpilot-stage-1-5-followup-fix-plan-2026-05-05.md)
2. [plotpilot-stage-1-5-closure-fix-plan-2026-05-05.md](./plotpilot-stage-1-5-closure-fix-plan-2026-05-05.md)
3. [plotpilot-remaining-adoption-roadmap-2026-05-04.md](./plotpilot-remaining-adoption-roadmap-2026-05-04.md)

范围：写作任务项目边界、AI 正文确认写入、伏笔回收建议真实应用、knowledge embeddings 检索。  
目标：修复当前仍未落地的 6 个问题，确保“用户确认才写入”“已应用必须真实生效”“跨项目数据不可操作”“知识库 embeddings 参与召回”。

---

## 1. 当前结论

当前代码虽然可以通过：

```bash
pnpm check
pnpm db:migrate
```

但以下业务闭环仍未完成：

1. `reject` 写作步骤仍未校验 `projectId`。
2. 写作任务仍没有 `apply_draft` 步骤。
3. `confirm_apply` 后仍不会把 AI 正文写回 `chapters.draft`。
4. 伏笔回收建议没有 `foreshadowingId` 时仍可能被标记为 `applied`。
5. 章后处理创建伏笔回收建议时仍未匹配已有 open 伏笔。
6. `knowledge_embeddings` 表仍未参与检索。

这些问题不一定阻塞构建，但会阻塞产品流程验收。

---

## 2. 必须按顺序修复

| 顺序 | 问题 | 优先级 | 必须先修原因 |
| --- | --- | --- | --- |
| 1 | reject 未校验项目归属 | P1 | 存在跨项目数据破坏风险 |
| 2 | 缺少 `apply_draft` 步骤 | P1 | AI 正文无法按用户确认写入 |
| 3 | `confirm_apply` 后未写回草稿 | P1 | 自动写作闭环不可用 |
| 4 | 伏笔回收假 applied | P1 | 用户看到成功但真实数据未变 |
| 5 | 章后处理未绑定 `foreshadowingId` | P1 | 伏笔回收无法自动落到具体台账 |
| 6 | embeddings 未参与检索 | P2 | 阶段 4 仍不是 embedding RAG |

---

## 3. 修复 1：reject 写作步骤校验项目归属

### 3.1 问题文件

```text
apps/api/src/routes/writing-jobs.ts
apps/api/src/services/writing-job.service.ts
```

当前问题：

```ts
await rejectStep(jobId, stepId, body.reason)
```

`projectId` 没有传入 service，service 也没有校验 `writingJobs.projectId`。

### 3.2 修改要求

#### routes 层

文件：

```text
apps/api/src/routes/writing-jobs.ts
```

修改：

```ts
app.post('/api/projects/:projectId/writing-job/:jobId/steps/:stepId/reject', async (c) => {
  const projectId = c.req.param('projectId')
  const jobId = c.req.param('jobId')
  const stepId = c.req.param('stepId')
  const body = await c.req.json().catch(() => ({}))

  try {
    await rejectStep(projectId, jobId, stepId, body.reason)
    const [job] = await db.select().from(writingJobs).where(
      and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
    )
    const steps = await getJobSteps(jobId)
    return c.json(success({ job, steps }))
  }
  catch (e: any) {
    return c.json(fail(e.message || 'Failed to reject step'), 400)
  }
})
```

#### service 层

文件：

```text
apps/api/src/services/writing-job.service.ts
```

修改签名：

```ts
export async function rejectStep(
  projectId: string,
  jobId: string,
  stepId: string,
  reason?: string,
): Promise<void>
```

函数开始处必须校验：

```ts
const [job] = await db.select().from(writingJobs).where(
  and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
)
if (!job)
  throw new Error('Job not found')
```

### 3.3 验收标准

1. 当前项目路径不能 reject 其他项目的任务。
2. reject 返回的 job 必须来自当前 `projectId`。
3. `pnpm check` 通过。

---

## 4. 修复 2：新增 `apply_draft` 写入正文步骤

### 4.1 问题文件

```text
packages/shared/src/types/writing-job.ts
apps/api/src/services/writing-job.service.ts
apps/web/src/views/WritingJobView.vue
```

当前步骤：

```text
generate_draft
consistency_check
confirm_apply
save_version
postprocess
```

缺少：

```text
apply_draft
```

### 4.2 shared 类型

如果 `WritingJobStepType` 定义在 shared 中，必须加入：

```ts
export type WritingJobStepType =
  | 'prepare_context'
  | 'generate_plan'
  | 'confirm_plan'
  | 'generate_draft'
  | 'consistency_check'
  | 'confirm_apply'
  | 'apply_draft'
  | 'save_version'
  | 'postprocess'
  | 'confirm_suggestions'
  | 'update_health'
```

### 4.3 步骤序列

文件：

```text
apps/api/src/services/writing-job.service.ts
```

修改：

```ts
draft_only: [
  'prepare_context',
  'generate_draft',
  'consistency_check',
  'confirm_apply',
  'apply_draft',
  'save_version',
  'postprocess',
  'confirm_suggestions',
  'update_health',
],
outline_then_draft: [
  'prepare_context',
  'generate_plan',
  'confirm_plan',
  'generate_draft',
  'consistency_check',
  'confirm_apply',
  'apply_draft',
  'save_version',
  'postprocess',
  'confirm_suggestions',
  'update_health',
],
```

新增 label：

```ts
apply_draft: '写入正文',
```

### 4.4 验收标准

1. 新建写作任务后，steps 中能看到 `apply_draft`。
2. `apply_draft` 位于 `confirm_apply` 之后、`save_version` 之前。
3. 前端展示文案为“写入正文”。

---

## 5. 修复 3：`confirm_apply` 后写回 `chapters.draft`

### 5.1 问题文件

```text
apps/api/src/services/writing-job.service.ts
```

### 5.2 新增执行函数

新增：

```ts
async function executeApplyDraft(
  projectId: string,
  chapterId: string | null,
  draftOutput: string,
  stepId: string,
): Promise<string> {
  if (!chapterId)
    throw new Error('没有可写入的章节')

  const draft = JSON.parse(draftOutput)
  const content = typeof draft.draft === 'string' ? draft.draft.trim() : ''
  if (!content)
    throw new Error('生成正文为空，无法写入章节')

  const [row] = await db.update(chapters).set({
    draft: content,
    title: draft.title || undefined,
    updatedAt: now(),
  }).where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  )).returning()

  if (!row)
    throw new Error('章节不存在或不属于当前项目')

  const output = JSON.stringify({
    chapterId,
    wordCount: content.length,
    title: row.title,
  })

  await updateStep(stepId, {
    output,
    status: 'completed',
    finishedAt: now(),
  })

  return output
}
```

### 5.3 接入 executeStep

新增分支：

```ts
case 'apply_draft': {
  const draftOutput = previousStepOutputs.get('generate_draft') || '{}'
  await executeApplyDraft(projectId, chapterId, draftOutput, step.id)
  break
}
```

### 5.4 调整 save_version

`save_version` 应保存已确认且已落库的正文。推荐读取 `chapters.draft`：

```ts
async function executeSaveVersion(
  projectId: string,
  chapterId: string | null,
  draftOutput: string,
  stepId: string,
): Promise<string> {
  if (!chapterId) {
    await updateStep(stepId, {
      output: JSON.stringify({ skipped: true, reason: 'no_chapter' }),
      status: 'completed',
      finishedAt: now(),
    })
    return JSON.stringify({ skipped: true })
  }

  const [chapter] = await db.select().from(chapters).where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  ))
  if (!chapter)
    throw new Error('章节不存在或不属于当前项目')

  const content = chapter.draft || ''
  if (!content)
    throw new Error('章节正文为空，无法保存快照')

  const result = await createSnapshot(projectId, chapterId, content, 'Writing job approved draft')
  ...
}
```

### 5.5 验收标准

1. AI 正文生成后，任务停在 `confirm_apply`。
2. 用户点击确认后执行 `apply_draft`。
3. `chapters.draft` 被更新。
4. 写作页刷新后显示已确认正文。
5. `save_version` 保存的是已写入正文，而不是未经确认的临时输出。

---

## 6. 修复 4：伏笔回收建议不能假 applied

### 6.1 问题文件

```text
apps/api/src/services/postprocess-suggestion.service.ts
```

当前问题：

```ts
if (payload.foreshadowingId) {
  await db.update(...)
}

await db.update(chapterPostprocessSuggestions).set({
  status: 'applied',
})
```

没有 `foreshadowingId` 时没有任何真实更新，但仍会标记 `applied`。

### 6.2 修改要求

对 `foreshadowing_payoff` 单独处理：

```ts
else if (suggestion.suggestionType === 'foreshadowing_payoff') {
  if (!payload.foreshadowingId) {
    // 不得标记 applied，保留 accepted 等用户补充匹配
    continue
  }

  const [updated] = await db.update(foreshadowingItems).set({
    status: 'paid_off',
    payoffChapterId: chapterId,
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(foreshadowingItems.id, payload.foreshadowingId),
    eq(foreshadowingItems.projectId, projectId),
  )).returning()

  if (!updated) {
    continue
  }
}
```

要求：

1. 没有 `foreshadowingId` 不得标记 `applied`。
2. 更新不到伏笔记录不得标记 `applied`。
3. 只有真实更新成功后才进入统一 `status = applied`。

### 6.3 验收标准

1. 无 `foreshadowingId` 的 payoff 建议应用后仍保持 `accepted`。
2. 有 `foreshadowingId` 且更新成功后才变为 `applied`。
3. 对应 `foreshadowing_items.status` 变为 `paid_off`。

---

## 7. 修复 5：章后处理创建 payoff 建议时绑定伏笔 ID

### 7.1 问题文件

```text
apps/api/src/services/chapter-postprocess.service.ts
```

当前创建 payload：

```ts
{
  title: fp.title,
  description: fp.description || '',
}
```

缺少：

```ts
foreshadowingId
```

### 7.2 修改要求

在处理 `parsed.foreshadowingPayoffs` 前查询 open 伏笔：

```ts
const openForeshadowing = await db.select().from(foreshadowingItems).where(and(
  eq(foreshadowingItems.projectId, projectId),
  eq(foreshadowingItems.status, 'open'),
))
```

注意：需要从 schema import `foreshadowingItems`。

匹配逻辑：

```ts
function matchForeshadowingByTitle(title: string) {
  const normalizedTitle = title.trim()
  return openForeshadowing.find(item =>
    item.title === normalizedTitle
    || normalizedTitle.includes(item.title)
    || item.title.includes(normalizedTitle),
  )
}
```

创建建议：

```ts
const matched = matchForeshadowingByTitle(fp.title)
await createSuggestion(projectId, chapterId, runId, 'foreshadowing_payoff', {
  foreshadowingId: matched?.id || null,
  title: fp.title,
  description: fp.description || '',
  matchedTitle: matched?.title || null,
}, fp.confidence || 70)
```

### 7.3 验收标准

1. 可匹配 open 伏笔时，payoff 建议 payload 包含 `foreshadowingId`。
2. 不可匹配时，payload 中 `foreshadowingId = null`。
3. 不可匹配建议不会在应用时假成功。

---

## 8. 修复 6：knowledge embeddings 参与检索

### 8.1 问题文件

```text
apps/api/src/services/knowledge.service.ts
apps/api/src/services/knowledge-retrieval.service.ts
apps/api/src/db/schema/knowledge.ts
```

当前只存在表：

```text
knowledge_embeddings
```

但没有：

1. 写入。
2. 查询。
3. 融合排序。

### 8.2 第一版最低实现

本轮不强制接 pgvector，但必须让 `knowledge_embeddings` 进入数据流。

#### 写入 embeddings 索引记录

在 `analyzeSource` 插入 chunks 后，写入 `knowledgeEmbeddings`：

```ts
const embeddingRows = chunksData
  .filter(chunk => chunk.summary || chunk.techniques)
  .map(chunk => ({
    id: generateId(),
    projectId,
    sourceType: 'knowledge_chunk',
    sourceId: chunk.id,
    embedding: null,
    summary: chunk.summary,
    tags: chunk.techniques,
  }))

if (embeddingRows.length > 0)
  await db.insert(knowledgeEmbeddings).values(embeddingRows)
```

需要 import：

```ts
import { knowledgeEmbeddings } from '../db/schema'
```

#### 查询 embeddings 索引记录

在 `knowledge-retrieval.service.ts` 新增：

```ts
async function embeddingIndexSearch(projectId: string, terms: string[]) {
  ...
}
```

第一版可以用 `summary/tags ILIKE`：

```ts
sql`${knowledgeEmbeddings.summary} ILIKE ${pattern}`
sql`${knowledgeEmbeddings.tags} ILIKE ${pattern}`
```

返回结构：

```ts
{
  id,
  title: '知识索引',
  summary,
  techniques: tags,
  matchedTerms,
}
```

#### 融合排序

`retrieveKnowledgeForAI` 改为：

```ts
const keywordResults = await keywordSearch(projectId, terms)
const embeddingIndexResults = await embeddingIndexSearch(projectId, terms)
const expansionTerms = await expandViaFactTriples(projectId, factTripleSubjects)
const expansionResults = ...

return fuseResults(
  keywordResults,
  expansionResults,
  embeddingIndexResults,
  ...
)
```

`embeddingIndexResults` 权重建议高于普通 keyword：

```text
embeddingIndex match: +3
keyword match: +2
graph expansion: +1
```

### 8.3 后续 pgvector 预留

在代码中保留 TODO：

```ts
// TODO: Replace text-index search with pgvector cosine similarity once embedding provider is configured.
```

### 8.4 验收标准

1. 上传并分析知识库后，`knowledge_embeddings` 有记录。
2. `retrieveKnowledgeForAI` 会读取 `knowledge_embeddings`。
3. AI 上下文只包含摘要、技巧或标签，不包含参考原文。
4. `pnpm check` 通过。

---

## 9. 验证命令

普通门禁：

```bash
pnpm check
```

数据库门禁：

```bash
pnpm db:migrate
```

如果改 schema：

```bash
pnpm db:generate
pnpm db:migrate
```

---

## 10. 手动验收清单

### 10.1 写作任务

1. 创建 `outline_then_draft` 写作任务。
2. 启动任务。
3. 确认任务停在 `confirm_plan`。
4. 批准大纲。
5. 确认任务继续到 `confirm_apply`。
6. 批准正文。
7. 确认执行 `apply_draft`。
8. 打开正文写作页，确认章节正文已更新。
9. 确认版本历史保存的是已写入正文。

### 10.2 任务边界

1. 创建项目 A 和项目 B。
2. 各自创建写作任务。
3. 使用项目 A URL 请求 reject 项目 B 的 step。
4. 应失败。
5. 项目 B 的任务状态不应变化。

### 10.3 伏笔回收

1. 创建 open 伏笔。
2. 运行章后分析生成 payoff 建议。
3. 检查 payload 是否包含 `foreshadowingId`。
4. 应用建议后，伏笔状态变为 `paid_off`。
5. 没有 `foreshadowingId` 的建议不得变为 `applied`。

### 10.4 知识检索

1. 上传参考文本。
2. 运行知识库分析。
3. 确认 `knowledge_embeddings` 有记录。
4. 触发 AI 生成。
5. 查看上下文快照，确认知识召回包含摘要/技巧，不包含参考原文。

---

## 11. 完成标准

修复完成后必须满足：

1. `rejectStep` 使用 `projectId + jobId + stepId` 校验。
2. 写作任务包含 `apply_draft` 步骤。
3. `apply_draft` 将确认后的 AI 正文写入 `chapters.draft`。
4. 伏笔 payoff 无匹配 ID 时不会假 applied。
5. 章后 payoff 建议尽可能自动匹配 `foreshadowingId`。
6. `knowledge_embeddings` 有写入和读取。
7. `pnpm check` 和 `pnpm db:migrate` 通过。

