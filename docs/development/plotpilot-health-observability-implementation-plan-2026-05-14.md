# PlotPilot 健康可观测闭环实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“写作任务完成 -> 章后分析 -> 项目健康检查”形成可追踪的历史快照，并保证导出导入不会丢失健康报告与风格张力数据。

**Architecture:** 保持当前 TypeScript monorepo、Hono service 层和 Drizzle schema 不变。本轮不新增数据库表，只复用已有 `project_health_reports` 与 `chapter_style_fingerprints`，把即时健康指标沉淀为任务完成后的报告快照，同时修正健康趋势排序和导入导出覆盖范围。

**Tech Stack:** Hono, Drizzle ORM, PostgreSQL, Vue 3, Pinia, pnpm workspace.

---

## 1. 背景

项目已经完成一批 PlotPilot 对齐能力：

1. AI 生成内容确认后会触发章节或场景章后分析。
2. 章后分析会抽取角色、关系、伏笔、事实、矛盾变化，并进入确认区。
3. 用户确认后会更新角色库、人物关系、矛盾矩阵、伏笔台账和事实图谱。
4. 写作任务已经串起“生成 -> 一致性检查 -> 确认写入 -> 章后分析 -> 应用建议 -> 更新健康”。
5. 章节风格指纹已经用于健康页的张力曲线。

但当前还存在一个闭环断点：健康页指标是即时计算，写作任务的 `update_health` 步骤只把摘要写入 step output，没有生成可追踪的健康报告。这样后续无法回答：

1. 某次自动写作任务完成后，作品健康状态如何？
2. 张力、风险、伏笔、人物关系是否随章节推进改善？
3. 导出再导入项目后，健康快照是否保留？

本轮先补齐“可观测闭环”，不扩大到新的 UI 大改。

## 2. 本轮范围

### 必做

1. 写作任务 `update_health` 步骤生成 `project_health_reports` 快照。
2. 健康报告包含分数、风险等级、核心指标、top risks、张力趋势。
3. 健康张力趋势按章节号排序，而不是按风格指纹创建时间排序。
4. 导出导入补齐 `projectHealthReports`。
5. 运行 `pnpm check`、`pnpm db:migrate`、`git diff --check`。

### 不做

1. 不新增健康报告 UI 历史列表。
2. 不新增数据库表或迁移。
3. 不改 AI provider、prompt 模板或写作人格逻辑。
4. 不改变用户确认区的交互规则。

## 3. 文件职责

### `apps/api/src/services/writing-job.service.ts`

负责写作任务步骤执行。本轮修改 `executeUpdateHealth`：

1. 调用 `getProjectHealthMetrics(projectId)`。
2. 计算健康分数和风险等级。
3. 插入 `project_health_reports`。
4. step output 返回 `reportId`、`score`、`riskLevel` 和核心摘要。

### `apps/api/src/services/health-metrics.service.ts`

负责健康指标即时计算。本轮修改：

1. 将 `chapterStyleFingerprints` 按章节号排序。
2. `tensionTrend` 和 `computeStyleDrift` 使用同一份章节顺序数据。
3. 避免后补旧章节指纹时健康趋势乱序。

### `apps/api/src/services/export-import.service.ts`

负责项目导出导入。本轮修改：

1. 导出 `projectHealthReports`。
2. 导入时 remap `projectId`，保留 `scope`、`score`、`riskLevel`、`metricsJson`、`generatedAt`。

## 4. 实施步骤

### Task 1: 健康报告持久化

**Files:**

- Modify: `apps/api/src/services/writing-job.service.ts`

- [ ] **Step 1: 引入 schema**

从 `../db/schema` 增加 `projectHealthReports`。

- [ ] **Step 2: 增加健康分数计算 helper**

规则：

1. 优先使用 `metrics.radarMetrics` 的平均值作为基础分。
2. high risk 扣 15 分，medium risk 扣 8 分，low risk 扣 3 分。
3. 最终分数限制在 0 到 100。
4. `score >= 80` 为 `low`，`score >= 60` 为 `medium`，否则为 `high`。
5. 如果存在 high severity risk，风险等级至少为 `high`；如果存在 medium 且分数没有 high，则至少为 `medium`。

