# 全自动写作差距检查与半自动内容移除计划（2026-05-18）

## 1. 检查结论

当前项目已经具备“自动写作”的主要骨架：自动驾驶 Run、章节 Job、上下文构建、正文生成、变更集、一致性检查、自动修复、章后管线、健康指标和异常隔离都已经存在。

但它还没有进入“纯全自动写作”状态。核心原因是：旧的半自动写作任务模型仍然保留在共享类型、后端步骤序列、前端任务面板和 API 路由中。当前系统更准确地说是：

> 自动化主流程 + 半自动确认兼容层 + 部分人工审查兜底。

距离目标状态大约还差 25% - 35%。其中最大差距不是 AI 生成能力，而是流程语义尚未统一：系统一边说全自动，一边仍把“确认计划 / 确认建议 / 等待审查 / 手动批准”作为一等流程节点。

## 2. 目标状态

后续版本应明确转向全自动写作：

- 用户只配置项目目标、题材、总字数、章节范围、风险策略和 AI 模型。
- 系统自动执行：大纲 -> 场景 -> 正文 -> 一致性检查 -> 自动修复 -> 写入正文 -> 章后抽取 -> 确认区结构化应用 -> 健康指标更新 -> 下一章。
- 人工不再参与每一步确认。
- 高风险内容不进入“等待人工确认”，而是进入自动修复、隔离、跳过、停止运行等机器可处理状态。
- 人工入口只保留为“异常运维 / 调试覆盖”，不能再作为产品主链路。

## 3. 主要发现

### P1. 写作任务步骤仍保留半自动确认节点

位置：

- `packages/shared/src/types/writing-job-step.ts`
- `apps/api/src/services/writing-job.service.ts`
- `apps/api/src/db/schema/ai.ts`

当前仍存在：

- `confirm_plan`
- `confirm_apply`
- `confirm_suggestions`
- `review_change_set`
- `reviewRequired`
- `CONFIRM_STEPS`

问题：

这些节点从命名和行为上都表示“等待人确认”。即使 `executionMode === 'auto'` 时可以跳过，它们仍然污染状态机、UI 文案和异常处理逻辑。后续任何功能接入写作任务时，都可能误以为需要进入人工确认。

目标：

将确认节点改造成自动审查节点：

- `confirm_plan` -> `validate_plan`
- `confirm_apply` -> 删除，改由 `apply_change_set` 或 `apply_draft` 承担写入
- `confirm_suggestions` -> `classify_suggestions`
- `review_change_set` -> `evaluate_change_set`
- `reviewRequired` -> `decisionAction` / `decisionStatus`

### P1. Run 和 Job 状态仍有等待人工审查语义

位置：

- `packages/shared/src/types/writing-job.ts`
- `packages/shared/src/types/autonomous-writing.ts`
- `apps/api/src/db/schema/ai.ts`
- `apps/api/src/services/autonomous-writing.service.ts`
- `apps/api/src/services/writing-job.service.ts`

当前仍存在：

- `waiting_review`
- `needs_attention`
- `paused`
- `approveStep`
- `rejectStep`

问题：

`waiting_review` 和 `needs_attention` 会让自动驾驶 Run 停下来，等待人工处理。这和“全自动写作”目标冲突。未来应该只有自动化可恢复状态和不可恢复状态，而不是主流程等待人工判断。

目标状态：

Run 状态建议收敛为：

- `idle`
- `running`
- `auto_repairing`
- `isolated`
- `completed`
- `failed`
- `cancelled`

Job 状态建议收敛为：

- `idle`
- `running`
- `repairing`
- `isolated`
- `completed`
- `failed`
- `skipped`

人工处理不再改变主流程状态，只能作为异常后台操作记录到 audit log。

### P1. 前端仍暴露“确认继续 / 驳回”

位置：

- `apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue`
- `apps/web/src/features/autonomous-writing/components/AutonomousJobDetailModal.vue`
- `apps/web/src/api/writing-jobs.ts`
- `apps/web/src/stores/writing-job.store.ts`

当前问题：

任务详情面板仍显示：

- “确认继续”
- “驳回”
- `approveStep`
- `rejectStep`

这会让作者误以为全自动流程仍需要人工逐步确认，也会继续鼓励开发者保留半自动分支。

目标：

产品 UI 删除这两个按钮。替换为：

- “查看决策报告”
- “查看自动修复记录”
- “隔离原因”
- “重新运行本章”
- “跳过本章”
- “停止全书任务”

其中“重新运行 / 跳过 / 停止”属于运维动作，不是正常写作链路的一部分。

### P1. `writing-job-auto-approval.service.ts` 是旧半自动决策服务

位置：

- `apps/api/src/services/writing-job-auto-approval.service.ts`

