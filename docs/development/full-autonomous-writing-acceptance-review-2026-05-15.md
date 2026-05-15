# 全部自动化写作验收审查与下一步搭建文档

日期：2026-05-15
状态：代码可构建，但自动化闭环仍需补强

## 1. 本轮验收结论

当前版本已经完成了全自动写作的基础搭建：

- 已新增 `/project/:id/autopilot` 自动写作驾驶舱。
- 已新增 `autonomous_writing_runs`、`autonomous_run_jobs`、`autonomous_run_exceptions`。
- 已支持 active run 恢复、异常列表、异常 resolve / ignore API。
- 已修复上一轮最明显的空跑问题：
  - `next_n_chapters` 不再查最大章节之后的不存在章节。
  - `project` scope 已实现。
  - `chapter_range` 不再直接用 ID 做大小比较。
- `pnpm check` 通过。
- `pnpm db:migrate` 通过。

但目前还不能认定为“完整全自动化写作系统”。原因是：写作 run 可以创建和启动，但前端状态、异常恢复、人工放行后的任务续跑、自动修复仍存在缺口。它已经从“组件骨架”前进到“可启动的自动化流程”，但还不是稳定的无人值守写作引擎。

## 2. 当前通过项

### 2.1 构建与迁移

已验证：

```bash
pnpm check
pnpm db:migrate
```

结果：

- lint 通过
- typecheck 通过
- build 通过
- shared test 通过
- drizzle migration 执行成功

### 2.2 自动驾驶入口

相关文件：

```text
apps/web/src/router/index.ts
apps/web/src/views/AutopilotView.vue
apps/web/src/components/AppSidebar.vue
```

当前已有：

- `/project/:id/autopilot` 路由。
- 侧边栏“自动写作”入口。
- 自动驾驶启动面板。
- 运行时间线组件。
- 异常队列组件。

### 2.3 自动驾驶数据模型

相关文件：

```text
apps/api/src/db/schema/ai.ts
apps/api/src/db/schema/postprocess.ts
packages/shared/src/types/autonomous-writing.ts
```

当前已有：

- `autonomous_writing_runs`
- `autonomous_run_jobs`
- `autonomous_run_exceptions`
- `AutonomousRunJob.status` 已包含 `waiting_review`
- `writing_jobs.target_words`
- `writing_jobs.autonomous_run_id`

## 3. P1：必须修复的流程问题

### P1-1 自动驾驶页面父子组件各自维护 run 状态

位置：

```text
apps/web/src/views/AutopilotView.vue
apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue
apps/web/src/features/autonomous-writing/composables/useAutonomousRun.ts
```

当前问题：

`AutopilotView.vue` 自己调用了一次 `useAutonomousRun(projectId)`，`AutonomousRunLauncher.vue` 内部又调用了一次 `useAutonomousRun(props.projectId)`。

结果：

1. 用户在 Launcher 中创建并启动 run。
2. Launcher 内部的 `currentRun` 更新。
3. 父页面的 `currentRun` 不会同步更新。
4. 父页面的时间线和异常面板可能仍认为没有 active run。
5. 用户需要刷新页面才能看到完整状态。

这会让自动驾驶入口表现得像“启动了但页面没有进入运行态”。

修复要求：

1. `AutopilotView` 成为唯一状态所有者。
2. `AutonomousRunLauncher` 改为纯展示/表单组件：
   - 接收 `loading`、`currentRun`。
   - 通过 `emit('create-and-start', input)` 通知父组件。
   - 不再内部调用 `useAutonomousRun`。
3. 父组件统一调用：

```ts
const run = await createRun(input)
await start(run.id)
await loadRun(run.id)
```

验收：

- 点击“开启自动驾驶”后，父页面立即显示 timeline。
- 右侧异常队列和运行状态同步更新。
- 不刷新页面也能看到当前 run。

