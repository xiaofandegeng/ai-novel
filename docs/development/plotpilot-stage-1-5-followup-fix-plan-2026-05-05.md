# PlotPilot 阶段 1-5 后续闭环修复文档

日期：2026-05-05  
状态：待执行  
关联文档：

1. [plotpilot-stage-1-5-closure-fix-plan-2026-05-05.md](./plotpilot-stage-1-5-closure-fix-plan-2026-05-05.md)
2. [plotpilot-remaining-adoption-roadmap-2026-05-04.md](./plotpilot-remaining-adoption-roadmap-2026-05-04.md)

范围：写作任务确认写入、伏笔回收建议应用、写作任务项目边界、embedding 检索接入。  
目标：修复当前阶段 1-5 实现中剩余的 3 个 P1 闭环问题和 1 个 P2 检索完整性问题，确保用户确认后的操作真实落库，跨项目数据不能被误操作，混合检索逐步接入 embeddings。

---

## 1. 当前状态

当前项目已经完成：

1. 章后分析能生成待确认建议。
2. AI 上下文快照已有写入链路。
3. 图谱推理不再写入空 `chapterId`。
4. 写作任务已有 `writing_job_steps` 和步骤推进。
5. 知识检索已从 `ai-context.service.ts` 抽出到 `knowledge-retrieval.service.ts`。

验证已通过：

```bash
pnpm check
pnpm db:migrate
```

但仍存在以下问题：

1. 用户批准 AI 正文后，生成正文没有写回 `chapters.draft`。
2. 伏笔回收建议缺少 `foreshadowingId` 时，应用后可能只是空操作。
3. 写作任务拒绝步骤没有校验 `projectId` 归属。
4. 混合检索还没有真正使用 `knowledge_embeddings`。

---

## 2. 修复顺序

必须按以下顺序处理：

| 顺序 | 问题 | 优先级 | 原因 |
| --- | --- | --- | --- |
| 1 | 拒绝写作步骤未校验项目归属 | P1 | 数据边界风险，应优先修 |
| 2 | 批准正文后没有写回章节草稿 | P1 | 用户确认写入闭环缺失 |
| 3 | 伏笔回收建议可能空应用 | P1 | 用户看到“已应用”但真实数据没变 |
| 4 | embedding 检索未接入 | P2 | 影响阶段 4 完整性，但不阻塞基础写作流程 |

---

## 3. 问题 1：拒绝写作步骤未校验项目归属

### 3.1 问题位置

文件：

```text
apps/api/src/routes/writing-jobs.ts
apps/api/src/services/writing-job.service.ts
```

当前 reject 路由路径包含：

```http
POST /api/projects/:projectId/writing-job/:jobId/steps/:stepId/reject
```

但 route 没有使用 `projectId`，service 也只通过 `jobId + stepId` 查询步骤。  
只要拿到其他项目的 `jobId` 和 `stepId`，就可能通过当前项目路径把其他项目任务置为失败。

### 3.2 修复要求

#### 3.2.1 route 传入 projectId

文件：

```text
apps/api/src/routes/writing-jobs.ts
```

修改：

```ts
const projectId = c.req.param('projectId')
...
await rejectStep(projectId, jobId, stepId, body.reason)
```

#### 3.2.2 service 校验任务归属

文件：

```text
apps/api/src/services/writing-job.service.ts
```

修改函数签名：

```ts
export async function rejectStep(
  projectId: string,
  jobId: string,
  stepId: string,
  reason?: string,
): Promise<void>
```

进入函数后先校验：

```ts
const [job] = await db.select().from(writingJobs).where(
  and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
)
if (!job)
  throw new Error('Job not found')
```

再查询 step：

```ts
const [step] = await db.select().from(writingJobSteps).where(
  and(eq(writingJobSteps.id, stepId), eq(writingJobSteps.jobId, jobId)),
)
```

### 3.3 验收标准

1. 当前项目路径不能 reject 其他项目的任务步骤。
2. `approveStep / retryStep / rejectStep` 三个操作都要校验 `projectId + jobId`。
3. `pnpm check` 通过。

---

## 4. 问题 2：批准正文后没有写回章节草稿

### 4.1 问题位置

文件：

```text
apps/api/src/services/writing-job.service.ts
```

当前流程：

```text
generate_draft
  ↓
consistency_check
  ↓
confirm_apply
  ↓
save_version
  ↓
postprocess
```

问题是：`confirm_apply` 只是一个暂停点。用户批准后，流程继续到 `save_version` 和 `postprocess`，但从未把 `generate_draft.output.draft` 写入 `chapters.draft`。

结果：

1. 用户看到任务继续执行。
2. 版本历史可能有快照。
3. 章后管线也可能运行。
4. 但写作页当前章节正文仍未更新。

这违背“作者确认后写入正文”的核心闭环。

### 4.2 推荐修复方案

新增一个明确步骤：

```text
apply_draft
```

