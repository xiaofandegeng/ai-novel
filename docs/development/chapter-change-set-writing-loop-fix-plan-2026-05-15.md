# 章节变更集与统一写作闭环修复文档

日期：2026-05-15
适用范围：自动写作、章节评审、章后分析、结构化抽取、项目健康页、PlotPilot 对齐后续开发

## 1. 背景

当前项目已经具备自动写作、AI 一致性检查、章后分析、结构化建议、项目健康指标等能力，但这些能力仍然是多个松散模块串联：

```text
生成大纲 -> 审查大纲 -> 生成正文 -> 一致性检查 -> 审查正文 -> 写入正文 -> 章后分析 -> 审查建议 -> 应用建议 -> 更新健康指标
```

这个流程的问题不是功能缺失，而是缺少一个统一的“章节变更事务”。当系统一会儿自动写作、一会儿人工评审、一会儿又自动应用章后建议时，正文、章节记忆、人物关系、伏笔、事实图谱、矛盾矩阵和健康指标可能处于不同步状态。

长篇小说写作需要的是“每一章形成一个完整的变更批次”，而不是让各模块各自落库。

同时需要明确产品演进方向：系统不应该长期停留在“半自动写作”。半自动只是早期阶段用于保护作者设定和数据库质量的安全壳。随着上下文工程、风险评估、变更集、回滚、健康监控逐步成熟，系统应逐步演进为“自动化写作为主，人类只处理异常、高风险和方向性决策”的写作驾驶舱。

换句话说，未来目标不是让作者反复确认每一个 AI 输出，而是让系统具备足够可靠的约束、审查、回滚和自我修复能力，默认稳定推进写作流程。

## 1.1 自动化优先的产品原则

后续所有写作链路改造都应遵守以下原则：

1. 默认目标是自动推进，而不是人工逐步确认。
2. 人工确认只用于高风险变更、方向性选择和系统无法判断的异常。
3. 所有 AI 输出必须先进入结构化变更集，但低风险变更集可以自动应用。
4. 自动化能力必须建立在可追溯、可回滚、可审计的基础上。
5. 系统应主动发现并修复问题，而不是把所有判断都交给作者。
6. 健康页和写作任务页应从“展示结果”升级为“自动驾驶控制台”。

### 1.1.1 阶段性演进目标

| 阶段 | 写作形态 | 作者角色 | 系统职责 |
| --- | --- | --- | --- |
| 当前阶段 | 半自动写作 | 逐步确认 AI 输出 | 生成内容、等待确认 |
| 近期目标 | 自动化辅助写作 | 审查高风险节点 | 自动生成、检查、打包变更 |
| 中期目标 | 自动驾驶写作 | 设置方向和干预异常 | 自动写作、自动修复、自动回滚 |
| 长期目标 | 小说生产流水线 | 做创作总监 | 连续生成章节、维护设定、控制节奏、输出成稿 |

### 1.1.2 半自动能力的定位

半自动能力仍然保留，但它的定位应调整为：

1. 新用户熟悉系统时的安全模式。
2. 高风险章节的人工控制模式。
3. 调试 AI 上下文、Prompt、模型配置时的可观察模式。
4. 自动化失败后的人工接管模式。

不要再把半自动作为主流程终态。

## 2. 当前风险

### 2.1 写作和评审状态不一致

位置：

```text
apps/api/src/services/writing-job.service.ts
apps/web/src/features/writing-jobs/composables/useWritingJobController.ts
```

风险：

1. `confirm_plan`、`consistency_check`、`confirm_apply`、`confirm_suggestions` 都是确认节点，但服务层和前端对“可确认状态”的判断不完全一致。
2. 某些确认节点返回暂停后，步骤状态可能仍然停在 `running`，但审批接口要求 `completed`。
3. 页面看到“等待审查”，但后端不一定允许继续确认。

### 2.2 全自动模式可能跳过关键风险

位置：

```text
apps/api/src/services/writing-job-auto-approval.service.ts
```

风险：

1. `balanced` 策略允许一致性 `warning` 自动通过。
2. 但 warning 可能包含人物跑偏、世界观规则冲突、伏笔断裂、主线偏题。
3. 长篇小说里这些 warning 不应该简单按等级通过，而应该按风险类型决定是否暂停。

