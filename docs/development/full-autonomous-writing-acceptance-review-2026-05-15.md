# 全自动写作流程验收审查（2026-05-15）

## 结论

当前版本已经补齐了上一轮的部分关键能力：

- `autonomous_run_exceptions` 已新增 `writing_job_id` / `step_id` 迁移。
- 本地 PostgreSQL 表结构已经包含 `writing_job_id` / `step_id` 及外键。
- 自动驾驶页已新增 `AutonomousRunControlBar`，运行中可以看到暂停、继续、刷新入口。
- `resolveAutonomousException()` 已改为先读取 open 异常，再推进审批，最后标记 resolved。
- `executeBuildChangeSet()` 已把 `consistencyReport` 写入 step output，自动修复可以拿到一致性报告。

但当前还不能判定为“全自动化写作流程已完成”。自动修复状态机仍存在顺序错误，会导致中风险内容在修复前先被应用。

## 验证结果

### 数据库迁移

执行：

```bash
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm db:migrate
```

结果：通过。

本地表结构检查：

```bash
psql "$DATABASE_URL" -c "\d autonomous_run_exceptions"
```

确认已存在：

- `writing_job_id text`
- `step_id text`
- `autonomous_run_exceptions_writing_job_id_writing_jobs_id_fk`
- `autonomous_run_exceptions_step_id_writing_job_steps_id_fk`

### 完整门禁

执行：

```bash
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm check
```

结果：未跑完，阻塞在 ESLint 依赖加载：

```text
Cannot find native binding
oxc-parser
```

这是当前 `node_modules` 的 optional native dependency 缺失问题，建议重新安装依赖后复跑。

建议命令：

```bash
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm install
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm check
```

## Review Findings

### Finding 1. [P1] 自动修复步骤顺序仍不正确，中风险内容会先应用再修复

**位置**

- `apps/api/src/services/writing-job.service.ts:32-40`
- `apps/api/src/services/writing-job.service.ts:1012-1046`

**问题**

当前 `draft_only` 步骤顺序是：

```text
prepare_context
generate_draft
build_change_set
review_change_set
apply_change_set
auto_repair
update_health
done
```

当 `review_change_set` 判断为中风险并尝试自动修复时，代码会：

1. 将 `auto_repair` 设为 pending。
2. 将当前 `review_change_set` 标记为 completed。
3. `continue` 进入下一轮循环。

但下一轮循环按步骤顺序找第一个未完成步骤时，会先遇到 `apply_change_set`，不是 `auto_repair`。

结果是：

```text
review_change_set 中风险
-> 标记 review completed
-> apply_change_set 先执行
-> 未修复内容被应用
-> auto_repair 才执行
```

这违背了自动化写作的安全边界：中风险内容必须先修复或进入异常队列，不能先写入正文/结构化数据。

**修复要求**

调整步骤顺序或状态机，保证自动修复发生在应用前。

推荐改法：

```text
prepare_context
generate_draft
build_change_set
review_change_set
auto_repair
build_change_set
review_change_set
apply_change_set
update_health
done
```

实现上不要在静态步骤里重复写两个 `build_change_set/review_change_set`，而应在状态机里表达：

1. `review_change_set` 中风险且未修复过：
   - 不允许进入 `apply_change_set`
   - 将 `auto_repair` 放到当前执行指针之前，或直接执行 `auto_repair`
   - 标记 repair attempt
2. `auto_repair` 成功：
   - 更新 `generate_draft.output`
   - 重置 `build_change_set/review_change_set`
   - 重置或阻塞旧 change set，避免旧草稿被误应用
3. 重跑 `build_change_set/review_change_set`
4. 只有修复后评审通过，才进入 `apply_change_set`

可选实现：

- 把 `auto_repair` 从 `apply_change_set` 后移动到 `review_change_set` 和 `apply_change_set` 之间。
- 当无需修复时，`auto_repair` 自动 `skipped`。
- 当修复失败时，进入 `waiting_review`，由自动驾驶异常队列处理。

**验收标准**

中风险章节的步骤记录必须满足：

```text
generate_draft completed
build_change_set completed
review_change_set completed / medium_risk_repair
auto_repair completed
build_change_set completed
review_change_set completed / approved
apply_change_set completed
```

不能出现：

```text
review_change_set medium_risk_repair
apply_change_set completed
auto_repair completed
```

### Finding 2. [P2] `resolveAutonomousException()` 恢复 run 为 running 后再 approve，approve 失败会短暂改变 run 状态

**位置**

- `apps/api/src/services/autonomous-writing.service.ts:481-519`

