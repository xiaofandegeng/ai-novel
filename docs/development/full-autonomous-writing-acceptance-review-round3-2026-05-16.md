# 全自动写作流程三次验收审查（2026-05-16）

## 结论

当前版本已经通过构建与迁移门禁，并修复了上一轮发现的大部分自动化控制问题：

- `pnpm check` 通过。
- `pnpm db:migrate` 通过。
- 自动修复已位于 `apply_change_set` 前。
- `paused` 状态不会继续启动下一章。
- `needs_attention` 已不能通过普通 resume 绕过异常队列。
- 同项目 active run 互斥检查已覆盖 `running` / `paused` / `needs_attention`。
- 前端 `needs_attention` 状态只提示处理异常，不再显示普通“继续推进”按钮。

但仍不能完全判定为“全自动化流程已完成”。当前还存在两个尾部状态问题，会让自动驾驶在最后阶段停在 `running`，或者 fast 策略无法自然完成。

## 验证结果

### 完整门禁

执行：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
```

结果：通过。

覆盖：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

### 数据库迁移

执行：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm db:migrate
```

结果：通过。

## 已完成项确认

### 1. 自动修复顺序已正确

**位置**

- `apps/api/src/services/writing-job.service.ts:32-40`
- `apps/api/src/services/writing-job.service.ts:42-52`
- `apps/api/src/services/writing-job.service.ts:54-64`

当前正文类任务顺序为：

```text
generate_draft
build_change_set
review_change_set
auto_repair
apply_change_set
update_health
done
```

中风险内容已经不会在修复前进入 `apply_change_set`。

### 2. 暂停语义已基本修复

**位置**

- `apps/api/src/services/autonomous-writing.service.ts:262-313`
- `apps/api/src/services/autonomous-writing.service.ts:390-407`

`runNextAutonomousStep()` 开头会检查 run 必须是 `running`，`handleAutonomousJobCompletion()` 在继续下一章前会重新读取 run 状态。  
这能保证用户暂停后，当前 job 可自然完成，但不会启动下一章。

### 3. `needs_attention` 不再允许普通 resume

**位置**

- `apps/api/src/services/autonomous-writing.service.ts:326-348`
- `apps/web/src/features/autonomous-writing/components/AutonomousRunControlBar.vue:77-91`

后端 `resumeAutonomousRun()` 已限制只能从 `paused` 恢复；前端 `needs_attention` 只显示“请先处理右侧待处理异常”。

## Review Findings

### Finding 1. [P1] 最后一章异常批准后，run 可能永久停在 `running`

**位置**

- `apps/api/src/services/autonomous-writing.service.ts:532-570`
- `apps/api/src/services/autonomous-writing.service.ts:276-289`
- `apps/api/src/services/autonomous-writing.service.ts:350-372`

**问题**

`resolveAutonomousException()` 当前流程是：

```text
run -> running
approveStep()
异常 -> resolved
```

而 `approveStep()` 会继续执行 writing job。若这是本轮自动驾驶的最后一个章节，job 完成后会触发：

```text
handleAutonomousJobCompletion()
-> runNextAutonomousStep()
-> 没有 pending job
-> hasActiveBlockers()
-> 发现当前 exception 仍是 open
-> return，不标记 completed
```

随后 `resolveAutonomousException()` 才把异常标记为 `resolved`，但没有再次调用 `runNextAutonomousStep()`。  
最终结果可能是：

```text
run.status = running
pending jobs = 0
open exceptions = 0
completed 也没有被写入
```

前端会继续轮询一个永远不会自然结束的自动驾驶任务。

**修复要求**

在成功标记异常 `resolved` 后，再主动推进一次：

```ts
await db.update(autonomousRunExceptions).set({ status: 'resolved', ... })
await runNextAutonomousStep(projectId, runId)
```

或者调整顺序：

```text
先将异常标记为 resolving / resolved
再 approveStep
最后统一检查 run 是否可完成
```

建议最小改法：

1. 保持当前“approve 成功后才 resolved”的安全策略。
2. 在 resolved 更新之后调用 `runNextAutonomousStep(projectId, runId)`。
3. `runNextAutonomousStep()` 已有 run 状态和 blocker 检查，可安全决定是否 completed 或继续下一章。

**验收标准**

构造只有 1 个章节的自动驾驶 run：

