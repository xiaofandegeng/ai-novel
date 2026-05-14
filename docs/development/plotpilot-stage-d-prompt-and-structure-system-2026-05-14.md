# 阶段 D：提示词接点与故事结构模板库修改文档

日期：2026-05-14  
状态：待实施  
前置阶段：阶段 C 长篇健康监控

## 1. 目标

把散落在各功能里的 AI prompt 收口为可管理、可测试、可版本化的提示词接点系统，同时深化故事结构模板库，让大纲、场景、正文生成都能被结构约束。

## 2. 修改范围

```text
apps/api/src/db/schema/template.ts
apps/api/src/services/prompt-template.service.ts
apps/api/src/services/story-structure.service.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/routes/story-structure.ts
apps/api/src/routes/settings.ts
apps/web/src/views/ProjectSettingsView.vue
apps/web/src/features/outline/components/ScenePlanner.vue
apps/web/src/features/settings
packages/shared/src
```

## 3. 提示词接点清单

至少收口以下 AI 接点：

```text
story_bible_brainstorm
character_analyze
character_create_candidate
relationship_infer
conflict_analyze
outline_brainstorm
scene_generate
draft_generate
draft_continue
draft_polish
quality_review
consistency_guard
chapter_postprocess
knowledge_analyze
persona_train
persona_memory_extract
foreshadowing_analyze
health_report
```

## 4. 数据模型建议

```text
prompt_templates
  id
  key
  name
  description
  scene
  version
  system_prompt
  user_prompt_template
  output_schema
  enabled
  created_at
  updated_at

project_prompt_overrides
  id
  project_id
  template_key
  override_prompt
  enabled
  created_at
  updated_at
```

## 5. Prompt 管理规则

1. 所有 prompt 必须通过 `prompt-template.service.ts` 获取。
2. 业务服务不得继续硬编码长 prompt。
3. 模板必须声明输出格式。
4. 结构化输出必须有 JSON schema 或运行时校验。
5. 用户可在项目设置中测试 prompt。
6. prompt 修改需要记录版本。

## 6. 故事结构模板库

内置模板建议：

1. 三幕式。
2. 英雄旅程。
3. 网文升级流。
4. 悬疑钩子流。
5. 复仇爽文流。
6. 群像多线流。
7. 副本/单元剧结构。
8. 日更章节节拍模板。

每个模板包含：

```text
acts
chapter_beats
scene_beats
conflict_curve
foreshadowing_pattern
hook_pattern
payoff_pattern
```

## 7. 大纲页集成

大纲页应支持：

1. 选择故事结构模板。
2. 应用到当前项目。
3. 按模板生成卷/章建议。
4. 按章节生成场景节拍建议。
5. 应用前进入确认区。

## 8. 写作页集成

AI 上下文必须包含：

1. 当前章节所属结构阶段。
2. 当前章节节拍。
3. 当前场景节拍。
4. 本章必须完成的爽点/反转/钩子/兑现。

## 9. 项目设置集成

新增“AI 模板与结构”设置区：

1. 查看当前启用模板。
2. 测试 prompt。
3. 查看输出 schema。
4. 项目级覆盖 prompt。
5. 恢复默认模板。

## 10. 验收场景

1. 应用“悬疑钩子流”后，大纲页出现章节节拍建议。
2. 生成正文时 prompt 包含当前章节节拍。
3. 修改项目 prompt 后，AI 请求使用项目 override。
4. prompt 输出不符合 schema 时，前端展示解析失败，不写入数据。

## 11. 验收命令

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

## 12. 完成标准

- [ ] AI prompt 不再大面积散落在页面/组件中。
- [ ] 每个 AI 接点有模板 key。
- [ ] 模板可以测试和回滚。
- [ ] 故事结构模板能影响大纲、场景和正文生成。
- [ ] AI 结构化输出有校验和失败态。

