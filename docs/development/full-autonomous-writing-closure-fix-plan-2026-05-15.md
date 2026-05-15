# 全自动写作闭环修复计划（2026-05-15）

## 目标

将当前“可创建自动驾驶任务、可执行部分写作步骤”的实现，修复为真正可稳定跑完的全自动写作闭环：

```text
选择章节范围
-> 创建自动驾驶 Run
-> 按章节创建 Writing Job
-> 构建上下文
-> 生成正文
-> 构建变更集
-> 一致性审查
-> 自动审批 / 自动修复 / 异常入队
-> 应用变更集
-> 更新结构化记忆与健康指标
-> 继续下一章
-> 完成整轮自动写作
```

当前 `pnpm check` 和 `pnpm db:migrate` 可以通过，但数据库结构和运行状态机仍存在闭环问题。以下修复必须按顺序完成。

## 当前问题

### P0. 自动化异常表缺少迁移字段

**影响文件**

- `apps/api/src/db/schema/postprocess.ts`
- `apps/api/drizzle/*.sql`
- `apps/api/src/services/autonomous-writing.service.ts`

**问题**

`autonomousRunExceptions` schema 已包含：

- `writingJobId`
- `stepId`

但当前 PostgreSQL 表 `autonomous_run_exceptions` 没有对应的 `writing_job_id` / `step_id` 列。自动写作进入人工审查或失败时，`recordAutonomousException()` 会插入不存在的列，导致整条自动化流程中断。

**修复要求**

1. 新增 Drizzle 迁移：
   - 给 `autonomous_run_exceptions` 增加 `writing_job_id text`
   - 给 `autonomous_run_exceptions` 增加 `step_id text`
   - 增加外键：
     - `writing_job_id -> writing_jobs.id ON DELETE SET NULL`
     - `step_id -> writing_job_steps.id ON DELETE SET NULL`
2. 迁移必须可重复在当前本地库上执行。
3. 不要手写只适配本地数据库状态的临时 SQL。

**验收**

```bash
pnpm db:migrate
source .env && psql "$DATABASE_URL" -c "\d autonomous_run_exceptions"
```

表结构中必须能看到 `writing_job_id` 和 `step_id`。

### P1. 自动修复步骤拿不到一致性报告

**影响文件**

- `apps/api/src/services/writing-job.service.ts`
- `apps/api/src/services/auto-repair.service.ts`
- `apps/api/src/services/chapter-change-set.service.ts`

**问题**

`executeBuildChangeSet()` 当前输出只包含：

```json
{
  "changeSetId": "...",
  "riskLevel": "...",
  "overallStatus": "..."
}
```

但 `auto_repair` 步骤读取的是：

```ts
buildOutput.consistencyReport
```

正常情况下它拿不到一致性报告，只能被跳过或失败，无法真正自动修复正文。

**修复要求**

选择一种稳定方案：

1. 推荐方案：`auto_repair` 通过 `changeSetId` 读取 `chapter_change_sets.consistencyReportJson`。
2. 可接受方案：`executeBuildChangeSet()` 把 `consistencyReport` 写入 step output。

注意：

- 不要把大段正文重复塞进多个 step output。
- `auto_repair` 必须拿到完整一致性报告，包括 `overallStatus`、风险项、blocked/warning 说明。

**验收**

构造一个中风险 change set，自动驾驶应进入 `auto_repair`，并能生成修复后的 draft，而不是显示 `No consistency report found`。

### P1. 自动修复状态机可能递归重跑并卡死

**影响文件**

- `apps/api/src/services/writing-job.service.ts`

**问题**

当前 `review_change_set` 中风险时会：

1. 重置 `build_change_set` / `review_change_set`
2. 递归调用 `runNextSteps(projectId, jobId)`

但 `auto_repair` 在步骤顺序中排在 `review_change_set` 后面。重跑时会再次先进入 `review_change_set`，可能反复递归，无法稳定进入修复步骤。

**修复要求**

调整自动修复流程为确定性状态机：

1. `review_change_set` 判断中风险且允许自动修复时：
   - 将 `auto_repair` 标记为 `pending`
   - 不要递归调用 `runNextSteps()`
   - 直接返回，让外层流程继续到 `auto_repair`
2. `auto_repair` 成功后：
   - 更新 `generate_draft` 的 draft 输出
   - 清空旧 change set 或生成新的 change set
   - 重新执行 `build_change_set` 和 `review_change_set`
3. 每个 job 最多自动修复一次或有限次数：
   - 建议新增 `repairAttemptCount`
   - 超过次数后进入异常队列，不再无限重试

**验收**

自动驾驶遇到中风险正文时，步骤顺序应为：

```text
generate_draft
-> build_change_set
-> review_change_set
-> auto_repair
-> build_change_set
-> review_change_set
-> apply_change_set
```

不能递归堆栈，不能重复创建无限 repair step。

### P1. 异常处理后 Run 状态不会可靠恢复