### P1-2 异常 resolve 只是把 run job 标记 completed，没有真正批准写作任务

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
```

当前逻辑：

```ts
await db.update(autonomousRunJobs).set({
  status: 'completed',
})
```

然后直接：

```ts
await resumeAutonomousRun(projectId, runId)
```

问题：

当 writing job 因 `review_change_set` 进入 `waiting_review` 时，真正需要处理的是：

- 批准对应 change set。
- 继续执行 writing job 后续步骤。
- 应用正文和结构化变更。
- 由 `handleAutonomousJobCompletion` 在 job completed 后更新 autonomous run job。

当前 resolve 直接把 `autonomous_run_jobs` 标记 completed，底层 `writing_jobs` 仍可能停在 `waiting_review`，变更集也可能没有应用。用户以为“批准并继续”，实际可能跳过了这一章的正文写入。

修复要求：

1. `autonomous_run_exceptions` 必须记录足够上下文：
   - `writingJobId`
   - `stepId`
   - `changeSetId`
   - `chapterId`
2. `resolveAutonomousException` 不应直接把 run job 标记 completed。
3. 正确流程应为：

```text
resolve exception
-> approve writing job review step / approve change set
-> runNextSteps continues
-> writing job completed
-> handleAutonomousJobCompletion marks run job completed
-> runNextAutonomousStep moves to next chapter
```

短期可选方案：

- 在异常 payload 中写入 `writingJobId + stepId`。
- resolve 时调用 writing job 的 `approveStep(projectId, writingJobId, stepId)`。

验收：

- 高风险章节 resolve 后，章节正文确实写入。
- change set 状态从 pending/approved 到 applied。
- writing job 状态最终变为 completed。
- run job 状态由 handler 更新，而不是 resolve 直接伪完成。

### P1-3 create run 没有事务，失败会留下半成品 run

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
```

当前流程：

```text
insert autonomous_writing_runs
-> prepareRunJobs
-> 如果选章/建 job 失败，run 已经留在数据库
```

风险：

- 没有可写章节时，会先插入一个 `idle` run，再抛错。
- 中途某个 job 插入失败，会留下部分 writing jobs 和 run jobs。
- 后续 active run / 排查日志会变脏。

修复要求：

使用事务包住：

```text
insert run
-> select target chapters
-> insert writing jobs
-> insert writing job steps
-> insert autonomous run jobs
```

如果任一步失败，整次创建回滚。

验收：

- 没有可写章节时，不产生 run。
- 批量创建中任意一步失败，不产生半成品 job。

### P1-4 自动修复仍未接入主链路

位置：

```text
apps/api/src/services/auto-repair.service.ts
apps/api/src/services/writing-job.service.ts
```

当前状态：

`attemptAutoRepair` 仍是 TODO，且没有被 `writing-job.service.ts` 调用。

这意味着：

- warning 级一致性问题不会自动修复。
- 自动驾驶仍然靠“自动通过 / 人工处理 / 跳过”推进。
- 还不具备真正的“生成 -> 检查 -> 修复 -> 复查 -> 应用”闭环。

修复要求：

新增自动修复链路：

```text
generate_draft
-> build_change_set
-> review_change_set
-> if warning and strategy allows
   -> attempt_auto_repair
   -> rebuild_change_set
   -> review_change_set again
-> apply_change_set
```

建议：

1. 给 `writing_job_steps.stepType` 增加 `auto_repair`。
2. `attemptAutoRepair` 调用 AI，输入：
   - 原 draft
   - 一致性报告 / change set 风险报告
   - 项目设定约束
3. 修复后必须重新 build change set。
4. 修复失败进入异常队列，不能假装通过。

验收：

- warning 级问题能自动修复并复查。
- blocked 级问题仍进入异常队列。
- 自动修复结果有 step output 和审计记录。

## 4. P2：建议继续加固的问题

### P2-1 active run 锁只拦截 running

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
```

当前只检查：

```ts
eq(autonomousWritingRuns.status, 'running')
```

风险：

当项目已有 `needs_attention` 或 `paused` run 时，用户仍可创建新 run。多个 run 可能同时指向同一批章节，造成重复写作或状态混乱。

建议：

创建新 run 前拦截：

```text
running
paused
needs_attention
```

或者要求用户明确归档旧 run。

### P2-2 chapter range 仍只按 chapterNumber 判断

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
```