当前问题：

该服务仍然以 `shouldPause`、`approved`、`半自动执行策略要求人工确认` 为核心语义。它和新的 `auto-decision.service.ts` 并存，会造成两套决策系统：

- 旧系统：自动批准 / 暂停等待人
- 新系统：继续 / 修复 / 隔离 / 跳过 / 停止

目标：

删除或完全废弃 `writing-job-auto-approval.service.ts`。所有写作任务决策统一走：

- `auto-decision.service.ts`
- `auto-repair.service.ts`
- `autonomous-writing.service.ts`
- `autonomousRunExceptions`

### P1. Fast 策略当前会放行 critical 风险

位置：

- `apps/api/src/services/auto-decision.service.ts`

当前逻辑：

`fast` 策略直接 `return 'continue'`，注释却写着“除非崩溃”。

问题：

如果风险已经是 `critical`，fast 仍继续，可能把严重偏题、结构破坏或 AI 调用错误继续写入正文。

目标：

任何策略下：

- `critical` -> `stop_run`
- `high` -> `repair` 或 `isolate`
- 只有 `none / low / medium` 才允许根据策略自动通过

### P1. 失败步骤仍等待手动 retry

位置：

- `apps/api/src/services/writing-job.service.ts`

当前逻辑：

当 step 状态为 `failed`，`runNextSteps` 直接 `return // Wait for manual retry`。

问题：

全自动写作中，失败后应该先进入自动修复或隔离，不应该直接等待用户手动重试。

目标：

失败处理顺序：

1. 判断错误类型。
2. 可修复错误进入 `auto_repair`。
3. 不可修复但不影响全书时隔离本章。
4. 致命错误停止 Run。
5. 全部写入异常日志和健康页，不进入人工确认状态。

### P2. 数据库字段仍保留旧语义

位置：

- `apps/api/src/db/schema/ai.ts`

当前仍有：

- `autoApprovalLevel`
- `reviewRequired`
- `waiting_review`
- `needs_attention`
- 确认类 step type

目标：

先做兼容迁移，再做清理迁移：

1. 新增新字段：`decision_action`、`decision_status`、`risk_level`、`automation_mode`。
2. 读写新字段，旧字段只读兼容。
3. 跑数据迁移，把旧状态映射到新状态。
4. 删除旧字段和旧枚举。

## 4. 推荐改造顺序

### 阶段 1：冻结半自动入口

目标：不再让新功能继续依赖旧半自动接口。

修改：

- 产品 UI 隐藏 `approveStep` / `rejectStep`。
- `WritingJobStepTimeline` 移除“确认继续 / 驳回”主按钮。
- `AutonomousJobDetailModal` 只展示自动决策、风险、修复、隔离结果。
- API 路由保留 `/approve` 和 `/reject`，但标记为 debug-only，并限制只在开发模式或管理员模式使用。

验收：

```bash
rg -n "确认继续|驳回|approveStep|rejectStep" apps/web/src
```

主产品 UI 不应再命中。

### 阶段 2：重命名并替换步骤语义

目标：把“确认节点”改造成“自动审查节点”。

修改：

- `confirm_plan` -> `validate_plan`
- `review_change_set` -> `evaluate_change_set`
- `confirm_suggestions` -> `classify_suggestions`
- 删除 `confirm_apply`
- `apply_draft` 只保留在没有变更集的兼容路径；主路径统一使用 `apply_change_set`

需要同步修改：

- `packages/shared/src/types/writing-job-step.ts`
- `apps/api/src/db/schema/ai.ts`
- `apps/api/src/services/writing-job.service.ts`
- `apps/web/src/features/writing-jobs/composables/useWritingJobController.ts`
- `apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue`
- 相关迁移文件

验收：

```bash
rg -n "confirm_plan|confirm_apply|confirm_suggestions|review_change_set" apps/api/src apps/web/src packages/shared/src
```

除迁移兼容脚本外，不应命中业务代码。

### 阶段 3：统一自动决策引擎

目标：所有步骤都通过同一个自动决策模型决定下一步。

修改：

- 删除 `writing-job-auto-approval.service.ts`。
- `runNextSteps` 不再返回 `waiting_review`。
- `decideNextAction` 输出统一动作：
  - `continue`
  - `repair`
  - `isolate`
  - `skip`
  - `stop_run`
- `critical` 风险任何策略都必须 `stop_run`。
- `failed` 步骤不等待手动 retry，转入自动修复或隔离。

验收：

```bash
rg -n "writing-job-auto-approval|shouldPause|waiting_review|needs_attention|reviewRequired" apps/api/src packages/shared/src
```

除迁移兼容外，不应命中主流程。

### 阶段 4：Run 编排改为不可人工阻塞

