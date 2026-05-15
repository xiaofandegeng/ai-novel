# 全自动写作闭环后续修复文档

日期：2026-05-15
适用范围：自动写作任务、章节变更集、场景写作、结构化回写、项目健康指标

## 1. 背景

当前代码已经新增了全自动写作相关框架：

1. `chapter_change_sets`
2. `chapter_change_set_items`
3. `build_change_set`
4. `review_change_set`
5. `apply_change_set`
6. 自动审批逻辑
7. 前端变更集审查面板

这说明系统已经从“半自动写作”开始向“自动化写作驾驶舱”演进。

但是当前实现还不能算完成稳定的全自动写作闭环。主要问题是：写作任务可以自动跑到后续步骤，但变更集的批准、应用、结构化回写、场景写入和项目边界校验还存在断点。

目标不是只让任务状态变成 `completed`，而是要保证：

```text
生成正文
-> 构建变更集
-> 风险审查
-> 自动或人工批准
-> 一次性应用正文与结构化变更
-> 更新记忆、事实、人物、关系、伏笔、矛盾
-> 更新健康指标
```

每一步都真实发生，并且失败时不会留下半完成数据。

## 2. 当前验收结论

当前状态：

```text
全自动写作框架：已实现
稳定全自动写作闭环：未完成
```

`pnpm check` 已通过，但仍有 UnoCSS warning：

```text
apps/web/src/features/writing-jobs/components/ChapterChangeSetReviewPanel.vue
  unocss/order warnings
```

这些 warning 不阻塞当前构建，但需要在本轮修复中一起收尾。

## 3. P1 问题

### P1-1：自动通过变更集后没有批准变更项

位置：

```text
apps/api/src/services/writing-job.service.ts
apps/api/src/services/chapter-change-set.service.ts
```

现象：

1. 全自动模式下，`review_change_set` 被自动通过。
2. 服务层只把 step 标记为 `completed`。
3. 没有调用 `approveChangeSetSvc`。
4. `applyChangeSet` 只应用 `status === 'approved'` 的 items。
5. 结果是正文可能写入，但角色、事实、伏笔、章节记忆等结构化变更仍是 `pending`，不会被应用。

修复要求：

在 `runNextSteps` 自动通过确认节点时，如果当前 step 是 `review_change_set` 且存在 `changeSetId`，必须先批准变更集：

```ts
if (step.stepType === 'review_change_set' && updatedStep.changeSetId) {
  await approveChangeSetSvc(projectId, updatedStep.changeSetId)
}
```

注意：

1. 只允许低风险或策略允许的变更集自动批准。
2. 高风险变更集必须继续暂停。
3. 自动批准后应写入 `autoDecision = 'approved'` 和原因。

验收：

1. 全自动低风险任务执行后，change set items 从 `pending` 变成 `applied`。
2. 章节记忆、事实、伏笔等低风险结构化数据真实写入。
3. 高风险 change set 不会被自动批准。

### P1-2：人工审查模式可能卡在不可确认状态

位置：

```text
apps/api/src/services/writing-job.service.ts
apps/web/src/features/writing-jobs/composables/useWritingJobController.ts
```

现象：

1. `review_change_set` 返回 `false` 表示暂停。
2. 后端进入 `waiting_review`。
3. 但 step 状态可能仍是 `running`。
4. `approveStep` 要求 `step.status === 'completed'`。
5. 页面看起来等待审查，实际点击确认可能失败。

修复方案：

确认节点暂停时统一把 step 设置成可确认状态：

```ts
await db.update(writingJobSteps).set({
  status: 'completed',
  reviewRequired: true,
  autoDecision: 'paused',
  autoDecisionReason: decision.reason,
  finishedAt: now(),
  updatedAt: now(),
}).where(eq(writingJobSteps.id, step.id))
```

适用节点：

```text
confirm_plan
consistency_check
confirm_apply
confirm_suggestions
review_change_set
```

验收：

1. 半自动任务进入等待审查后，当前审查 step 状态为 `completed`。
2. 前端能展示当前待审查节点。
3. 用户点击确认后能继续执行下一步。
4. 不会重复展示旧确认节点。

### P1-3：变更集应用会假 applied