**影响文件**

- `apps/api/src/services/autonomous-writing.service.ts`

**问题**

`resolveAutonomousException()` 当前先把异常标记为 `resolved`，再调用 `approveStep()`。

风险：

1. 如果 `approveStep()` 失败，异常已经被标记为已解决。
2. 如果 `approveStep()` 成功，底层 job 可能继续执行，但 run 状态仍可能停留在 `needs_attention`，前端轮询不会继续。

**修复要求**

1. 先读取异常，校验状态必须是 `open`。
2. 如果异常绑定 `writingJobId + stepId`：
   - 先把 run 状态恢复为 `running`
   - 调用 `approveStep()`
   - approve 成功后再把异常标记为 `resolved`
3. 如果 approve 失败：
   - run 保持 `needs_attention`
   - 异常保持 `open`
   - 返回明确错误
4. 只有当当前 run 没有其他 open critical/high 异常时，才允许继续执行下一章。

**验收**

在自动驾驶 `needs_attention` 状态下点击“批准继续”：

- 异常从 `open` 变为 `resolved`
- run 从 `needs_attention` 变为 `running` 或继续推进到 `completed`
- 前端能继续轮询，不需要刷新整页

### P1. 自动驾驶页运行中缺少暂停/恢复入口

**影响文件**

- `apps/web/src/views/AutopilotView.vue`
- `apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue`

**问题**

`AutopilotView.vue` 只有在无 run 或 run 已完成/失败时才渲染 `AutonomousRunLauncher`。但暂停、恢复、新建下一轮等控制入口在 `AutonomousRunLauncher` 内部，导致运行中看不到这些操作。

**修复要求**

1. 将运行控制区抽成独立组件，例如：
   - `AutonomousRunControlBar.vue`
2. 运行中、暂停、需要关注时都展示控制区。
3. 控制区至少包含：
   - 当前状态
   - 当前章节
   - 已完成/失败/跳过统计
   - 暂停
   - 恢复
   - 刷新
4. `AutonomousRunLauncher` 只负责创建新 run，不再承担 active run 控制。

**验收**

访问 `/project/:id/autopilot`：

- 无 active run：显示创建表单
- running：显示时间线 + 暂停按钮
- paused：显示恢复按钮
- needs_attention：显示异常队列 + 处理后继续按钮
- completed/failed：显示结果摘要 + 新建下一轮按钮

## 推荐实施顺序

### 第 1 步：修复数据库迁移

先补 `autonomous_run_exceptions` 缺列。

完成后执行：

```bash
pnpm db:migrate
source .env && psql "$DATABASE_URL" -c "\d autonomous_run_exceptions"
```

### 第 2 步：修复异常恢复顺序

调整 `resolveAutonomousException()`：

```text
select open exception
-> validate run ownership
-> restore run to running
-> approve step
-> mark exception resolved
-> load next run state
```

失败时不得把异常提前标记 resolved。

### 第 3 步：修复自动修复输入

让 `auto_repair` 通过 `changeSetId` 读取一致性报告，或在 build output 中提供报告。

### 第 4 步：重构自动修复状态机

禁止 `review_change_set` 内递归调用 `runNextSteps()`。

用明确的 step 状态推进：

```text
review_change_set -> auto_repair -> build_change_set -> review_change_set
```

### 第 5 步：补前端运行控制区

将 active run 控制入口从 Launcher 中拆出，确保运行中也能暂停、恢复、刷新。

### 第 6 步：端到端验收

使用 seed 项目跑一轮自动写作：

```text
选择 next_n_chapters
targetWordsPerChapter = 800
strategy = balanced
autoApprovalLevel = low_risk
```

至少覆盖：

1. 正常低风险章节自动写入。
2. 中风险章节进入自动修复。
3. 高风险章节进入异常队列。
4. 人工批准后继续后续章节。
5. 最终 run 完成，并更新章节正文、结构化变更、健康指标。

## 验证命令

```bash
pnpm check
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

建议额外增加自动化服务测试：

```bash
pnpm --filter @ai-novel/api test
```

测试覆盖：

- 创建 run 时生成 run jobs
- `recordAutonomousException()` 可写入 `writingJobId/stepId`
- `resolveAutonomousException()` approve 失败时异常不变 resolved
- `resolveAutonomousException()` approve 成功后 run 恢复
- auto repair 不递归、不无限重试

## 完成标准

满足以下条件才算全自动写作搭建完成：

- `pnpm check` 通过
- `pnpm db:migrate` 通过
- `autonomous_run_exceptions` 表含 `writing_job_id` / `step_id`
- 自动驾驶可以从创建 run 跑到 completed
- 中风险内容能自动修复或进入异常队列
- 高风险内容不会静默写入正文
- 异常处理后可以继续下一章
- 运行中前端可以暂停、恢复、刷新
- 最终章节正文、人物/关系/伏笔/事实/健康指标都有可追踪更新