**问题**

当前逻辑已比上一版安全：异常不会在 approve 前被标记为 resolved。  
但它会先把 run 改为 `running`，再执行 `approveStep()`。如果 `approveStep()` 失败，会 catch 并恢复为 `needs_attention`。

这在单请求内最终状态是正确的，但如果未来加 SSE、轮询日志或并发控制，中间态可能被观察到。

**建议**

可接受保留当前实现。若要更稳，可以：

1. 先执行可校验的 approve 前置检查。
2. 用事务包住：
   - run -> running
   - approve step
   - exception -> resolved
3. 失败时事务回滚。

这不是当前阻塞项，但属于后续可靠性增强。

### Finding 3. [P2] `pnpm check` 被本地依赖安装状态阻塞

**位置**

- 本地 `node_modules`
- `oxc-parser`
- UnoCSS ESLint plugin 链路

**问题**

`pnpm check` 在 lint 阶段失败：

```text
Cannot find native binding
oxc-parser
```

这通常是 optional native dependency 没装完整或 Node 版本切换后 node_modules 不匹配。

**修复要求**

重新安装依赖后复跑：

```bash
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm install
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm check
```

如果仍失败，再清理当前依赖目录后重装：

```bash
rm -rf node_modules
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm install
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm check
```

注意：删除 `node_modules` 前确认当前没有 dev server 或任务依赖它运行。

## 已完成项确认

### 1. 异常表迁移已完成

文件：

- `apps/api/drizzle/0024_fearless_ego.sql`

包含：

```sql
ALTER TABLE "autonomous_run_exceptions" ADD COLUMN "writing_job_id" text;
ALTER TABLE "autonomous_run_exceptions" ADD COLUMN "step_id" text;
```

并已建立外键。

### 2. 自动驾驶控制区已接入

文件：

- `apps/web/src/views/AutopilotView.vue`
- `apps/web/src/features/autonomous-writing/components/AutonomousRunControlBar.vue`

运行中、暂停、需要关注时已有控制入口。

### 3. 一致性报告已进入 build output

文件：

- `apps/api/src/services/writing-job.service.ts`

`executeBuildChangeSet()` 输出已包含：

```ts
consistencyReport: report
```

这为 `auto_repair` 提供了输入基础。

## 下一步实施顺序

### Step 1. 修复自动修复顺序

优先级最高。

目标：保证 `auto_repair` 一定在 `apply_change_set` 前执行。

建议最小改动：

1. 调整 `STEP_SEQUENCE`：

```text
build_change_set
review_change_set
auto_repair
apply_change_set
```

2. 当 `auto_repair` 不需要执行时，自动 `skipped`。
3. 当 `review_change_set` 判定中风险时：
   - 不再让流程继续到 `apply_change_set`
   - 确保下一步是 `auto_repair`

### Step 2. 自动修复后废弃旧 change set

修复成功后必须避免旧 change set 被误应用：

- 旧 `chapter_change_sets` 标记为 `blocked` 或 `rejected`
- 重跑 `build_change_set`
- 新 change set 进入 review

### Step 3. 给自动修复增加次数上限

建议每个 job 最多自动修复 1 次。

可选字段：

- `writing_jobs.repair_attempt_count`

或复用 step 状态：

- 已存在非 pending 的 `auto_repair` 即视为尝试过

### Step 4. 重装依赖并复跑门禁

```bash
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm install
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm check
/Users/lhw/.nvm/versions/node/v22.21.1/bin/pnpm db:migrate
```

### Step 5. 做端到端自动写作验收

使用一个测试项目，至少覆盖：

1. 低风险章节自动通过并写入。
2. 中风险章节触发自动修复，修复后再应用。
3. 高风险章节进入异常队列。
4. 人工批准后继续下一章。
5. 最终 run 完成并更新：
   - 章节正文
   - 角色/关系/伏笔/事实图谱
   - 章后记忆
   - 健康指标

## 最终完成标准

只有同时满足以下条件，才算全自动写作流程完成：

- `pnpm check` 通过
- `pnpm db:migrate` 通过
- 自动驾驶可从创建 run 跑到 completed
- `autonomous_run_exceptions` 可记录并恢复 `writingJobId/stepId`
- 中风险内容不会在修复前执行 `apply_change_set`
- 高风险内容不会自动污染正文或结构化数据库
- 异常处理后 run 能继续推进
- 前端运行中可暂停、恢复、刷新
- 自动写作完成后，章节正文和结构化资产都能被下一次 AI 上下文读取

