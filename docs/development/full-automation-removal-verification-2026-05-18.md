# 全自动化与非自动化内容移除验收报告（2026-05-18）

## 1. 验收口径

本次检查只判断“全自动写作主流程是否已经成立、半自动内容是否已经从主链路删除”。暂不把格式、lint、测试作为主要结论依据。

检查范围：

- `apps/api/src`
- `apps/web/src`
- `packages/shared/src`

核心扫描命令：

```bash
rg -n "waiting_review|needs_attention|approveStep|rejectStep|确认继续|驳回|人工确认|手动确认|reviewRequired|autoApprovalLevel|confirm_plan|confirm_apply|confirm_suggestions|review_change_set|writing-job-auto-approval|shouldPause" apps/api/src apps/web/src packages/shared/src
```

## 2. 总体结论

当前还不能判定为“已实现完整全自动化”，非自动化内容也还没有删除干净。

已经完成的部分：

- 旧的 `writing-job-auto-approval.service.ts` 已删除。
- 主步骤名已从 `confirm_plan / review_change_set / confirm_suggestions` 部分迁移到：
  - `validate_plan`
  - `evaluate_change_set`
  - `classify_suggestions`
- 自动驾驶失败分支已经更接近正确流程：单章失败后会尝试隔离并继续下一章。
- `resolveAutonomousException` 已不再直接调用 `approveStep`，而是重置失败 / 隔离 Job 后重新进入自动运行。
- 自动决策服务已支持：
  - `continue`
  - `repair`
  - `isolate`
  - `skip`
  - `stop_run`

仍未完成的部分：

- shared 类型仍保留 `waiting_review`、`needs_attention`、`reviewRequired`、`autoApprovalLevel`。
- API 和 store 仍暴露 `approveStep` / `rejectStep`。
- 普通写作任务面板仍展示“确认继续 / 驳回”。
- `writing-job.service.ts` 仍存在 manual 分支，可写入 `waiting_review`。
- `autonomous-writing.service.ts` 仍有 `waiting_review` 兼容分支。
- `AutonomousRunControlBar` / `useAutonomousRun` 仍把 `needs_attention` 作为可见状态处理。

因此当前状态应定义为：

> 自动驾驶主线已明显推进，但半自动合同层和普通任务入口仍未清理，系统仍处于“自动化优先 + 半自动兼容残留”的过渡态。

## 3. 关键残留问题

### P1. Shared 合同仍允许半自动状态

位置：

- `packages/shared/src/types/writing-job.ts`
- `packages/shared/src/types/autonomous-writing.ts`
- `packages/shared/src/types/writing-job-step.ts`

残留：

```ts
WritingJobStatus = 'waiting_review'
AutonomousRunStatus = 'needs_attention'
AutonomousRunJob.status = 'waiting_review'
WritingJobStep.reviewRequired
WritingJob.autoApprovalLevel
```

影响：

即使后端主流程避免写入这些值，前端和其他服务仍会把它们当成合法状态。只要合同不清理，后续功能就会继续围绕“等待审查 / 自动批准等级”扩展，系统无法真正转向全自动。

建议：

- `WritingJobStatus` 删除 `waiting_review`。
- `AutonomousRunStatus` 删除 `needs_attention`。
- `AutonomousRunJob.status` 删除 `waiting_review`。
- `WritingJobStep` 删除 `reviewRequired`。
- `WritingJob` 删除 `autoApprovalLevel`，统一使用 Run 的 `strategy` 或 `riskPolicy`。

### P1. 后端仍保留人工批准 / 驳回服务

位置：

- `apps/api/src/services/writing-job.service.ts`
- `apps/api/src/routes/writing-jobs.ts`

残留：

```ts
approveStep()
rejectStep()
/steps/:stepId/approve
/steps/:stepId/reject
```

影响：

这些接口仍然是产品 API 的一部分，并且普通前端 store 仍可调用。它们不是“全自动异常运维”，而是旧半自动写作的核心动作。

建议：

短期：

- 从主产品 API 中移除调用入口。
- 如果必须保留，迁移到 `/api/debug/...` 或 `/api/admin/...`。

长期：

- 删除 `approveStep` / `rejectStep`。
- 异常处理只保留：
  - 重新运行当前 Job
  - 跳过当前章节
  - 隔离当前章节
  - 停止整轮 Run

### P1. 普通写作任务 UI 仍是半自动交互

位置：

- `apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue`
- `apps/web/src/features/writing-jobs/composables/useWritingJobController.ts`
- `apps/web/src/stores/writing-job.store.ts`
- `apps/web/src/api/writing-jobs.ts`

残留：

- “确认继续”
- “驳回”
- `approveStep`
- `rejectStep`
- `job.status === 'waiting_review'`
- `step.reviewRequired`
- `autoDecision === 'paused'`

影响：

自动驾驶详情页虽然传了 `read-only`，但普通写作任务面板仍然保留旧半自动操作。这会让产品出现两套体验：一个页面说自动驾驶，一个页面仍要求逐步确认。

建议：

- 普通任务面板也改成只读自动决策时间线。
- 操作按钮改为：
  - 查看决策报告
  - 查看修复记录
  - 重新运行本章
  - 跳过本章
  - 停止任务
- 删除“确认继续 / 驳回”。

### P1. `writing-job.service.ts` 仍可能写入 `waiting_review`

位置：

- `apps/api/src/services/writing-job.service.ts`

当前逻辑：

