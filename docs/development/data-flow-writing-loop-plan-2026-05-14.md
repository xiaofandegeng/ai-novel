# 数据自动流动与写作闭环修改文档

日期：2026-05-14
状态：待实施
关联文档：

1. `docs/development/module-linkage-closure-fix-plan-2026-05-13.md`
2. `docs/development/plotpilot-next-alignment-plan-2026-05-06.md`
3. `docs/development/plotpilot-remaining-adoption-roadmap-2026-05-04.md`
4. `docs/development/ai-context-engineering-plan-2026-04-30.md`
5. `docs/development/novel-consistency-guard-plan-2026-05-02.md`

目标：让项目不再是“多个功能模块并排存在”，而是形成一条可追踪、可确认、可回流的长篇小说创作流水线。

---

## 1. 核心结论

后续开发重点不是继续新增孤立页面，而是打通两条主链路：

### 1.1 数据自动流动

```text
故事设定 / 角色 / 关系 / 矛盾 / 伏笔 / 知识库
  ↓
大纲与章节元素
  ↓
AI 上下文构建
  ↓
正文或场景生成
  ↓
一致性检查
  ↓
章后分析
  ↓
待确认建议
  ↓
回填角色、关系、矛盾、伏笔、事实图谱、章节记忆
  ↓
下一章继续召回
```

### 1.2 写作闭环

```text
选择章节
  ↓
检查设定完整度
  ↓
准备上下文
  ↓
生成章节计划 / 场景计划
  ↓
作者确认
  ↓
生成草稿
  ↓
一致性审查
  ↓
作者确认写入
  ↓
保存版本
  ↓
章后分析
  ↓
作者确认结构化变更
  ↓
更新长期记忆
  ↓
刷新项目健康指标
```

---

## 2. 当前断点

### 2.1 大纲数据没有完全流入写作约束

现状：

- 大纲页有 `chapter.characters`。
- 章节元素有 `chapter_elements`。
- 两者可以不一致。

问题：

- 作者选择“登场角色”后，不一定进入“必须出场人物”。
- AI 上下文可能漏掉本章关键人物。
- 写作页上下文面板可能和大纲页选择不一致。

### 2.2 正文写完后的关系变化没有回填人物关系

现状：

- 章后分析能识别 `relationshipChanges`。
- 但它只进入章节记忆，不进入人物关系待确认建议。

问题：

- 人物关系网仍停留在旧状态。
- 后续 AI 继续读取旧关系，容易写出前后矛盾。

### 2.3 图谱推理结果没有转成业务动作

现状：

- 共场、三元组推理主要进入事实图谱。

问题：

- 推理出的“人物可能有关联”没有进入人物关系候选。
- 推理出的“矛盾可能升级”没有进入矛盾更新。
- 推理出的“伏笔可能需要兑现”没有进入伏笔台账。

### 2.4 AI 结果确认区和业务回填粒度不统一

现状：

- 写作页、大纲页、角色页已有确认区思路。
- 但不同模块的 AI 输出有的只是文本，有的才是结构化候选。

问题：

- AI 生成的角色分析、关系建议、设定建议可能需要用户手动复制。
- “存为备选 / 插入 / 替换 / 应用结构化变更”的语义不统一。

### 2.5 写作任务还没有成为唯一主流程

现状：

- 写作任务已有步骤、确认节点、草稿写回、章后处理等能力。
- 但用户仍可能绕过任务流，直接在侧栏生成、手动粘贴。

问题：

- 无法保证每章都经过一致性检查。
- 无法保证每章都进入章后分析。
- 长篇记忆可能断档。

---

## 3. 总体改造原则

1. **业务数据优先结构化**  
   能用 ID 关联的，不再只存自由文本。

2. **AI 输出先进入候选层**  
   不允许 AI 直接覆盖正文、关系、矛盾、伏笔、事实图谱。

3. **候选应用必须真实落库**  
   不能出现“显示已应用，但业务表没变化”。

4. **所有自动推理都要可解释**  
   每条建议必须带来源章节、来源字段、推理原因和置信度。

5. **写作任务应成为推荐主流程**  
   手动写作可以保留，但完整测试和正式写作应优先走任务流。

6. **AI 上下文可调试**  
   每次 AI 请求都应能看到实际使用了哪些设定、角色、关系、记忆和约束。

---

