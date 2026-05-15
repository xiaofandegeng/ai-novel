# 全自动写作模式修改文档

日期：2026-05-15
适用范围：AI 小说创作工作台自动写作、写作任务、章后分析、结构化记忆、项目健康页

## 1. 背景

当前系统的自动写作是“半自动写作”：

1. AI 构建上下文。
2. AI 生成大纲。
3. 系统停在“审查大纲”，等待作者确认。
4. 作者确认后继续生成正文。
5. 后续在“一致性检查、审查正文、审查建议”等节点继续停下来。

这个设计符合 `docs/development/ai-collaboration-rules.md` 中“AI 结果必须进入确认区，不得直接覆盖用户内容”的默认安全边界。

如果后续需要“全自动写作”，不能简单删除确认节点，否则会破坏 AI 信任边界。正确做法是新增一个显式的、可配置的“全自动模式”，让用户在创建任务时主动授权系统在低风险条件下自动通过确认点，并保留快照、审计日志和回滚能力。

## 2. 目标

新增全自动写作能力：

1. 作者可以选择“半自动”或“全自动”执行策略。
2. 全自动模式下，系统可自动通过低风险确认点。
3. 高风险内容必须自动暂停，等待作者确认。
4. AI 生成的大纲、正文、章后建议、结构化抽取结果都必须可追溯。
5. 自动写入正文前后必须保存版本快照。
6. 自动应用结构化建议时必须按类型和风险等级分流。
7. 项目健康页能显示全自动写作造成的风险变化。

## 3. 非目标

本轮不做：

1. 不把所有 AI 结果无条件写入数据库。
2. 不绕过一致性检查。
3. 不取消现有“半自动写作”。
4. 不允许默认开启全自动。
5. 不允许 AI 直接修改世界观、角色核心设定、重大关系、主线矛盾，除非规则明确允许。

## 4. 产品设计

### 4.1 写作任务新增执行策略

在“自动写作”创建任务面板中新增：

```text
执行策略：
- 半自动：每个关键节点由作者确认
- 全自动：低风险节点自动通过，高风险节点暂停
```

推荐默认值：

```text
半自动
```

全自动模式需要显示说明：

```text
全自动会在低风险条件下自动写入正文、保存快照并运行章后分析。若发现人物跑偏、逻辑冲突、伏笔断裂或高风险结构变更，任务会暂停等待确认。
```

### 4.2 全自动安全等级

新增全自动安全等级：

```ts
type AutoApprovalLevel = 'conservative' | 'balanced' | 'aggressive'
```

含义：

| 等级 | 自动通过范围 | 暂停条件 |
| --- | --- | --- |
| conservative | 仅自动通过大纲生成、低风险正文检查 | 任意 warning 或结构化建议 |
| balanced | 自动通过低/中风险建议，正文 warning 可继续 | blocked、高风险建议、世界观/人物核心改动 |
| aggressive | 自动通过多数建议 | blocked、数据库写入失败、连续异常 |

首版建议只实现：

```text
conservative
balanced
```

`aggressive` 只保留类型和 UI 占位，不默认开放。

### 4.3 自动确认点规则

现有确认步骤：

```ts
confirm_plan
consistency_check
confirm_apply
confirm_suggestions
```

全自动模式下的规则：

| 步骤 | 可自动通过 | 条件 |
| --- | --- | --- |
| confirm_plan | 是 | 大纲 JSON 可解析，章节目标/冲突/事件非空 |
| consistency_check | 条件通过 | `overallStatus === 'pass'`；balanced 可允许低/中风险 warning |
| confirm_apply | 是 | 正文非空，字数在阈值内，写入前已保存快照 |
| confirm_suggestions | 条件通过 | 只自动应用低风险建议；高风险建议保留待确认 |

任何 `blocked` 或解析失败都必须暂停。

## 5. 数据库修改

### 5.1 writing_jobs 新增字段

文件：

```text
apps/api/src/db/schema/ai.ts
```

新增字段：

```ts
executionMode: text('execution_mode')
  .$type<'manual' | 'auto'>()
  .notNull()
  .default('manual')

autoApprovalLevel: text('auto_approval_level')
  .$type<'conservative' | 'balanced' | 'aggressive'>()
  .notNull()
  .default('conservative')

autoStopReason: text('auto_stop_reason')
autoApprovedSteps: integer('auto_approved_steps').notNull().default(0)
```

