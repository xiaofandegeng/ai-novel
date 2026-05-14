# 阶段 E：实时任务状态、导入导出与最终验收修改文档

日期：2026-05-14  
状态：待实施  
前置阶段：阶段 D 提示词接点与故事结构模板库

## 1. 目标

补齐生产级长篇写作工作台的最后一层能力：

1. 长任务实时状态。
2. 任务失败可重试。
3. 导入导出覆盖所有新增数据。
4. 自动验收脚本覆盖写作闭环。
5. 用户开始正式写作前有明确健康检查。

## 2. 修改范围

```text
apps/api/src/routes/writing-jobs.ts
apps/api/src/routes/knowledge.ts
apps/api/src/routes/data-portability.ts
apps/api/src/services/export-import.service.ts
apps/api/src/services/authoring-event.service.ts
apps/api/src/scripts/smoke-writing-loop.ts
apps/web/src/views/ProjectHealthView.vue
apps/web/src/views/ProjectSettingsView.vue
apps/web/src/features/writing-jobs
docs/testing
packages/shared/src
```

## 3. 实时任务状态

需要实时状态的任务：

1. 写作任务。
2. 知识库上传分析。
3. 参考作品人格训练。
4. 章后处理。
5. 健康报告生成。
6. 导入导出。

## 4. SSE 或轮询方案

优先 SSE：

```text
GET /api/projects/:projectId/jobs/:jobId/events
```

事件类型：

```text
job_started
step_started
step_progress
step_waiting_review
step_completed
step_failed
job_completed
job_failed
```

如果暂不做 SSE，必须至少提供轮询接口：

```text
GET /api/projects/:projectId/writing-jobs/:jobId
```

前端每 2-3 秒刷新，任务结束后停止。

## 5. 导入导出覆盖清单

`exportProjectData` 和 `importProjectData` 必须覆盖：

```text
novel_projects
story_bibles
characters
character_relationships
character_arc_events
volumes
chapters
chapter_scenes
chapter_elements
chapter_memories
chapter_versions
chapter_postprocess_runs
chapter_postprocess_suggestions
conflicts
conflict_participants
conflict_timeline_events
foreshadowing_items
foreshadowing_characters
story_fact_triples
acts
knowledge_sources
knowledge_chunks
knowledge_embeddings
knowledge_notes
quality_reports
writing_jobs
writing_job_steps
ai_context_snapshots
ai_generation_candidates
ai_quality_feedback
ai_usage_logs
writing_goals
daily_writing_stats
writing_personas
project_persona_configs
persona_memory_cards
authoring_events
health_reports
prompt_templates 或 project_prompt_overrides
```

如果某个表故意不导出，必须在文档和 UI 中标明原因。

## 6. 导入事务要求

`importProjectData` 必须：

1. 使用数据库事务。
2. 建立 ID remap。
3. 按外键依赖顺序插入。
4. 出错时整体回滚。
5. 返回导入统计和跳过项。

## 7. 备份兼容策略

导入旧版本备份时：

1. 支持缺失新字段。
2. 支持缺失新表。
3. 跳过无法恢复的外部依赖。
4. 给出 skipped summary。

## 8. 最终验收脚本

完善：

```text
apps/api/src/scripts/smoke-writing-loop.ts
```

脚本应覆盖：

1. 创建项目。
2. 创建故事设定。
3. 创建角色。
4. 创建人物关系。
5. 创建矛盾。
6. 创建伏笔。
7. 创建卷章和场景。
8. 写入章节元素。
9. 运行 AI 上下文构建。
10. 创建写作任务。
11. 模拟确认计划。
12. 模拟写入正文。
13. 运行章后处理。
14. 应用章后建议。
15. 刷新健康报告。
16. 导出项目。
17. 导入项目。
18. 校验关键数据数量一致。

## 9. 前端最终验收路线

人工测试顺序：

1. 项目列表：创建项目。
2. 项目设置：配置 AI provider 并测试。
3. 故事设定集：AI 辅助构思，确认写入。
4. 角色管理：AI 分析角色，确认回填；AI 推荐新角色，自动关联人物关系。
5. 人物关系：检查自动关系是否出现。
6. 矛盾矩阵：创建冲突，查看冲突时间线。
7. 伏笔台账：创建伏笔，设置预计兑现章节。
8. 大纲规划：生成章节和场景，设置章节元素。
9. 正文写作：运行 AI 生成，进入确认区后写入。
10. 写作任务：运行半自动任务。
11. 章后分析：接受建议，应用到事实/伏笔/角色/矛盾。
12. 健康页：查看风险和修复建议。
13. 知识库：上传参考作品，生成摘要和 embedding。
14. 项目导出：导出备份。
15. 项目导入：导入备份并检查数据。

## 10. 必须修复的易漏点

1. 导出新增表后忘记导入。
2. 导入时 persona/config 外键失败留下半导入。
3. 写作任务旧确认步骤重复显示按钮。
4. SSE 断开后前端不恢复。
5. AI stream 错误被当成正文。
6. 参考作品原文进入 prompt。
7. 数据归属只校验 id，不校验 projectId。

## 11. 验收命令

```bash
pnpm check
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
pnpm --filter @ai-novel/api smoke:writing-loop
```

如果没有 `smoke:writing-loop` 脚本，需要在本阶段补齐 package script。

## 12. 完成标准

- [ ] 长任务有实时状态或稳定轮询。
- [ ] 失败任务能重试。
- [ ] 项目导入导出覆盖所有关键业务表。
- [ ] smoke 脚本能完整跑通写作闭环。
- [ ] 用户能从空项目走到可写作状态。
- [ ] `pnpm check` 通过。
- [ ] `pnpm db:migrate` 通过。

