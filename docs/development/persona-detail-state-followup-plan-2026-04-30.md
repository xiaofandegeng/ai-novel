# 写作人格作品详情状态修复文档

日期：2026-04-30  
范围：参考作品详情页状态刷新、章节分析失败统计。  
背景：`persona-config-flow-followup-plan-2026-04-30.md` 执行后，`pnpm db:migrate` 和 `pnpm check` 已通过，主体闭环已完成。本文件只记录剩余两个流程细节问题。

---

## 1. 当前状态

已通过：

```bash
pnpm db:migrate
pnpm check
```

仍需修复：

1. `ReferenceWorkDetailView.vue` 在分析章节或生成报告后没有刷新 `analysisSummary`。
2. `getWorkAnalysisSummary()` 的 `failedCount` 永远为 `0`，训练集页失败提示无法真实生效。

---

## 2. P1：作品详情页操作后刷新状态摘要

### 问题位置

```text
apps/web/src/views/ReferenceWorkDetailView.vue
```

当前逻辑：

1. 页面初始化时读取 `work`、`chapters`、`analysisSummary`、`styleReport`。
2. `handleAnalyze()` 成功后只刷新 `chapters`。
3. `handleGenerateReport()` 成功后只写入 `styleReport`。

结果：

1. 点击「分析章节」后，按钮仍可能停留在旧状态。
2. 点击「生成报告」后，顶部按钮可能继续显示，直到刷新页面。
3. 作品状态、分析数量、报告状态不一定同步。

### 修复目标

抽一个统一刷新函数：

```ts
async function refreshWorkDetail() {
  work.value = await personaApi.getWork(workId)
  chapters.value = await personaApi.listWorkChapters(workId)
  analysisSummary.value = await personaApi.getWorkAnalysisSummary(workId)
  styleReport.value = await personaApi.getWorkStyleReport(workId).catch(() => null)
}
```

使用位置：

1. `onMounted()` 调用 `refreshWorkDetail()`。
2. `handleAnalyze()` 成功后调用 `refreshWorkDetail()`。
3. `handleGenerateReport()` 成功后调用 `refreshWorkDetail()`。

### 推荐实现

```ts
async function refreshWorkDetail() {
  const [workResult, chaptersResult, summaryResult, reportResult] = await Promise.allSettled([
    personaApi.getWork(workId),
    personaApi.listWorkChapters(workId),
    personaApi.getWorkAnalysisSummary(workId),
    personaApi.getWorkStyleReport(workId),
  ])

  if (workResult.status === 'fulfilled')
    work.value = workResult.value
  if (chaptersResult.status === 'fulfilled')
    chapters.value = chaptersResult.value
  if (summaryResult.status === 'fulfilled')
    analysisSummary.value = summaryResult.value
  if (reportResult.status === 'fulfilled')
    styleReport.value = reportResult.value
  else
    styleReport.value = null
}
```

注意：

1. 如果 `getWork()` 失败，应让外层 `onMounted` 显示「加载作品失败」。
2. `getWorkStyleReport()` 404 是正常空状态，不应 toast 报错。
3. 操作成功后刷新摘要，再展示成功 toast。

---

## 3. P2：补齐章节分析失败统计

### 问题位置

```text
apps/api/src/services/persona.service.ts
apps/web/src/api/persona.ts
apps/web/src/views/TrainingSetDetailView.vue
apps/web/src/views/ReferenceWorkDetailView.vue
```

当前 `getWorkAnalysisSummary()`：

```ts
return {
  chapterCount,
  analyzedCount,
  failedCount: 0,
  hasReport,
  canAnalyze: chapterCount > 0 && analyzedCount < chapterCount,
  canGenerateReport: analyzedCount > 0 && !hasReport,
}
```

问题：

1. `failedCount` 永远为 `0`。
2. 训练集页虽然有「x 章失败」标签，但永远不会显示真实失败数。
3. `partial_failed` 只能说明存在失败，不能告诉用户影响范围。

