# 下一步作者生产力增强实施文档

日期：2026-05-14
状态：待实施
前置假设：

1. `docs/development/next-step-authoring-operations-iteration-plan-2026-05-14.md` 已完成。
2. 项目已经具备真实写作日志、AI 输出质量复盘、Prompt 版本管理、模型成本监控和创作周报。
3. 当前系统已经可以支持正式长期写作。

目标：在稳定可写的基础上，继续增强作者每天真正会用到的生产力能力，包括场景节拍、角色弧光、伏笔视图、矛盾曲线、多模型对比、写作目标和作品交付导出。

---

## 1. 本轮实施范围

本轮聚焦作者生产力，不再做底层闭环大改：

1. 场景节拍编辑器。
2. 角色弧光时间线。
3. 伏笔兑现甘特图。
4. 矛盾强度曲线。
5. 多模型生成对比评测。
6. 写作目标和每日字数计划。
7. 作品交付导出增强。

暂不做：

- 多用户协作。
- 商业化计费。
- 云端发布。
- 移动端专用版本。
- 社区和评论系统。

---

## 2. 阶段 A：场景节拍编辑器

### 2.1 目标

让作者不仅能规划章节，还能规划每个场景的节拍、功能、冲突和情绪转折。

### 2.2 修改范围

```text
apps/api/src/db/schema/chapter.ts
apps/api/src/routes/scenes.ts
apps/api/src/services/scene-planning.service.ts
apps/web/src/features/scenes
apps/web/src/views/OutlineView.vue
apps/web/src/views/WritingView.vue
packages/shared/src
```

### 2.3 数据字段

在 `chapter_scenes` 中确认或新增：

```text
beat_type
purpose
entry_hook
turning_point
exit_hook
emotion_start
emotion_end
conflict_level
required_elements
status
```

`beat_type` 建议：

```text
hook
setup
reveal
conflict
reversal
payoff
transition
cliffhanger
```

### 2.4 前端要求

大纲页或独立场景页提供：

1. 章节下场景列表。
2. 每个场景的节拍类型。
3. 场景目标。
4. 冲突强度。
5. 情绪起点和终点。
6. 入场钩子和出场钩子。
7. 必须出现的角色、地点、道具。

### 2.5 AI 辅助

AI 可提供：

1. 为章节生成场景节拍。
2. 检查场景是否缺少转折。
3. 检查连续场景是否节奏重复。
4. 为场景生成更强的出场钩子。

所有 AI 结果必须进入确认区。

### 2.6 验收

- [ ] 一章可以拆成多个场景。
- [ ] 每个场景有明确节拍和情绪变化。
- [ ] 写作页场景模式能读取节拍信息。
- [ ] AI 上下文包含当前场景节拍。

命令：

```bash
pnpm check
```

---

## 3. 阶段 B：角色弧光时间线

### 3.1 目标

让角色不只是静态资料，而是能看到每章中的目标、关系、状态和弧光变化。

### 3.2 修改范围

```text
apps/api/src/db/schema/character.ts
apps/api/src/routes/character-arcs.ts
apps/api/src/services/character-arc.service.ts
apps/api/src/services/chapter-postprocess.service.ts
apps/web/src/views/CharactersView.vue
apps/web/src/views/CharacterArcTimelineView.vue
packages/shared/src
```

### 3.3 建议新增表

```text
character_arc_events
  id
  project_id
  character_id
  chapter_id nullable
  scene_id nullable
  event_type
  before_state
  after_state
  motivation_change
  relationship_impact
  evidence
  source_type
  created_at
```

`event_type`：

```text
goal_shift
fear_triggered
secret_revealed
relationship_changed
belief_changed
ability_changed
trauma
victory
loss
```

### 3.4 数据来源

1. 章后分析的 `character_state` 建议。
2. 人物关系变化建议。
3. 写作任务完成后的正文分析。
4. 用户手动添加。

### 3.5 前端要求

角色详情页新增：

1. 弧光时间线。
2. 按章节筛选。
3. 状态变化前后对比。
4. 与人物关系变化的关联。
5. AI 检查“角色是否突然 OOC”。

### 3.6 验收

- [ ] 章后分析接受角色状态建议后生成弧光事件。
- [ ] 角色页能看到时间线。
- [ ] AI 上下文能引用近期角色弧光。

命令：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

---

## 4. 阶段 C：伏笔兑现甘特图

### 4.1 目标

让作者能直观看到伏笔从埋设、推进到兑现的章节跨度，避免长篇写作中忘记伏笔。

### 4.2 修改范围

```text
apps/api/src/routes/foreshadowing.ts
apps/api/src/services/foreshadowing-timeline.service.ts
apps/web/src/views/ForeshadowingView.vue
apps/web/src/features/foreshadowing
packages/shared/src
```

### 4.3 视图数据

每条伏笔显示：

```text
title
status
importance
setupChapter
expectedPayoffChapter
actualPayoffChapter
relatedCharacters
progressNotes
riskLevel
```

### 4.4 风险规则

1. 超过预期兑现章仍未兑现：高风险。
2. 埋设后超过 N 章未提及：中风险。
3. 多条高重要伏笔集中在同一章兑现：节奏风险。
4. 伏笔相关角色长期未出现：连续性风险。

### 4.5 前端要求

1. 时间轴或甘特图展示。
2. 支持按状态筛选。
3. 支持点击跳转章节。
4. 支持 AI 给出兑现建议。

### 4.6 验收

