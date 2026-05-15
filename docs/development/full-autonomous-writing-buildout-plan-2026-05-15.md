# 全部自动化写作搭建文档

日期：2026-05-15
适用范围：自动写作驾驶舱、连续章节生成、自动审查、自动修复、变更集应用、项目健康闭环

## 1. 背景

当前系统已经完成“全自动写作主链路”的基础搭建：

```text
构建上下文
-> 生成大纲 / 场景计划
-> 生成正文
-> 构建章节变更集
-> 风险评估
-> 自动或人工审查
-> 应用变更集
-> 更新健康指标
```

现阶段的自动化特点是：

1. 低风险变更集可以自动通过。
2. 中风险变更集在平衡策略下可以自动通过。
3. 高风险变更集会暂停等待人工确认。
4. blocked 一致性检查会暂停。
5. 任务单位仍主要是“单章/单场景”。

下一阶段目标是把系统从“单任务自动化”升级为“连续写作自动驾驶”。作者不再逐章操作，而是设定写作目标、范围、风格和安全策略，系统自动规划、生成、检查、修复、回写和推进。

## 2. 总目标

搭建全部自动化写作能力：

1. 支持连续生成多章。
2. 支持按卷、章节范围、字数目标、故事阶段自动推进。
3. 支持自动修复低/中风险问题。
4. 支持高风险异常进入“异常队列”，而不是阻塞整个项目。
5. 支持后台运行和进度恢复。
6. 支持自动选择下一章、下一场景。
7. 支持自动组装场景为章节。
8. 支持自动更新角色、关系、冲突、伏笔、事实图谱、章节记忆。
9. 支持项目健康页驱动写作策略调整。
10. 支持完整审计、快照和回滚。

一句话目标：

```text
作者只设定方向，系统自动写作；作者只处理异常，而不是确认每一步。
```

## 3. 自动化分级

不要把“全部自动化”理解为“无条件写入”。应设计为可控自动化。

### 3.1 执行模式

扩展写作任务执行模式：

```ts
export type WritingJobExecutionMode =
  | 'manual'
  | 'auto'
  | 'autonomous'
```

说明：

| 模式 | 说明 |
| --- | --- |
| manual | 半自动，每个关键节点人工确认 |
| auto | 单章自动化，低风险自动通过 |
| autonomous | 连续自动驾驶，多章自动推进，异常进入队列 |

### 3.2 自动驾驶策略

新增：

```ts
export type AutonomousStrategy =
  | 'safe'
  | 'balanced'
  | 'fast'
```

含义：

| 策略 | 自动范围 | 异常处理 |
| --- | --- | --- |
| safe | 只自动应用低风险 | 中高风险进入异常队列 |
| balanced | 低/中风险自动应用 | 高风险进入异常队列 |
| fast | 尽量自动推进 | blocked 和核心设定变更才暂停 |

推荐默认：

```text
balanced
```

## 4. 新增核心概念

### 4.1 自动驾驶会话 Autonomous Run

自动驾驶不应该只是单个 writing job。需要新增上层会话：

```text
autonomous_writing_runs
```

它负责管理多章、多场景、多任务。

### 4.2 自动驾驶任务队列

每个 run 下可以产生多个 writing jobs：

```text
autonomous run
  -> chapter job 1
  -> chapter job 2
  -> chapter job 3
```

### 4.3 异常队列

高风险问题不应直接阻塞整个 run。应进入异常队列：

```text
autonomous_run_exceptions
```

系统继续处理可安全推进的章节，作者集中处理异常。

### 4.4 自动修复尝试

一致性 warning、节奏问题、轻微人物偏移可以先自动修复：

```text
generate -> check -> auto_repair -> recheck -> apply
```

## 5. 数据库设计

### 5.1 autonomous_writing_runs

文件：

```text
apps/api/src/db/schema/ai.ts
```

新增：