说明：

1. `executionMode = manual` 表示现有半自动。
2. `executionMode = auto` 表示全自动。
3. `autoStopReason` 记录为什么自动流程暂停。
4. `autoApprovedSteps` 记录自动批准过多少确认点。

### 5.2 writing_job_steps 新增字段

新增字段：

```ts
reviewRequired: boolean('review_required').notNull().default(false)
autoDecision: text('auto_decision')
  .$type<'approved' | 'paused' | 'rejected' | 'not_applicable'>()
autoDecisionReason: text('auto_decision_reason')
```

用途：

1. 明确某个步骤是否被自动确认。
2. 支持 UI 展示“系统为何自动通过/为何暂停”。
3. 支持后续审计和调试。

### 5.3 迁移

生成迁移：

```bash
pnpm db:generate
pnpm db:migrate
```

注意：

1. migration 必须兼容已有任务。
2. 已有任务默认 `manual + conservative`。

## 6. Shared 类型修改

文件：

```text
packages/shared/src/types/writing-job.ts
packages/shared/src/types/writing-job-step.ts
```

新增：

```ts
export type WritingJobExecutionMode = 'manual' | 'auto'
export type AutoApprovalLevel = 'conservative' | 'balanced' | 'aggressive'
export type AutoDecision = 'approved' | 'paused' | 'rejected' | 'not_applicable'
```

`WritingJob` 增加：

```ts
executionMode: WritingJobExecutionMode
autoApprovalLevel: AutoApprovalLevel
autoStopReason: string | null
autoApprovedSteps: number
```

`CreateWritingJobInput` 增加：

```ts
executionMode?: WritingJobExecutionMode
autoApprovalLevel?: AutoApprovalLevel
```

`WritingJobStep` 增加：

```ts
reviewRequired: boolean
autoDecision: AutoDecision | null
autoDecisionReason: string | null
```

## 7. 后端服务修改

### 7.1 创建任务

文件：

```text
apps/api/src/routes/writing-jobs.ts
```

创建任务时接收：

```ts
executionMode
autoApprovalLevel
```

校验规则：

1. `executionMode` 只能是 `manual | auto`。
2. `autoApprovalLevel` 只能是 `conservative | balanced | aggressive`。
3. 若 `mode !== outline_only`，必须选择 `currentChapterId`。
4. 全自动模式必须有 `currentChapterId`，否则无法写入正文。

### 7.2 自动确认策略服务

新增文件：

```text
apps/api/src/services/writing-job-auto-approval.service.ts
```

职责：

1. 读取当前步骤输出。
2. 根据任务 `executionMode` 和 `autoApprovalLevel` 判断是否自动通过。
3. 返回结构化决策。

接口建议：

```ts
interface AutoApprovalDecision {
  shouldPause: boolean
  approved: boolean
  reason: string
  severity: 'none' | 'low' | 'medium' | 'high'
}

export function evaluateAutoApproval(input: {
  job: WritingJob
  step: WritingJobStep
  previousOutputs: Map<WritingJobStepType, string>
}): AutoApprovalDecision
```

### 7.3 runNextSteps 修改

文件：

```text
apps/api/src/services/writing-job.service.ts
```

现有逻辑：

```ts
if (!shouldContinue) {
  await updateJobStatus(jobId, 'waiting_review', null)
  return
}
```

修改为：

```ts
if (!shouldContinue) {
  const decision = evaluateAutoApproval({ job, step: updatedStep, previousOutputs })

  if (job.executionMode === 'auto' && decision.approved) {
    await markStepAutoApproved(step.id, decision.reason)
    await incrementAutoApprovedSteps(job.id)
    continue
  }

  await markStepNeedsReview(step.id, decision.reason)
  await updateJobStatus(jobId, 'waiting_review', decision.reason)
  return
}
```

关键要求：

1. 自动通过也要记录 `autoDecision='approved'`。
2. 自动暂停要记录 `autoDecision='paused'` 和 `autoStopReason`。
3. 不允许直接跳过失败步骤。
4. 自动模式下遇到错误必须转为 `failed` 或 `waiting_review`，不能静默继续。

### 7.4 正文写入前后快照

当前 `apply_draft` 会写入正文，`save_version` 在后面保存快照。

全自动模式需要改成：

1. 写入前保存 `before_auto_apply` 快照。
2. 写入正文。
3. 写入后保存 `after_auto_apply` 快照。

