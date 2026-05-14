# 阶段 A：半自动驾驶写作舱 v1 修改文档

日期：2026-05-14  
状态：待实施  
前置文档：[PlotPilot 后续对齐总路线图](./plotpilot-alignment-master-plan-2026-05-14.md)

## 1. 目标

把现有 `writing_jobs` 从“步骤任务”升级为作者可控的半自动驾驶写作舱。

目标流程：

```text
选择章节 / 场景
  -> 准备上下文
  -> 生成章节计划
  -> 作者确认计划
  -> 生成场景草稿或章节草稿
  -> 一致性检查
  -> 作者确认写入
  -> 保存版本
  -> 章后分析
  -> 待确认建议
  -> 健康指标刷新
```

## 2. 修改范围

后端：

```text
apps/api/src/db/schema/operations.ts
apps/api/src/routes/writing-jobs.ts
apps/api/src/services/writing-job.service.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/services/consistency-guard.service.ts
apps/api/src/services/chapter-postprocess.service.ts
apps/api/src/services/authoring-event.service.ts
packages/shared/src
```

前端：

```text
apps/web/src/views/WritingJobView.vue
apps/web/src/features/writing-jobs/components/WritingJobLauncher.vue
apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue
apps/web/src/features/writing-jobs/composables/useWritingJobController.ts
apps/web/src/stores/writing-job.store.ts
apps/web/src/api/writing-jobs.ts
```

## 3. 数据模型要求

确认 `writing_jobs` 至少支持：

```text
id
project_id
current_chapter_id
scene_id
mode
status
last_error
created_at
updated_at
```

确认 `writing_job_steps` 至少支持：

```text
id
job_id
step_type
status
input
output
error
started_at
finished_at
created_at
updated_at
```

建议新增或补齐 step 类型：

```text
prepare_context
generate_plan
confirm_plan
generate_scene_draft
generate_draft
consistency_check
confirm_apply
apply_draft
save_version
postprocess
health_refresh
done
```

## 4. 后端服务改造

### 4.1 startJob

`startJob(projectId, jobId)` 必须：

1. 校验 `job.projectId === projectId`。
2. 校验 `currentChapterId` 和 `sceneId` 属于当前项目。
3. 根据 mode 初始化 step 序列。
4. 创建缺失的 `writing_job_steps`。
5. 从第一个 pending step 开始执行。
6. 遇到确认节点时设置 `job.status = waiting_review`。

### 4.2 approveStep

`approveStep(projectId, jobId, stepId, payload)` 必须：

1. 校验项目归属。
2. 只能批准当前待确认步骤。
3. `confirm_plan` 后继续生成草稿。
4. `confirm_apply` 后必须进入 `apply_draft`。
5. 不能从旧步骤重复推进任务。

### 4.3 apply_draft

`apply_draft` 是必须步骤。

规则：

1. 读取 `generate_draft` 或 `generate_scene_draft` 的 output。
2. 写入 `chapters.draft` 或 `chapter_scenes.content`。
3. 写入前创建版本快照。
4. 记录 `authoring_events`。
5. 更新写作目标统计。

### 4.4 consistency_check

一致性检查失败时：

1. `overallStatus = blocked` 时任务停在 `waiting_review`。
2. 前端必须展示风险报告。
3. 用户可以选择：
   - 返回重新生成
   - 手动修改
   - 强制继续，但必须二次确认并写入事件日志

### 4.5 postprocess

章后处理必须：

1. 生成章节记忆。
2. 生成待确认建议。
3. 不直接写入事实、伏笔、人物关系等正式表。
4. 完成后刷新健康指标。

## 5. 前端 UI 改造

### 5.1 写作任务页

页面必须显示：

1. 当前任务状态。
2. 当前章节/场景。
3. 步骤时间线。
4. 当前待确认步骤。
5. AI 输出预览。
6. 一致性风险报告。
7. 继续、驳回、重试按钮。

### 5.2 确认面板

只允许当前待确认步骤出现操作按钮。

禁止：

```text
所有 completed 的确认步骤都显示“确认继续”
```

### 5.3 与写作页联动

写作页应能：

1. 从当前章节创建写作任务。
2. 从当前场景创建场景草稿任务。
3. 查看任务进行中状态。
4. 任务完成后刷新章节/场景正文。

## 6. API 约定

```text
POST /api/projects/:projectId/writing-jobs
POST /api/projects/:projectId/writing-jobs/:jobId/start
POST /api/projects/:projectId/writing-jobs/:jobId/steps/:stepId/approve
POST /api/projects/:projectId/writing-jobs/:jobId/steps/:stepId/reject
POST /api/projects/:projectId/writing-jobs/:jobId/steps/:stepId/retry
GET  /api/projects/:projectId/writing-jobs/:jobId
GET  /api/projects/:projectId/writing-jobs
```

所有写操作必须校验：

```text
projectId + jobId + stepId
```

## 7. 验收场景

### 场景 1：章节草稿生成

1. 在写作页选择一个未完成章节。
2. 创建 `outline_then_draft` 任务。
3. 确认章节计划。
4. 生成草稿。
5. 一致性检查通过。
6. 确认写入。
7. `chapters.draft` 更新。
8. 版本历史新增快照。
9. 章后建议出现。

### 场景 2：一致性阻断

1. 人为制造和设定冲突的 AI 输出。
2. 一致性检查返回 `blocked`。
3. 任务停住。
4. 正文不被写入。
5. 用户必须显式处理。

### 场景 3：重试失败步骤

1. 模拟 AI 调用失败。
2. step 进入 failed。
3. 点击重试。
4. 只重跑当前步骤及其后续步骤。
5. 前面已确认步骤不重复执行。

## 8. 验收命令

```bash
pnpm check
pnpm db:migrate
```

## 9. 完成标准

- [ ] 写作任务能从章节开始跑到正文写入。
- [ ] 写作任务能从场景开始跑到场景正文写入。
- [ ] 所有确认节点都只影响当前步骤。
- [ ] 一致性失败不会静默放行。
- [ ] 任务失败可重试。
- [ ] 章后建议可在任务完成后看到。
- [ ] 写作目标统计同步更新。

