# 全程自动化写作改造方案：移除半自动流程（2026-05-16）

## 背景

当前系统已经有自动驾驶、写作任务、变更集、一致性检查、章后分析、结构化回写等基础能力，但整体仍保留大量半自动设计：

- `confirm_plan`
- `review_change_set`
- `confirm_suggestions`
- `needs_attention`
- 手动确认异常
- 前端确认按钮
- 保守策略下暂停

这些设计适合“AI 辅助写作”，但不适合后续目标：

> 系统趋向全自动写作，从大纲、场景、正文、检查、修复、章后分析、结构化回写到下一章续写，都由系统自动完成；用户主要做配置、抽检、回滚和最终审阅。

因此本轮改造目标不是继续修补半自动，而是重构为“自动化流水线 + 风险隔离 + 事后审计”。

## 总目标

把当前流程从：

```text
AI 生成 -> 等用户确认 -> 用户应用 -> 下一步
```

改造成：

```text
AI 生成 -> 自动检查 -> 自动修复 -> 自动应用低/中风险 -> 高风险隔离 -> 自动继续下一章 -> 事后审计与可回滚
```

用户不再作为每个步骤的阻塞点，而是作为：

1. 写作目标配置者
2. 风格和边界规则配置者
3. 高风险异常审计者
4. 最终稿件审阅者

## 核心原则

### 1. 不再使用确认步骤阻塞主流程

旧流程中的确认点：

```text
confirm_plan
review_change_set
confirm_suggestions
confirm_apply
```

不再作为默认阻塞步骤。

它们应改造为：

```text
auto_review_plan
auto_review_change_set
auto_apply_suggestions
auto_audit
```

所有步骤都应自动给出决策：

- `approved`
- `repaired`
- `isolated`
- `skipped`
- `failed`

### 2. 高风险不暂停全局 run，改为隔离当前章节

旧逻辑：

```text
高风险 -> run.status = needs_attention -> 停止整个自动驾驶
```

新逻辑：

```text
高风险 -> 当前章节 job 标记 isolated -> 记录异常 -> 继续下一章
```

只有以下情况才允许停止整个 run：

- AI 服务不可用
- 数据库写入失败
- 上下文构建失败
- 连续 N 章失败
- 项目级健康指标跌破硬阈值

### 3. 所有自动写入都必须有快照和审计记录

全自动不是直接污染数据库。

每次自动写入必须生成：

- 写入前快照
- 写入后快照
- 变更集
- 自动决策报告
- 健康指标报告
- 可回滚入口

### 4. 结构化数据必须自动流动

正文生成后必须自动抽取：

- 新角色
- 角色状态变化
- 人物关系变化
- 新矛盾
- 矛盾进展
- 伏笔新增
- 伏笔回收
- 事实三元组
- 章节记忆
- 风格指纹

低/中风险结构化变更自动写入正式库；高风险进入隔离区，但不阻塞后续章节。

### 5. 下一章必须读取上一章自动沉淀的数据

下一章上下文必须包含：

- 前序章节记忆
- 已确认事实图谱
- 最新人物关系
- 最新矛盾矩阵
- 未回收伏笔
- 章节元素
- 项目写作人格
- 风格指纹
- 健康风险摘要

## 目标流程

### 新全自动步骤序列

建议统一写作任务步骤为：

```text
prepare_context
generate_plan
auto_review_plan
generate_draft
build_change_set
auto_review_change_set
auto_repair
apply_change_set
postprocess
auto_apply_suggestions
update_memory
update_health
auto_audit
done
```

场景模式：

```text
prepare_context
generate_scene_plan
generate_scene_draft
auto_review_scene
apply_scene_draft
postprocess_scene
auto_apply_suggestions
assemble_chapter
build_change_set
auto_review_change_set
auto_repair
apply_change_set
update_memory
update_health
auto_audit
done
```

## 数据模型改造

### 1. writing_job_steps 扩展决策字段

当前已有：

- `autoDecision`
- `autoDecisionReason`
- `reviewRequired`

建议扩展为：

```ts
autoDecision:
  | 'approved'
  | 'repaired'
  | 'isolated'
  | 'skipped'
  | 'failed'
  | 'not_applicable'

autoRiskLevel:
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

autoDecisionReport: jsonb
```

迁移：

```sql
ALTER TABLE writing_job_steps
ADD COLUMN auto_risk_level text,
ADD COLUMN auto_decision_report jsonb;
```

### 2. autonomous_run_jobs 增加隔离状态

当前状态：

```ts
'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_review'
```

改为：

```ts
'pending'
| 'running'
| 'completed'
| 'failed'
| 'skipped'
| 'isolated'
```

移除或废弃：

```ts
waiting_review
```

新增字段：

```ts
isolationReason: text
isolationReport: jsonb
```

### 3. autonomous_run_exceptions 改造成审计异常

当前异常偏向人工处理。

新异常应区分：

```ts
status:
  | 'open'
  | 'auto_resolved'
  | 'isolated'
  | 'ignored'
  | 'resolved_by_user'
```

新增字段：