放在：

```text
confirm_apply
  ↓
apply_draft
  ↓
save_version
```

### 4.3 schema / shared 类型

文件：

```text
packages/shared/src/types/writing-job.ts
apps/api/src/db/schema/ai.ts
```

如果 `WritingJobStepType` 是联合类型，需要新增：

```ts
'apply_draft'
```

如果数据库没有枚举约束，只需要更新 shared 类型和前端 label。

### 4.4 service 实现

文件：

```text
apps/api/src/services/writing-job.service.ts
```

新增 step label：

```ts
apply_draft: '写入正文',
```

修改 `STEP_SEQUENCE`：

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
]
```

`outline_then_draft` 同样加入 `apply_draft`。

新增执行函数：

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

在 `executeStep` 中接入：

```ts
case 'apply_draft': {
  const draftOutput = previousStepOutputs.get('generate_draft') || '{}'
  await executeApplyDraft(projectId, chapterId, draftOutput, step.id)
  break
}
```

### 4.5 版本保存顺序

`save_version` 应保存写入后的正文快照。  
可以继续使用 `generate_draft.output` 中的正文，也可以读取 `chapters.draft`。推荐读取已落库正文：

```ts
const [chapter] = await db.select().from(chapters).where(...)
await createSnapshot(projectId, chapterId, chapter.draft || '', 'Writing job approved draft')
```

### 4.6 前端要求

文件：

```text
apps/web/src/views/WritingJobView.vue
```

要求：

1. 展示 `apply_draft` 步骤，文案为“写入正文”。
2. `confirm_apply` 按钮文案建议为“确认写入正文”。
3. 写入成功后，提示用户可以去正文写作页查看。
4. 不允许 AI 正文在 `confirm_apply` 前写入章节草稿。

### 4.7 验收标准

1. 自动写作生成正文后，任务停在 `confirm_apply`。
2. 用户点击确认后，`chapters.draft` 更新为 AI 正文。
3. 写作页刷新后能看到更新后的正文。
4. 版本历史保存的是已确认正文。
5. 章后管线使用的是已确认正文。

---

## 5. 问题 3：伏笔回收建议应用后可能只是空操作

### 5.1 问题位置

文件：

```text
apps/api/src/services/chapter-postprocess.service.ts
apps/api/src/services/postprocess-suggestion.service.ts
```

当前创建 `foreshadowing_payoff` 建议时 payload 只有：

```ts
{
  title,
  description,
}
```

但应用逻辑只有在：

```ts
payload.foreshadowingId
```

存在时才更新 `foreshadowing_items`。  
如果没有 ID，代码不会更新任何伏笔，却仍可能把 suggestion 标记为 `applied`。

### 5.2 修复方案 A：创建建议时匹配已有伏笔

推荐在 `runChapterPostprocess` 创建 payoff 建议前，查询当前项目未回收伏笔：

```ts
const openForeshadowing = await db.select().from(foreshadowingItems).where(
  and(
    eq(foreshadowingItems.projectId, projectId),
    eq(foreshadowingItems.status, 'open'),
  ),
)
```

用标题做保守匹配：

```ts
const matched = openForeshadowing.find(item =>
  item.title === fp.title || fp.title.includes(item.title) || item.title.includes(fp.title),
)
```

创建 payload：

```ts
await createSuggestion(projectId, chapterId, runId, 'foreshadowing_payoff', {
  foreshadowingId: matched?.id || null,
  title: fp.title,
  description: fp.description || '',
  matchedTitle: matched?.title || null,
}, fp.confidence || 70)
```

### 5.3 修复方案 B：应用时没有 ID 不得标记 applied

文件：

```text
apps/api/src/services/postprocess-suggestion.service.ts
```

修改：

```ts
else if (suggestion.suggestionType === 'foreshadowing_payoff') {
  if (!payload.foreshadowingId) {
    await db.update(chapterPostprocessSuggestions).set({
      status: 'accepted',
      reason: appendReason(...),
      updatedAt: new Date().toISOString(),
    }).where(eq(chapterPostprocessSuggestions.id, suggestion.id))
    continue
  }

  const [updated] = await db.update(foreshadowingItems).set(...).where(...).returning()
  if (!updated)
    continue
}
```

更简单的第一版：

```ts
if (!payload.foreshadowingId)
  continue