## 4. 阶段 1：大纲到写作约束的数据流

### 4.1 目标

让大纲页选择的角色、事件、地点和章节目标，稳定进入章节元素、写作页上下文和 AI prompt。

### 4.2 修改范围

```text
apps/web/src/features/outline/composables/useOutlineWorkspace.ts
apps/web/src/features/outline/components/ChapterOutlineEditor.vue
apps/web/src/features/writing/components/WritingContextPanel.vue
apps/api/src/routes/chapter-elements.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/services/ai-context-renderer.ts
```

### 4.3 后端要求

1. `chapter_elements` 写入时校验：
   - chapter 属于 project。
   - `elementType === 'character'` 时，`elementId` 必须属于当前 project。
2. `PUT /elements` 保持事务写入。
3. 返回元素时按：
   - `importance`
   - `appearanceOrder`
   - `createdAt`
   排序。

### 4.4 前端要求

1. `toggleCharacter(charId)` 同步维护 character 类型章节元素。
2. `addCharacterElement(charId)` 反向同步 `outlineForm.characterIds`。
3. 保存前运行 `normalizeOutlineElements()`：
   - 登场角色补齐章节元素。
   - 章节元素中的角色补齐登场角色。
   - 去重。
4. 写作页上下文面板显示：
   - 登场角色
   - 必须出场人物
   - 关键事件
   - 本章目标
   - 核心冲突
   - 伏笔要求

### 4.5 验收

- 大纲页勾选角色后，保存刷新仍能看到该角色在章节元素中。
- 写作页能展示同一批角色和关键事件。
- AI 上下文预览能看到该章节元素。

---

## 5. 阶段 2：章后分析到业务模块的回流

### 5.1 目标

正文完成后，系统自动分析本章产生的结构化变化，进入待确认队列；用户确认后回填业务模块。

### 5.2 修改范围

```text
apps/api/src/services/chapter-postprocess.service.ts
apps/api/src/services/postprocess-suggestion.service.ts
apps/api/src/db/schema/postprocess.ts
apps/web/src/views/PostChapterAnalysisView.vue
packages/shared/src
```

### 5.3 建议类型扩展

`chapter_postprocess_suggestions.suggestionType` 应支持：

```ts
type PostprocessSuggestionType =
  | 'fact_triple'
  | 'foreshadowing_add'
  | 'foreshadowing_payoff'
  | 'chapter_element'
  | 'character_state'
  | 'relationship_update'
  | 'conflict_update'
  | 'continuity_note'
  | 'style_note'
```

### 5.4 relationship_update payload

```json
{
  "characterAName": "林澈",
  "characterBName": "沈微",
  "characterAId": "optional",
  "characterBId": "optional",
  "type": "ally",
  "strength": 7,
  "status": "临时同盟",
  "description": "两人因雨夜事件形成合作关系",
  "sourceText": "正文依据摘要",
  "confidence": 82
}
```

### 5.5 应用规则

1. `fact_triple` 写入 `story_fact_triples`。
2. `foreshadowing_add` 写入 `foreshadowing_items`。
3. `foreshadowing_payoff` 更新 `foreshadowing_items.status`。
4. `chapter_element` 写入 `chapter_elements`。
5. `character_state` 更新角色 arc 或新增角色状态记录。
6. `relationship_update` 创建或更新 `character_relationships`。
7. `conflict_update` 更新 `conflicts`。
8. `style_note` 和 `continuity_note` 暂时只标记 `acknowledged`，除非有正式存储表。

### 5.6 验收

- 章后分析能产生人物关系建议。
- 接受建议后人物关系页自动更新。
- 接受矛盾建议后矛盾矩阵自动更新。
- 失败建议必须显示失败原因，不能伪装为已应用。

---

## 6. 阶段 3：事实图谱到关系、矛盾、伏笔的自动推理

### 6.1 目标

让事实图谱不只是“知识展示”，而能驱动人物关系候选、矛盾升级提醒和伏笔风险提示。

### 6.2 修改范围

```text
apps/api/src/services/story-graph-inference.service.ts
apps/api/src/services/postprocess-suggestion.service.ts
apps/web/src/views/PostChapterAnalysisView.vue
apps/web/src/views/RelationshipsView.vue
apps/web/src/views/ConflictMatrixView.vue
apps/web/src/views/ForeshadowingView.vue
```