```ts
export const autonomousWritingRuns = pgTable('autonomous_writing_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  status: text('status').$type<
    'idle' |
    'running' |
    'paused' |
    'completed' |
    'failed' |
    'needs_attention'
  >().notNull().default('idle'),
  strategy: text('strategy').$type<'safe' | 'balanced' | 'fast'>().notNull().default('balanced'),
  scopeType: text('scope_type').$type<'project' | 'volume' | 'chapter_range' | 'next_n_chapters'>().notNull(),
  volumeId: text('volume_id'),
  startChapterId: text('start_chapter_id'),
  endChapterId: text('end_chapter_id'),
  targetChapterCount: integer('target_chapter_count'),
  targetWordsPerChapter: integer('target_words_per_chapter').notNull().default(3000),
  currentChapterId: text('current_chapter_id'),
  completedChapterCount: integer('completed_chapter_count').notNull().default(0),
  failedChapterCount: integer('failed_chapter_count').notNull().default(0),
  pausedReason: text('paused_reason'),
  lastError: text('last_error'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

### 5.2 autonomous_run_jobs

新增：

```ts
export const autonomousRunJobs = pgTable('autonomous_run_jobs', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => autonomousWritingRuns.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  writingJobId: text('writing_job_id').notNull().references(() => writingJobs.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  sceneId: text('scene_id').references(() => chapterScenes.id, { onDelete: 'set null' }),
  status: text('status').$type<'pending' | 'running' | 'completed' | 'failed' | 'skipped'>().notNull().default('pending'),
  orderIndex: integer('order_index').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

### 5.3 autonomous_run_exceptions

新增：

```ts
export const autonomousRunExceptions = pgTable('autonomous_run_exceptions', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => autonomousWritingRuns.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  changeSetId: text('change_set_id').references(() => chapterChangeSets.id, { onDelete: 'set null' }),
  exceptionType: text('exception_type').$type<
    'consistency_blocked' |
    'high_risk_change_set' |
    'apply_failed' |
    'ai_failed' |
    'health_regression' |
    'manual_required'
  >().notNull(),
  severity: text('severity').$type<'medium' | 'high' | 'critical'>().notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').$type<'open' | 'resolved' | 'ignored'>().notNull().default('open'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

## 6. Shared 类型

新增文件：

```text
packages/shared/src/types/autonomous-writing.ts
```

类型：

```ts
export type AutonomousRunStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'needs_attention'

export type AutonomousStrategy = 'safe' | 'balanced' | 'fast'

export type AutonomousScopeType =
  | 'project'
  | 'volume'
  | 'chapter_range'
  | 'next_n_chapters'

export interface AutonomousWritingRun {
  id: string
  projectId: string
  status: AutonomousRunStatus
  strategy: AutonomousStrategy
  scopeType: AutonomousScopeType
  volumeId: string | null
  startChapterId: string | null
  endChapterId: string | null
  targetChapterCount: number | null
  targetWordsPerChapter: number
  currentChapterId: string | null
  completedChapterCount: number
  failedChapterCount: number
  pausedReason: string | null
  lastError: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}
```

## 7. 后端服务设计

### 7.1 autonomous-writing.service.ts

新增文件：

```text
apps/api/src/services/autonomous-writing.service.ts
```

职责：

1. 创建自动驾驶 run。
2. 计算写作范围。
3. 自动创建 writing jobs。
4. 串行或批量执行 jobs。
5. 处理 change set 自动应用。
6. 捕获异常并写入异常队列。
7. 根据健康指标决定是否继续。

核心函数：

```ts
export async function createAutonomousRun(projectId: string, input: CreateAutonomousRunInput): Promise<AutonomousWritingRun>

export async function startAutonomousRun(projectId: string, runId: string): Promise<void>

export async function pauseAutonomousRun(projectId: string, runId: string, reason?: string): Promise<void>

export async function resumeAutonomousRun(projectId: string, runId: string): Promise<void>

export async function runNextAutonomousStep(projectId: string, runId: string): Promise<void>

export async function resolveAutonomousException(projectId: string, exceptionId: string, resolution: string): Promise<void>
```

### 7.2 自动选择下一章

新增函数：

```ts
async function pickNextChapterForRun(run): Promise<Chapter | null>
```

规则：

1. 优先选择目标范围内 `status !== completed` 的章节。
2. 如果章节不存在但范围允许，自动创建下一章占位。
3. 如果上一章存在 open 高风险 change set，则跳过或进入异常队列。
4. 如果健康指标严重下降，暂停 run。

### 7.3 自动修复服务

新增文件：

```text
apps/api/src/services/auto-repair.service.ts
```

核心函数：

```ts
export async function attemptAutoRepair(input: {
  projectId: string
  chapterId: string
  draftContent: string
  consistencyReport: ConsistencyGuardReport
  strategy: AutonomousStrategy
}): Promise<{
  repaired: boolean
  draftContent: string
  repairReport: unknown
}>
```

自动修复范围：

允许修复：

1. 节奏过慢。
2. 描写过薄。
3. 轻微语气不一致。
4. 低风险逻辑跳跃。
5. 普通伏笔提醒遗漏。

禁止自动修复：

1. 世界观核心规则冲突。
2. 主角身份、能力、秘密变化。
3. 主要人物关系反转。
4. 主线矛盾方向改变。
5. blocked 一致性结果。

### 7.4 自动异常队列

当出现以下情况，不直接让整个系统失败，而是创建 exception：

1. 高风险 change set。
2. 一致性 blocked。
3. AI 调用失败超过重试次数。
4. change set apply_failed。
5. 健康分数下降超过阈值。

策略：

| 策略 | 异常处理 |
| --- | --- |
| safe | 出现 medium/high 异常暂停 run |
| balanced | high/critical 暂停，medium 进入队列后继续 |
| fast | critical 暂停，其余入队后继续 |

## 8. 写作任务引擎调整

### 8.1 writing_jobs 增加 runId

文件：

```text
apps/api/src/db/schema/ai.ts
```

新增：

```ts
autonomousRunId: text('autonomous_run_id').references(() => autonomousWritingRuns.id, { onDelete: 'set null' })
```

用途：

1. 标识这个 job 属于哪个自动驾驶 run。
2. 健康页和日志可按 run 聚合。

### 8.2 startJob 支持被 run 调用

`startJob` 保持现有 API，但新增内部参数：

```ts
startJob(projectId, jobId, options?: {
  invokedByRunId?: string
  suppressManualPause?: boolean
})
```

`suppressManualPause` 不是跳过安全检查，而是把异常写入 run exception。

### 8.3 自动驾驶下 review_change_set 的处理

如果是 `executionMode = autonomous`：

1. 低风险自动批准并应用。
2. 中风险按 strategy 决定。
3. 高风险生成 exception。
4. 若 strategy 允许继续，则该章节 job 标记 failed/skipped，run 继续下一章。
5. 若 strategy 不允许继续，则 run 标记 `needs_attention`。

## 9. API 设计

新增路由：

```text
GET    /api/projects/:projectId/autonomous-runs
POST   /api/projects/:projectId/autonomous-runs
GET    /api/projects/:projectId/autonomous-runs/:runId
POST   /api/projects/:projectId/autonomous-runs/:runId/start
POST   /api/projects/:projectId/autonomous-runs/:runId/pause
POST   /api/projects/:projectId/autonomous-runs/:runId/resume
DELETE /api/projects/:projectId/autonomous-runs/:runId

GET    /api/projects/:projectId/autonomous-runs/:runId/exceptions
POST   /api/projects/:projectId/autonomous-runs/:runId/exceptions/:exceptionId/resolve
POST   /api/projects/:projectId/autonomous-runs/:runId/exceptions/:exceptionId/ignore
```

创建 run 输入：

```ts
interface CreateAutonomousRunInput {
  strategy: AutonomousStrategy
  scopeType: AutonomousScopeType
  volumeId?: string
  startChapterId?: string
  endChapterId?: string
  targetChapterCount?: number
  targetWordsPerChapter?: number
}
```

## 10. 前端设计

### 10.1 自动驾驶页面升级

现有 `/project/:id/autopilot` 从“单任务页”升级为“自动驾驶控制台”。

布局：

```text
左侧：自动驾驶设置
中间：运行时间线
右侧：异常队列 + 健康指标
```

### 10.2 新增组件

文件：

```text
apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue
apps/web/src/features/autonomous-writing/components/AutonomousRunTimeline.vue
apps/web/src/features/autonomous-writing/components/AutonomousExceptionQueue.vue
apps/web/src/features/autonomous-writing/components/AutonomousHealthGate.vue
```

### 10.3 控制项

创建 run 时提供：

1. 写作范围。
2. 自动驾驶策略。
3. 每章目标字数。
4. 是否自动创建缺失章节。
5. 是否允许中风险自动应用。
6. 遇到高风险是否暂停整个 run。

### 10.4 异常队列 UI

异常队列显示：

1. 异常类型。
2. 影响章节。
3. 变更集链接。
4. 建议处理方式。
5. 操作：
   - 查看
   - 修复
   - 忽略
   - 接管

## 11. 自动化闭环规则

### 11.1 自动应用规则

低风险：

```text
自动应用
```

中风险：

```text
safe: 暂停
balanced: 自动应用
fast: 自动应用
```

高风险：

```text
safe: 暂停 run
balanced: 进入异常队列，run 暂停或跳过该章
fast: 进入异常队列，继续下一章
```

critical：

```text
始终暂停 run
```

### 11.2 健康闸门

每完成一章后运行健康检查：

若出现以下情况：

1. 健康分数下降超过 15。
2. open 伏笔超过阈值。
3. 人物关系断裂超过阈值。
4. 章节记忆缺失。
5. 新增事实冲突。

系统应：

1. 创建 exception。
2. 根据 strategy 决定暂停或继续。
3. 在 run timeline 显示原因。

## 12. 开发阶段

### 阶段 1：数据模型和类型

目标：

1. 新增 autonomous run 相关表。
2. 新增 shared 类型。
3. 新增迁移。

验收：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

### 阶段 2：后端 run 服务

目标：

1. 创建 run。
2. 计算章节范围。
3. 创建关联 writing jobs。
4. 查询 run 状态。

验收：

1. API 能创建 run。
2. run 能生成任务队列。
3. 项目边界校验通过。

### 阶段 3：自动驾驶执行器

目标：

1. `startAutonomousRun` 能连续启动 jobs。
2. job 完成后自动进入下一章。
3. 异常进入 exception queue。

验收：

1. 可连续生成 2-3 章。
2. 低风险章节自动完成。
3. 高风险章节产生 exception。

### 阶段 4：自动修复

目标：

1. 对 warning 结果尝试自动修复。
2. 修复后重新一致性检查。
3. 修复失败进入 exception queue。

验收：

1. 低风险 warning 可自动修复。
2. blocked 不会自动修复后强行应用。

### 阶段 5：前端自动驾驶控制台

目标：

1. 创建 run。
2. 启动/暂停/恢复 run。
3. 查看 run timeline。
4. 查看异常队列。

验收：

1. 用户可以从 UI 一键生成多章。
2. 异常可集中处理。
3. 不再需要逐章手动创建 writing job。

### 阶段 6：健康闸门联动

目标：

1. 每章完成后写入健康指标。
2. 健康异常进入 exception queue。
3. 控制台展示风险趋势。

验收：

1. 健康下降会影响自动驾驶状态。
2. 作者能看到为什么暂停。

### 阶段 7：烟测脚本

新增：

```text
apps/api/src/scripts/smoke-autonomous-writing.ts
```

验证：

1. 创建 run。
2. 自动生成两章。
3. 检查 change set applied。
4. 检查章节正文。
5. 检查章节记忆。
6. 检查健康报告。

## 13. 测试计划

### 13.1 单元测试

新增：

```text
apps/api/src/services/__tests__/autonomous-writing.service.test.ts
apps/api/src/services/__tests__/auto-repair.service.test.ts
```

覆盖：

1. 范围选择。
2. 下一章选择。
3. 低风险自动推进。
4. 高风险异常入队。
5. 健康闸门暂停。
6. resume 后继续。

### 13.2 集成测试

流程：

```text
seed 项目
-> 创建 autonomous run
-> 生成第 1 章
-> 应用变更集
-> 更新健康
-> 自动进入第 2 章
-> 遇到高风险异常
-> 异常入队
-> run needs_attention
```

### 13.3 手动测试

场景：

1. safe 策略。
2. balanced 策略。
3. fast 策略。
4. blocked 一致性。
5. AI 调用失败。
6. change set 应用失败。
7. 健康指标下降。

## 14. 验收标准

完成后应满足：

1. 用户可以一次配置多章自动写作。
2. 系统可以自动连续推进章节。
3. 低风险章节不需要人工确认。
4. 高风险异常集中进入异常队列。
5. 自动驾驶不会因单章异常直接全局崩溃。
6. 每章都有 change set、快照、健康记录。
7. 作者可以随时暂停、恢复、接管。
8. `pnpm check` 通过。
9. `pnpm db:migrate` 通过。
10. 自动驾驶烟测脚本通过。

## 15. 不建议突破的底线

即使目标是全部自动化，也不建议取消以下底线：

1. blocked 一致性检查不得自动应用。
2. 世界观核心规则不得无审查修改。
3. 主角身份、能力、秘密不得无审查修改。
4. 主线矛盾方向不得无审查修改。
5. 数据库写入失败不得标记成功。
6. 没有快照不得应用正文。

全部自动化的正确方向不是“什么都自动写入”，而是：

```text
系统自动处理绝大多数安全工作；
系统自动隔离危险工作；
作者只处理真正需要创作判断的异常。
```
