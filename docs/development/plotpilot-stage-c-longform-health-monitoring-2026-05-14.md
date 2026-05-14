# 阶段 C：长篇健康监控与风格漂移修改文档

日期：2026-05-14  
状态：待实施  
前置阶段：阶段 B 真实向量 RAG

## 1. 目标

把项目健康页从统计面板升级为长篇小说持续风险雷达。

需要监控：

1. 主题偏离。
2. 人物 OOC。
3. 伏笔遗忘。
4. 矛盾停滞。
5. 节奏下滑。
6. 风格漂移。
7. 设定冲突。
8. 关键角色长期缺席。
9. 爽点密度不足。

## 2. 修改范围

```text
apps/api/src/db/schema/operations.ts
apps/api/src/services/health-metrics.service.ts
apps/api/src/services/consistency-guard.service.ts
apps/api/src/services/quality.service.ts
apps/api/src/services/authoring-report.service.ts
apps/api/src/routes/health-metrics.ts
apps/web/src/views/ProjectHealthView.vue
apps/web/src/views/AuthoringWeeklyReportView.vue
packages/shared/src
```

## 3. 数据来源

```text
novel_projects
story_bibles
characters
character_arc_events
character_relationships
conflicts
conflict_timeline_events
foreshadowing_items
story_fact_triples
chapter_elements
chapter_memories
chapter_scenes
quality_reports
chapter_versions
authoring_events
persona_memory_cards
```

## 4. 建议新增模型

如当前 schema 不足，可新增：

```text
project_health_reports
  id
  project_id
  scope
  score
  risk_level
  metrics_json
  generated_at

chapter_style_fingerprints
  id
  project_id
  chapter_id
  sentence_length_avg
  dialogue_ratio
  emotion_density
  conflict_density
  hook_density
  style_summary
  embedding_id
  created_at
```

## 5. 指标定义

### 5.1 主题偏离

输入：

1. 项目主题。
2. 故事设定集主题。
3. 当前章节摘要。
4. 章节记忆。

输出：

```text
score: 0-100
riskLevel: low | medium | high
evidence[]
suggestions[]
```

### 5.2 人物 OOC

输入：

1. 角色设定。
2. 人物弧光事件。
3. 当前章节人物行为。
4. 章后 `character_state` 建议。

输出：

1. 哪个角色偏离。
2. 偏离了哪个设定字段。
3. 出现在哪一章/场景。
4. 建议修正方向。

### 5.3 伏笔遗忘

输入：

1. `foreshadowing_items.status = open | progressing`
2. `expectedPayoffChapterId`
3. 当前章节号。

规则：

1. 超过预计兑现章节 3 章以上：中风险。
2. 超过预计兑现章节 8 章以上：高风险。
3. 重要度高且长期未出现：高风险。

### 5.4 矛盾停滞

输入：

1. `conflicts`
2. `conflict_timeline_events`
3. 章节跨度。

规则：

1. 主线冲突连续多章无强度变化：提示停滞。
2. 强度突然跳变但没有事件支撑：提示断裂。

### 5.5 风格漂移

输入：

1. 写作人格规则。
2. 参考作品风格报告。
3. 章节风格指纹。
4. 最近 N 章文本统计。

输出：

1. 漂移分数。
2. 漂移方向。
3. 示例证据。
4. 修正建议。

## 6. 后端服务要求

`health-metrics.service.ts` 需要拆分成可测试函数：

```text
computeThemeDrift()
computeCharacterOOC()
computeForeshadowingRisk()
computeConflictStagnation()
computePacingRisk()
computeStyleDrift()
computeContinuityRisk()
```

每个函数必须：

1. 输入明确。
2. 不直接依赖全局状态。
3. 返回结构化结果。
4. 便于单测。

## 7. 前端 UI 要求

项目健康页改成四个区域：

1. 总览：总分、最高风险、最近更新。
2. 风险雷达：主题、人物、伏笔、矛盾、节奏、风格。
3. 风险列表：按严重程度排序。
4. 修复入口：
   - 跳转到对应章节。
   - 跳转到伏笔台账。
   - 跳转到角色页。
   - 创建写作任务修复。

## 8. 验收场景

1. 创建一个开放伏笔，超过预计兑现章节，健康页出现伏笔风险。
2. 修改某章让角色行为明显违背设定，健康页出现 OOC 风险。
3. 连续多章没有冲突推进，健康页出现矛盾停滞。
4. 章节风格统计明显变化，健康页显示风格漂移。
5. 点击风险项能跳到具体编辑位置。

## 9. 验收命令

```bash
pnpm check
```

如新增模型：

```bash
pnpm db:generate
pnpm db:migrate
```

## 10. 完成标准

- [ ] 健康页不是静态统计，而是可解释风险雷达。
- [ ] 每个风险项有证据和修复建议。
- [ ] 高风险问题能跳转到对应模块。
- [ ] 风格漂移有趋势数据。
- [ ] 健康报告可以被写作任务使用。

