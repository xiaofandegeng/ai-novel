# PlotPilot 后续对齐修改文档

日期：2026-05-06  
状态：待执行  
关联文档：

1. [plotpilot-gap-analysis-and-adoption-roadmap-2026-05-03.md](./plotpilot-gap-analysis-and-adoption-roadmap-2026-05-03.md)
2. [plotpilot-remaining-adoption-roadmap-2026-05-04.md](./plotpilot-remaining-adoption-roadmap-2026-05-04.md)
3. [plotpilot-stage-1-5-closure-fix-plan-2026-05-05.md](./plotpilot-stage-1-5-closure-fix-plan-2026-05-05.md)
4. [plotpilot-stage-1-5-followup-fix-plan-2026-05-05.md](./plotpilot-stage-1-5-followup-fix-plan-2026-05-05.md)
5. [plotpilot-stage-1-5-unresolved-fix-plan-2026-05-05.md](./plotpilot-stage-1-5-unresolved-fix-plan-2026-05-05.md)

参考项目与资料：

1. [PlotPilot GitHub](https://github.com/shenminglinyi/PlotPilot)
2. [PlotPilot 架构文档](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/ARCHITECTURE.md)
3. [PlotPilot 知识检索设计](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/knowledge_search_design.md)
4. [PlotPilot 故事结构设计](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/story_structure_complete_design.md)
5. [PlotPilot 知识图谱自动推理设计](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/knowledge_graph_auto_inference.md)

范围：PlotPilot 已借鉴能力复盘、剩余对齐方向、后续开发顺序、验收标准。  
目标：明确当前项目已经吸收了哪些 PlotPilot 机制，后续还需要继续对齐哪些内容，避免重复开发和跳阶段开发。

---

## 1. 当前结论

当前项目已经完成了 PlotPilot 对齐路线中的一批基础能力，不再是只停留在文档阶段：

1. 章节元素、章节记忆、伏笔台账、故事事实三元组已有数据表、迁移和 API。
2. 大纲页和写作页已经开始接入章节元素。
3. AI 上下文已经能渲染当前章节、人物动机、前序记忆、章节元素、伏笔、事实三元组、知识库摘要等约束。
4. 章后处理已经能抽取结构化建议，并进入待确认 / 应用流程。
5. 写作任务已经具备步骤表和任务推进基础。
6. 项目健康指标已有初版页面和后端聚合逻辑。

后续不应继续盲目加表，而应优先做 5 类闭环：

1. 场景级规划与场景级写作。
2. 知识图谱自动推理与确认。
3. 真正的向量检索 RAG。
4. 长篇健康监控与风险解释。
5. 半自动写作任务的可观测、可暂停、可重试流程。

---

## 2. 已经对齐的能力清单

以下能力已具备基础实现，后续开发时应在现有代码上增强，不要重复新建平行模型。

| 能力 | 当前实现位置 | 当前状态 |
| --- | --- | --- |
| 章节元素 | `apps/api/src/routes/chapter-elements.ts`、`apps/web/src/stores/chapter-element.store.ts`、`apps/web/src/features/outline/components/ChapterOutlineEditor.vue`、`apps/web/src/features/writing/components/WritingContextPanel.vue` | 已进入大纲和写作上下文 |
| 章节记忆 | `apps/api/src/db/schema/chapter.ts`、`apps/api/src/services/chapter-postprocess.service.ts` | 已有唯一约束、upsert、前序记忆召回 |
| 伏笔台账 | `apps/api/src/routes/foreshadowing.ts`、`apps/api/src/db/schema/postprocess.ts` | 已有基础 CRUD 和项目归属校验 |
| 事实三元组 | `apps/api/src/routes/triples.ts`、`apps/api/src/services/story-graph-inference.service.ts` | 已有基础 CRUD、推理入口和待确认建议 |
| AI 上下文 | `apps/api/src/services/ai-context.service.ts`、`apps/api/src/services/ai-context-renderer.ts` | 已集中构建 prompt 上下文 |
| 章后建议 | `apps/api/src/services/postprocess-suggestion.service.ts`、`apps/web/src/views/PostChapterAnalysisView.vue` | 已有接受、拒绝、应用流程 |
| 写作任务 | `apps/api/src/services/writing-job.service.ts`、`apps/web/src/features/writing-jobs` | 已有步骤推进和确认节点 |
| 健康指标 | `apps/api/src/services/health-metrics.service.ts`、`apps/web/src/views/ProjectHealthView.vue` | 已有基础聚合，但还不是完整长篇监控 |
| 知识检索 | `apps/api/src/services/knowledge-retrieval.service.ts` | 已有关键词、事实扩展、知识索引融合，向量能力仍需升级 |

---

## 3. 后续对齐原则

### 3.1 不复制 PlotPilot 源码和提示词

PlotPilot 只能作为产品机制和架构思想参考。本项目不得复制其源码、专有提示词和商业化受限实现。

允许借鉴：

1. 长篇写作闭环。
2. 自动抽取和沉淀机制。
3. 知识图谱和伏笔台账思路。
4. 场景级规划、健康监控、自动驾驶任务流。

不允许：

1. 复制源代码。
2. 复制提示词模板。
3. 直接把参考作品原文塞进生成 prompt。
4. 让 AI 自动覆盖作者正文。

### 3.2 保持作者主控

当前项目不是全自动小说生成器，而是作者主控的 AI 小说工作台。所有新增对齐能力必须遵守：

1. AI 生成结果先进入确认区。
2. 结构化事实变更先进入待确认队列。
3. 一致性检查失败不得静默放行。
4. 参考网文只能沉淀抽象技巧、节奏、结构和风格特征。
5. 任何写入正文、事实库、伏笔台账、人物状态的动作都必须可追溯。

---

## 4. 后续开发顺序

必须按以下顺序推进。前一阶段验收未通过时，不要直接进入后续阶段。

| 顺序 | 阶段 | 优先级 | 目标 |
| --- | --- | --- | --- |
| 1 | 现有对齐能力回归验收 | P0 | 确认章节元素、章后建议、写作任务、上下文渲染没有回归 |
| 2 | 场景级规划闭环 | P1 | 把 `chapter_scenes` 从后端能力变成大纲、写作、AI 上下文里的真实工作流 |
| 3 | 图谱推理确认闭环 | P1 | 让自动推理结果进入可解释、可确认、可应用的队列 |
| 4 | 真实向量 RAG | P1 | 接入 embedding 生成、pgvector 查询、融合排序和上下文引用 |
| 5 | 长篇健康监控 | P2 | 监控主题偏离、人物 OOC、伏笔风险、节奏下滑、设定漂移 |
| 6 | 半自动写作驾驶舱 | P2 | 用任务流串起规划、生成、审查、确认、章后处理、健康更新 |
| 7 | 参考作品人格记忆增强 | P2 | 把参考网文分析结果转成可检索、可组合、可审查的写作人格记忆 |
| 8 | 导入导出与备份完整性 | P3 | 确保新增结构化数据都能迁移、导入、导出和备份 |

---

## 5. 阶段 1：现有对齐能力回归验收

### 5.1 目标

先确认早期 PlotPilot 对齐改造没有留下伪闭环。

### 5.2 检查项

#### 5.2.1 章节元素

检查文件：

```text
apps/api/src/routes/chapter-elements.ts
apps/web/src/features/outline/composables/useOutlineWorkspace.ts
apps/web/src/features/outline/components/ChapterOutlineEditor.vue
apps/web/src/views/WritingView.vue
apps/web/src/features/writing/components/WritingContextPanel.vue
```

验收标准：

1. 大纲页能添加、删除、保存章节元素。
2. 写作页能展示当前章节硬约束。
3. `PUT /elements` 使用事务，失败时不会删光旧数据。
4. `PATCH / DELETE` 同时校验 `projectId + chapterId + elementId`。

#### 5.2.2 章后处理

检查文件：

```text
apps/api/src/services/chapter-postprocess.service.ts
apps/api/src/services/postprocess-suggestion.service.ts
apps/web/src/views/PostChapterAnalysisView.vue
```

验收标准：

1. 章后处理能生成 `fact_triple / foreshadowing_add / foreshadowing_payoff / chapter_element / character_state / style_note / continuity_note` 建议。
2. 支持的建议类型应用后必须真实落库。
3. 暂不支持的建议类型只能标记为 `acknowledged`，不能伪装成 `applied`。
4. 无法解析的 payload 必须标记为 `apply_failed`，不能长期停留在 `accepted`。

#### 5.2.3 AI 上下文

检查文件：

```text
apps/api/src/services/ai-context.service.ts
apps/api/src/services/ai-context-renderer.ts
```

验收标准：

1. 当前章节的目标、冲突、事件、情绪曲线、伏笔、结尾钩子进入 prompt。
2. 人物的目标、欲望、恐惧、秘密、弱点、弧光进入 prompt。
3. 章节元素、前序章节记忆、开放伏笔、事实三元组进入 prompt。
4. 知识库只输出摘要、技巧和结构建议，不输出参考原文片段。
5. 当前章节和相关数据查询必须校验 `projectId`。

#### 5.2.4 写作任务

检查文件：

```text
apps/api/src/services/writing-job.service.ts
apps/api/src/routes/writing-jobs.ts
apps/web/src/features/writing-jobs
```

验收标准：

1. `approve / reject / retry` 均校验 `projectId + jobId + stepId`。
2. 用户确认正文后，生成草稿必须写回 `chapters.draft`。
3. 一致性检查失败时，任务不得继续自动写入。
4. 每一步有状态、输入、输出、失败原因和重试入口。

---

## 6. 阶段 2：场景级规划闭环

### 6.1 当前缺口

项目已有 `acts` 和 `chapter_scenes`，但场景层还没有成为主写作流程的一等能力。PlotPilot 的故事结构能力更强调从宏观结构拆到章节节拍和场景目标。

### 6.2 后端改造

检查或增强：

```text
apps/api/src/routes/scenes.ts
apps/api/src/db/schema/chapter.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/services/writing-job.service.ts
```

需要补齐：

1. `chapter_scenes` 增加明确状态：`planned / drafting / reviewed / completed`。
2. 场景字段至少包括：
   - `sceneNumber`
   - `title`
   - `location`
   - `timeline`
   - `purpose`
   - `conflict`
   - `characters`
   - `targetWords`
   - `summary`
   - `content`
3. AI 上下文支持 `sceneId`，并只渲染当前场景相关约束。
4. 写作任务支持 `scene_draft` 模式。

### 6.3 前端改造

新增或增强：

```text
apps/web/src/features/outline/components/ScenePlanner.vue
apps/web/src/features/writing/components/SceneDraftPanel.vue
apps/web/src/stores/scene.store.ts
apps/web/src/api/scenes.ts
```

产品流程：

```text
大纲页选择章节
  ↓
配置本章场景列表
  ↓
为每个场景设置目标、冲突、人物、地点、字数
  ↓
写作页选择当前场景
  ↓
AI 只基于当前场景生成草稿
  ↓
作者确认后写入 scene.content
  ↓
场景完成后汇总回章节草稿
```

### 6.4 验收标准

1. 用户可以在大纲页创建和编辑场景。
2. 用户可以在写作页按场景生成正文。
3. AI prompt 中能看到当前场景约束。
4. 场景正文不会绕过确认区直接覆盖章节正文。

---

## 7. 阶段 3：图谱推理确认闭环

### 7.1 当前缺口

项目已有事实三元组和推理服务，但还需要从“能生成推理”升级为“能解释、能确认、能应用、能审计”。

### 7.2 后端改造

检查或增强：

```text
apps/api/src/services/story-graph-inference.service.ts
apps/api/src/services/postprocess-suggestion.service.ts
apps/api/src/routes/postprocess-suggestions.ts
```

需要补齐：

1. 推理结果必须包含：
   - `sourceTripleIds`
   - `inferenceRule`
   - `confidence`
   - `reason`
   - `sourceChapterId`
2. 推理建议必须进入待确认队列，不得直接写入正式事实库。
3. 没有来源章节的推理不得写入章节级建议表。
4. 重复推理需要去重，避免同一条关系反复出现在队列。

### 7.3 前端改造

增强：

```text
apps/web/src/views/PostChapterAnalysisView.vue
```

新增“图谱推理”区域：

1. 显示推理关系。
2. 显示来源事实。
3. 显示推理规则。
4. 支持接受、拒绝、稍后处理。

### 7.4 验收标准

1. 推理建议能解释“为什么得出这个事实”。
2. 用户接受后写入 `story_fact_triples`。
3. 用户拒绝后不会再次重复出现同一建议。
4. 推理结果进入 AI 上下文前必须是 `confirmed`。

---

## 8. 阶段 4：真实向量 RAG

### 8.1 当前缺口

当前 `knowledge-retrieval.service.ts` 已经融合关键词、事实图谱扩展和知识索引文本匹配，但 `knowledge_embeddings.embedding` 仍未形成真正的向量检索能力。

### 8.2 后端改造

检查或增强：

```text
apps/api/src/services/knowledge.service.ts
apps/api/src/services/knowledge-retrieval.service.ts
apps/api/src/db/schema/knowledge.ts
apps/api/drizzle
```

需要补齐：

1. PostgreSQL 启用 `pgvector`。
2. `knowledge_embeddings.embedding` 改为向量类型，或使用兼容的 vector 存储方案。
3. 上传参考作品拆解后，为每个 chunk 摘要生成 embedding。
4. AI 请求时为检索 query 生成 embedding。
5. 执行向量相似度查询。
6. 将向量分数、关键词分数、事实图谱扩展分数融合排序。

### 8.3 AI 安全边界

RAG 上下文只能提供：

1. 摘要。
2. 结构技巧。
3. 节奏规律。
4. 人物关系抽象。
5. 场景功能说明。

禁止提供：

1. 参考网文原文连续片段。
2. 角色专名复刻。
3. 具体桥段复刻。
4. 可直接模仿的长段表达。

### 8.4 验收标准

1. 上传参考作品后，`knowledge_embeddings` 有真实向量。
2. 检索日志能看到关键词命中、向量命中、事实扩展命中。
3. AI 上下文中只出现摘要和技巧，不出现参考原文片段。
4. 无 embedding provider 时，系统明确降级到关键词检索，并在 UI 中提示。

---

## 9. 阶段 5：长篇健康监控

### 9.1 当前缺口

当前健康页已有基础指标，但 PlotPilot 值得借鉴的是“长篇作品持续监控”：发现偏题、人物失真、伏笔遗忘、节奏下滑、风格漂移。

### 9.2 后端改造

增强：

```text
apps/api/src/services/health-metrics.service.ts
apps/api/src/services/continuity.service.ts
apps/api/src/services/consistency-guard.service.ts
```

新增指标：

1. 主题偏离风险。
2. 人物 OOC 风险。
3. 伏笔超期未回收数量。
4. 关键冲突长期无进展数量。
5. 章节目标未完成数量。
6. 风格漂移趋势。
7. 写作人格偏离度。
8. 连续性风险条目数量。

### 9.3 前端改造

增强：

```text
apps/web/src/views/ProjectHealthView.vue
```

建议布局：

```text
作品健康
  总览分数
  风险卡片
  伏笔台账风险
  人物一致性风险
  节奏曲线
  风格漂移曲线
  建议修复动作
```

### 9.4 验收标准

1. 健康页不只是统计数量，而能指出具体风险来源。
2. 每个风险都能跳转到对应章节、人物、伏笔或冲突。
3. 风险建议不能自动修改正文，只能进入建议或任务。

---

## 10. 阶段 6：半自动写作驾驶舱

### 10.1 当前缺口

项目已有 `writing_jobs`，但还需要把它从“步骤任务”升级为“作者可控的半自动驾驶流程”。

### 10.2 目标流程

```text
选择目标：章节 / 场景 / 分卷
  ↓
准备上下文
  ↓
生成写作计划
  ↓
作者确认计划
  ↓
生成草稿
  ↓
一致性检查
  ↓
作者确认写入
  ↓
保存版本
  ↓
章后处理
  ↓
待确认建议
  ↓
健康指标更新
```

### 10.3 后端改造

增强：

```text
apps/api/src/services/writing-job.service.ts
apps/api/src/routes/writing-jobs.ts
```

需要补齐：

1. 每个步骤的 input/output 都可查看。
2. 每个失败步骤都可 retry。
3. 每个确认步骤都只允许确认当前待确认步骤。
4. 任务状态通过 SSE 或轮询实时更新。
5. postprocess 失败时任务应进入 `needs_attention`，不得假完成。

### 10.4 前端改造

增强：

```text
apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue
apps/web/src/features/writing-jobs/composables/useWritingJobController.ts
```

需要补齐：

1. 当前步骤高亮。
2. 步骤详情抽屉。
3. 输入 / 输出预览。
4. 错误原因和重试按钮。
5. 确认区禁止重复确认已完成步骤。

### 10.5 验收标准

1. 生成一章可以完整跑完任务流。
2. 每个 AI 输出都能被作者确认。
3. 任一步失败都能看到原因。
4. 任务不会跨项目操作其他项目数据。

---

## 11. 阶段 7：参考作品人格记忆增强

### 11.1 当前缺口

项目已有写作人格和参考作品训练中心，但后续还要把参考作品拆解结果转成可检索、可组合、可审查的长期记忆。

### 11.2 数据方向

参考作品分析结果应沉淀为：

1. 叙事节奏模式。
2. 章节开合方式。
3. 冲突升级方式。
4. 人物关系推进方式。
5. 爽点分布。
6. 伏笔布置与回收方式。
7. 语言风格特征。
8. 禁止复刻的原文和专名黑名单。

### 11.3 生成方向

写作时不应提示“模仿某作品”，而应提示：

```text
使用已训练人格中的抽象技巧：
- 节奏：短钩子开场，章节末保留未解答问题
- 冲突：每 800-1200 字推进一次压力
- 人物：主角选择必须暴露价值观
- 伏笔：每章至少保留一个可回收细节
```

### 11.4 验收标准

1. 多部参考作品可以合成一个写作人格。
2. 写作人格只包含抽象技巧和约束。
3. 生成 prompt 不包含参考作品原文。
4. 用户可查看人格由哪些参考作品贡献了哪些抽象特征。

---

## 12. 阶段 8：导入导出与备份完整性

### 12.1 当前缺口

PlotPilot 对齐后新增了大量结构化数据。导入导出必须持续跟上，否则用户迁移项目时会丢失关键上下文。

### 12.2 检查文件

```text
apps/api/src/services/export-import.service.ts
```

必须覆盖：

1. `acts`
2. `chapter_scenes`
3. `chapter_elements`
4. `chapter_memories`
5. `foreshadowing_items`
6. `story_fact_triples`
7. `chapter_postprocess_runs`
8. `chapter_postprocess_suggestions`
9. `writing_jobs`
10. `writing_job_steps`
11. `health_metrics`
12. `ai_context_snapshots`
13. `knowledge_embeddings`

### 12.3 验收标准

1. 导出项目后重新导入，核心写作上下文不丢失。
2. 所有外键 ID 正确 remap。
3. 导入过程使用事务。
4. 导入失败不会留下半导入项目。

---

## 13. 测试计划

每完成一个阶段必须运行：

```bash
pnpm check
pnpm db:migrate
```

涉及数据库 schema 时额外运行：

```bash
pnpm db:generate
pnpm --filter @ai-novel/api db:seed
```

涉及前端 UI 时必须检查：

1. 大纲页。
2. 写作页。
3. 章后分析页。
4. 写作任务页。
5. 项目健康页。
6. 项目设置页。

建议补充测试：

1. `chapter-elements` 批量替换事务测试。
2. `postprocess-suggestion` 应用统计测试。
3. `ai-context-renderer` 上下文快照测试。
4. `writing-job.service` 步骤推进测试。
5. `knowledge-retrieval.service` 融合排序测试。
6. `export-import.service` 完整迁移测试。

---

## 14. 给后续 AI 的执行提示

后续 AI 开发时必须先阅读：

1. `AGENTS.md`
2. `docs/development/engineering-standards.md`
3. `docs/development/ai-collaboration-rules.md`
4. 本文档

执行规则：

1. 不要重复实现已有的章节元素、章节记忆、伏笔、三元组模型。
2. 不要绕过 `apps/web/src/api` 直接在 store 或组件里拼 fetch。
3. 不要让 AI 结果直接覆盖正文。
4. 不要把参考作品原文放进生成 prompt。
5. 不要新增 schema 字段后遗漏 migration。
6. 不要用当前项目路径操作其他项目资源。
7. 每一阶段结束必须给出验证命令和结果。

---

## 15. 最小下一步

建议下一轮只做一件事：**场景级规划闭环**。

原因：

1. 章节元素、伏笔、记忆、事实图谱已经进入基础闭环。
2. 场景级规划是从“按章写”升级到“按节拍写”的关键。
3. 场景级上下文能显著提升长篇连贯性。
4. 后续半自动驾驶、健康监控、RAG 召回都可以围绕场景展开。

最小交付：

1. 大纲页能创建场景。
2. 写作页能选择当前场景。
3. AI 生成时传入 `sceneId`。
4. prompt 渲染当前场景目标、冲突、人物、地点、字数。
5. 生成结果进入确认区后写入 `chapter_scenes.content`。

