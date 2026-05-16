# 全自动写作流程二次验收审查（2026-05-15）

## 结论

当前版本已经接近“全自动化写作闭环”，但还不能算完全完成。

本轮确认的进展：

- 自动修复步骤已移动到 `apply_change_set` 之前。
- `executeBuildChangeSet()` 已把 `consistencyReport` 写入 step output。
- 自动修复成功后会更新 `generate_draft.output`，并重置 `build_change_set` / `review_change_set`。
- 旧 change set 会在修复后被 reject，避免直接应用旧草稿。
- `autonomous_run_exceptions` 已补齐 `writing_job_id` / `step_id` 迁移。
- 前端已新增 `AutonomousRunControlBar`，运行中可看到暂停、继续、刷新入口。
- 在 Node 22 PATH 下，`pnpm check` 已通过。
- `pnpm db:migrate` 已通过。

仍需修复的关键问题：

1. `pauseAutonomousRun()` 只改 run 状态，不能真正阻止当前 job 完成后继续下一章。
2. `needs_attention` 状态下前端和后端都允许直接 resume，可能绕过异常队列，导致待审查章节被跳过或 run 被误标 completed。

因此当前状态应判定为：

```text
自动化主流程基本搭建完成，但自动驾驶控制语义尚未闭环。
```

## 验证结果

### 1. 完整门禁

