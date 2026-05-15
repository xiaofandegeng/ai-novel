# 全部自动化写作实现审查与后续修复文档

日期：2026-05-15
适用范围：自动驾驶写作、连续章节生成、写作任务队列、异常队列、自动修复、前端自动化入口

## 1. 当前结论

本轮代码已经搭起“全部自动化写作”的基础骨架：

- 后端新增 `autonomous_writing_runs`、`autonomous_run_jobs`、`autonomous_run_exceptions`。
- 前端新增自动驾驶启动组件和轮询 composable。
- 写作任务已经可以在 `executionMode = auto` 下自动通过低风险 / 中风险变更集。
- `writing_jobs` 已经能挂载 `autonomousRunId`，自动驾驶会话可以串联多个 writing job。

但当前实现还不能算完整的“全自动写作闭环”。核心问题是：自动驾驶入口可以创建 run，但默认选章逻辑会选不到章节，异常状态也可能让同一个 job 被反复启动，因此用户会看到“步骤完成 / 任务完成”，但章节正文没有真正连续生成。

## 2. P0：必须先修复的自动化闭环问题

### P0-1 默认“后续 N 章”会选不到任何章节

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
```

当前逻辑：

```ts
const lastChapter = await db.select().from(chapters)
  .where(eq(chapters.projectId, projectId))
  .orderBy(desc(chapters.chapterNumber))
  .limit(1)

const lastOrder = lastChapter[0]?.chapterNumber || 0

targetChapters = await db.select().from(chapters).where(and(
  eq(chapters.projectId, projectId),
  sql`${chapters.chapterNumber} > ${lastOrder}`,
))
```

问题：

`lastOrder` 已经是当前项目最大的章节号，再查 `chapterNumber > lastOrder` 通常会返回空数组。前端默认使用 `next_n_chapters`，所以自动驾驶会创建一个没有任何章节 job 的 run，然后直接完成。

这就是“页面显示完成，但没有自动写作”的主要原因之一。

修复要求：

1. `next_n_chapters` 应选择“需要生成正文”的后续章节，而不是最大章节号之后的不存在章节。
2. 推荐规则：
   - 优先选择 `draft` 为空或字数不足的章节。
   - 按 `volume.orderIndex`、`chapter.chapterNumber` 排序。
   - 跳过已完成且正文足够的章节。
3. 如果项目没有足够章节，应提供两种策略：
   - `createMissingChapters = false`：返回 400，提示先补大纲。
   - `createMissingChapters = true`：根据最近大纲自动创建占位章节。

建议实现：

```ts
targetChapters = await db.select()
  .from(chapters)
  .where(and(
    eq(chapters.projectId, projectId),
    or(
      isNull(chapters.draft),
      sql`char_length(coalesce(${chapters.draft}, '')) < ${minDraftWords}`
    ),
  ))
  .orderBy(asc(chapters.chapterNumber))
  .limit(params.targetChapterCount)
```

验收：

- 创建“后续 3 章”自动驾驶时，必须生成 3 条 `autonomous_run_jobs`。
- 若没有可写章节，接口必须返回明确错误，不能静默创建空 run。
- 前端显示“待写章节数不足”而不是“任务完成”。

### P0-2 `project` 范围在前端可选，但后端没有实现

位置：

```text
apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue
apps/api/src/services/autonomous-writing.service.ts
```

当前前端选项包含：

```ts
{ label: '全书范围', value: 'project' }
```

但 `prepareRunJobs` 没有处理 `scopeType === 'project'`。

结果：

用户选择“全书范围”后，后端不会创建任何章节任务，run 会直接完成。

修复要求：

1. 后端补齐 `project` scope：
   - 选择全项目内所有需要生成或需要重写的章节。
   - 默认限制最大批量，例如 20 章，避免误触发全书重写。
2. 前端增加范围说明：
   - “全书范围会处理所有未完成章节。”
   - 展示预计章节数。
3. 如果暂时不支持全书范围，则前端先移除该选项。

验收：

- 选择“全书范围”不会创建空 run。
- run 的 `targetChapterCount` 和 jobs 数量一致或有明确解释。

### P0-3 `chapter_range` 使用章节 ID 做大小比较，顺序不可靠

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
```

当前逻辑：

