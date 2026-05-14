# 下一步图谱推理与写作闭环实施文档

日期：2026-05-14
状态：待实施
前置假设：

1. `docs/development/next-step-data-flow-implementation-plan-2026-05-14.md` 已完成。
2. 大纲角色与章节元素已经双向同步。
3. 章节元素已校验 `elementId` 项目归属。
4. 章后分析已经能生成人物关系建议并回填人物关系网。
5. 人物关系创建已具备去重能力。

目标：在上一批“数据能自动回填”的基础上，继续完成“图谱能推理、写作任务能闭环、AI 上下文可审计”的下一阶段。

---

## 1. 本轮实施范围

本轮只做 4 件事：

1. 事实图谱推理业务化。
2. 矛盾和伏笔与角色建立结构化关联。
3. 写作任务成为推荐主流程。
4. AI 上下文快照与调试器补齐。

暂不做：

- 完整自动驾驶守护进程。
- 多模型路由策略优化。
- 完整向量 RAG。
- 参考作品人格长期记忆增强。
- 新 UI 大改版。

---

## 2. 阶段 A：事实图谱推理业务化

### 2.1 目标

当前事实图谱主要用于记录三元组。下一步要让事实图谱能产生业务建议：

- 人物关系候选
- 矛盾升级候选
- 伏笔兑现候选
- 设定冲突提示

所有推理结果必须进入待确认队列，不允许直接改正式数据。

### 2.2 修改范围

```text
apps/api/src/services/story-graph-inference.service.ts
apps/api/src/services/postprocess-suggestion.service.ts
apps/api/src/services/chapter-postprocess.service.ts
apps/api/src/db/schema/postprocess.ts
apps/web/src/views/PostChapterAnalysisView.vue
packages/shared/src
```

### 2.3 新增或扩展建议类型

在 `chapter_postprocess_suggestions.suggestionType` 中确认支持：

```ts
type PostprocessSuggestionType =
  | 'fact_triple'
  | 'relationship_update'
  | 'conflict_update'
  | 'foreshadowing_add'
  | 'foreshadowing_payoff'
  | 'chapter_element'
  | 'character_state'
  | 'continuity_note'
  | 'style_note'
```

如果已有类型不完整，补齐 shared 类型、schema 类型和前端展示映射。

### 2.4 共场推理转人物关系候选

输入：

- 同一章节中两个角色都出现在 `chapter_elements`。
- 两人尚无正式 `character_relationships`。

输出：

```json
{
  "suggestionType": "relationship_update",
  "payload": {
    "characterAId": "角色A ID",
    "characterBId": "角色B ID",
    "characterAName": "角色A",
    "characterBName": "角色B",
    "type": "neutral",
    "strength": 3,
    "status": "同章共场，关系待确认",
    "description": "两人在同一章节出现，可能存在互动或剧情联系",
    "sourceType": "graph_inference",
    "sourceChapterId": "章节 ID",
    "sourceElementIds": ["元素 A ID", "元素 B ID"],
    "inferenceRule": "co_occurrence"
  }
}
```

要求：

1. 使用角色 ID pair 去重。
2. 已有人物关系时不生成候选。
3. 同一章节同一 pair 不重复生成候选。
4. 候选必须可拒绝、可接受、可解释。

### 2.5 事实三元组转矛盾升级候选

输入：

- `story_fact_triples` 中出现冲突类谓词：
  - 攻击
  - 背叛
  - 欺骗
  - 追捕
  - 威胁
  - 交易破裂
  - 争夺
  - 隐瞒
- 相关角色已经存在 active / escalated conflict。

输出：

```json
{
  "suggestionType": "conflict_update",
  "payload": {
    "conflictId": "可选",
    "title": "矛盾标题",
    "newStatus": "escalated",
    "newIntensity": 8,
    "reason": "某事实三元组显示冲突升级",
    "sourceTripleIds": ["tripleId"],
    "sourceChapterId": "chapterId"
  }
}
```

要求：

1. 优先匹配已有矛盾。
2. 匹配不到时生成 `continuity_note`，提示用户是否创建新矛盾。
3. 不允许自动创建正式矛盾。

### 2.6 事实三元组转伏笔兑现候选

输入：

- 开放伏笔 `foreshadowing_items.status = 'open' | 'progressing'`。
- 当前章节事实、事件或摘要与伏笔标题/描述/关联角色匹配。

输出：

```json
{
  "suggestionType": "foreshadowing_payoff",
  "payload": {
    "foreshadowingId": "伏笔 ID",
    "title": "伏笔标题",
    "description": "兑现依据",
    "payoffChapterId": "当前章节 ID",
    "sourceTripleIds": ["tripleId"],
    "confidence": 72
  }
}
```