执行：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
```

结果：通过。

包含：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

说明：

直接使用当前默认 shell 环境时，可能会因为 Node 24 / native optional dependency 签名问题导致 Rollup 或 oxc native binding 报错。强制使用 Node 22 后验证通过。

### 2. 数据库迁移

执行：

```bash
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm db:migrate
```

结果：通过。

### 3. 数据库表结构

执行：

```bash
psql "$DATABASE_URL" -c "\d autonomous_run_exceptions"
```

确认存在：

- `writing_job_id text`
- `step_id text`
- `autonomous_run_exceptions_writing_job_id_writing_jobs_id_fk`
- `autonomous_run_exceptions_step_id_writing_job_steps_id_fk`

## 已完成项确认

### 1. 自动修复顺序已提前到应用前

**位置**

- `apps/api/src/services/writing-job.service.ts:32-40`
- `apps/api/src/services/writing-job.service.ts:42-52`
- `apps/api/src/services/writing-job.service.ts:54-64`

当前 `draft_only` 顺序：

```text
prepare_context
generate_draft
build_change_set
review_change_set
auto_repair
apply_change_set
update_health
done
```

这已经避免了上一轮的“先 apply 再 repair”问题。

### 2. 自动修复可以拿到一致性报告

**位置**

- `apps/api/src/services/writing-job.service.ts:729-734`
- `apps/api/src/services/writing-job.service.ts:882-897`

`build_change_set` output 已包含：

```ts
consistencyReport: report
```

`auto_repair` 会从 `buildOutput.consistencyReport` 读取修复依据。

### 3. 修复后会废弃旧变更集并重跑审查

**位置**

- `apps/api/src/services/writing-job.service.ts:900-929`

当前逻辑会：

1. 更新 `generate_draft.output`
2. reject 旧 change set
3. 重置 `build_change_set`
4. 重置 `review_change_set`
5. 让 while 循环重跑变更集构建和审查

这个方向是正确的。

## Review Findings

### Finding 1. [P1] 暂停状态不会阻止当前 job 完成后继续下一章

**位置**

- `apps/api/src/services/autonomous-writing.service.ts:296-317`
- `apps/api/src/services/autonomous-writing.service.ts:335-347`
- `apps/api/src/services/autonomous-writing.service.ts:257-294`

**问题**

`pauseAutonomousRun()` 只把 `autonomous_writing_runs.status` 改为 `paused`：

```ts
status: 'paused'
```

但当前正在执行的 writing job 不会停止。更关键的是，当该 job 完成后，`handleAutonomousJobCompletion()` 会无条件继续调用：

```ts
await runNextAutonomousStep(projectId, runId)
```

`runNextAutonomousStep()` 也不会检查 run 当前是否仍是 `running`，因此用户点击“暂停”后：

```text
run.status = paused
当前章节 job 继续执行
job completed
handleAutonomousJobCompletion()
runNextAutonomousStep()
下一章继续启动
```

这会让“暂停”按钮只是视觉状态，不是真正的自动驾驶控制。

**影响**

- 用户以为已暂停，系统仍可能继续生成后续章节。
- 长篇自动写作中可能继续消耗 AI 额度。
- 如果用户暂停是为了调整设定，后续章节仍会按旧上下文继续写，造成故事偏离。

**修复要求**

1. 在 `runNextAutonomousStep()` 开头读取 run：

```ts
const [run] = await db.select().from(autonomousWritingRuns).where(...)
if (!run || run.status !== 'running') return
```

2. 在 `handleAutonomousJobCompletion()` 的 completed 分支里，继续下一章前重新读取 run 状态：

```ts
const [latestRun] = await ...
if (latestRun.status !== 'running') return
await runNextAutonomousStep(...)
```

3. `pauseAutonomousRun()` 的语义应是：

```text
当前 job 可以自然完成
但不得启动下一章
```

如果未来需要强制停止当前 AI 请求，应另做 cancellation token，不属于本轮必须范围。

**验收标准**

启动自动驾驶后，在第一章生成中点击暂停：

- 当前 job 可以完成。
- `autonomous_writing_runs.status` 保持 `paused`。
- 下一条 `autonomous_run_jobs.status = pending` 不会变成 `running`。
- 点击“继续”后才启动下一章。

### Finding 2. [P1] `needs_attention` 可以被普通 resume 绕过异常队列

**位置**

- `apps/web/src/features/autonomous-writing/components/AutonomousRunControlBar.vue:77-85`
- `apps/api/src/routes/autonomous-runs.ts:52-56`
- `apps/api/src/services/autonomous-writing.service.ts:307-317`
- `apps/api/src/services/autonomous-writing.service.ts:257-270`

**问题**

前端当前对 `paused` 和 `needs_attention` 都展示同一个“继续推进”按钮：

```ts
['paused', 'needs_attention'].includes(currentRun.status)
```

后端 `resumeAutonomousRun()` 也不检查 open exceptions，会直接：

```ts
status = running
runNextAutonomousStep()
```

如果 run 当前处于 `needs_attention`，通常说明某个 `autonomous_run_jobs` 已经是 `waiting_review`。此时直接 resume 会绕过异常处理。更糟的是，`runNextAutonomousStep()` 只查 pending job：

```ts
where status = 'pending'
```

如果没有 pending job，它会把整个 run 标记为 completed。这样可能出现：

```text
存在 open exception
存在 waiting_review job
用户点击继续推进
runNextAutonomousStep 找不到 pending
run.status = completed
异常仍未解决
```

**影响**

- 高风险或需要作者确认的内容可能被流程状态掩盖。
- run 显示完成，但异常队列仍有 open 项。
- 自动写作安全边界被绕过。

**修复要求**

前端：

1. `needs_attention` 状态下不要显示普通“继续推进”按钮。
2. 改为提示：

```text
请先处理右侧待处理异常
```

3. 只有 `paused` 状态显示“继续推进”。

后端：

1. `resumeAutonomousRun()` 只允许从 `paused` 恢复。
2. 如果 run 是 `needs_attention`，必须返回 400：

```text
请先处理待处理异常
```

3. `runNextAutonomousStep()` 在标记 completed 前，必须检查是否仍存在：

- `autonomous_run_jobs.status = waiting_review`
- `autonomous_run_exceptions.status = open`
- `autonomous_run_jobs.status = running`

只有不存在这些阻塞状态时，才允许 completed。

**验收标准**

当 run 是 `needs_attention`：

- 前端不能显示“继续推进”。
- 调用 `/resume` 返回失败。
- open exception 未解决前，run 不能变成 completed。
- 通过异常队列 resolve / ignore 后，才能继续。

### Finding 3. [P2] `startAutonomousRun()` 只检查其他 running run，没有检查 paused / needs_attention

**位置**

- `apps/api/src/services/autonomous-writing.service.ts:236-243`

**问题**

创建 run 时已经会拦截 running / paused / needs_attention，但 start 已存在 run 时只检查其他 running run。

如果某个项目已有 paused 或 needs_attention run，理论上仍可能启动另一个 idle run。

**修复建议**

`startAutonomousRun()` 的互斥检查应和 `createAutonomousRun()` 一致：

```ts
or(
  eq(status, 'running'),
  eq(status, 'paused'),
  eq(status, 'needs_attention'),
)
```

**验收标准**

同一个项目存在 paused / needs_attention run 时，不能启动另一个 run。

## 下一步修复顺序

### Step 1. 修复 pause 语义

优先处理 `handleAutonomousJobCompletion()` 和 `runNextAutonomousStep()`。

目标：

```text
暂停后不再启动下一章
```

### Step 2. 禁止 needs_attention 直接 resume

同时改前端和后端。

目标：

```text
needs_attention 只能通过异常队列 resolve / ignore 推进
```

### Step 3. 强化 completed 判定

`runNextAutonomousStep()` 在没有 pending job 时，不应立即 completed。

需要先检查：

- open exceptions
- waiting_review jobs
- running jobs
- failed jobs 是否允许计入 completed with warnings

建议未来增加状态：

```text
completed
completed_with_warnings
failed
needs_attention
```

本轮最小可先保持现有枚举，但不得在 open exception 存在时 completed。

### Step 4. 修复 start 互斥检查

防止同项目多个 active run 并行。

### Step 5. 真实端到端验收

用测试项目覆盖：

1. 正常低风险章节自动写入。
2. 中风险章节自动修复后再应用。
3. 高风险章节进入异常队列。
4. `needs_attention` 下不能直接 resume。
5. resolve 异常后继续下一章。
6. pause 后当前 job 完成但不启动下一章。
7. resume paused 后继续下一章。

## 最终完成标准

只有同时满足以下条件，才算全自动化写作流程完成：

- `pnpm check` 通过。
- `pnpm db:migrate` 通过。
- 中风险内容修复发生在 `apply_change_set` 前。
- 高风险内容进入异常队列，不直接污染正文或结构化数据。
- `needs_attention` 不能绕过异常队列。
- `paused` 能真正阻止下一章启动。
- 异常 resolve / ignore 后可继续后续章节。
- 自动驾驶完成后，章节正文、结构化变更、章后记忆和健康指标都已更新。
- 下一次 AI 上下文能读取自动写作产生的结构化信息。