```ts
sql`${chapters.id} >= ${params.startChapterId}`
sql`${chapters.id} <= ${params.endChapterId}`
```

问题：

章节 ID 是 UUID / text，不代表小说顺序。用 ID 做范围比较会随机选章，可能漏选、错选，甚至跨越不相关章节。

修复要求：

1. 先按 `startChapterId`、`endChapterId` 查询对应章节并校验 `projectId`。
2. 用 `chapterNumber` 或 `volume.orderIndex + chapterNumber` 计算范围。
3. 如果起止章节不在同一卷，要明确跨卷排序规则。

验收：

- 选择第 3 章到第 6 章，只会创建 3、4、5、6 章任务。
- 不能通过其他项目 chapterId 创建当前项目任务。

## 3. P1：自动推进与异常处理问题

### P1-1 `waiting_review` 会导致 fast 策略重复启动同一个 job

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
```

当前行为：

1. writing job 进入 `waiting_review`。
2. `handleAutonomousJobCompletion` 记录异常。
3. 如果策略是 `fast`，直接调用 `runNextAutonomousStep`。
4. 但对应 `autonomous_run_jobs.status` 仍是 `running`。
5. `runNextAutonomousStep` 查询 `pending` 或 `running`，于是又选中同一个 job。

风险：

- 同一个高风险 job 被反复启动。
- 自动驾驶看似在继续，实际卡在同一个章节。
- 可能重复写入异常队列。

修复要求：

1. 增加 run job 状态：

```ts
type AutonomousRunJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'waiting_review'
```

2. 当 job 进入 `waiting_review`：
   - `safe` / `balanced`：run job 标记 `waiting_review`，run 标记 `needs_attention` 或 `paused`。
   - `fast`：run job 标记 `skipped`，记录异常，然后推进下一章。
3. `runNextAutonomousStep` 只能查询 `pending`，不要查询 `running`。
4. 运行中的任务恢复应通过专门的 retry/resume 逻辑处理。

验收：

- fast 策略遇到高风险章节时，不会重复启动同一 job。
- safe/balanced 策略能在异常队列中看到该章节，并暂停等待处理。

### P1-2 异常队列组件没有后端闭环

位置：

```text
apps/api/src/routes/autonomous-runs.ts
apps/web/src/features/autonomous-writing/components/AutonomousExceptionQueue.vue
```

当前状态：

- 前端有 `resolve` / `ignore` 事件。
- 后端没有异常列表、处理、忽略、恢复接口。
- API 客户端也没有对应方法。

修复要求：

新增接口：

```text
GET  /api/projects/:projectId/autonomous-runs/:runId/exceptions
POST /api/projects/:projectId/autonomous-runs/:runId/exceptions/:exceptionId/resolve
POST /api/projects/:projectId/autonomous-runs/:runId/exceptions/:exceptionId/ignore
```

resolve 行为：

1. 校验 exception 属于当前 `projectId + runId`。
2. 如果有 `changeSetId`，进入变更集详情或批准后应用。
3. 更新 exception.status = `resolved`。
4. 如果 run 没有其他 open critical/high 异常，允许继续。

ignore 行为：

1. 只允许 medium / high，critical 不允许直接忽略。
2. 写入 resolution。
3. fast/balanced 可以继续推进。

验收：

- 前端异常队列可以拉取真实异常。
- 点击“批准并继续”会更新异常状态，并恢复 run。
- 页面刷新后异常处理状态仍保留。

### P1-3 自动修复服务只是占位，没有接入写作链路

位置：

```text
apps/api/src/services/auto-repair.service.ts
apps/api/src/services/writing-job.service.ts
```

当前状态：

`attemptAutoRepair` 只有 TODO，且没有被主流程调用。

修复要求：

在 `review_change_set` 或一致性检查后增加自动修复逻辑：

```text
generate_draft
-> build_change_set
-> review_change_set
-> if warning and strategy allows repair
   -> auto_repair
   -> rebuild_change_set
   -> review_change_set again