### 2.3 正文写入和结构化回写不是原子闭环

位置：

```text
apps/api/src/services/writing-job.service.ts
apps/api/src/services/chapter-postprocess.service.ts
apps/api/src/services/postprocess-suggestion.service.ts
```

风险：

1. 正文可能已写入，但章后分析失败。
2. 章后建议可能已生成，但没有应用到角色、关系、伏笔、事实图谱。
3. 建议可能已应用，但健康指标仍基于旧数据。
4. 用户无法清楚知道“这一章到底带来了哪些设定变化”。

### 2.4 场景模式和章节模式上下文混用

位置：

```text
apps/api/src/services/writing-job.service.ts
```

风险：

1. `scene_draft` 使用 `generate_scene_draft` 生成场景计划。
2. 后续 `generate_draft` 主要读取 `generate_plan` 输出。
3. 场景模式没有稳定的“场景计划 -> 场景正文 -> 场景后处理 -> 汇总章节”的闭环。

### 2.5 项目健康页缺少批次来源

位置：

```text
apps/api/src/services/health-metrics.service.ts
apps/api/src/services/writing-job.service.ts
```

风险：

健康页能看到当前风险，但不容易追溯：

1. 哪个写作任务引入了风险。
2. 哪一章改变了关系、伏笔、事实或矛盾。
3. 哪些风险是 AI 自动写作产生的。
4. 哪些风险已经被用户确认接受。

## 3. 目标

新增“章节变更集 Chapter Change Set”机制，把一次章节写作产生的正文、审查结果、结构化抽取、建议、健康变化统一收束。

目标流程：

```text
构建上下文
-> 生成章节计划
-> 生成正文草稿
-> 一致性检查
-> 抽取结构化变化
-> 生成 ChapterChangeSet
-> 风险评估
-> 作者确认 / 自动低风险通过
-> 一次性应用正文、记忆、事实、人物、关系、伏笔、矛盾
-> 保存快照
-> 更新健康指标
```

核心原则：

1. AI 生成内容不能分散直接写入业务表。
2. 所有写作结果先进入变更集。
3. 变更集通过审查后再统一应用。
4. 全自动只能自动应用低风险变更集。
5. 高风险变更必须暂停并进入确认区。
6. 每个章节变更集都必须可追溯、可回滚、可审计。

## 4. 数据模型修改

### 4.1 新增 chapter_change_sets 表

文件：

```text
apps/api/src/db/schema/postprocess.ts
```

新增表：

```ts
export const chapterChangeSets = pgTable('chapter_change_sets', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  sceneId: text('scene_id').references(() => chapterScenes.id, { onDelete: 'set null' }),
  writingJobId: text('writing_job_id').references(() => writingJobs.id, { onDelete: 'set null' }),
  sourceStepId: text('source_step_id').references(() => writingJobSteps.id, { onDelete: 'set null' }),
  status: text('status').$type<
    'drafted' |
    'reviewing' |
    'approved' |
    'applied' |
    'blocked' |
    'rejected' |
    'apply_failed'
  >().notNull().default('drafted'),
  riskLevel: text('risk_level').$type<'low' | 'medium' | 'high'>().notNull().default('medium'),
  riskSummary: text('risk_summary'),
  draftTitle: text('draft_title'),
  draftContent: text('draft_content'),
  consistencyReportJson: jsonb('consistency_report_json'),
  extractedChangesJson: jsonb('extracted_changes_json').notNull().default({}),
  applyReportJson: jsonb('apply_report_json'),
  beforeSnapshotId: text('before_snapshot_id'),
  afterSnapshotId: text('after_snapshot_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  appliedAt: timestamp('applied_at'),
})
```

说明：

1. `draftContent` 保存本次 AI 生成正文，不直接覆盖 `chapters.draft`。
2. `consistencyReportJson` 保存一致性审查结果。
3. `extractedChangesJson` 保存章后抽取结果，例如角色变化、关系变化、伏笔变化、事实变化、矛盾变化。
4. `applyReportJson` 保存最终应用了哪些实体、跳过了哪些实体、失败了哪些实体。
5. `beforeSnapshotId` 和 `afterSnapshotId` 用于回滚和审计。

### 4.2 新增 chapter_change_set_items 表

新增表：