1. 章节进入 `needs_attention`。
2. 点击异常队列“批准继续”。
3. writing job 完成。
4. 异常变为 `resolved`。
5. run 必须从 `running` 变为 `completed`，不能停留在 `running`。

### Finding 2. [P1] fast 策略跳过失败/待审查章节时留下 open exception，最终会阻塞 completed

**位置**

- `apps/api/src/services/autonomous-writing.service.ts:426-441`
- `apps/api/src/services/autonomous-writing.service.ts:457-477`
- `apps/api/src/services/autonomous-writing.service.ts:365-370`

**问题**

在 `failed` 和 `waiting_review` 分支里，代码都会先调用 `recordAutonomousException()` 创建 `open` 异常。

但当 run 策略是 `fast` 时，系统会：

```text
记录 open exception
标记当前 run job 为 skipped 或 failed
继续下一章
```

问题是 `hasActiveBlockers()` 会把任何 `open exception` 视为 blocker。  
因此 fast 策略即使一路跳过阻塞章节，最后没有 pending job 时也会因为 open exceptions 无法 completed，run 可能停在 `running`。

**修复要求**

fast 策略下，如果系统决定“跳过并继续”，对应异常不能保持 `open`。

推荐策略：

1. `fast` + `waiting_review`：
   - 记录异常时直接标记为 `ignored` 或 `auto_skipped`。
   - 如果 schema 不支持 `auto_skipped`，先用 `ignored`，`resolution = '快速策略自动跳过该章节'`。
2. `fast` + `failed`：
   - 若继续下一章，则对应异常也应标记为 `ignored` 或 `auto_skipped`。
   - 若失败不可跳过，则 run 进入 `needs_attention`。
3. `hasActiveBlockers()` 只阻塞 `status = 'open'` 的异常。

**验收标准**

构造 fast 策略自动驾驶：

1. 第 1 章触发高风险审查或 AI 失败。
2. 系统按 fast 策略跳过第 1 章。
3. 第 2 章正常完成。
4. run 最终必须进入 `completed`，或明确进入 `completed_with_warnings`。
5. 不允许停留在 `running`。

### Finding 3. [P2] `pauseAutonomousRun()` 未校验更新结果

**位置**

- `apps/api/src/services/autonomous-writing.service.ts:315-324`

**问题**

`pauseAutonomousRun()` 直接 update，没有确认 run 是否存在、是否属于当前项目、是否处于可暂停状态。  
虽然 where 条件包含 projectId，但如果 run 不存在，接口仍可能返回成功。

**修复建议**

1. 先 select run：
   - 不存在返回 `Run not found`
   - 只有 `running` 可以暂停
2. 再 update。

**验收标准**

- 暂停不存在的 run 返回 404/400。
- 暂停 completed run 返回明确错误。
- 暂停 running run 成功。

## 下一步修复顺序

### Step 1. 修复 resolve 后尾部 completed

在 `resolveAutonomousException()` 成功标记异常 resolved 后，调用：

```ts
await runNextAutonomousStep(projectId, runId)
```

确保最后一章也能进入 completed。

### Step 2. 修复 fast 策略异常状态

fast 策略决定跳过时，不要留下 open exception。

可先使用现有状态：

```ts
status: 'ignored'
resolution: '快速策略自动跳过该章节'
```

### Step 3. 补 `pauseAutonomousRun()` 状态校验

只允许 running -> paused。

### Step 4. 增加自动驾驶服务测试

建议增加 API/service 单测，覆盖：

1. 最后一章异常 resolve 后 run completed。
2. fast 策略跳过后 run completed。
3. pause 后当前 job 完成但不启动下一章。
4. needs_attention 不能 resume。

## 完成标准

只有同时满足以下条件，才算全自动写作流程完成：

- `pnpm check` 通过。
- `pnpm db:migrate` 通过。
- 中风险内容在 `apply_change_set` 前完成自动修复或进入异常队列。
- 高风险内容不会直接污染正文或结构化数据库。
- `paused` 能阻止下一章启动。
- `needs_attention` 不能绕过异常队列。
- 最后一章异常处理后 run 能进入 `completed`。
- fast 策略跳过章节后 run 不会被 open exception 卡住。
- 自动驾驶完成后，章节正文、结构化变更、章后记忆和健康指标都已更新。