```ts
if (job.executionMode === 'manual') {
  await updateJobStatus(jobId, 'waiting_review', decision.reason)
  return
}
```

影响：

只要创建 Job 时仍允许 `executionMode = manual`，系统就不是纯全自动。即使自动驾驶 Run 不走该分支，项目仍保留半自动运行模式。

建议：

- 如果目标是彻底去半自动，删除 `manual` 模式。
- 如果仍要保留调试能力，改名为 `debug_manual`，并从普通产品入口隐藏。
- 主流程不可写入 `waiting_review`。

### P2. `autonomous-writing.service.ts` 仍有 `waiting_review` 兼容分支

位置：

- `apps/api/src/services/autonomous-writing.service.ts`

当前情况：

`waiting_review` 分支已变成 safety net，会自动隔离章节并继续 Run。这比之前正确，但类型签名和分支仍保留：

```ts
status: 'completed' | 'failed' | 'waiting_review' | 'isolated'
```

建议：

- 删除 `waiting_review` 参数类型。
- 删除该分支。
- 如果历史数据需要兼容，单独写 migration / legacy adapter，不放在主服务里。

### P2. `needs_attention` 仍是前端可见状态

位置：

- `apps/web/src/features/autonomous-writing/components/AutonomousRunControlBar.vue`
- `apps/web/src/features/autonomous-writing/composables/useAutonomousRun.ts`
- `packages/shared/src/types/autonomous-writing.ts`

影响：

用户仍可能看到“需要关注”这种旧半自动状态。全自动模式下，更合适的表达应该是：

- 运行中
- 已暂停（用户主动）
- 已完成
- 已失败
- 有隔离章节

建议：

- 删除 `needs_attention`。
- 用 `failed` 或 `completed_with_isolations` 表达系统状态。
- 隔离章节数量通过统计展示，不作为 Run 阻塞状态。

## 4. 当前已经正确的方向

以下改动方向是正确的，应继续保留：

- 删除旧 `writing-job-auto-approval.service.ts`。
- 使用 `auto-decision.service.ts` 作为统一决策器。
- 使用 `validate_plan` 代替 `confirm_plan`。
- 使用 `evaluate_change_set` 代替 `review_change_set`。
- 使用 `classify_suggestions` 代替 `confirm_suggestions`。
- 单章失败时隔离并继续下一章。
- critical 风险使用 `stop_run`。
- 异常恢复改为重新运行 Job，而不是批准某个旧步骤。

## 5. 下一步必须修改的顺序

### 第一步：删除主产品人工入口

修改：

- 删除前端普通产品里的“确认继续 / 驳回”。
- 删除 `writing-job.store.ts` 中的 `approveStep` / `rejectStep`。
- 删除 `api/writing-jobs.ts` 中的 `approveStep` / `rejectStep`。

保留策略：

如果还需要调试入口，新建 debug API，不复用主产品命名。

### 第二步：删除 manual execution mode

修改：

- `WritingJobExecutionMode` 只保留 `auto`，或删除该字段。
- 创建 Job 时不再允许传 `manual`。
- `writing-job.service.ts` 删除写入 `waiting_review` 的 manual 分支。

### 第三步：清理 shared 类型

修改：

- 删除 `WritingJobStatus.waiting_review`。
- 删除 `AutonomousRunStatus.needs_attention`。
- 删除 `AutonomousRunJob.status.waiting_review`。
- 删除 `WritingJobStep.reviewRequired`。
- 删除 `AutoApprovalLevel` / `autoApprovalLevel`。

### 第四步：清理后端兼容分支

修改：

- `handleAutonomousJobCompletion` 删除 `waiting_review` 参数和分支。
- `hasActiveBlockers` 不再检查 `waiting_review`。
- `pause/resume` 只表示用户主动暂停。
- 异常队列只记录隔离和失败，不阻塞 Run。

### 第五步：迁移 seed 和历史数据

修改：

- `apps/api/src/scripts/seed.ts` 删除 `waiting_review` 示例数据。
- 如果数据库历史中有旧状态，写迁移：
  - `waiting_review` -> `isolated`
  - `needs_attention` -> `failed` 或 `paused`
  - `reviewRequired = true` -> `autoDecision = 'isolated'`

## 6. 验收标准

完成后再次运行：

```bash
rg -n "waiting_review|needs_attention|approveStep|rejectStep|确认继续|驳回|人工确认|手动确认|reviewRequired|autoApprovalLevel|confirm_plan|confirm_apply|confirm_suggestions|review_change_set|writing-job-auto-approval|shouldPause" apps/api/src apps/web/src packages/shared/src
```

理想结果：

- 主业务代码 0 命中。
- 只允许历史迁移脚本或明确 debug/admin 文件命中。

流程验收：

1. 启动自动驾驶 Run。
2. 不点击任何确认按钮。
3. 系统自动生成大纲 / 场景 / 正文。
4. 中低风险自动继续。
5. 高风险自动修复。
6. 修复失败自动隔离当前章。
7. Run 自动继续下一章。
8. critical 错误才停止整轮 Run。
9. 前端只展示决策、修复、隔离、失败，不展示确认 / 驳回。

## 7. 最终判断

当前版本不应标记为“全自动化完成”。

更准确的状态是：

> 自动驾驶主流程接近完成，但半自动合同、API 和 UI 入口仍未清理。下一步应优先删除 `waiting_review / needs_attention / approveStep / rejectStep / reviewRequired / autoApprovalLevel` 这些旧语义。