- [ ] **Step 3: 在 `executeUpdateHealth` 插入报告**

插入：

```ts
await db.insert(projectHealthReports).values({
  id: reportId,
  projectId,
  scope: 'overall',
  score,
  riskLevel,
  metricsJson: {
    completedChapters: metrics.completedChapters,
    totalChapters: metrics.totalChapters,
    openForeshadowingCount: metrics.openForeshadowingCount,
    pendingTriples: metrics.pendingTriples,
    tensionTrend: metrics.tensionTrend,
    riskCount: metrics.risks.length,
    topRisks,
  },
})
```

- [ ] **Step 4: step output 带上 reportId**

`update_health` step output 必须包含：

1. `reportId`
2. `score`
3. `riskLevel`
4. 原有摘要字段

### Task 2: 健康趋势按章节顺序排序

**Files:**

- Modify: `apps/api/src/services/health-metrics.service.ts`

- [ ] **Step 1: 对风格指纹排序**

查询后基于 `chapterNumMap` 排序：

```ts
const orderedFingerprints = [...fingerprints].sort((a, b) =>
  (chapterNumMap.get(a.chapterId) || 0) - (chapterNumMap.get(b.chapterId) || 0),
)
```

- [ ] **Step 2: 张力曲线使用 orderedFingerprints**

`tensionTrend` 必须来自 `orderedFingerprints`。

- [ ] **Step 3: 风格漂移使用 orderedFingerprints**

`computeStyleDrift(projectId, orderedFingerprints)`。

### Task 3: 导入导出健康报告

**Files:**

- Modify: `apps/api/src/services/export-import.service.ts`

- [ ] **Step 1: 引入 projectHealthReports**

从 `../db/schema` import `projectHealthReports`。

- [ ] **Step 2: 增加字段白名单**

```ts
const PROJECT_HEALTH_REPORT_FIELDS = ['scope', 'score', 'riskLevel', 'metricsJson', 'generatedAt']
```

- [ ] **Step 3: 导出健康报告**

```ts
const healthReports = await db.select().from(projectHealthReports).where(eq(projectHealthReports.projectId, projectId))
```

返回对象增加：

```ts
projectHealthReports: healthReports
```

- [ ] **Step 4: 导入健康报告**

在 style fingerprints 附近导入：

```ts
for (const report of ((data.projectHealthReports as Record<string, unknown>[] | undefined) || [])) {
  await safeInsert(projectHealthReports, {
    id: remapId(report.id as string),
    projectId,
    ...pick(report, PROJECT_HEALTH_REPORT_FIELDS),
  })
}
```

## 5. 验收标准

1. 写作任务执行到 `update_health` 后，数据库出现一条 `project_health_reports` 记录。
2. step output 包含 `reportId`、`score`、`riskLevel`。
3. 健康页张力曲线按章节号升序展示。
4. 导出项目 JSON 包含 `projectHealthReports`。
5. 导入项目时恢复健康报告。
6. `pnpm check` 通过。
7. `pnpm db:migrate` 通过。
8. `git diff --check` 通过。

## 6. 后续阶段

本轮完成后，下一轮再做健康报告 UI 历史视图：

1. 健康页增加“历史报告”时间线。
2. 支持查看每次写作任务结束后的风险变化。
3. 支持对比两个健康报告的风险新增、解决和恶化。

## 7. 执行记录

执行日期：2026-05-14

已完成：

1. `update_health` 步骤会写入 `project_health_reports`。
2. `update_health` step output 已包含 `reportId`、`score`、`riskLevel`。
3. 健康张力趋势改为按章节号排序。
4. 导出导入已包含 `projectHealthReports`。

验证命令：

```bash
pnpm check
pnpm db:migrate
git diff --check
```

验证结果：全部通过。