要求：

1. 有明确 `foreshadowingId` 才能应用为 `applied`。
2. 匹配不到 ID 时只能生成 `continuity_note` 或 `apply_failed`。
3. 不能出现“已应用但伏笔状态没变”。

### 2.7 验收

手动测试：

1. 在同一章配置两个必须出场角色。
2. 运行图谱推理。
3. 确认出现人物关系候选。
4. 接受候选后人物关系页出现关系。
5. 新增一条冲突类事实三元组。
6. 运行推理，确认出现矛盾升级建议。
7. 新增开放伏笔，再写入对应事实。
8. 运行推理，确认出现伏笔兑现建议。

命令：

```bash
pnpm check
```

---

## 3. 阶段 B：矛盾和伏笔与角色结构化关联

### 3.1 目标

减少自由文本关联，避免角色改名、新增、删除后，矛盾和伏笔断链。

### 3.2 修改范围

```text
apps/api/src/db/schema
apps/api/src/routes/conflicts.ts
apps/api/src/routes/foreshadowing.ts
apps/api/src/services/ownership.service.ts
apps/web/src/views/ConflictMatrixView.vue
apps/web/src/views/ForeshadowingView.vue
packages/shared/src
```

### 3.3 新增表

#### conflict_participants

```text
id
project_id
conflict_id
character_id
role_in_conflict
created_at
updated_at
```

唯一约束：

```text
unique(project_id, conflict_id, character_id)
```

#### foreshadowing_characters

```text
id
project_id
foreshadowing_id
character_id
relation_type
created_at
updated_at
```

唯一约束：

```text
unique(project_id, foreshadowing_id, character_id)
```

### 3.4 API 要求

矛盾接口支持：

```http
GET /api/projects/:projectId/conflicts/:id/participants
PUT /api/projects/:projectId/conflicts/:id/participants
```

伏笔接口支持：

```http
GET /api/projects/:projectId/foreshadowing/:id/characters
PUT /api/projects/:projectId/foreshadowing/:id/characters
```

要求：

1. 所有关联 ID 必须校验归属。
2. PUT 使用事务替换。
3. 保留原 `participants` / `relatedCharacters` 文本字段作为展示兼容，但 AI 上下文优先使用结构化关联。

### 3.5 前端要求

1. 矛盾编辑页增加“参与角色”选择。
2. 伏笔编辑页增加“相关角色”选择。
3. 保存时同时保存文本摘要和结构化关联。
4. 角色改名后，页面展示使用角色表最新名称。

### 3.6 AI 上下文要求

`ai-context.service.ts` / `ai-context-renderer.ts`：

1. 矛盾区块渲染结构化参与角色。
2. 伏笔区块渲染结构化相关角色。
3. 如果结构化关联为空，再回退旧文本字段。

### 3.7 验收

1. 角色改名后，矛盾参与者显示新名称。
2. 角色改名后，伏笔相关角色显示新名称。
3. AI 上下文中矛盾和伏笔相关人物来自结构化关联。
4. 跨项目角色不能绑定到当前项目矛盾或伏笔。

命令：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

---

## 4. 阶段 C：写作任务成为推荐主流程

### 4.1 目标

让“开始写作”不只是打开编辑器，而是启动可追踪任务流。

### 4.2 修改范围

```text
apps/api/src/services/writing-job.service.ts
apps/api/src/routes/writing-jobs.ts
apps/web/src/views/WritingView.vue
apps/web/src/features/writing-jobs
apps/web/src/features/writing/components/WritingHeaderActions.vue
```

### 4.3 标准任务步骤

```text
prepare_context
generate_plan
confirm_plan
generate_draft
run_consistency_guard
confirm_apply
apply_draft
save_version
postprocess
refresh_health_metrics
completed
```

### 4.4 强制规则

1. `generate_plan` 结果必须进入确认节点。
2. `generate_draft` 结果不能直接写入正文。
3. 一致性检查失败时进入人工确认，不得自动放行。
4. `confirm_apply` 通过后才执行 `apply_draft`。
5. `apply_draft` 必须写入 `chapters.draft` 或当前 scene content。
6. 写入后必须保存版本。
7. 版本保存后自动触发章后分析。
8. 任务完成后刷新健康指标。

### 4.5 前端入口

写作页推荐两个按钮：

1. `开始任务写作`
2. `手动编辑`

要求：

- `开始任务写作` 走完整任务流。
- `手动编辑` 保留自由编辑能力，但保存章节完成时仍建议触发章后分析。