建议拆分：

```ts
executePreApplySnapshot()
executeApplyDraft()
executePostApplySnapshot()
```

如果暂不改步骤序列，也要在 `executeApplyDraft` 内部完成前后快照。

### 7.5 章后建议自动应用规则

文件：

```text
apps/api/src/services/postprocess-suggestion.service.ts
```

新增建议风险分级：

```ts
type SuggestionRisk = 'low' | 'medium' | 'high'
```

建议风险：

| 类型 | 默认风险 | 全自动处理 |
| --- | --- | --- |
| chapter_element | low | 可自动应用 |
| fact_triple | medium | balanced 可自动应用，conservative 暂停 |
| character_state | medium | balanced 可自动确认到事件/备注，不直接改核心角色 |
| relationship_update | high | 暂停 |
| conflict_add | high | 暂停 |
| conflict_update | high | 暂停 |
| foreshadowing_add | medium | balanced 可自动创建 pending/open |
| foreshadowing_payoff | high | 暂停，必须人工确认 |
| style_note | low | 可自动 acknowledged |
| continuity_note | medium | 暂停或仅 acknowledged |

新增函数：

```ts
export async function autoAcceptSafeSuggestions(projectId: string, chapterId: string, level: AutoApprovalLevel)
```

返回：

```ts
{
  accepted: number
  applied: number
  paused: number
  highRiskTypes: string[]
}
```

## 8. 前端 UI 修改

### 8.1 创建任务面板

文件：

```text
apps/web/src/features/writing-jobs/components/WritingJobLauncher.vue
```

新增控件：

```text
执行策略：
[ 半自动 ] [ 全自动 ]

自动确认等级：
[ 保守 ] [ 平衡 ]
```

显示条件：

1. 选择“全自动”后展示等级选择。
2. 全自动模式下显示风险说明。
3. `outline_only` 可以不选章节；其他模式必须选章节。

### 8.2 任务时间线

文件：

```text
apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue
```

新增展示：

1. 任务头部显示 `半自动 / 全自动`。
2. 自动通过的步骤显示：

```text
已自动确认：原因...
```

3. 自动暂停的步骤显示：

```text
已暂停：原因...
```

4. 旧任务没有 `currentChapterId` 时继续显示当前已有提示。

### 8.3 全自动运行中状态

全自动模式运行中，页面要显示：

```text
系统正在自动执行。遇到高风险问题会暂停等待确认。
```

如果任务完成：

```text
全自动写作完成，已写入正文、保存快照并更新项目健康指标。
```

## 9. API 修改

### 9.1 创建写作任务

请求：

```http
POST /api/projects/:projectId/writing-jobs
```

新增 body：

```json
{
  "mode": "outline_then_draft",
  "currentChapterId": "...",
  "executionMode": "auto",
  "autoApprovalLevel": "balanced"
}
```

### 9.2 步骤返回

`GET /api/projects/:projectId/writing-jobs/:jobId/steps`

每个 step 返回：

```json
{
  "reviewRequired": false,
  "autoDecision": "approved",
  "autoDecisionReason": "一致性检查通过，风险等级 low"
}
```

## 10. 停止条件

全自动必须在以下情况停止：

1. AI 返回无法解析。
2. 生成正文为空。
3. 字数低于最小阈值或高于最大阈值太多。
4. 一致性检查 `overallStatus === blocked`。
5. 角色 OOC 高风险。
6. 世界观规则冲突。
7. 伏笔被错误回收。
8. 结构化建议包含高风险类型。
9. 数据库写入失败。
10. 连续两次 AI 调用失败。

停止后状态：

```ts
writing_jobs.status = 'waiting_review'
writing_jobs.autoStopReason = '...'
current step.reviewRequired = true
current step.autoDecision = 'paused'
```

## 11. 审计与回滚

全自动写作必须写入以下审计信息：

1. `authoring_events`：
   - `auto_job_started`
   - `auto_step_approved`
   - `auto_step_paused`
   - `auto_draft_applied`
   - `auto_job_completed`

2. `chapter_versions`：
   - 写入正文前快照
   - 写入正文后快照

3. `ai_context_snapshots`：
   - 每次 AI 生成保存上下文快照

## 12. 推荐开发顺序

### 阶段 1：类型与数据库