```ts
export const chapterChangeSetItems = pgTable('chapter_change_set_items', {
  id: text('id').primaryKey(),
  changeSetId: text('change_set_id').notNull().references(() => chapterChangeSets.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  itemType: text('item_type').$type<
    'draft' |
    'character_create' |
    'character_update' |
    'relationship_create' |
    'relationship_update' |
    'conflict_create' |
    'conflict_update' |
    'foreshadowing_create' |
    'foreshadowing_payoff' |
    'fact_create' |
    'chapter_memory' |
    'style_note' |
    'continuity_note'
  >().notNull(),
  riskLevel: text('risk_level').$type<'low' | 'medium' | 'high'>().notNull().default('medium'),
  title: text('title').notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  status: text('status').$type<'pending' | 'approved' | 'applied' | 'blocked' | 'rejected' | 'apply_failed'>().notNull().default('pending'),
  applyError: text('apply_error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

说明：

1. `chapter_change_sets` 是批次。
2. `chapter_change_set_items` 是批次里的具体变更项。
3. 页面确认时可以按 item 单独批准/拒绝，也可以整批批准。

### 4.3 writing_job_steps 增加 changeSetId

文件：

```text
apps/api/src/db/schema/ai.ts
```

新增：

```ts
changeSetId: text('change_set_id').references(() => chapterChangeSets.id, { onDelete: 'set null' })
```

用途：

1. 让写作任务步骤能定位当前章节变更集。
2. UI 能从审查步骤直接打开变更集详情。

### 4.4 生成迁移

执行：

```bash
pnpm db:generate
pnpm db:migrate
```

迁移要求：

1. 不破坏已有写作任务。
2. 旧任务没有 `changeSetId` 时照常展示，但提示“旧任务不支持统一变更集”。
3. 外键必须包含 `projectId` 查询校验，避免跨项目污染。

## 5. Shared 类型修改

文件：

```text
packages/shared/src/types/chapter-change-set.ts
packages/shared/src/types/index.ts
```

新增：

```ts
export type ChapterChangeSetStatus =
  | 'drafted'
  | 'reviewing'
  | 'approved'
  | 'applied'
  | 'blocked'
  | 'rejected'
  | 'apply_failed'

export type ChangeSetItemType =
  | 'draft'
  | 'character_create'
  | 'character_update'
  | 'relationship_create'
  | 'relationship_update'
  | 'conflict_create'
  | 'conflict_update'
  | 'foreshadowing_create'
  | 'foreshadowing_payoff'
  | 'fact_create'
  | 'chapter_memory'
  | 'style_note'
  | 'continuity_note'

export interface ChapterChangeSet {
  id: string
  projectId: string
  chapterId: string
  sceneId: string | null
  writingJobId: string | null
  sourceStepId: string | null
  status: ChapterChangeSetStatus
  riskLevel: 'low' | 'medium' | 'high'
  riskSummary: string | null
  draftTitle: string | null
  draftContent: string | null
  consistencyReportJson: unknown
  extractedChangesJson: unknown
  applyReportJson: unknown
  beforeSnapshotId: string | null
  afterSnapshotId: string | null
  createdAt: string
  updatedAt: string
  appliedAt: string | null
}

export interface ChapterChangeSetItem {
  id: string
  changeSetId: string
  projectId: string
  chapterId: string
  itemType: ChangeSetItemType
  riskLevel: 'low' | 'medium' | 'high'
  title: string
  payloadJson: unknown
  status: 'pending' | 'approved' | 'applied' | 'blocked' | 'rejected' | 'apply_failed'
  applyError: string | null
  createdAt: string
  updatedAt: string
}
```

## 6. 后端服务设计

### 6.1 新增 chapter-change-set.service.ts

文件：

```text
apps/api/src/services/chapter-change-set.service.ts
```

职责：

1. 创建变更集。
2. 从 AI 草稿和章后分析结果生成变更项。
3. 计算风险等级。
4. 审批变更集。
5. 应用变更集。
6. 回滚或标记失败。

核心函数：

```ts
export async function createChapterChangeSet(input: {
  projectId: string
  chapterId: string
  sceneId?: string
  writingJobId?: string
  sourceStepId?: string
  draftTitle?: string
  draftContent: string
  consistencyReport: ConsistencyGuardReport
  extractedChanges: ChapterPostprocessResult
}): Promise<ChapterChangeSet>

