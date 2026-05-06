# 项目完整性与数据边界跟进修复文档

日期：2026-05-06  
优先级：P1/P2  
适用范围：数据导入导出、写作任务步骤重试、章后处理运行时间字段

## 1. 背景

当前项目已通过基础门禁，但全项目审查发现三个会影响真实使用的流程问题：

1. 导出包含知识库、质量报告和章后建议，但导入没有恢复这些数据。
2. 写作任务 `retryStep` 在校验项目归属前就会修改步骤状态。
3. 章后处理 run 的 `startedAt/finishedAt` 被降级为 `createdAt/updatedAt` 语义，运行耗时和状态历史不清晰。

本修复文档用于交给其他 AI 或开发者执行，按风险从高到低排列。

## 2. 修复顺序

推荐顺序：

1. 先修 `retryStep` 项目归属校验，阻断跨项目状态修改。
2. 再补齐导入导出完整性，避免用户迁移项目时丢数据。
3. 最后整理章后处理运行时间字段，并同步 migration。

## 3. Finding 1：导入流程没有恢复导出的知识库和分析数据

### 问题位置

- `apps/api/src/services/export-import.service.ts`

### 当前问题

`exportProjectData(projectId)` 已导出：

- `knowledgeSources`
- `knowledgeChunks`
- `knowledgeNotes`
- `qualityReports`
- `suggestions`
- `personaConfigs`

但 `importProjectData(data)` 只恢复到：

- project
- story bibles
- characters
- volumes
- chapters
- relationships
- memories
- elements
- foreshadowing
- triples
- acts
- conflicts
- personaConfigs

没有恢复：

- `knowledgeSources`
- `knowledgeChunks`
- `knowledgeNotes`
- `qualityReports`
- `chapterPostprocessSuggestions`

这会导致用户导出再导入后，经典小说拆解结果、知识库检索素材、质量评估报告和章后待确认建议全部丢失。

### 修复要求

文件：

- `apps/api/src/services/export-import.service.ts`

需要补齐导入：

```ts
const KNOWLEDGE_SOURCE_FIELDS = ['title', 'sourceType', 'author', 'status', 'metadata']
const KNOWLEDGE_CHUNK_FIELDS = ['chunkType', 'title', 'content', 'summary', 'techniques', 'orderIndex']
const KNOWLEDGE_NOTE_FIELDS = ['title', 'content', 'tags']
const QUALITY_REPORT_FIELDS = ['scope', 'score', 'rhythmScore', 'conflictScore', 'logicScore', 'characterScore', 'styleScore', 'issues', 'suggestions']
const POSTPROCESS_SUGGESTION_FIELDS = ['suggestionType', 'payload', 'confidence', 'status', 'reason']
```

具体插入顺序建议：

1. `knowledgeSources`
2. `knowledgeChunks`
3. `knowledgeNotes`
4. `qualityReports`
5. `chapterPostprocessSuggestions`
6. `personaConfigs`

ID remap 要求：

- `knowledgeChunks.sourceId` 必须 remap 到新的 source id。
- `knowledgeNotes.sourceId` 如存在，必须 remap 到新的 source id。
- `qualityReports.chapterId` 如存在，必须 remap 到新的 chapter id。
- `chapterPostprocessSuggestions.chapterId` 必须 remap 到新的 chapter id。
- `chapterPostprocessSuggestions.runId` 如果导出数据中没有同步导出 runs，建议导入时置为 `null`。
- `projectPersonaConfigs.personaId` 如果 persona 是全局库中已有人格，需要确认当前 remap 逻辑是否合适。若导出中没有 `writingPersonas`，不要盲目 remap 成不存在的人格 id。

### 推荐策略

短期最小修复：

- 补齐 `knowledgeSources/chunks/notes/qualityReports/suggestions` 的导入。
- `suggestions.runId` 置为 `null`。
- `personaConfigs.personaId` 若不能确认目标人格存在，则暂不导入该配置，或保留原 id 并校验存在。

完整修复：

- 导出和导入同时支持 `chapterPostprocessRuns`、`writingPersonas`、`knowledgeEmbeddings`。
- 对导入过程加事务，任何一步失败时整体回滚。

### 验收标准

准备一个包含以下内容的项目：

- 至少 1 个知识库 source。
- 至少 1 个知识库 chunk。
- 至少 1 条知识库 note。
- 至少 1 条质量报告。
- 至少 1 条章后建议。

导出后重新导入，检查：

- 新项目中知识库列表可见。
- 知识库搜索能搜到 chunk/summary/techniques。
- 质量评估页能看到导入报告。
- 章后分析页能看到导入建议。

## 4. Finding 2：retryStep 会在校验项目归属前修改任务步骤

### 问题位置

- `apps/api/src/services/writing-job.service.ts`
- `apps/api/src/routes/writing-jobs.ts`

### 当前问题

`rejectStep(projectId, jobId, stepId)` 已经先校验：

```ts
and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId))
```

但 `retryStep(projectId, jobId, stepId)` 开头只查：

```ts
and(eq(writingJobSteps.id, stepId), eq(writingJobSteps.jobId, jobId))
```

随后会修改步骤状态：

- 重置前置生成步骤。
- 重置当前步骤。
- 重置后续 failed/skipped 步骤。

最后才调用 `runNextSteps(projectId, jobId, retryFromIdx)`，如果 `projectId` 不匹配，此时数据已经被修改。

