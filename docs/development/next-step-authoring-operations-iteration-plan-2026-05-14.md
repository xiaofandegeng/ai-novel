# 下一步正式写作运营与迭代实施文档

日期：2026-05-14
状态：待实施
前置假设：

1. `docs/development/next-step-authoring-readiness-acceptance-plan-2026-05-14.md` 已完成。
2. 真实小说试写、全模块回归、AI 质量验收、备份恢复演练均已通过。
3. 项目已经可以开始正式长期写作。

目标：进入真实写作后，建立持续运营、质量复盘、模型调优、提示词版本管理和需求迭代机制，避免系统只在测试样本中可用，真实写作中逐渐失控。

---

## 1. 本轮实施范围

本轮不再新增核心写作功能，重点是正式写作后的持续运营能力：

1. 真实写作日志与问题收集。
2. AI 输出质量复盘。
3. Prompt 与上下文版本管理。
4. 模型效果、成本、延迟监控。
5. 长篇创作周报。
6. 用户反馈到开发任务的转化流程。
7. 下阶段产品路线分级。

暂不做：

- 新故事类型扩展。
- 多人协作。
- 商业化计费。
- 云端部署。
- 移动端适配。

---

## 2. 阶段 A：真实写作运行日志

### 2.1 目标

记录真实写作中的关键事件，方便复盘 AI 是否真正帮助了创作。

### 2.2 修改范围

```text
apps/api/src/db/schema
apps/api/src/routes/authoring-events.ts
apps/api/src/services/authoring-event.service.ts
apps/web/src/api/authoring-events.ts
apps/web/src/composables/useAuthoringEventLogger.ts
packages/shared/src
docs/testing/authoring-operations-log.md
```

### 2.3 建议新增表

```text
authoring_events
  id
  project_id
  chapter_id nullable
  scene_id nullable
  event_type
  source
  payload
  created_at
```

`event_type` 建议：

```text
project_opened
chapter_opened
ai_context_built
ai_generation_started
ai_generation_confirmed
ai_generation_discarded
draft_applied
postprocess_started
suggestion_applied
health_risk_opened
export_created
import_completed
```

`source`：

```text
manual
ai
system
task
smoke
```

### 2.4 记录规则

必须记录：

1. 每次 AI 生成开始和结束。
2. 用户接受或丢弃 AI 结果。
3. 正文写入章节。
4. 章后分析开始和完成。
5. 结构化建议应用。
6. 健康风险打开和处理。
7. 导出和导入。

不记录：

1. API Key。
2. 完整参考作品原文。
3. 用户未确认的敏感草稿全文。

### 2.5 验收

1. 完成一章写作后，事件日志中能看到完整链路。
2. 丢弃 AI 结果也有记录。
3. 导出项目时不包含敏感配置。

命令：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

---

## 3. 阶段 B：AI 输出质量复盘

### 3.1 目标

让“AI 写得好不好”可记录、可量化、可追溯到上下文快照和模型配置。

### 3.2 修改范围

```text
apps/api/src/db/schema
apps/api/src/routes/ai-quality-feedback.ts
apps/api/src/services/ai-quality-feedback.service.ts
apps/web/src/components/AIQualityFeedbackPanel.vue
apps/web/src/views/AIContextDebuggerView.vue
packages/shared/src
docs/testing/ai-output-quality-scorecard.md
```

### 3.3 建议新增表

```text
ai_quality_feedback
  id
  project_id
  chapter_id nullable
  scene_id nullable
  context_snapshot_id nullable
  model_provider
  model_name
  task_type
  rating_overall
  rating_consistency
  rating_character
  rating_plot
  rating_style
  rating_usefulness
  issue_tags
  comment
  accepted
  created_at
```

`issue_tags` 示例：

```text
ooc
plot_drift
style_drift
weak_conflict
ignored_foreshadowing
bad_pacing
too_generic
context_missing
model_error
```

### 3.4 前端入口

以下位置提供轻量评分入口：

1. AI 结果确认区。
2. 写作任务完成页。
3. AI 上下文调试器。
4. 质量评估页。

### 3.5 复盘视图

新增或增强页面：

```text
/project/:id/ai-feedback
```

展示：

1. 模型平均分。
2. 任务类型平均分。
3. 常见问题标签。
4. 被接受率。
5. 与上下文快照的关联。

### 3.6 验收

1. 用户能对 AI 结果评分。
2. 评分能关联到上下文快照。
3. 可以按模型和任务类型统计。

命令：

```bash
pnpm check
```

---

## 4. 阶段 C：Prompt 与上下文版本管理

### 4.1 目标

提示词和上下文组装规则会持续调整。必须能知道一次 AI 输出使用了哪个版本，避免效果变差后无法定位。

### 4.2 修改范围

```text
apps/api/src/services/ai-context-renderer.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/services/prompt-template.service.ts
apps/api/src/db/schema
apps/web/src/views/AIContextDebuggerView.vue
packages/shared/src
docs/development/prompt-versioning.md
```

### 4.3 建议新增表

```text
prompt_templates
  id
  name
  task_type
  version
  content
  variables_schema
  status
  created_at
  updated_at
```

```text
prompt_template_runs
  id
  project_id
  context_snapshot_id
  template_id
  template_version
  rendered_preview
  created_at
```

### 4.4 版本规则

1. 每个 AI 场景有固定 taskType：
   - outline
   - draft
   - polish
   - character
   - relationship
   - postprocess
   - quality
   - consistency_guard