### 4.6 任务时间线 UI

每一步显示：

- 步骤名
- 状态
- 输入摘要
- 输出摘要
- 错误信息
- 重试按钮
- 当前待确认操作

只允许当前待确认步骤显示“确认继续 / 驳回”。

### 4.7 验收

1. 点击开始任务写作后，能看到任务时间线。
2. 生成计划后停在确认节点。
3. 确认计划后生成草稿。
4. 草稿通过一致性检查后停在应用确认。
5. 确认应用后正文写回章节。
6. 自动保存版本。
7. 自动触发章后分析。
8. 任务失败可重试。

命令：

```bash
pnpm check
```

---

## 5. 阶段 D：AI 上下文快照与调试器

### 5.1 目标

每次 AI 请求都能追溯：用了哪些设定、人物、关系、矛盾、伏笔、事实、记忆、知识库和人格。

### 5.2 修改范围

```text
apps/api/src/routes/ai.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/services/ai-context-renderer.ts
apps/api/src/db/schema/ai.ts
apps/api/src/routes/context-snapshots.ts
apps/web/src/views/AIContextDebuggerView.vue
apps/web/src/api/context-snapshots.ts
```

### 5.3 快照字段

```text
id
request_id
project_id
chapter_id
scene_id
scene
task_type
model_provider
model_name
context_payload
prompt_preview
token_estimate
created_at
```

### 5.4 写入时机

以下请求必须写入快照：

1. 大纲 AI。
2. 角色 AI。
3. 正文生成。
4. 润色 / 扩写 / 精简。
5. 一致性检查。
6. 章后分析。
7. 质量评估。

### 5.5 隐私和版权要求

1. 快照可以保存项目自身上下文。
2. 知识库来源只保存摘要、技巧、结构建议。
3. 不保存参考作品原文片段。
4. API Key、完整 provider 配置不得进入快照。

### 5.6 前端调试页

调试页至少显示：

- 请求时间
- 场景
- 模型
- 章节
- 使用的角色数量
- 使用的关系数量
- 使用的伏笔数量
- 使用的事实数量
- 使用的知识库条目数量
- prompt 预览

### 5.7 验收

1. 触发一次正文 AI 生成后，调试页出现快照。
2. 快照能看到本次使用的角色、关系、伏笔和事实数量。
3. prompt 预览不包含参考作品原文。
4. 删除项目时相关快照级联清理。

命令：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

---

## 6. 端到端测试流程

### 6.1 测试数据

项目：镜中城

角色：

- 林澈：主角
- 沈微：盟友
- 楚笙：反派

核心设定：

- 记忆可以被商品化交易。
- 越珍贵的记忆越值钱，但越容易影响身份稳定。

### 6.2 测试流程

1. 大纲页第一章配置林澈、沈微为必须出场。
2. 运行图谱推理，检查是否生成二人关系候选。
3. 接受关系候选。
4. 创建矛盾：林澈与楚笙围绕记忆档案展开冲突，并绑定两名角色。
5. 创建伏笔：沈微隐瞒档案馆身份，并绑定沈微。
6. 启动写作任务。
7. 生成计划，确认。
8. 生成草稿，一致性检查，确认应用。
9. 任务完成后检查：
   - 章节正文已写入。
   - 版本已保存。
   - 章后分析已生成。
   - 人物关系、矛盾、伏笔建议可确认。
   - AI 上下文快照已生成。

### 6.3 验收命令

```bash
pnpm check
```

如有 schema 变更：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

---

## 7. 不允许的实现方式

1. 不允许图谱推理直接修改正式业务数据。
2. 不允许写作任务跳过作者确认。
3. 不允许一致性检查失败后静默放行。
4. 不允许 AI 上下文快照保存参考作品原文。
5. 不允许跨项目绑定角色、矛盾、伏笔、章节。
6. 不允许只做前端展示，不落库。

---

## 8. 完成标准

- [ ] 共场推理能生成关系候选。
- [ ] 冲突类事实能生成矛盾升级候选。
- [ ] 伏笔相关事实能生成兑现候选。
- [ ] 矛盾参与者使用结构化角色关联。
- [ ] 伏笔相关角色使用结构化角色关联。
- [ ] 写作任务能从计划到草稿、审查、确认、写入、版本、章后分析完整跑通。
- [ ] 每次关键 AI 请求都有上下文快照。
- [ ] 快照不包含 API Key 和参考作品原文。
- [ ] `pnpm check` 通过。
- [ ] 涉及数据库时 `pnpm db:migrate` 通过。