### 修复要求

文件：

- `apps/api/src/services/writing-job.service.ts`

在 `retryStep` 开头增加 job 归属校验：

```ts
const [job] = await db.select().from(writingJobs).where(
  and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
)
if (!job)
  throw new Error('Job not found')
```

并且所有步骤查询保持：

```ts
and(eq(writingJobSteps.id, stepId), eq(writingJobSteps.jobId, jobId))
```

不要在归属校验通过前调用任何 `updateStep`。

### 建议补充

`approveStep(projectId, jobId, stepId)` 当前虽然最终会通过 `getJobSteps(jobId)` 避免跨 job step 被继续执行，但它先按 `stepId` 单独查询 step。建议统一风格：

```ts
const [job] = await ...
const [step] = await db.select().from(writingJobSteps).where(
  and(eq(writingJobSteps.id, stepId), eq(writingJobSteps.jobId, jobId)),
)
```

这样 approve/reject/retry 三个确认操作的边界一致。

### 验收标准

手动或测试构造：

1. 项目 A 的 writing job 和 failed step。
2. 使用项目 B 的 URL 调用项目 A 的 retry endpoint。

预期：

- API 返回 400/404。
- 项目 A 的 step 状态完全不变。
- 项目 A 的 job 状态完全不变。

## 5. Finding 3：章后处理运行时间字段语义混乱

### 问题位置

- `apps/api/src/db/schema/chapter.ts`
- `apps/api/src/services/chapter-postprocess.service.ts`
- `apps/api/drizzle/0007_unique_pretty_boy.sql`

### 当前问题

`chapterPostprocessRuns` 暴露：

```ts
startedAt: timestamps.createdAt,
finishedAt: timestamps.updatedAt,
...timestamps,
```

这意味着：

- `startedAt` 实际写入 `created_at`。
- `finishedAt` 实际写入 `updated_at`。
- 表面上有 `startedAt/finishedAt`，数据库里却没有独立 `started_at/finished_at`。

同时 migration `0007_unique_pretty_boy.sql` 删除了：

```sql
ALTER TABLE "chapter_postprocess_runs" DROP COLUMN "started_at";
ALTER TABLE "chapter_postprocess_runs" DROP COLUMN "finished_at";
```

但 service 仍然写：

```ts
startedAt: now
finishedAt: new Date().toISOString()
```

这会让运行开始/结束时间和普通创建/更新时间混在一起，不利于后续运行耗时、失败重试和历史审计。

### 推荐修复方向

推荐恢复独立字段。

文件：

- `apps/api/src/db/schema/chapter.ts`

改为：

```ts
import { timestamp } from 'drizzle-orm/pg-core'

export const chapterPostprocessRuns = pgTable('chapter_postprocess_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  status: text('status').$type<'pending' | 'running' | 'completed' | 'failed'>().notNull().default('pending'),
  trigger: text('trigger').notNull(),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { mode: 'string' }),
  finishedAt: timestamp('finished_at', { mode: 'string' }),
  ...timestamps,
})
```

然后生成 migration：

```bash
pnpm db:generate
```

新 migration 应该是：

```sql
ALTER TABLE "chapter_postprocess_runs" ADD COLUMN "started_at" timestamp;
ALTER TABLE "chapter_postprocess_runs" ADD COLUMN "finished_at" timestamp;
```

注意：

- 不要手写临时 SQL 覆盖 Drizzle snapshot，除非明确知道当前 migration 历史状态。
- 如果 0007 已经被应用到本地，新增 0008 恢复字段是更安全的方式。

### 备选修复

如果决定不保留独立运行时间字段，则必须：

- 删除 `startedAt/finishedAt` 领域字段。
- service 改写 `createdAt/updatedAt`。
- 前端和 shared 类型不再展示开始/结束时间。

但这会削弱章后管线的可观察性，不推荐。

## 6. 测试与验证

### 必跑命令

```bash
pnpm check
pnpm db:migrate
```

如果改 schema：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

### 专项扫描

```bash
rg -n "retryStep|projectId, jobId, stepId|startedAt: timestamps.createdAt|finishedAt: timestamps.updatedAt|knowledgeSources|qualityReports|chapterPostprocessSuggestions" apps/api/src apps/api/drizzle
```

### 手动验收

1. 创建项目并生成知识库、质量报告、章后建议。
2. 导出项目。
3. 导入项目。
4. 检查知识库、质量报告、章后建议仍可见。
5. 创建写作任务，让某步骤失败。
6. 使用错误 projectId 调 retry，确认不会修改原项目步骤。
7. 运行章后分析，确认 run 记录有独立 `started_at/finished_at`。

## 7. 交给 AI 的执行提示词

```text
请按照 docs/development/project-integrity-followup-fix-plan-2026-05-06.md 修复三个项目完整性问题。

执行顺序：
1. 修复 writing-job retryStep：在任何 updateStep 前校验 writingJobs.id + projectId。
2. 补齐 export/import：导入时恢复 knowledgeSources、knowledgeChunks、knowledgeNotes、qualityReports、chapterPostprocessSuggestions，并正确 remap id。
3. 恢复 chapterPostprocessRuns 独立 started_at/finished_at 字段，生成 migration。

要求：
- 不破坏现有 API 响应结构。
- 如果改 schema 必须生成 migration。
- 最后运行 pnpm db:migrate 和 pnpm check。
- 最终说明修改文件和验证结果。
```