---

## 4. 推荐修复方案

### 方案 A：短期无迁移方案

适用于：不想再改 schema。

根据 `referenceWorks.status` 推导部分失败：

```ts
const hasPartialFailure = work.status === 'partial_failed'
const failedCount = hasPartialFailure
  ? Math.max(1, chapterCount - analyzedCount)
  : 0
```

返回：

```ts
return {
  chapterCount,
  analyzedCount,
  failedCount,
  hasPartialFailure,
  hasReport,
  canAnalyze: chapterCount > 0 && analyzedCount < chapterCount,
  canGenerateReport: analyzedCount > 0 && !hasReport,
}
```

同步扩展前端类型：

```ts
export interface WorkAnalysisSummary {
  chapterCount: number
  analyzedCount: number
  failedCount: number
  hasPartialFailure?: boolean
  hasReport: boolean
  canAnalyze: boolean
  canGenerateReport: boolean
}
```

优点：

1. 改动小。
2. 不需要 migration。
3. UI 能显示「至少有失败章节」。

缺点：

1. 不能保留每章失败原因。
2. 如果用户重新分析部分章节，失败数只能粗略推导。

### 方案 B：长期可追踪方案

适用于：希望后续能查看每章失败原因。

新增表：

```text
reference_chapter_analysis_errors
```

字段建议：

```ts
id
chapterId
workId
trainingSetId
message
createdAt
```

在 `analyzeAllChapters()` 中：

1. 每章分析前删除该章节旧错误。
2. 分析成功则写入 `chapter_analyses`。
3. 分析失败则写入 `reference_chapter_analysis_errors`。
4. `getWorkAnalysisSummary()` 统计错误表数量作为 `failedCount`。

优点：

1. 能展示失败章节和原因。
2. 后续可做「重试失败章节」。
3. 数据语义清楚。

缺点：

1. 需要 schema 和 migration。
2. UI 需要增加失败详情展示。

### 本轮建议

本轮优先采用方案 A，快速修复 UI 误导；后续如果要做「失败章节重试」，再升级方案 B。

---

## 5. UI 调整要求

### 训练集详情页

位置：

```text
apps/web/src/views/TrainingSetDetailView.vue
```

规则：

1. `failedCount > 0` 显示 warning tag。
2. 如果 `hasPartialFailure` 为 true，可显示：

```text
部分章节分析失败
```

3. `canGenerateReport` 为 true 且 `failedCount > 0` 时，按钮旁边提示：

```text
报告将基于已成功分析的章节生成。
```

### 作品详情页

位置：

```text
apps/web/src/views/ReferenceWorkDetailView.vue
```

建议在作品信息面板增加：

```text
已分析 x / y 章
失败 z 章
```

当 `failedCount > 0` 时显示 warning：

```text
部分章节分析失败，当前报告只会基于已成功分析的章节生成。
```

---

## 6. 验收命令

普通验收：

```bash
pnpm check
```

如果采用方案 B 并新增表：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

---

## 7. 浏览器验收步骤

1. 打开 `/persona`。
2. 进入一个训练集。
3. 打开某个参考作品详情页。
4. 点击「分析章节」。
5. 分析完成后无需刷新页面，顶部按钮应立即从「分析章节」切换为「生成报告」或显示正确状态。
6. 点击「生成报告」。
7. 报告生成后无需刷新页面，顶部「生成报告」按钮应消失，风格报告应显示。
8. 如果作品为 `partial_failed`，训练集列表和作品详情都应展示失败提示。

---

## 8. 验收标准

修复完成必须满足：

1. `ReferenceWorkDetailView.vue` 不再依赖页面刷新才能更新按钮状态。
2. `analysisSummary` 在初始化、分析后、生成报告后都保持最新。
3. `failedCount` 不再永远是 `0`。
4. `partial_failed` 在训练集页和作品详情页都有明确提示。
5. `pnpm check` 通过。