- [ ] 能看到伏笔从埋设到预计兑现的跨度。
- [ ] 过期未兑现伏笔有风险提示。
- [ ] 点击伏笔能跳转相关章节。

---

## 5. 阶段 D：矛盾强度曲线

### 5.1 目标

让作者看到核心矛盾是否持续升级、是否停滞、是否过早解决。

### 5.2 修改范围

```text
apps/api/src/db/schema/conflict.ts
apps/api/src/routes/conflicts.ts
apps/api/src/services/conflict-timeline.service.ts
apps/api/src/services/chapter-postprocess.service.ts
apps/web/src/views/ConflictMatrixView.vue
apps/web/src/features/conflicts
packages/shared/src
```

### 5.3 建议新增表

```text
conflict_timeline_events
  id
  project_id
  conflict_id
  chapter_id nullable
  scene_id nullable
  intensity_before
  intensity_after
  status_before
  status_after
  reason
  evidence
  source_type
  created_at
```

### 5.4 前端要求

1. 每条矛盾显示强度曲线。
2. 支持查看每次强度变化原因。
3. 支持标记“本卷主矛盾”。
4. 健康页引用矛盾停滞风险。

### 5.5 验收

- [ ] 章后分析接受 conflict_update 后生成时间线事件。
- [ ] 矛盾页能看到强度曲线。
- [ ] 长期未变化的 active 矛盾会进入健康风险。

---

## 6. 阶段 E：多模型生成对比评测

### 6.1 目标

支持同一任务下用多个模型生成候选，作者选择最佳结果，并沉淀模型表现数据。

### 6.2 修改范围

```text
apps/api/src/routes/ai.ts
apps/api/src/services/ai-provider.service.ts
apps/api/src/services/ai-evaluation.service.ts
apps/api/src/db/schema/ai.ts
apps/web/src/components/AIMultiCandidatePanel.vue
apps/web/src/views/AIUsageDashboardView.vue
packages/shared/src
```

### 6.3 数据模型

```text
ai_generation_candidates
  id
  project_id
  chapter_id nullable
  context_snapshot_id
  provider
  model
  task_type
  content
  quality_score nullable
  user_selected
  user_rating nullable
  created_at
```

### 6.4 前端要求

1. 同一任务展示 2-3 个候选。
2. 支持选择一个应用。
3. 支持评分和标记问题。
4. 记录模型、延迟、成本。

### 6.5 验收

- [ ] 同一上下文能生成多个候选。
- [ ] 用户只能确认应用其中一个。
- [ ] 被选择结果进入 AI 质量反馈。

---

## 7. 阶段 F：写作目标和每日字数计划

### 7.1 目标

帮助作者建立稳定产出节奏，而不只是生成内容。

### 7.2 修改范围

```text
apps/api/src/db/schema/project.ts
apps/api/src/routes/writing-goals.ts
apps/api/src/services/writing-goal.service.ts
apps/web/src/views/DashboardView.vue
apps/web/src/views/AuthoringWeeklyReportView.vue
packages/shared/src
```

### 7.3 数据模型

```text
writing_goals
  id
  project_id
  goal_type
  target_words
  target_chapters
  start_date
  end_date
  status
  created_at
```

```text
daily_writing_stats
  id
  project_id
  date
  words_added
  chapters_completed
  ai_words_accepted
  manual_words_added
  created_at
```

### 7.4 前端要求

1. 仪表盘显示今日目标。
2. 显示本周进度。
3. 区分手写字数和 AI 接受字数。
4. 周报引用目标完成情况。

### 7.5 验收

- [ ] 写入章节后更新每日字数。
- [ ] 今日目标能显示完成比例。
- [ ] 周报能总结本周进度。

---

## 8. 阶段 G：作品交付导出增强

### 8.1 目标

让作者能把项目导出为可阅读、可投稿、可备份的成果，而不仅是数据 JSON。

### 8.2 修改范围

```text
apps/api/src/routes/export.ts
apps/api/src/services/manuscript-export.service.ts
apps/web/src/views/ProjectSettingsView.vue
apps/web/src/features/export
packages/shared/src
```

### 8.3 导出格式

支持：

1. Markdown。
2. TXT。
3. DOCX。
4. 项目企划书 Markdown。
5. 角色设定集 Markdown。
6. 伏笔和矛盾报告 Markdown。

### 8.4 导出配置

可选择：

1. 是否包含卷标题。
2. 是否包含章节标题。
3. 是否包含未完成章节。
4. 是否包含作者备注。
5. 是否包含设定资料。
6. 是否包含 AI 生成痕迹。

### 8.5 验收

- [ ] 可导出完整正文 Markdown。
- [ ] 可导出 TXT。
- [ ] 可导出项目企划书。
- [ ] 导出内容章节顺序正确。
- [ ] 不泄露 API Key、上下文快照内部调试信息。

---

## 9. 验收命令

常规：

```bash
pnpm check
```

涉及数据库：

```bash
pnpm db:generate
pnpm db:migrate
```

涉及导出：

```bash
pnpm smoke:writing-loop
```

---

## 10. 完成标准

- [ ] 作者能按场景节拍规划章节。
- [ ] 角色有可查看的弧光时间线。
- [ ] 伏笔有兑现时间轴和风险提示。
- [ ] 矛盾有强度曲线。
- [ ] AI 可以多模型候选对比。
- [ ] 仪表盘能显示写作目标和字数进度。
- [ ] 项目能导出为可阅读手稿和企划书。