-> apply_change_set
```

建议新增 step：

```ts
'auto_repair'
```

或在 `review_change_set` 内部记录 repair attempt。

验收：

- warning 级问题不会直接进入人工确认。
- 修复前后变更集都有审计记录。
- 修复失败时进入异常队列，而不是假装继续。

### P1-4 自动驾驶组件没有接入主页面

位置：

```text
apps/web/src/features/autonomous-writing/components/*
apps/web/src/views/*
```

当前扫描结果：

`AutonomousRunLauncher`、`AutonomousRunTimeline`、`AutonomousExceptionQueue` 只存在于 feature 目录，没有在 view 或 router 中被使用。

修复要求：

1. 新增或完善自动驾驶页面：

```text
/project/:id/autopilot
```

2. 页面至少包含：
   - `AutonomousRunLauncher`
   - 当前 run 概览
   - `AutonomousRunTimeline`
   - `AutonomousExceptionQueue`
   - 当前章节预览
   - 暂停 / 继续 / 终止
3. 侧边栏入口名称建议：

```text
自动写作
```

验收：

- 用户能从项目内导航进入自动驾驶页面。
- 页面刷新后能恢复最近未完成 run。
- 不是只能启动一次、然后状态丢失。

## 4. P2：体验、稳定性与审计增强

### P2-1 前端轮询不会在 `paused` / `needs_attention` 时停止

位置：

```text
apps/web/src/features/autonomous-writing/composables/useAutonomousRun.ts
```

当前只在 `completed` / `failed` 停止轮询。

修复要求：

```ts
const terminalOrWaiting = ['completed', 'failed', 'paused', 'needs_attention']
```

或者：

- `paused` 停止轮询。
- `needs_attention` 降低轮询频率，并显示异常队列。

### P2-2 `targetWordsPerChapter` 没有进入生成提示词

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
apps/api/src/services/writing-job.service.ts
apps/api/src/services/ai-context.service.ts
```

当前 run 保存了 `targetWordsPerChapter`，但创建 writing job 时没有传入 input，也没有写进 AI context。

修复要求：

1. writing job input 中写入：

```json
{
  "targetWords": 3000,
  "autonomousRunId": "..."
}
```

2. 生成正文 prompt 明确：

```text
本章目标字数：约 3000 字。
允许上下浮动 10%，但不能短于 2400 字。
```

3. 应用后统计实际字数并写入 run job。

### P2-3 自动驾驶同步执行可能导致长请求超时

位置：

```text
apps/api/src/services/autonomous-writing.service.ts
apps/api/src/services/writing-job.service.ts
```

当前 `startAutonomousRun` 直接 await `runNextAutonomousStep`，后者 await `startJob`。多章连续生成时可能让 HTTP 请求长时间挂起。

修复方向：

1. 短期：`start` 接口只更新状态并触发后台异步任务。
2. 中期：引入本地队列：

```text
autonomous_run_worker
```

3. 长期：使用 BullMQ / pg-boss / graphile-worker。

验收：

- 点击启动后接口快速返回。
- 后台 worker 持续推进。
- 页面通过轮询 / SSE 获取进度。

### P2-4 运行状态缺少锁，重复点击可能重复启动

修复要求：

1. `startAutonomousRun` 加状态锁：
   - run 必须是 `idle` / `paused` / `needs_attention` 才能启动。
   - 正在 `running` 时直接返回当前状态。
2. `runNextAutonomousStep` 需要防并发：
   - PostgreSQL 可用 `FOR UPDATE SKIP LOCKED` 或乐观锁字段。

## 5. 推荐开发顺序

### 阶段 1：修复选章与空 run

目标：

- 修复 `next_n_chapters`。
- 实现或移除 `project` scope。
- 修复 `chapter_range` 顺序。
- 空任务必须返回 400。

涉及文件：

```text
apps/api/src/services/autonomous-writing.service.ts
apps/api/src/routes/autonomous-runs.ts
apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue
packages/shared/src/types/autonomous-writing.ts
```

验收命令：

```bash
pnpm check
pnpm db:migrate
```

手动验收：

1. 创建 3 个有大纲但无正文的章节。
2. 开启“后续 3 章”。
3. 确认创建 3 个 run jobs。
4. 页面不能直接显示完成。

### 阶段 2：修复异常推进

目标：

- 增加 `waiting_review` run job 状态。
- fast 策略跳过异常章节并继续下一章。
- safe/balanced 进入异常队列并暂停。
- `runNextAutonomousStep` 只取 `pending`。

涉及文件：

```text
apps/api/src/db/schema/ai.ts
apps/api/src/services/autonomous-writing.service.ts
packages/shared/src/types/autonomous-writing.ts
```

如变更 enum / 状态字段，需要生成迁移。

### 阶段 3：补齐异常队列 API 与 UI

目标：

- 后端提供异常列表、resolve、ignore。
- 前端异常队列接真实 API。
- 处理后能恢复 run。

涉及文件：

```text
apps/api/src/routes/autonomous-runs.ts
apps/api/src/services/autonomous-writing.service.ts
apps/web/src/api/autonomous-runs.ts
apps/web/src/features/autonomous-writing/components/AutonomousExceptionQueue.vue
apps/web/src/features/autonomous-writing/composables/useAutonomousRun.ts
```

### 阶段 4：接入主页面与状态恢复

目标：

- `/project/:id/autopilot` 使用自动驾驶组件。
- 刷新页面后能恢复最近 run。
- 侧边栏入口稳定可见。

涉及文件：

```text
apps/web/src/router/index.ts
apps/web/src/components/AppSidebar.vue
apps/web/src/views/AutopilotView.vue
apps/web/src/features/autonomous-writing/*
```

### 阶段 5：自动修复闭环

目标：

- warning 级一致性问题可尝试自动修复。
- 修复后重新构建变更集并再次审查。
- 修复失败进入异常队列。

涉及文件：

```text
apps/api/src/services/auto-repair.service.ts
apps/api/src/services/writing-job.service.ts
apps/api/src/services/chapter-change-set.service.ts
```

### 阶段 6：后台 worker 化

目标：

- start 接口快速返回。
- 后台持续推进。
- 防止重复启动和长请求超时。

建议先做轻量本地 worker，不急着引入外部队列。

## 6. 回归测试清单

### 自动驾驶最小用例

1. 新建项目。
2. 新建 1 卷 3 章。
3. 每章有标题、目标、冲突、关键事件。
4. 正文为空。
5. 开启“后续 3 章 / balanced / 每章 3000 字”。
6. 预期：
   - 创建 3 个 autonomous run jobs。
   - 第 1 章进入 running。
   - 低风险变更自动应用。
   - 正文写入章节或场景。
   - 章后分析生成建议。
   - 健康指标更新。
   - 自动进入第 2 章。

### 高风险用例

1. 制造一个明显偏离主线的 AI 输出。
2. 预期：
   - safe/balanced 停在异常队列。
   - fast 跳过该章并继续下一章。
   - 异常记录可查看、处理、忽略。

### 空范围用例

1. 没有可写章节时启动自动驾驶。
2. 预期：
   - 接口返回 400。
   - 前端显示“没有可写章节”。
   - 不创建空 run。

## 7. 当前审查发现摘要

| 优先级 | 问题 | 影响 |
| --- | --- | --- |
| P0 | `next_n_chapters` 选不到章节 | 自动驾驶空跑 |
| P0 | `project` scope 前端可选但后端未实现 | 全书自动写作空跑 |
| P0 | `chapter_range` 用 ID 比大小 | 章节范围错乱 |
| P1 | `waiting_review` 不更新 run job 状态 | fast 策略可能重复执行同一 job |
| P1 | 异常队列无后端处理闭环 | 用户不能真正处理自动驾驶异常 |
| P1 | 自动修复服务未接入 | warning 仍不能自动闭环 |
| P1 | 自动驾驶组件未接入主页面 | 功能可能只停留在组件层 |
| P2 | 轮询不处理 paused / needs_attention | 页面状态体验不稳定 |
| P2 | 目标字数未进入生成上下文 | 自动写作无法按配置控制篇幅 |
| P2 | 同步执行长任务 | 多章写作容易超时或卡请求 |

## 8. 完成标准

这一批修复完成后，才能把系统称为“全部自动化搭建完成”：

1. 作者可以从项目页面启动自动写作。
2. 系统能自动选择下一章，而不是创建空任务。
3. 每一章能完整跑完：

```text
构建上下文
-> 生成正文
-> 构建变更集
-> 风险审查
-> 自动应用 / 异常入队
-> 章后分析
-> 更新结构化记忆
-> 更新健康指标
-> 进入下一章
```

4. 高风险不会污染正文和数据库。
5. 异常可以集中处理。
6. 页面刷新后能恢复运行状态。
7. `pnpm check`、`pnpm db:migrate` 通过。