export async function approveChangeSet(projectId: string, changeSetId: string): Promise<ChapterChangeSet>

export async function rejectChangeSet(projectId: string, changeSetId: string, reason?: string): Promise<ChapterChangeSet>

export async function applyChangeSet(projectId: string, changeSetId: string): Promise<ApplyChangeSetResult>

export async function autoEvaluateChangeSet(projectId: string, changeSetId: string, level: AutoApprovalLevel): Promise<AutoApprovalDecision>
```

### 6.2 风险分级规则

低风险：

1. 章节记忆摘要。
2. 风格笔记。
3. 普通连续性提醒。
4. 不影响主线的低置信事实。

中风险：

1. 新增配角。
2. 新增弱关系。
3. 新增支线矛盾。
4. 新增伏笔。

高风险：

1. 修改主角核心目标、秘密、身份、能力。
2. 修改世界观规则。
3. 修改主要人物关系类型。
4. 回收关键伏笔。
5. 改变主线矛盾状态。
6. 一致性检查 `blocked`。
7. 大纲目标和生成正文不一致。

全自动规则：

| 模式 | 可自动应用 |
| --- | --- |
| conservative | 只应用低风险 `chapter_memory`、`style_note`、`continuity_note` |
| balanced | 应用低风险，允许部分中风险新增项，但不允许修改核心设定 |
| aggressive | 暂不开放 |

## 7. 写作任务流程重构

### 7.1 新流程

替换当前分散式流程：

```text
generate_draft
-> consistency_check
-> confirm_apply
-> apply_draft
-> save_version
-> postprocess
-> confirm_suggestions
-> apply_suggestions
-> update_health
```

调整为：

```text
generate_draft
-> consistency_check
-> build_change_set
-> review_change_set
-> apply_change_set
-> update_health
-> done
```

### 7.2 新增步骤类型

文件：

```text
packages/shared/src/types/writing-job-step.ts
apps/api/src/db/schema/ai.ts
apps/api/src/services/writing-job.service.ts
```

新增：

```ts
type WritingJobStepType =
  | ...
  | 'build_change_set'
  | 'review_change_set'
  | 'apply_change_set'
