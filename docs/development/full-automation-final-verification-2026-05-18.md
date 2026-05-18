# 全自动化最终验收检查报告（2026-05-18）

## 1. 验收目标

本次检查目标：

- 确认全自动写作主流程是否成立。
- 确认旧半自动内容是否已经从主业务代码删除。
- 标记仍需收尾的流程风险。
- 暂不把 lint / 格式问题作为主流程失败依据，但会记录。

检查范围：

- `apps/api/src`
- `apps/web/src`
- `packages/shared/src`

## 2. 旧半自动关键词扫描

执行命令：

```bash
rg -n "waiting_review|needs_attention|approveStep|rejectStep|确认继续|驳回|人工确认|手动确认|reviewRequired|autoApprovalLevel|confirm_plan|confirm_apply|confirm_suggestions|review_change_set|writing-job-auto-approval|shouldPause" apps/api/src apps/web/src packages/shared/src
```

结果：

```text
0 命中
```

结论：

旧半自动主语义已经从主业务代码中清除。相比上一轮，以下内容已经删除或迁移完成：

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

## 3. 当前全自动主流程状态

### 3.1 Step 序列已切换为自动化语义

位置：

- `apps/api/src/services/writing-job.service.ts`
- `packages/shared/src/types/writing-job-step.ts`

当前步骤：

```text
prepare_context
generate_plan
validate_plan
generate_draft
generate_scene_draft
build_change_set
evaluate_change_set
auto_repair
apply_change_set
postprocess
classify_suggestions
apply_suggestions
update_health
done
```

判断：

通过。旧确认型步骤已经替换成自动验证、自动评估和自动分类。

### 3.2 Job 状态已移除等待人工审查

位置：

- `packages/shared/src/types/writing-job.ts`

当前状态：

```ts
export type WritingJobStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'isolated'
```

判断：

通过。`waiting_review` 已删除。

### 3.3 Run 状态已移除需要人工关注

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

通过。`needs_attention` 已删除。

### 3.4 Run Job 状态已移除等待审查

位置：

- `packages/shared/src/types/autonomous-writing.ts`

当前状态：

```ts
status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'isolated'
```

判断：

通过。章节级任务可以失败、跳过或隔离，不再等待人工审查。

### 3.5 写作任务创建已固定为自动模式

位置：

- `apps/api/src/routes/writing-jobs.ts`

当前逻辑：

```ts
executionMode: 'auto'
```

判断：

通过。主 API 不再允许前端传入半自动模式。

### 3.6 自动驾驶失败 / 隔离后的续跑逻辑已成立

位置：

- `apps/api/src/services/autonomous-writing.service.ts`

当前行为：

- `completed`：更新完成计数，然后继续下一章。
- `isolated`：标记章节任务隔离，然后继续下一章。
- `failed`：记录异常；如果 Run 仍是 running，则继续下一章。

判断：

基本通过。单章失败不会默认阻断整轮 Run，已经符合全自动写作主流程。

## 4. 仍需收尾的问题

### P1. “查看决策报告”按钮实际触发 retry

位置：

- `apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue`

当前代码：

```vue
<NButton
  size="sm"
  @click="emit('retry', step.id)"
>
  <BookOpen :size="12" class="mr-1" /> 查看决策报告
</NButton>
```

问题：

按钮文案是“查看决策报告”，但点击后触发的是 `retry`。这不是半自动残留，但会破坏自动驾驶监控台语义：用户以为只是查看报告，实际可能重跑步骤。

建议：

- 新增 `view-report` 事件。
- 或将按钮文案改成“重新运行步骤”。
- 如果要查看报告，应打开只读详情面板，不应触发重试。

### P2. 异常类型仍保留 `manual_required`

位置：

- `packages/shared/src/types/autonomous-writing.ts`

当前代码：

```ts
export type AutonomousExceptionType
  = | 'consistency_blocked'
    | 'high_risk_change_set'
    | 'apply_failed'
    | 'ai_failed'
    | 'health_regression'
    | 'manual_required'
```

问题：

虽然严格旧半自动扫描已经通过，但 `manual_required` 仍是“需要人工”的旧语义。全自动模式中更合适的表达是：

- `auto_isolated`
- `requires_operator_override`
- `unrecoverable`

如果保留，也应该表示“运维覆盖”，而不是“作者确认”。

建议：

把 `manual_required` 改名为：

```ts
'operator_override_required'
```

并确认它只用于 debug/admin 运维，不进入正常写作流程。

### P2. `CONFIRM_STEPS` 命名仍旧，但语义已变

位置：

- `apps/api/src/services/writing-job.service.ts`
- `apps/web/src/features/writing-jobs/composables/useWritingJobController.ts`

当前包含：

```ts
validate_plan
consistency_check
classify_suggestions
evaluate_change_set
```

问题：

这些已经不是人工确认步骤，但常量仍叫 `CONFIRM_STEPS`。这会误导后续开发继续引入“确认点”语义。

建议：

重命名为：

```ts
DECISION_REPORT_STEPS
```

或：

```ts
CHECKPOINT_STEPS
```

## 5. 门禁检查记录

执行命令：

```bash
pnpm check
```

结果：

失败，原因是 lint / import / unused 类问题：

- `apps/api/src/db/schema/ai.ts`
  - `boolean` 未使用。
- `apps/api/src/services/postprocess-suggestion.service.ts`
  - import 顺序不符合规则。
- `apps/api/src/services/writing-job.service.ts`
  - `applyAcceptedSuggestions` 未使用。
  - `job` 参数未使用。
  - `antfu/consistent-chaining` 链式格式问题。

判断：

这些不影响“全自动主流程是否成立”的结论，但在正式验收前必须修复。

## 6. 当前结论

从流程语义看：

> 当前项目已经基本进入全自动写作流程。

旧半自动主链路已经被移除：

- 没有等待人工审查状态。
- 没有确认 / 驳回按钮。
- 没有 approve / reject API。
- 没有半自动 approval service。
- Job 创建固定为 auto。
- 单章失败会隔离 / 失败记录，并由 Run 继续推进。

但还不能标记为最终完成，因为还有两个流程收尾项：

1. “查看决策报告”按钮不能触发 retry。
2. `manual_required`、`CONFIRM_STEPS` 等旧命名需要清理，避免后续开发误用。

## 7. 建议最终收尾顺序

### 第一步：修正决策报告按钮

- `查看决策报告` 不再 emit `retry`。
- 新增只读报告面板。
- 重试按钮单独命名为 `重新运行步骤`。

### 第二步：清理旧命名

- `manual_required` -> `operator_override_required`。
- `CONFIRM_STEPS` -> `CHECKPOINT_STEPS` 或 `DECISION_REPORT_STEPS`。

### 第三步：修复 lint 门禁

修复未使用 import、import 顺序和链式格式。

### 第四步：跑完整门禁

```bash
pnpm check
```

### 第五步：跑真实流程冒烟

创建一个 3 章自动驾驶 Run，验证：

1. 无需用户确认。
2. 章节能自动推进。
3. 正文能写入。
4. 章后建议能分类和应用。
5. 高风险章节能隔离。
6. Run 能继续下一章。

## 8. 最终判定

当前判定：

```text
全自动主流程：基本完成
非自动化主链路：已清除
遗留问题：少量命名和 UI 动作语义需要收尾
工程门禁：暂未通过
```