位置：

```text
apps/api/src/services/chapter-change-set.service.ts
```

现象：

1. `applyChangeSet` 遍历 approved items。
2. 单个 item 写入失败后 catch 错误并继续。
3. 最后仍把整个 change set 标记为 `applied`。
4. 用户看到“已应用”，但实际上部分结构化数据失败。

修复方案：

改为严格事务语义：

1. 关键 item 失败时抛错。
2. 整个 change set 标记为 `apply_failed`。
3. 不允许整批标记 `applied`。
4. `applyReportJson` 记录失败项。

建议伪代码：

```ts
try {
  return await db.transaction(async (tx) => {
    // apply draft
    // apply every approved item
    // if any critical item fails, throw
    // mark change set applied
  })
}
catch (error) {
  await db.update(chapterChangeSets).set({
    status: 'apply_failed',
    applyReportJson: {
      error: error.message,
      failedAt: now(),
    },
    updatedAt: now(),
  }).where(and(
    eq(chapterChangeSets.id, changeSetId),
    eq(chapterChangeSets.projectId, projectId),
  ))
  throw error
}
```

关键 item：

```text
draft
chapter_memory
fact_create
character_create
relationship_create
relationship_update
conflict_create
conflict_update
foreshadowing_create
foreshadowing_payoff
```

可降级 item：

```text
style_note
continuity_note
```

验收：

1. 任一关键结构化写入失败时，change set 不能标记为 `applied`。
2. 失败原因写入 `applyReportJson`。
3. 前端能看到失败状态。
4. 修复后可重试应用。

### P1-4：场景自动写作没有完整闭环

位置：

```text
apps/api/src/services/writing-job.service.ts
apps/api/src/services/chapter-change-set.service.ts
```

现象：

1. `scene_draft` 使用 `generate_scene_draft` 生成场景计划。
2. 后续 `generate_draft` 仍读取 `generate_plan`。
3. 场景模式没有稳定使用 `generate_scene_draft` 作为正文生成依据。
4. `applyChangeSet` 只写 `chapters.draft`，没有按 `sceneId` 写 `chapter_scenes.content`。

修复方案：

#### 4.1 生成正文时区分场景模式

在 `generate_draft` 中：

```ts
const planOutput = job.mode === 'scene_draft'
  ? previousStepOutputs.get('generate_scene_draft')
  : previousStepOutputs.get('generate_plan')
```

#### 4.2 应用变更集时区分写入目标

如果 change set 有 `sceneId`：

```ts
await tx.update(chapterScenes).set({
  content: fullChangeSet.draftContent,
  status: 'reviewed',
  updatedAt: now(),
}).where(and(
  eq(chapterScenes.id, fullChangeSet.sceneId),
  eq(chapterScenes.projectId, projectId),
  eq(chapterScenes.chapterId, fullChangeSet.chapterId),
))
```

否则写入：

```ts
chapters.draft
```

验收：

1. 场景自动写作写入 `chapter_scenes.content`。
2. 章节自动写作写入 `chapters.draft`。
3. 场景模式不会误覆盖整章正文。
4. 场景完成后可继续走章后分析和健康更新。

### P1-5：服务层项目归属校验不够硬

位置：

```text
apps/api/src/services/writing-job.service.ts
apps/api/src/services/chapter-change-set.service.ts
```

现象：

1. `getJobAndChapter` 查询 chapter/scene 时只按 id 查。
2. `applyChangeSet` 查询和更新 chapter 时也只按 id 查。
3. 虽然路由创建时有部分校验，但服务层作为核心任务引擎必须兜底。

修复要求：

所有章节查询必须同时限制：

```ts
and(
  eq(chapters.id, chapterId),
  eq(chapters.projectId, projectId),
)
```

所有场景查询必须同时限制：

```ts
and(
  eq(chapterScenes.id, sceneId),
  eq(chapterScenes.projectId, projectId),
  eq(chapterScenes.chapterId, chapterId),
)
```

`createChapterChangeSet` 必须先校验：

1. chapter 属于 project。
2. scene 属于 project 和 chapter。
3. writingJob 属于 project。
4. sourceStep 属于 writingJob。