虽然已经不再用 ID 比大小，但如果 `chapterNumber` 在每卷内重置，跨卷范围仍可能错选。

建议：

范围排序使用：

```text
volume.orderIndex + chapter.chapterNumber
```

或给 chapters 增加全书级 `globalOrder`。

### P2-3 异常处理后没有检查是否还有 open 异常

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
```

当前 resolve / ignore 后直接 resume。

建议：

恢复运行前检查：

```text
当前 run 是否仍存在 open high / critical exception
```

如果还有，保持 `needs_attention`。

### P2-4 自动驾驶后台执行仍是进程内 fire-and-forget

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
```

当前 `startAutonomousRun` 使用：

```ts
runNextAutonomousStep(projectId, runId).catch(...)
```

这比长 HTTP 请求好，但还不是稳定 worker：

- API 进程重启会丢失执行。
- 没有任务锁。
- 没有 retry/backoff。
- 没有并发控制。

下一阶段建议引入轻量 worker：

```text
autonomous_run_worker
```

短期可以先用数据库状态轮询；长期可考虑 pg-boss / BullMQ。

## 5. 下一步开发顺序

### 阶段 1：统一前端 run 状态

目标：

- `AutopilotView` 统一持有 `useAutonomousRun`。
- `AutonomousRunLauncher` 改为受控组件。
- 启动后 timeline / exception queue 立即刷新。

涉及文件：

```text
apps/web/src/views/AutopilotView.vue
apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue
apps/web/src/features/autonomous-writing/composables/useAutonomousRun.ts
```

### 阶段 2：修复异常 resolve 的真实放行

目标：

- exception 记录 writingJobId / stepId / changeSetId。
- resolve 调用 approve step，而不是直接标记 run job completed。
- 由 writing job completed 事件推进 run。

涉及文件：

```text
apps/api/src/db/schema/postprocess.ts
apps/api/src/services/autonomous-writing.service.ts
apps/api/src/services/writing-job.service.ts
packages/shared/src/types/autonomous-writing.ts
apps/api/drizzle/*
```

### 阶段 3：create run 事务化

目标：

- run + jobs + steps 创建原子化。
- 空章节不落库。
- 部分失败不留下半成品。

涉及文件：

```text
apps/api/src/services/autonomous-writing.service.ts
```

### 阶段 4：接入自动修复

目标：

- warning 自动修复。
- 修复后复查。
- 修复失败进入异常队列。

涉及文件：

```text
apps/api/src/services/auto-repair.service.ts
apps/api/src/services/writing-job.service.ts
packages/shared/src/types/writing-job.ts
```

### 阶段 5：后台 worker 化

目标：

- 自动驾驶不依赖单次 HTTP 请求。
- 支持进程恢复。
- 支持 retry / backoff / lock。

涉及文件：

```text
apps/api/src/services/autonomous-run-worker.service.ts
apps/api/src/index.ts
apps/api/src/services/autonomous-writing.service.ts
```

## 6. 全自动化验收脚本建议

后续建议增加 smoke 脚本：

```text
apps/api/src/scripts/smoke-autonomous-writing.ts
```

覆盖：

1. 创建测试项目。
2. 创建 1 卷 3 章，正文为空。
3. 启动 `next_n_chapters = 3` 自动驾驶。
4. 等待 run 状态变更。
5. 校验：
   - 生成 3 个 run jobs。
   - 至少 1 个 writing job 进入 completed 或 waiting_review。
   - 如果 completed，章节 draft 非空。
   - 如果 waiting_review，异常队列非空且能 resolve / ignore。

## 7. 当前状态判断

当前版本可以称为：

```text
自动驾驶写作第一版可运行骨架
```

但还不能称为：

```text
完整全自动写作系统
```

达到完整全自动化还需要完成：

1. 前端状态单源化。
2. 异常 resolve 真实推进底层 writing job。
3. run 创建事务化。
4. 自动修复接入。
5. 后台 worker 与 smoke 验收。