### 6.3 推理规则

#### 6.3.1 共场推理

输入：

- 同一章节中两个角色均为 `chapter_elements.character.appears`。

输出：

- `relationship_update` 候选。

要求：

- 若已有关系，不重复生成。
- 建议理由必须说明来源章节和共场原因。

#### 6.3.2 冲突升级推理

输入：

- 事实三元组中出现攻击、欺骗、背叛、追捕、交易破裂等谓词。
- 关联角色已经存在 active conflict。

输出：

- `conflict_update` 候选。

#### 6.3.3 伏笔兑现推理

输入：

- 当前章节事实与开放伏笔标题、描述、关联角色、关联事件高度匹配。

输出：

- `foreshadowing_payoff` 候选。

#### 6.3.4 设定冲突推理

输入：

- 新事实与 Story Bible 规则冲突。

输出：

- `continuity_note` 或一致性风险报告。

### 6.4 验收

- 同章共场角色能生成关系候选。
- 已存在关系不会重复建议。
- 明显伏笔兑现能进入待确认队列。
- 图谱推理建议必须可拒绝、可接受、可解释。

---

## 7. 阶段 4：写作任务成为完整写作闭环

### 7.1 目标

把“写一章”变成可追踪的任务流，确保每章都经过上下文准备、AI 生成、作者确认、一致性检查、章后分析和记忆回流。

### 7.2 修改范围

```text
apps/api/src/services/writing-job.service.ts
apps/api/src/routes/writing-jobs.ts
apps/web/src/features/writing-jobs
apps/web/src/views/WritingView.vue
apps/web/src/features/writing/components/AIPendingResultPanel.vue
```

### 7.3 推荐步骤

```text
prepare_context
  ↓
generate_plan
  ↓
confirm_plan
  ↓
generate_scene_or_draft
  ↓
run_consistency_guard
  ↓
confirm_apply
  ↓
apply_draft
  ↓
save_version
  ↓
postprocess
  ↓
apply_accepted_suggestions
  ↓
refresh_health_metrics
```

### 7.4 每步要求

每个 `writing_job_step` 必须保存：

- `status`
- `input`
- `output`
- `error`
- `startedAt`
- `finishedAt`
- `retryCount`
- `requiresReview`

### 7.5 作者确认节点

必须确认的步骤：

1. `confirm_plan`
2. `confirm_apply`
3. 高风险一致性检查结果
4. 章后结构化建议应用

### 7.6 验收

- 从章节点击“开始写作任务”，能完成一整章闭环。
- 任何一步失败都能重试。
- 用户确认后正文才写入 `chapters.draft`。
- 任务完成后自动生成章后分析建议。
- 章后建议应用后，下一次 AI 上下文能读取新数据。

---

## 8. 阶段 5：AI 上下文快照与调试器

### 8.1 目标

让用户和开发者能确认：AI 到底读了哪些设定、人物、关系、伏笔、事实、记忆和知识库内容。

### 8.2 修改范围

```text
apps/api/src/routes/ai.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/services/ai-context-renderer.ts
apps/api/src/db/schema/ai.ts
apps/web/src/views/AIContextDebuggerView.vue
```

### 8.3 快照字段

```text
ai_context_snapshots
  id
  requestId
  projectId
  chapterId
  sceneId
  scene
  taskType
  contextPayload
  promptPreview
  tokenEstimate
  createdAt
```

### 8.4 验收

- 每次 AI 生成请求都有上下文快照。
- 调试页能查看 prompt 预览。
- 能看到本次使用了哪些角色、关系、伏笔、事实、知识库摘要。
- 不展示参考作品原文，只展示摘要和技巧。

---

## 9. 阶段 6：长期健康监控回路

### 9.1 目标

每章写完后更新项目健康指标，提示长篇写作风险。

### 9.2 指标

至少包括：

1. 主题一致性。
2. 人物 OOC 风险。
3. 伏笔遗忘风险。
4. 矛盾推进停滞。
5. 章节节奏波动。
6. 风格漂移。
7. 设定冲突。
8. 未使用关键角色。

### 9.3 数据来源

- Story Bible
- Characters
- Relationships
- Conflicts
- Foreshadowing
- Chapter Memories
- Story Fact Triples
- Quality Reports
- Consistency Guard Reports

### 9.4 验收