```

保留旧步骤但标记为兼容：

```text
apply_draft
save_version
postprocess
confirm_suggestions
apply_suggestions
```

新任务默认使用新流程。旧任务继续按旧流程跑，避免破坏已有数据。

### 7.3 build_change_set

输入：

1. `generate_draft.output`
2. `consistency_check.output`
3. 当前章节上下文

执行：

1. 不写入 `chapters.draft`。
2. 调用章后抽取服务，但结果只生成 change set items。
3. 创建 `chapter_change_sets`。
4. 把 `changeSetId` 写回当前 step。

输出：

```json
{
  "changeSetId": "xxx",
  "riskLevel": "medium",
  "itemCount": 8,
  "blockedCount": 1
}
```

### 7.4 review_change_set

人工模式：

1. 一律暂停。
2. UI 展示正文差异、结构化变更、风险摘要。

自动模式：

1. 调用 `autoEvaluateChangeSet`。
2. 低风险通过。
3. 高风险暂停。
4. `blocked` 必须暂停。

### 7.5 apply_change_set

必须放在数据库事务里执行：

```ts
await db.transaction(async (tx) => {
  // 1. 保存写入前快照
  // 2. 写入章节正文或场景正文
  // 3. 应用人物/关系/伏笔/事实/矛盾变更
  // 4. 写入章节记忆
  // 5. 标记 items applied
  // 6. 标记 change set applied
  // 7. 保存写入后快照
})
```

失败要求：

1. 不允许出现正文已写入、结构化数据没写入的半状态。
2. 失败时 `chapter_change_sets.status = apply_failed`。
3. `applyReportJson` 记录失败项。

## 8. 章后分析重构

当前章后分析可以继续用于手动保存，但自动写作任务中应改为“生成变更项”，而不是直接写入建议队列。

### 8.1 新增 extractChapterChanges

文件：

```text
apps/api/src/services/chapter-postprocess.service.ts
```

新增：

```ts
export async function extractChapterChanges(input: {
  projectId: string
  chapterId: string
  sceneId?: string
  content: string
  trigger: 'manual_save' | 'mark_completed' | 'auto_drive'
}): Promise<{
  memory: ChapterMemoryPayload
  facts: FactChangePayload[]
  characters: CharacterChangePayload[]
  relationships: RelationshipChangePayload[]
  conflicts: ConflictChangePayload[]
  foreshadowing: ForeshadowingChangePayload[]
  notes: ContinuityNotePayload[]
}>
```

规则：

1. 只抽取，不落业务表。
2. 调用方决定是进入建议队列，还是进入 change set。
3. 自动写作只进入 change set。

### 8.2 保留 runChapterPostprocess

`runChapterPostprocess` 保留给手动流程使用，但内部应复用 `extractChapterChanges`，避免两套 AI 抽取逻辑漂移。

## 9. API 设计

新增路由：

```text
GET    /api/projects/:projectId/chapters/:chapterId/change-sets
GET    /api/projects/:projectId/change-sets/:id
POST   /api/projects/:projectId/change-sets/:id/approve
POST   /api/projects/:projectId/change-sets/:id/reject
POST   /api/projects/:projectId/change-sets/:id/apply
POST   /api/projects/:projectId/change-sets/:id/items/:itemId/approve
POST   /api/projects/:projectId/change-sets/:id/items/:itemId/reject
```

归属校验：

1. 每个接口必须同时校验 `projectId`。
2. 涉及 `chapterId` 时必须校验章节归属。
3. 涉及 `sceneId` 时必须校验场景归属。
4. 涉及 item 时必须校验 item 属于 change set。

## 10. 前端修改

### 10.1 新增 API 层

文件：

```text
apps/web/src/api/chapter-change-sets.ts
```

函数：

```ts
fetchChapterChangeSets(projectId, chapterId)
fetchChapterChangeSet(projectId, id)
approveChapterChangeSet(projectId, id)
rejectChapterChangeSet(projectId, id, reason)
applyChapterChangeSet(projectId, id)
approveChangeSetItem(projectId, changeSetId, itemId)
rejectChangeSetItem(projectId, changeSetId, itemId)
```

### 10.2 新增 store

文件：

```text
apps/web/src/stores/chapter-change-set.store.ts
```

职责：

1. 当前变更集列表。
2. 当前待审查变更集。
3. 批准、拒绝、应用操作。
4. 统一 toast 错误处理。

### 10.3 写作任务页接入变更集评审

文件：

```text
apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue
```

当步骤为 `review_change_set` 时展示：

1. 正文差异预览。
2. 一致性报告。
3. 结构化变更列表。
4. 风险标签。
5. 操作按钮：
   - 批准整批
   - 拒绝整批
   - 逐项调整
   - 应用并继续

### 10.4 新增 ChapterChangeSetReviewPanel

文件：

```text
apps/web/src/features/writing-jobs/components/ChapterChangeSetReviewPanel.vue
```

UI 要求：

1. 不使用弹窗作为主要评审面板。
2. 左侧展示正文 diff。
3. 右侧展示结构化变更项。
4. 高风险项默认展开。
5. 低风险项可折叠。
6. 所有 AI 变更都必须有“来源说明”和“应用影响”。

## 11. 全自动模式收敛

全自动不再自动通过单个零散步骤，而是自动评估整个 change set。

### 11.1 禁止的自动行为

全自动模式下仍禁止：

1. 自动修改世界观核心规则。
2. 自动修改主角身份、能力、秘密。
3. 自动改变主要人物关系类型。
4. 自动关闭主线伏笔。
5. 自动改变主线矛盾状态。
6. 自动接受一致性 `blocked`。

### 11.2 允许的自动行为

允许：

1. 写入已通过一致性检查的章节正文。
2. 保存章节记忆。
3. 新增低风险连续性备注。
4. 新增低风险风格备注。
5. 新增普通事实候选，但状态为 `pending`。

## 12. 健康页联动

文件：

```text
apps/api/src/services/health-metrics.service.ts
apps/web/src/views/ProjectHealthView.vue
```

新增指标：

1. 最近 5 个 change set 风险趋势。
2. 自动写作引入的高风险项数量。
3. 已应用但未被后续章节引用的事实数量。
4. 已生成正文但未完成结构化应用的章节。
5. change set apply_failed 数量。

健康页文案：

```text
最近章节存在未完成的 AI 变更集，建议先完成审查再继续自动写作。
```

## 13. 开发阶段

### 阶段 1：修复现有确认状态

目标：

1. 确认节点暂停时，step 状态必须稳定可确认。
2. 前端只展示当前待审查节点。

修改：

```text
apps/api/src/services/writing-job.service.ts
apps/web/src/features/writing-jobs/composables/useWritingJobController.ts
apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue
```

验收：

1. 半自动模式能从大纲审查继续到正文审查。
2. 不会重复展示旧审查节点。
3. `pnpm check` 通过。

### 阶段 2：新增 change set 数据模型

目标：

1. 新增表。
2. 新增 shared 类型。
3. 新增迁移。

验收：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

### 阶段 3：新增 change set 服务与 API

目标：

1. 创建变更集。
2. 查询变更集。
3. 批准/拒绝/应用变更集。

验收：

1. API 能返回 change set 和 items。
2. 跨项目访问返回 404 或 403。
3. 应用失败不会产生半落库。

### 阶段 4：章后分析抽取层拆分

目标：

1. 把 AI 抽取拆成 `extractChapterChanges`。
2. 自动写作只创建 change set，不直接应用建议。

验收：

1. 自动写作后能看到 change set。
2. 结构化变更不会直接污染角色库、关系网、伏笔台账。

### 阶段 5：写作任务流程接入 change set

目标：

1. 新任务使用 `build_change_set -> review_change_set -> apply_change_set`。
2. 旧任务兼容旧流程。

验收：

1. 半自动任务会停在 change set 评审。
2. 全自动任务只在低风险 change set 下自动应用。
3. 高风险 change set 自动暂停。

### 阶段 6：前端评审面板

目标：

1. 新增 `ChapterChangeSetReviewPanel.vue`。
2. 写作任务页接入。
3. 支持逐项批准/拒绝。

验收：

1. 用户能看清正文变化和结构化变化。
2. 高风险项醒目显示。
3. 不使用原生 confirm。

### 阶段 7：健康页和回滚链路

目标：

1. 健康页展示 change set 风险。
2. 版本历史能关联 change set。
3. apply_failed 可重试或回滚。

验收：

1. 健康页能指出哪一章引入风险。
2. 版本历史能看到全自动写作前后快照。

## 14. 测试计划

### 14.1 单元测试

新增测试：

```text
apps/api/src/services/__tests__/chapter-change-set.service.test.ts
apps/api/src/services/__tests__/writing-job-auto-approval.service.test.ts
apps/api/src/services/__tests__/writing-job.service.test.ts
```

覆盖：

1. 低风险 change set 自动通过。
2. 高风险 change set 自动暂停。
3. apply_change_set 事务失败不会写入半数据。
4. blocked 一致性报告永远不能自动应用。
5. 场景正文不会误写到章节正文。

### 14.2 集成测试

测试流程：

```text
创建项目
-> 创建章节
-> 创建全自动写作任务
-> 启动任务
-> 生成 change set
-> 自动应用或暂停
-> 检查章节正文、记忆、事实、关系、伏笔、健康指标
```

### 14.3 手动验收

至少验证：

1. 半自动模式。
2. 全自动保守模式。
3. 全自动平衡模式。
4. 一致性 blocked。
5. 章后抽取包含新角色。
6. 章后抽取包含关系变化。
7. 章后抽取包含伏笔回收。
8. apply failed 后重试。

## 15. 验收标准

完成后应满足：

1. 自动写作不会直接散落写入多个业务表。
2. 每次章节写作都有一个可追溯的 change set。
3. 作者能看到“这一章改变了什么”。
4. 全自动模式只自动应用低风险变更。
5. 高风险变更必须暂停。
6. 健康页能追踪风险来源。
7. 场景写作和章节写作不会混用输出。
8. 所有关键流程 `pnpm check` 通过。
9. 数据库迁移可在新库和已有库上执行。

## 16. 推荐下一步

优先执行阶段 1 和阶段 2：

1. 先修复现有确认状态，避免当前写作任务卡死或重复确认。
2. 再新增 change set 表和 shared 类型。

不要先继续扩大全自动能力。否则自动写作越强，正文、结构化设定和健康评估之间的不同步风险越大。