```

但必须保证不会走到后面的 `status = applied`。

### 5.4 前端要求

文件：

```text
apps/web/src/views/PostChapterAnalysisView.vue
```

对 `foreshadowing_payoff` payload 展示：

1. 匹配到的伏笔标题。
2. 未匹配时显示“需要手动选择要回收的伏笔”。
3. 未匹配时禁用“批量应用”，或允许用户补选后再应用。

第一版可以先后端阻止 applied，前端后续再补选择器。

### 5.5 验收标准

1. 没有 `foreshadowingId` 的 payoff 建议不会被标记为 `applied`。
2. 有 `foreshadowingId` 的 payoff 建议应用后，`foreshadowing_items.status = paid_off`。
3. 用户不会看到“已应用但数据没变”的假成功。

---

## 6. 问题 4：混合检索仍没有使用 embeddings

### 6.1 问题位置

文件：

```text
apps/api/src/services/knowledge-retrieval.service.ts
apps/api/src/db/schema/knowledge.ts
apps/api/src/services/knowledge.service.ts
```

当前 `retrieveKnowledgeForAI` 已经完成：

1. 关键词检索。
2. 事实图谱扩展。
3. 融合排序。

但还没有使用：

```text
knowledge_embeddings
```

所以阶段 4 仍不能算完整 embedding RAG。

### 6.2 分阶段修复方案

#### 第一阶段：接入 embedding 记录，不要求 pgvector

如果当前 AI Provider 没有统一 embedding 能力，可以先生成“检索文本”并写入 `knowledge_embeddings`：

```ts
searchText = [
  chunk.title,
  chunk.summary,
  chunk.techniques,
  chunk.tags,
].filter(Boolean).join('\n')
```

写入：

```ts
knowledge_embeddings {
  projectId,
  sourceType: 'knowledge_chunk',
  sourceId: chunk.id,
  embedding: null,
  summary,
  tags,
}
```

这一阶段的目标是让后续 embedding 生成有稳定来源，而不是立即向量搜索。

#### 第二阶段：统一 embedding service

新增：

```text
apps/api/src/services/embedding.service.ts
```

接口：

```ts
export async function embedText(text: string): Promise<number[]>
```

要求：

1. 根据项目 AI 配置选择 provider。
2. 不把 API Key 写入日志。
3. 支持 provider 不可用时返回明确错误。

#### 第三阶段：引入 pgvector

迁移：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

将 `knowledge_embeddings.embedding` 从 `text` 升级为 vector 类型。  
如果 Drizzle 类型不方便，可以先用 raw SQL migration。

查询示例：

```sql
ORDER BY embedding <=> query_embedding
LIMIT 10
```

#### 第四阶段：融合向量结果

`retrieveKnowledgeForAI` 需要合并：

1. keywordResults
2. graphExpansionResults
3. vectorResults

融合排序：

```text
finalScore = keywordScore * 0.4 + graphScore * 0.2 + vectorScore * 0.4
```

### 6.3 当前阶段最低要求

如果本轮不接 pgvector，至少要做到：

1. `knowledge_embeddings` 有写入来源。
2. `retrieveKnowledgeForAI` 查询 `knowledge_embeddings.summary/tags` 参与召回。
3. 代码中明确 TODO：下一步替换为 pgvector cosine search。

### 6.4 验收标准

1. 上传并分析知识库后，`knowledge_embeddings` 有记录。
2. `retrieveKnowledgeForAI` 至少读取 `knowledge_embeddings` 参与召回。
3. AI 上下文不包含参考原文，只包含摘要、技巧和标签。
4. 后续接入 pgvector 时不需要重写 AI 上下文主流程。

---

## 7. 验证命令

普通门禁：

```bash
pnpm check
```

数据库门禁：

```bash
pnpm db:generate
pnpm db:migrate
```

如修改 seed：

```bash
pnpm --filter @ai-novel/api db:seed
```

---

## 8. 手动验收流程

### 8.1 写作任务确认写入

1. 创建一个项目和章节。
2. 创建 `outline_then_draft` 写作任务。
3. 启动任务。
4. 等待任务停在 `confirm_apply`。
5. 点击“确认写入正文”。
6. 打开正文写作页。
7. 确认章节正文已经更新。

### 8.2 伏笔回收

1. 新建一条 open 状态伏笔。
2. 让章后分析生成 `foreshadowing_payoff` 建议。
3. 如果匹配到 `foreshadowingId`，应用后应变成 `paid_off`。
4. 如果没有匹配到 `foreshadowingId`，建议不得变成 `applied`。

### 8.3 项目边界

1. 创建两个项目，各自创建写作任务。
2. 用项目 A 的路径请求 reject 项目 B 的 step。
3. 应返回 404 或 400。
4. 项目 B 的任务状态不应变化。

### 8.4 知识检索

1. 上传并分析参考文本。
2. 确认生成 `knowledge_embeddings` 记录。
3. 调用 AI 生成。
4. 在上下文快照中确认知识召回来自摘要、技巧或标签，不包含参考原文。

---

## 9. 完成标准

本轮修复完成后，必须满足：

1. 写作任务的 AI 正文只有在用户确认后才写入 `chapters.draft`。
2. 用户确认后，正文写作页可以看到新正文。
3. 伏笔回收建议不会出现假 applied。
4. 写作任务所有 step 操作都校验项目归属。
5. `knowledge_embeddings` 至少参与检索数据流。
6. `pnpm check` 和 `pnpm db:migrate` 通过。