```ts
autoResolutionStrategy:
  | 'repair'
  | 'skip_chapter'
  | 'isolate_chapter'
  | 'retry'
  | 'stop_run'

resolutionReport: jsonb
```

## 服务层改造

### 阶段 1：废弃人工确认语义

文件：

- `apps/api/src/services/writing-job.service.ts`
- `packages/shared/src/types/writing-job-step.ts`
- `apps/api/src/db/schema/ai.ts`

改造：

1. 将 `CONFIRM_STEPS` 改为 `AUTO_REVIEW_STEPS`。
2. `executeStep()` 不再返回 `false` 表示人工确认。
3. 每个 review 步骤都必须调用自动决策服务。
4. `runNextSteps()` 不应因为中高风险默认 `waiting_review`。

旧逻辑：

```ts
if (!shouldContinue) {
  await updateJobStatus(jobId, 'waiting_review', decision.reason)
  return
}
```

新逻辑：

```ts
if (decision.action === 'continue') {
  continue
}

if (decision.action === 'repair') {
  scheduleAutoRepair()
  continue
}

if (decision.action === 'isolate') {
  await isolateCurrentJob()
  return
}

if (decision.action === 'stop_run') {
  await failJobAndStopRun()
  return
}
```

### 阶段 2：新增统一自动决策服务

新增文件：

```text
apps/api/src/services/auto-decision.service.ts
```

职责：

```ts
export async function decideNextAction(input: {
  projectId: string
  job: WritingJob
  step: WritingJobStep
  previousOutputs: Map<string, string>
  runStrategy: 'safe' | 'balanced' | 'fast'
}): Promise<{
  action: 'continue' | 'repair' | 'isolate' | 'skip' | 'stop_run'
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'
  reason: string
  report: Record<string, unknown>
}>
```

规则：

#### safe

- low：自动继续
- medium：自动修复一次，失败则 isolate
- high：isolate 当前章节
- critical：stop run

#### balanced

- low：自动继续
- medium：自动继续或修复
- high：自动修复一次，失败 isolate
- critical：stop run

#### fast

- low / medium：自动继续
- high：自动修复，失败 skip/isolate
- critical：stop run

### 阶段 3：改造自动驾驶 run 推进逻辑

文件：

- `apps/api/src/services/autonomous-writing.service.ts`

目标：

`handleAutonomousJobCompletion()` 不再把 `waiting_review` 作为主状态。

新逻辑：

```text
completed -> 继续下一章
failed but recoverable -> retry 或 isolate 当前章 -> 继续下一章
failed critical -> run failed
isolated -> 记录异常 -> 继续下一章
```

run 完成条件：

```text
没有 pending/running job
没有 critical open exception
```

不应因为 isolated/ignored exception 阻塞 completed。

### 阶段 4：自动应用结构化建议

文件：

- `apps/api/src/services/postprocess-suggestion.service.ts`
- `apps/api/src/services/chapter-change-set.service.ts`

目标：

不再让 `confirm_suggestions` 默认等待人确认。

建议分级：

| 类型 | 默认处理 |
| --- | --- |
| `fact_triple` | 自动应用，低风险 |
| `chapter_element` | 自动应用，低风险 |
| `character_state` | 自动应用，低/中风险 |
| `style_note` | 自动 acknowledge |
| `continuity_note` | 自动 acknowledge |
| `foreshadowing_add` | balanced/fast 自动应用，safe 可隔离 |
| `foreshadowing_payoff` | 需要匹配到 `foreshadowingId` 才自动应用 |
| `relationship_update` | strength <= 6 自动应用；> 6 isolate |
| `character_add` | extra/supporting 可自动应用；protagonist/antagonist isolate |
| `conflict_add` | isolate 或 balanced 以上自动应用 |
| `conflict_update` | medium 以下自动应用；resolved/abandoned isolate |

新增返回：

```ts
{
  applied: number
  acknowledged: number
  isolated: number
  failed: number
  report: AutoApplyReport
}
```

### 阶段 5：自动修复成为默认策略

文件：

- `apps/api/src/services/auto-repair.service.ts`
- `apps/api/src/services/writing-job.service.ts`

修复目标：

- 人物 OOC
- 设定冲突
- 伏笔误回收
- 章节目标偏离
- 正文字数不足
- 风格漂移

限制：

- 同一 job 最多自动修复 2 次。
- 仍失败则 isolate 当前章节。
- 修复前后都要保存 step report。

### 阶段 6：自动续写范围改造

文件：

- `apps/api/src/services/autonomous-writing.service.ts`
- `apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue`

最终范围：

```ts
type AutonomousScopeType =
  | 'next_n_chapters'
  | 'from_current_forward'
  | 'continue_incomplete'
  | 'rewrite_selected'
  | 'project_until_target'
```

规则：

#### next_n_chapters

从第一个未完成章节开始，取 N 章。

#### from_current_forward

从指定章节之后开始，跳过已完成且字数达标章节。

#### continue_incomplete

只处理：

- `status !== completed`
- 或正文字数低于目标字数 70%

#### rewrite_selected