1. 修改 shared 类型。
2. 修改 `writing_jobs` schema。
3. 修改 `writing_job_steps` schema。
4. 生成 migration。
5. 运行：

```bash
pnpm db:generate
pnpm db:migrate
pnpm typecheck
```

### 阶段 2：创建任务接入执行策略

1. 后端 `POST /writing-jobs` 接收 `executionMode`。
2. 前端创建任务面板新增执行策略。
3. 创建后任务详情能显示策略。
4. 验证旧任务默认半自动。

### 阶段 3：自动确认策略服务

1. 新增 `writing-job-auto-approval.service.ts`。
2. 实现 `confirm_plan` 自动通过规则。
3. 实现 `consistency_check` 自动通过/暂停规则。
4. 单元测试覆盖 pass/warning/blocked。

### 阶段 4：写作任务引擎接入

1. `runNextSteps` 接入自动确认。
2. 自动通过后继续执行下一步。
3. 自动暂停后进入 `waiting_review`。
4. UI 显示自动通过/暂停原因。

### 阶段 5：正文写入快照

1. `apply_draft` 前保存快照。
2. `apply_draft` 后保存快照。
3. 版本历史可看到自动写作快照。

### 阶段 6：章后建议自动分级应用

1. 增加建议风险分级。
2. 低风险建议自动应用。
3. 高风险建议保留在确认区。
4. UI 显示“自动应用 N 条，待确认 M 条”。

### 阶段 7：健康页联动

1. 全自动任务结束后刷新健康指标。
2. 健康页显示最近一次全自动任务结果。
3. 高风险暂停原因能跳转到对应页面。

### 阶段 8：端到端验收

准备一个测试项目：

1. 至少 1 个项目。
2. 至少 1 个故事设定集。
3. 至少 3 个角色。
4. 至少 2 段关系。
5. 至少 1 个冲突。
6. 至少 1 个待写章节。

运行全自动任务：

```text
模式：大纲+正文
执行策略：全自动
自动确认等级：保守
目标章节：第 N 章
```

验收：

1. 自动生成大纲。
2. 大纲低风险自动通过。
3. 自动生成正文。
4. 一致性检查通过后自动写入。
5. 写入前后均有快照。
6. 章后分析产生建议。
7. 低风险建议自动应用或 acknowledged。
8. 高风险建议进入确认区。
9. 项目健康指标更新。
10. 正文写作页能看到新正文。

## 13. 测试计划

### 13.1 单元测试

新增：

```text
apps/api/src/services/writing-job-auto-approval.service.test.ts
```

覆盖：

1. manual 模式永远暂停确认。
2. auto + conservative + pass 自动通过。
3. auto + conservative + warning 暂停。
4. auto + balanced + low/medium warning 自动通过。
5. blocked 永远暂停。
6. 高风险建议永远暂停。

### 13.2 服务测试

覆盖：

1. 创建全自动任务。
2. 自动通过 `confirm_plan`。
3. 自动暂停 `consistency_check`。
4. 自动写入正文后生成快照。

### 13.3 手动验收

```bash
pnpm check
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

浏览器检查：

1. `/project/:id/autopilot`
2. 创建全自动任务。
3. 观察时间线自动推进。
4. 去 `/project/:id/write` 检查正文。
5. 去 `/project/:id/versions` 检查快照。
6. 去 `/project/:id/postprocess` 检查待确认建议。
7. 去 `/project/:id/health` 检查健康指标。

## 14. 风险与注意事项

1. 全自动模式默认不能开启。
2. 不能删除半自动流程。
3. 自动模式不是无条件覆盖，必须有风险阈值。
4. 正文写入必须有版本快照。
5. 结构化建议必须先分级，不能全部自动应用。
6. UI 必须明确告诉用户“当前任务是全自动”。
7. 任何 AI 解析失败都必须暂停，而不是继续。
8. 任何数据库写入失败都必须保留错误信息。

## 15. 完成标准

只有同时满足以下条件，才能认为全自动写作完成：

1. `pnpm check` 通过。
2. `pnpm db:migrate` 通过。
3. 创建任务时可选择半自动/全自动。
4. 全自动任务能从大纲跑到正文写入。
5. 低风险确认点能自动通过。
6. 高风险确认点能自动暂停。
7. 正文写入前后有快照。
8. 章后建议按风险分级处理。
9. 项目健康指标更新。
10. UI 能清楚展示自动通过/暂停原因。