验收：

1. 不能通过异常任务写入其他项目章节。
2. 不能通过异常 change set 应用其他项目数据。
3. 跨项目 ID 请求返回错误。

## 4. P2 问题

### P2-1：UnoCSS warning 未收尾

位置：

```text
apps/web/src/features/writing-jobs/components/ChapterChangeSetReviewPanel.vue
```

现象：

`pnpm check` 通过，但 lint 输出 4 个 `unocss/order` warning。

修复要求：

调整 class 顺序，消除 warning。

验收：

```bash
pnpm lint
```

无 warning。

## 5. 推荐修改顺序

### 阶段 1：修复确认节点状态

先修 `P1-2`。

原因：

1. 这是半自动和全自动共用的流程基础。
2. 如果确认状态不稳，后续变更集评审面板也会卡住。

### 阶段 2：修复自动批准变更集

修 `P1-1`。

原因：

1. 这是全自动结构化回写的核心断点。
2. 不修的话，全自动只会写正文，不会完整更新设定台账。

### 阶段 3：修复变更集应用事务

修 `P1-3`。

原因：

1. 防止假 applied。
2. 防止章节正文和结构化数据不一致。

### 阶段 4：修复场景写作闭环

修 `P1-4`。

原因：

1. 场景写作和章节写作必须分离目标。
2. 否则自动写作会误覆盖整章正文。

### 阶段 5：补齐服务层归属校验

修 `P1-5`。

原因：

1. 自动任务是后台链路，不能只依赖路由层校验。
2. 项目边界必须在服务层兜底。

### 阶段 6：清理 UI warning

修 `P2-1`。

## 6. 测试计划

### 6.1 单元测试

新增或补充：

```text
apps/api/src/services/__tests__/writing-job.service.test.ts
apps/api/src/services/__tests__/chapter-change-set.service.test.ts
apps/api/src/services/__tests__/writing-job-auto-approval.service.test.ts
```

覆盖：

1. 半自动任务进入 review 后可确认继续。
2. 全自动低风险 change set 自动 approved + applied。
3. 高风险 change set 自动暂停。
4. item 写入失败时 change set 为 `apply_failed`。
5. 场景任务写入 scene content，不写 chapter draft。
6. 跨项目 chapterId / sceneId 被拒绝。

### 6.2 集成测试

建议新增脚本：

```text
apps/api/src/scripts/smoke-auto-writing.ts
```

流程：

```text
1. 创建测试项目
2. 创建故事设定、角色、章节、场景
3. 创建全自动 draft_only 任务
4. 启动任务
5. 检查任务 completed 或 waiting_review
6. 如果低风险 completed，检查：
   - chapters.draft 已写入
   - chapter_memories 已更新
   - story_fact_triples 有新增或保持一致
   - chapter_change_sets.status = applied
   - chapter_change_set_items.status = applied
   - project_health_reports 有新增
7. 创建 scene_draft 任务
8. 检查 scene.content 已写入，chapter.draft 未被误覆盖
```

### 6.3 手动验收

在前端验证：

1. 创建半自动任务。
2. 审查变更集。
3. 点击确认后任务继续。
4. 创建全自动保守任务。
5. 低风险任务自动完成。
6. 创建含新角色/新冲突的高风险任务。
7. 任务自动暂停在变更集审查。
8. 进入健康页能看到变更集风险。

## 7. 验收命令

普通代码门禁：

```bash
pnpm check
```

数据库门禁：

```bash
pnpm db:migrate
```

如修改 schema：

```bash
pnpm db:generate
pnpm db:migrate
```

可选烟测：

```bash
pnpm --filter @ai-novel/api db:seed
pnpm --filter @ai-novel/api smoke:auto-writing
```

## 8. 完成标准

本轮完成后应满足：

1. 全自动低风险章节能从生成到应用完整跑完。
2. 全自动不只是写正文，还能应用低风险结构化变更。
3. 高风险变更集必须暂停。
4. 变更集应用失败不会假装成功。
5. 场景写作不会误写章节正文。
6. 项目边界由服务层兜底。
7. 健康页能看到变更集风险。
8. `pnpm check` 无错误，lint warning 清零。