允许覆盖已有正文，但必须：

- 创建写入前快照
- 在 run 配置中明确记录 `rewriteConfirmed: true`

#### project_until_target

持续写作直到：

- 达到项目目标字数
- 达到目标章节数
- 或触发 critical stop

## 前端改造

### 1. 自动驾驶页从“确认操作台”改为“运行监控台”

文件：

- `apps/web/src/views/AutopilotView.vue`
- `apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue`
- `apps/web/src/features/autonomous-writing/components/AutonomousRunTimeline.vue`
- `apps/web/src/features/autonomous-writing/components/AutonomousExceptionQueue.vue`

界面重点：

- 启动配置
- 当前运行状态
- 每章完成情况
- 自动决策记录
- 隔离章节
- 可回滚快照
- 健康趋势

不再突出：

- 确认继续
- 手动应用
- 每步审批

### 2. 异常队列改名为“自动审计队列”

旧：

```text
待处理异常
```

新：

```text
自动审计队列
```

分类：

- 已自动修复
- 已隔离
- 已跳过
- 需要最终审阅
- 致命错误

### 3. 移除默认人工按钮

以下按钮只在审计详情中出现，不再作为主流程按钮：

- 确认继续
- 驳回
- 应用建议
- 手动确认

## API 改造

### 保留但降级的接口

以下接口保留用于调试和人工介入，但不再作为主流程依赖：

```text
POST /writing-jobs/:jobId/steps/:stepId/approve
POST /writing-jobs/:jobId/steps/:stepId/reject
POST /postprocess-suggestions/:id/accept
POST /postprocess-suggestions/:id/reject
```

标记为：

```text
debug/manual override only
```

### 新增接口

```text
GET /api/projects/:projectId/autonomous-runs/:runId/audit
GET /api/projects/:projectId/autonomous-runs/:runId/decisions
POST /api/projects/:projectId/autonomous-runs/:runId/isolate/:jobId
POST /api/projects/:projectId/autonomous-runs/:runId/retry-isolated/:jobId
POST /api/projects/:projectId/autonomous-runs/:runId/rollback/:chapterId
```

## 迁移计划

### 迁移 1：step 决策字段

```sql
ALTER TABLE writing_job_steps
ADD COLUMN auto_risk_level text,
ADD COLUMN auto_decision_report jsonb;
```

### 迁移 2：run job 隔离字段

```sql
ALTER TABLE autonomous_run_jobs
ADD COLUMN isolation_reason text,
ADD COLUMN isolation_report jsonb;
```

### 迁移 3：exception 自动处理字段

```sql
ALTER TABLE autonomous_run_exceptions
ADD COLUMN auto_resolution_strategy text,
ADD COLUMN resolution_report jsonb;
```

## 开发顺序

### P0：先保证全仓库可构建

1. 删除未使用 import。
2. 运行：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
```

### P1：取消半自动阻塞

1. 新增 `auto-decision.service.ts`。
2. 改造 `runNextSteps()`。
3. 废弃默认 `waiting_review`。
4. 高风险改为 isolate 当前章节。
5. critical 才停止 run。

### P2：完善全局回写

1. 统一 `applyOneSuggestion()` 和 `applyChangeSet()`。
2. 所有结构化类型都必须可自动应用或隔离。
3. 变更集应用必须事务化。
4. 应用结果必须写入 report。

### P3：自动续写策略

1. 补齐前端范围配置。
2. 跳过已完成章节。
3. 支持 `project_until_target`。
4. 重写模式强制快照。

### P4：自动审计 UI

1. 自动驾驶页展示每章自动决策。
2. 显示结构化回写数量。
3. 显示隔离章节。
4. 支持回滚。

### P5：测试

新增测试：

```text
apps/api/src/services/__tests__/auto-decision.service.test.ts
apps/api/src/services/__tests__/autonomous-writing-flow.test.ts
apps/api/src/services/__tests__/chapter-change-set-auto-apply.test.ts
```

## 验收标准

### 工程验收

必须通过：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm db:migrate
```

### 流程验收

准备一个 3 章测试项目：

1. 第 1 章自动生成正文。
2. 自动生成变更集。
3. 自动应用正文。
4. 自动抽取角色、关系、伏笔、事实。
5. 自动写入章节记忆。
6. 第 2 章上下文能读取第 1 章记忆和事实。
7. 第 2 章自动续写。
8. 若发现高风险，当前章隔离，run 继续第 3 章。
9. run 结束后状态为 `completed`，隔离章节进入审计队列。

### 产品验收

用户只需要：

1. 配置项目目标。
2. 选择自动化策略。
3. 点击启动。
4. 查看自动审计报告。
5. 必要时回滚或重试隔离章节。

中间不再需要逐步确认。

## 最终目标状态

系统应从“AI 写作助手”升级为：

> 自动小说生产流水线。

它不是让 AI 直接乱写，而是让 AI 在故事规则、人物关系、伏笔台账、事实图谱、章节记忆、健康指标的约束下持续写作，并把所有写入行为变成可审计、可追溯、可回滚的自动化流程。