2. Prompt 改动必须 bump version。
3. AI 上下文快照必须记录：
   - rendererVersion
   - promptTemplateVersion
   - retrievalVersion
4. 不允许直接在 route 中拼长 prompt。

### 4.5 验收

1. AI 上下文快照能看到 prompt version。
2. 修改 prompt 后，新旧快照能区分版本。
3. 回滚 prompt 版本后，AI 请求使用旧模板。

命令：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

---

## 5. 阶段 D：模型效果、成本与延迟监控

### 5.1 目标

支持多 AI provider 后，需要知道不同模型在不同任务上的效果、成本和速度。

### 5.2 修改范围

```text
apps/api/src/services/ai-provider.service.ts
apps/api/src/services/ai-usage.service.ts
apps/api/src/db/schema
apps/api/src/routes/ai-usage.ts
apps/web/src/views/AIUsageDashboardView.vue
packages/shared/src
```

### 5.3 建议新增表

```text
ai_usage_records
  id
  project_id
  chapter_id nullable
  context_snapshot_id nullable
  provider
  model
  task_type
  prompt_tokens
  completion_tokens
  total_tokens
  estimated_cost
  latency_ms
  status
  error_code nullable
  created_at
```

### 5.4 监控指标

1. 每日调用次数。
2. 每日 token 消耗。
3. 每日估算成本。
4. 平均延迟。
5. 失败率。
6. 各任务类型模型评分。
7. 各模型接受率。

### 5.5 前端要求

新增或增强：

```text
/project/:id/ai-usage
```

展示：

1. 本项目消耗。
2. 按模型分组。
3. 按任务类型分组。
4. 失败记录。
5. 成本提醒。

### 5.6 验收

1. 每次 AI 请求生成 usage record。
2. 失败请求也记录。
3. 能按 provider/model/taskType 汇总。

命令：

```bash
pnpm check
```

---

## 6. 阶段 E：长篇创作周报

### 6.1 目标

给作者一个“这周写作进展和风险”的总结，帮助长期写作保持节奏。

### 6.2 修改范围

```text
apps/api/src/services/authoring-report.service.ts
apps/api/src/routes/authoring-reports.ts
apps/web/src/views/AuthoringWeeklyReportView.vue
packages/shared/src
```

### 6.3 周报内容

```text
本周新增字数
完成章节
新增角色 / 关系 / 矛盾 / 伏笔
已解决伏笔
新增健康风险
AI 使用情况
AI 输出接受率
本周最高风险问题
下周建议写作重点
```

### 6.4 生成方式

1. 基础统计由数据库聚合。
2. 总结建议可选 AI 生成。
3. AI 周报也必须记录上下文快照。

### 6.5 验收

1. 能生成当前项目本周报告。
2. 报告能链接到相关章节、角色、风险。
3. 无 AI Key 时仍可生成基础统计版。

命令：

```bash
pnpm check
```

---

## 7. 阶段 F：反馈到开发任务的转化流程

### 7.1 目标

真实写作过程中产生的问题，要能快速变成明确的开发任务，而不是散落在聊天记录里。

### 7.2 修改范围

```text
docs/development/feature-request-template.md
docs/development/bug-report-template.md
docs/development/ai-output-quality-report-template.md
docs/development/iteration-triage-rules.md
docs/testing/authoring-operations-log.md
```

### 7.3 任务分类

```text
bug
ai_quality
workflow_gap
data_integrity
ui_polish
performance
documentation
```

### 7.4 分级

P0：

- 数据丢失。
- 构建失败。
- 写作任务无法继续。
- AI 错误内容可应用。

P1：

- AI 上下文缺失关键数据。
- 章后分析不能回填。
- 导入导出不完整。
- 健康指标误报严重。

P2：

- UI 不顺。
- 文案不清。
- 统计不够详细。

### 7.5 验收

1. 每个真实写作问题都能归类。
2. 每个 P0/P1 都能追溯到复现步骤。
3. 每次迭代后更新验收报告。

---

## 8. 阶段 G：下阶段路线分级

### 8.1 目标

正式写作开始后，新增需求必须按写作价值排序。

### 8.2 优先级规则

最高优先级：

1. 防止写偏。
2. 防止丢数据。
3. 提高连续写作效率。
4. 提高 AI 可控性。
5. 降低作者手工整理成本。

低优先级：

1. 纯视觉装饰。
2. 与小说写作无关的通用 AI 聊天。
3. 复杂但低频的设置项。
4. 尚未被真实写作验证需要的功能。

### 8.3 推荐下一阶段候选

正式写作运营一周后，根据日志和反馈从以下候选中选择：

1. 更细的场景节拍编辑器。
2. 角色弧光时间线。
3. 伏笔兑现甘特图。
4. 矛盾强度曲线。
5. AI 生成对比评测。
6. 多模型 A/B 测试。
7. 写作目标和每日字数计划。
8. 可打印小说企划书。

---

## 9. 验收命令

本阶段完成后：

```bash
pnpm check
pnpm smoke:writing-loop
```

如果新增 schema：

```bash
pnpm db:generate
pnpm db:migrate
```

---

## 10. 完成标准

- [ ] 能记录真实写作事件。
- [ ] 能对 AI 输出进行评分和复盘。
- [ ] AI 上下文快照包含 prompt/context/retrieval 版本。
- [ ] 能统计模型成本、延迟和失败率。
- [ ] 能生成长篇创作周报。
- [ ] 真实写作反馈能转化为开发任务。
- [ ] 后续路线按写作价值排序。