- 每章完成后健康指标自动刷新。
- 健康页能解释风险来源。
- 风险项能跳转到相关章节、角色、伏笔或矛盾。

---

## 10. 阶段 7：参考作品人格记忆与创作约束闭环

### 10.1 目标

将用户上传的大量网文分析成抽象写作人格，并在生成时作为风格与结构约束，而不是仿写原文。

### 10.2 数据流

```text
上传参考作品
  ↓
拆章 / 拆场景
  ↓
分析节奏、冲突、爽点、人物推进、悬念、文风
  ↓
生成作品风格报告
  ↓
汇总训练集人格
  ↓
绑定到项目
  ↓
AI 上下文按场景注入人格约束
  ↓
一致性检查风格漂移
```

### 10.3 要求

1. 不把参考作品原文塞进生成 prompt。
2. 只使用摘要、技巧、结构、风格指纹。
3. 项目设置页必须能绑定人格。
4. 不同场景可配置是否启用人格：
   - outline
   - draft
   - polish
   - quality

### 10.4 验收

- 上传参考作品后能生成作品风格报告。
- 训练集能生成人格。
- 项目设置页能绑定人格。
- AI 上下文快照能看到人格约束。
- 输出不包含参考原文连续表达。

---

## 11. API 与数据一致性要求

### 11.1 所有跨模块写入必须校验归属

必须校验：

- chapterId 属于 projectId。
- characterId 属于 projectId。
- relationshipId 属于 projectId。
- conflictId 属于 projectId。
- foreshadowingId 属于 projectId。
- sceneId 属于 projectId。

### 11.2 所有候选应用必须可追踪

建议应用后必须记录：

- 谁产生的建议。
- 来源章节。
- 来源 runId。
- 应用时间。
- 应用结果。
- 失败原因。

### 11.3 不允许静默成功

以下情况必须失败或标记 acknowledged：

- 解析失败。
- 角色匹配失败。
- 关系重复。
- 伏笔未匹配。
- 目标业务表没有对应落库逻辑。

---

## 12. 前端交互要求

### 12.1 统一 AI 结果确认区

所有 AI 结果按类型进入不同确认区：

1. 文本建议：
   - 插入
   - 替换
   - 保存为备选
   - 丢弃

2. 结构化建议：
   - 接受
   - 拒绝
   - 编辑后接受
   - 查看来源

3. 高风险建议：
   - 查看风险
   - 确认继续
   - 放弃

### 12.2 禁止手动复制作为主流程

AI 分析结果不能只显示在侧栏并提示用户复制。  
必须提供“应用到字段 / 生成候选 / 创建结构化记录”的明确操作。

---

## 13. 推荐实施顺序

### 第一批：数据流基础闭环

1. 大纲角色同步章节元素。
2. 章节元素 API 校验 `elementId`。
3. 章后分析增加 `relationship_update`。
4. 人物关系 API 增加去重。

### 第二批：写作闭环

1. 写作任务固定步骤流。
2. 用户确认后写回草稿。
3. 写作任务完成后自动触发章后分析。
4. 章后建议应用后刷新 AI 上下文和健康指标。

### 第三批：图谱与健康

1. 共场推理转人物关系候选。
2. 事实图谱转矛盾 / 伏笔候选。
3. 长篇健康指标解释与跳转。

### 第四批：人格与 RAG

1. 参考作品风格报告增强。
2. 项目绑定写作人格。
3. embedding 检索接入。
4. AI 上下文快照展示召回来源。

---

## 14. 验收总清单

- [ ] 大纲角色、章节元素、写作页上下文一致。
- [ ] AI 生成正文前能看到完整上下文快照。
- [ ] 生成结果必须经过一致性检查。
- [ ] 用户确认后正文才写入草稿。
- [ ] 写入草稿后自动保存版本。
- [ ] 章节完成后自动生成章后分析。
- [ ] 章后建议能回填事实、伏笔、角色状态、人物关系、矛盾。
- [ ] 回填后的数据能进入下一次 AI 上下文。
- [ ] 图谱推理能生成可确认业务建议。
- [ ] 健康指标能解释风险来源。
- [ ] 参考作品人格只注入抽象风格和结构，不注入原文。
- [ ] `pnpm check` 通过。
- [ ] 涉及数据库时 `pnpm db:generate` 和 `pnpm db:migrate` 通过。
