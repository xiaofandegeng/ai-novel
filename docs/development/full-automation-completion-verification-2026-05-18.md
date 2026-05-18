# 全自动化完成验收报告（2026-05-18）

## 1. 验收目标

本次验收用于确认：

- 是否已经实现全自动写作主流程。
- 旧半自动主链路是否已经删除。
- 前端是否还存在确认 / 驳回类半自动操作。
- 后端是否还会写入等待人工状态。
- shared 合同是否还允许旧半自动状态。

## 2. 旧半自动关键词扫描

执行命令：

```bash
rg -n "waiting_review|needs_attention|approveStep|rejectStep|确认继续|驳回|人工确认|手动确认|reviewRequired|autoApprovalLevel|confirm_plan|confirm_apply|confirm_suggestions|review_change_set|writing-job-auto-approval|shouldPause|manual_required|CONFIRM_STEPS" apps/api/src apps/web/src packages/shared/src
```

结果：

```text
0 命中
```

判断：

通过。旧半自动主链路关键词已经从主业务代码中清除。

已确认移除：

- `waiting_review`
- `needs_attention`
- `approveStep`
- `rejectStep`
- `确认继续`
- `驳回`
- `reviewRequired`
- `autoApprovalLevel`
- `confirm_plan`
- `confirm_apply`
- `confirm_suggestions`
- `review_change_set`
- `writing-job-auto-approval`
- `shouldPause`
- `manual_required`
- `CONFIRM_STEPS`

## 3. Shared 合同验收

### 3.1 WritingJob

位置：

- `packages/shared/src/types/writing-job.ts`

当前状态：

```ts
export type WritingJobStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'isolated'
```

判断：

通过。

说明：

- 已删除 `waiting_review`。
- 已删除 `executionMode`。
- 已删除 `autoApprovalLevel`。

### 3.2 AutonomousWritingRun

位置：

- `packages/shared/src/types/autonomous-writing.ts`

当前状态：

```ts
export type AutonomousRunStatus
  = | 'idle'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
```

判断：

通过。

说明：

- 已删除 `needs_attention`。
- Run 不再表达“等待人工关注”。

### 3.3 AutonomousRunJob

当前状态：

```ts
status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'isolated'
```

判断：

通过。

说明：

- 已删除章节任务级 `waiting_review`。
- 单章异常只允许失败、跳过或隔离。

### 3.4 WritingJobStep

位置：

- `packages/shared/src/types/writing-job-step.ts`

当前步骤：

```ts
prepare_context
generate_plan
validate_plan
generate_draft
generate_scene_draft
consistency_check
apply_draft
save_version
postprocess
classify_suggestions
apply_suggestions
update_health
build_change_set
evaluate_change_set
apply_change_set
auto_repair
done
```

判断：

通过。

说明：

- 已删除确认型步骤。
- 已删除 `reviewRequired`。
- 步骤语义已切换为自动检查、自动评估、自动应用。

## 4. 后端流程验收

### 4.1 写作任务创建固定为自动模式

位置：

- `apps/api/src/routes/writing-jobs.ts`

当前逻辑：

```ts
executionMode: 'auto'
```

判断：

通过。

说明：

- API 不再接受半自动模式参数。
- 创建 Job 时固定进入自动写作链路。

### 4.2 写作任务 Step 序列已自动化

位置：

- `apps/api/src/services/writing-job.service.ts`

当前序列：

```text
prepare_context
-> generate_plan / generate_scene_draft / generate_draft
-> validate_plan
-> build_change_set
-> evaluate_change_set
-> auto_repair
-> apply_change_set
-> postprocess
-> classify_suggestions
-> apply_suggestions
-> update_health
-> done
```

判断：

通过。

说明：

- 主流程不再出现人工确认 Step。
- 风险判断由 `decideNextAction` 统一处理。

### 4.3 失败处理已进入自动决策

位置：

- `apps/api/src/services/writing-job.service.ts`

当前行为：

- Step 失败后调用 `decideNextAction`。
- `isolate` / `skip` 会隔离当前 Job。
- `stop_run` 会停止整轮 Run。
- 其他无法处理的决策会 fail-safe 到 failed。

判断：

通过。

说明：

失败不再默认等待人工 retry。

### 4.4 自动驾驶 Run 不再等待人工审查

位置：

- `apps/api/src/services/autonomous-writing.service.ts`

当前行为：

- `completed`：继续下一章。
- `isolated`：标记隔离并继续下一章。
- `failed`：记录异常；如果 Run 仍在 running，则继续下一章。

判断：

通过。

说明：

Run 层已经不再写入 `needs_attention` 或 `waiting_review`。

### 4.5 异常恢复不再审批旧 Step

位置：

- `apps/api/src/services/autonomous-writing.service.ts`

当前行为：

- `resolveAutonomousException` 会重置失败 / 隔离 Job，并重新进入自动运行。
- 不再调用 approve / reject 逻辑。

判断：

通过。

## 5. 前端流程验收

### 5.1 任务时间线不再显示确认 / 驳回

位置：

- `apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue`

当前行为：

- 检查点步骤只展示“查看决策报告”。
- 失败步骤单独展示“重试”。

判断：

通过。

说明：

“查看决策报告”现在只展开报告，不再触发重试。

### 5.2 重试动作已经与报告查看分离

位置：

- `apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue`

当前行为：

- `查看决策报告`：展开 `expandedReportStepId`。
- `重试`：仅在 failed step 区域显示，并触发 `retry`。

判断：

通过。

### 5.3 自动驾驶 UI 不再展示需要人工关注状态

位置：

- `apps/web/src/features/autonomous-writing`

判断：

通过。

说明：

`needs_attention` 已从扫描中消失。

## 6. 运维覆盖语义

### 6.1 `manual_required` 已替换

位置：

- `packages/shared/src/types/autonomous-writing.ts`
- `apps/api/src/db/schema/postprocess.ts`

当前语义：

```ts
operator_override_required
```

判断：

通过。

说明：

新的命名表示“运维覆盖需要”，不再表示作者在写作主流程里手动确认。

## 7. 工程门禁

执行命令：

```bash
pnpm check
```

结果：

```text
通过
```

包含：

- lint
- typecheck
- build
- test

判断：

通过。

## 8. 当前最终结论

当前可以判定：

```text
全自动主流程：已实现
旧半自动主链路：已删除
旧半自动关键词扫描：0 命中
前端确认 / 驳回入口：已删除
后端等待人工状态：已删除
shared 合同：已切换到自动化状态模型
pnpm check：通过
```

## 9. 仍建议补充的真实流程验收

虽然代码层面已经通过，但仍建议补一次真实端到端冒烟：

1. 创建测试小说项目。
2. 配置 AI。
3. 创建至少 3 个章节。
4. 启动自动驾驶 Run。
5. 不进行任何人工确认。
6. 验证章节自动推进。
7. 验证正文写回。
8. 验证变更集应用。
9. 验证章后分析生成结构化建议。
10. 验证低风险建议自动应用。
11. 验证高风险章节会隔离或跳过。
12. 验证下一章上下文包含上一章记忆、人物关系、矛盾、伏笔和事实。

该冒烟不是当前代码验收的阻塞项，但它是产品上线前的最终体验验收。

## 10. 最终判定

本轮判定：

> 已达到全自动化代码层验收标准。非自动化主链路已经从主业务代码中删除。