目标：全书自动写作不能因为单章问题停死。

修改：

- `handleAutonomousJobCompletion` 移除 `waiting_review` 分支。
- 高风险变更集：
  - safe：自动修复，失败则隔离本章并继续下一章。
  - balanced：自动修复一次，失败隔离。
  - fast：低中风险直接通过，高风险隔离，critical 停止。
- `autonomousRunExceptions` 只记录异常，不再要求人解决后才能继续。
- 健康页展示“被隔离章节”“自动修复次数”“未应用建议”，不阻塞写作。

验收：

创建 3 章自动写作任务，其中 1 章故意制造高风险。期望：

- Run 继续执行后续章节。
- 高风险章节变为 `isolated` 或 `skipped`。
- Run 最终 `completed` 或 `completed_with_isolations`，不应停在 `needs_attention`。

### 阶段 5：前端改为自动驾驶监控台

目标：从“操作流程”转为“观察自动系统”。

修改：

- 自动驾驶页显示：
  - 当前运行章节
  - 当前步骤
  - 自动决策
  - 风险等级
  - 修复动作
  - 隔离原因
  - 已完成章节
  - 已跳过章节
- 删除面向正常用户的逐步确认。
- 保留调试面板，但明确标记“开发调试 / 手动覆盖”。

验收：

用户启动自动写作后，不需要点击任何确认按钮，能看到任务自动推进。

### 阶段 6：清理旧合同和迁移旧数据

目标：代码库不再把半自动作为一等能力。

修改：

- 删除共享类型中的旧 step/status。
- 删除旧 API 或迁移到 `/debug/writing-jobs/...`。
- 删除 `autoApprovalLevel`，改为 `runStrategy` / `riskPolicy`。
- 数据库迁移旧值：
  - `waiting_review` -> `isolated`
  - `needs_attention` -> `isolated` 或 `failed`
  - `confirm_*` -> 新 step type
  - `reviewRequired = true` -> `decision_status = isolated`

验收：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

同时运行：

```bash
rg -n "confirm_plan|confirm_apply|confirm_suggestions|review_change_set|waiting_review|needs_attention|人工确认|确认继续|驳回|reviewRequired|autoApprovalLevel" apps/api/src apps/web/src packages/shared/src
```

主业务代码不应命中。

## 5. 保留人工能力的正确方式

全自动并不等于完全不能人工干预。正确边界是：

- 正常写作链路：自动推进。
- 异常运维链路：允许用户在健康页或调试页手动处理。
- 人工操作必须有审计记录，不能伪装成正常流程步骤。

建议保留这些人工能力：

- 停止整轮自动写作
- 暂停整轮自动写作
- 重新运行某章
- 跳过某章
- 恢复隔离章节
- 查看并手动应用某条结构化建议

不建议保留：

- 每章确认大纲
- 每章确认正文
- 每章确认建议
- 每个步骤确认继续

## 6. 后续验收样例

使用测试项目《镜中城回声》跑一轮 5 章自动写作：

1. 启动全自动 Run。
2. 系统自动生成或补全章节大纲。
3. 系统按章节生成场景。
4. 系统生成正文。
5. 系统一致性检查。
6. 中低风险自动通过。
7. 高风险自动修复。
8. 修复失败隔离当前章并继续下一章。
9. 章后抽取角色、关系、伏笔、事实、矛盾变化。
10. 低风险建议自动应用，高风险建议进入隔离建议池。
11. 健康页显示全书偏题、人物跑偏、伏笔遗忘、关系断裂、节奏问题。
12. 全流程结束时，不出现“等待审查”状态。

## 7. 当前不建议立刻删除的内容

为避免破坏已有数据和开发调试能力，以下内容应先隐藏、废弃，再迁移删除：

- `/steps/:stepId/approve`
- `/steps/:stepId/reject`
- `approveStep`
- `rejectStep`
- `waiting_review`
- `needs_attention`
- `reviewRequired`
- `autoApprovalLevel`

推荐策略：

1. 第一版：保留 API，前端主产品不再调用。
2. 第二版：API 迁移到 debug namespace。
3. 第三版：数据迁移完成后删除旧类型和旧字段。

## 8. 完成定义

只有满足以下条件，才能认为“全自动写作搭建完成”：

- 启动自动写作后，用户不需要逐章确认。
- 主流程中没有 `waiting_review`。
- 主产品 UI 中没有“确认继续 / 驳回”。
- 高风险内容不会污染正文，会被自动修复、隔离或停止。
- 章后结构化建议可以自动分级处理。
- 下一章写作会自动读取上一章记忆、角色变化、关系变化、伏笔、事实图谱和健康指标。
- `pnpm check`、`pnpm db:migrate` 通过。

