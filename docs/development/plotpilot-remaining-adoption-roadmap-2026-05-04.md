# PlotPilot 剩余可借鉴能力开发路线图

日期：2026-05-04  
状态：待执行  
关联文档：

1. [plotpilot-gap-analysis-and-adoption-roadmap-2026-05-03.md](./plotpilot-gap-analysis-and-adoption-roadmap-2026-05-03.md)
2. [plotpilot-p0-minimum-loop-fix-plan-2026-05-03.md](./plotpilot-p0-minimum-loop-fix-plan-2026-05-03.md)
3. [plotpilot-p0-followup-fix-plan-2026-05-04.md](./plotpilot-p0-followup-fix-plan-2026-05-04.md)
4. [chapter-elements-transaction-fix-plan-2026-05-04.md](./chapter-elements-transaction-fix-plan-2026-05-04.md)

参考项目：

1. [shenminglinyi/PlotPilot](https://github.com/shenminglinyi/PlotPilot)
2. [PlotPilot 架构文档](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/ARCHITECTURE.md)
3. [PlotPilot 知识检索设计](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/knowledge_search_design.md)
4. [PlotPilot 故事结构设计](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/story_structure_complete_design.md)
5. [PlotPilot 知识图谱自动感知设计](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/knowledge_graph_auto_inference.md)

范围：自动抽取、知识图谱、混合检索、写作任务引擎、故事结构模板、连续性守卫、写作人格长期记忆、AI 上下文调试器。  
目标：在不复制 PlotPilot 源码和提示词的前提下，把剩余可借鉴机制转化为本项目的分阶段开发顺序。

---

## 1. 当前已经借鉴完成的能力

当前项目已经从 PlotPilot 对标路线中吸收了以下基础结构：

1. `chapter_elements`：章节元素，用于记录本章必须出场人物、地点、道具、组织、事件。
2. `foreshadowing_items`：伏笔台账，用于追踪伏笔埋设、预计兑现和实际兑现。
3. `story_fact_triples`：故事事实三元组，用于沉淀人物、地点、事件、物品等事实。
4. `chapter_memories`：章节记忆，用于在后续写作中召回前文摘要和变化。
5. `acts` / `chapter_scenes`：幕和场景层级，用于支撑更细粒度的故事结构。
6. `writing_jobs`：写作任务基础表，用于后续承载半自动写作流程。
7. `health_metrics`：项目健康度基础能力，用于检查伏笔、章节、冲突和结构状态。
8. `ai-context.service.ts`：统一 AI 上下文构建入口，已经开始整合项目设定、章节、人物、人格、伏笔、事实和章节记忆。

这些能力说明项目已经完成了“结构化数据底座”的一部分。  
后续重点不应继续盲目加表，而应把结构化数据变成自动推理、生成约束、风险审查和可视化工作流。

---

## 2. 总体原则

### 2.1 只学习机制，不复制实现

PlotPilot 许可证包含 Commons Clause 限制。本项目不得复制 PlotPilot 源码、专有提示词、实现细节或商业化复用其代码。

允许学习：

1. 产品机制。
2. 模块边界。
3. 数据流设计。
4. 长篇写作闭环思想。

不允许：

1. 复制源码。
2. 复制提示词。
3. 复制专有业务实现。
4. 把参考网文原文直接放进生成 prompt。

### 2.2 保持作者主控

PlotPilot 偏“自动驾驶长篇生成”。本项目定位是“作者主控的 AI 小说创作工作台”。  
因此所有自动化能力必须遵守：

1. AI 生成内容先进入确认区。
2. 结构化事实变更先进入待确认队列。
3. 一致性检查失败不得静默放行。
4. 参考作品只能提炼抽象技巧、节奏和结构，不得复刻桥段和表达。

### 2.3 按闭环优先，而不是按模块堆叠

后续开发顺序必须优先完成端到端闭环：

```text
章节写作
  ↓
章后自动分析
  ↓
抽取事实 / 元素 / 伏笔 / 风格变化
  ↓
作者确认
  ↓
写入长期记忆和知识图谱
  ↓
下一章 AI 上下文自动召回
  ↓
生成后一致性检查
```

---

## 3. 开发顺序总览

必须按以下顺序执行。不要跳过前置阶段直接做后置阶段。

| 顺序 | 阶段 | 优先级 | 核心目标 |
| --- | --- | --- | --- |
| 0 | 稳定现有 P0 闭环 | P0 | 修复章节元素事务、项目边界和当前门禁 |
| 1 | 章后自动抽取与待确认队列 | P0 | 写完章节后自动生成结构化变更，作者确认后入库 |
| 2 | AI 上下文调试器 | P0 | 每次 AI 请求可查看实际携带的设定、事实、记忆和约束 |
| 3 | 知识图谱推理层 | P1 | 从事实三元组推导人物、地点、事件、物品关系 |
| 4 | 混合检索 RAG | P1 | 关键词 + 向量 + 图谱召回，支撑参考网文人格和技巧召回 |
| 5 | 写作任务引擎 | P1 | 把生成一章拆成可追踪、可暂停、可重试的任务流 |
| 6 | 故事结构模板库 | P2 | 内置网文节拍、三幕式、爽点循环、伏笔兑现结构 |
| 7 | 全文连续性仪表盘 | P2 | 监控主题偏离、人物 OOC、伏笔遗忘、节奏下滑 |
| 8 | 写作人格长期记忆增强 | P2 | 从大量参考作品形成可检索、可约束、可审查的人格记忆 |
| 9 | 本地化与隐私增强 | P3 | 强化本地部署、导入导出、备份、离线可用能力 |

---

## 4. 阶段 0：稳定现有 P0 闭环

### 4.1 目标

确保已经借鉴的结构化数据能力不会在保存、迁移、项目边界上产生数据损坏。

### 4.2 必修事项

1. 完成 [chapter-elements-transaction-fix-plan-2026-05-04.md](./chapter-elements-transaction-fix-plan-2026-05-04.md)。
2. `PUT /api/projects/:projectId/chapters/:chapterId/elements` 必须使用事务。
3. 批量替换章节元素前必须校验：
   - `chapterId` 属于 `projectId`
   - `elementName` 非空
   - `elementType / relationType / importance` 是合法枚举
   - 同批次没有重复元素
4. `foreshadowing / triples / acts / scenes / writing-jobs` 等新增路由写入关联 ID 时必须校验项目归属。

### 4.3 验收标准

1. `pnpm check` 通过。
2. `pnpm db:migrate` 通过。
3. 大纲页保存章节元素失败时，旧元素不会丢失。
4. 任意接口不能通过当前项目路径修改其他项目的数据。

---

## 5. 阶段 1：章后自动抽取与待确认队列

### 5.1 要解决的问题

当前项目已有 `chapter-postprocess.service.ts` 和章节记忆，但章后处理仍偏“摘要生成”。  
PlotPilot 更值得学习的是：章节生成或保存后，自动沉淀结构化信息。

### 5.2 新增能力

章节正文保存后，自动抽取：

1. 本章摘要。
2. 关键事件。
3. 人物状态变化。
4. 新增事实三元组。
5. 可能新增的伏笔。
6. 可能兑现的伏笔。
7. 本章出现的结构化元素。
8. 对后续章节的约束。
9. 风格和节奏特征。

这些结果不能直接写入正式事实库。必须先进入“待确认变更队列”。

### 5.3 建议新增表

文件：

```text
apps/api/src/db/schema.ts
```

建议新增：

```text
chapter_postprocess_suggestions
```

字段建议：

1. `id`
2. `projectId`
3. `chapterId`
4. `runId`
5. `suggestionType`
   - `fact_triple`
   - `foreshadowing_add`
   - `foreshadowing_payoff`
   - `chapter_element`
   - `character_state`
   - `continuity_note`
   - `style_note`
6. `payload`
7. `confidence`
8. `status`
   - `pending`
   - `accepted`
   - `rejected`
   - `applied`
9. `reason`
10. `createdAt`
11. `updatedAt`

### 5.4 API

新增：

```http
GET  /api/projects/:projectId/chapters/:chapterId/postprocess-suggestions
POST /api/projects/:projectId/chapters/:chapterId/postprocess-suggestions/:id/accept
POST /api/projects/:projectId/chapters/:chapterId/postprocess-suggestions/:id/reject
POST /api/projects/:projectId/chapters/:chapterId/postprocess-suggestions/apply-accepted
```

### 5.5 前端

写作页新增“章后分析”面板：

```text
章后分析

待确认事实
- 林岚 隶属于 镜中城调查局 [接受] [拒绝]

待确认伏笔
- 空白信可能是身份反转伏笔 [接受] [拒绝]

人物变化
- 顾临川开始怀疑自己的记忆 [接受] [拒绝]
```

### 5.6 验收标准

1. 写完章节后可以触发章后分析。
2. AI 抽取结果默认是 `pending`。
3. 接受后才写入 `story_fact_triples / foreshadowing_items / chapter_elements`。
4. 拒绝后不会进入 AI 长期上下文。
5. 失败时有错误状态和重试入口。

---

## 6. 阶段 2：AI 上下文调试器

### 6.1 要解决的问题

当前已经有统一 AI 上下文构建，但用户和开发者很难知道一次 AI 请求到底带了什么内容。  
这会导致：

1. AI 写偏时无法定位原因。
2. 人格、知识库、章节记忆是否生效不可见。
3. 一致性守卫是否拿到正确上下文不可见。

### 6.2 新增能力

每次 AI 请求保存一份上下文快照：

```text
ai_context_snapshots
```

字段建议：

1. `id`
2. `projectId`
3. `chapterId`
4. `scene`
5. `requestId`
6. `modelProvider`
7. `modelName`
8. `contextPayload`
9. `renderedPromptPreview`
10. `tokenEstimate`
11. `createdAt`

### 6.3 前端入口

在 AI 侧栏、写作页、大纲页增加“查看本次上下文”入口。

展示分区：

1. 项目目标。
2. 故事设定。
3. 当前章节。
4. 前序章节记忆。
5. 人物设定。
6. 章节元素。
7. 伏笔台账。
8. 故事事实。
9. 知识库技巧。
10. 写作人格。
11. 一致性规则。

### 6.4 验收标准

1. 每次 AI 请求都有 `requestId`。
2. 开发者能通过 `requestId` 查看上下文快照。
3. 快照不保存 API Key。
4. 快照不保存参考作品原文，只保存摘要、技巧和结构标签。
5. 前端可以复制上下文摘要用于排查。

---

## 7. 阶段 3：知识图谱推理层

### 7.1 要解决的问题

`story_fact_triples` 当前只是事实表。  
PlotPilot 值得学习的是“从文本和事实中自动感知关系”。

### 7.2 推理规则

第一版只做可解释规则，不做复杂图算法：

1. 同章多次共场的人物，可以建议建立人物关系。
2. 人物在某地点多次行动，可以建议人物-地点关联。
3. 事件发生在某地点，可以建议事件-地点关联。
4. 道具被某人物使用，可以建议道具归属或使用关系。
5. 伏笔 setup 和 payoff 跨章节时，可以建议因果关联。
6. 人物目标、恐惧、秘密被正文触发时，可以建议人物状态变化。

### 7.3 新增服务

文件：

```text
apps/api/src/services/story-graph-inference.service.ts
```

职责：

1. 从已确认 `chapter_postprocess_suggestions` 和 `story_fact_triples` 中推理新关系。
2. 生成新的 `pending` 建议，而不是直接写入正式事实。
3. 为每条推理提供 reason 和 evidence。

### 7.4 验收标准

1. 推理结果必须可解释。
2. 推理结果必须可拒绝。
3. AI 上下文默认只使用已确认事实。
4. 用户可以在“知识图谱”页面看到待确认关系。

---

## 8. 阶段 4：混合检索 RAG

### 8.1 要解决的问题

当前知识库检索主要依赖关键词匹配。大量参考网文、章节摘要、技巧标签进入系统后，仅靠 `ILIKE` 很难稳定召回。

### 8.2 检索升级顺序

按以下顺序实现：

1. 关键词检索增强。
2. pgvector 向量检索。
3. 图谱关联召回。
4. 结果融合排序。
5. 上下文预算控制。

### 8.3 数据来源

可生成 embedding 的内容：

1. 知识库 chunk 摘要。
2. 技巧标签。
3. 风格报告。
4. 写作人格规则。
5. 章节记忆摘要。
6. 已确认事实三元组的自然语言描述。

禁止生成时直接召回：

1. 参考网文连续原文。
2. 大段未摘要内容。
3. 带版权风险的桥段复述。

### 8.4 建议新增表

```text
knowledge_embeddings
```

字段建议：

1. `id`
2. `projectId`
3. `sourceType`
4. `sourceId`
5. `embedding`
6. `summary`
7. `tags`
8. `createdAt`

如果使用 PostgreSQL，建议后续引入 `pgvector`。

### 8.5 检索策略

一次 AI 请求的知识召回应按以下顺序：

```text
当前章节目标 / 人物 / 冲突 / 场景
  ↓
抽取关键词
  ↓
向量检索相近技巧
  ↓
图谱扩展相关事实
  ↓
去重和版权过滤
  ↓
按 token 预算裁剪
```

### 8.6 验收标准

1. 搜索“身份反转”能命中技巧摘要，而不要求原文包含完整查询句。
2. AI prompt 中不出现参考网文原文。
3. 每条召回结果能说明来源。
4. 上下文调试器能显示本次召回了哪些知识。

---

## 9. 阶段 5：写作任务引擎

### 9.1 要解决的问题

当前 `writing_jobs` 更像任务记录，还不是可执行工作流。  
PlotPilot 的后台生成思想可以借鉴，但本项目必须保留人工确认点。

### 9.2 任务步骤

“生成下一章”应拆成：

1. 准备上下文。
2. 生成章节计划。
3. 作者确认章节计划。
4. 生成草稿。
5. 一致性检查。
6. 作者确认应用。
7. 保存章节版本。
8. 执行章后分析。
9. 作者确认结构化变更。
10. 更新章节记忆和健康度。

### 9.3 新增表

```text
writing_job_steps
```

字段建议：

1. `id`
2. `jobId`
3. `stepType`
4. `status`
5. `input`
6. `output`
7. `error`
8. `startedAt`
9. `finishedAt`

### 9.4 API

```http
POST /api/projects/:projectId/writing-jobs
GET  /api/projects/:projectId/writing-jobs/:jobId
POST /api/projects/:projectId/writing-jobs/:jobId/start
POST /api/projects/:projectId/writing-jobs/:jobId/pause
POST /api/projects/:projectId/writing-jobs/:jobId/resume
POST /api/projects/:projectId/writing-jobs/:jobId/cancel
GET  /api/projects/:projectId/writing-jobs/:jobId/events
```

`events` 可以使用 SSE 或 NDJSON。

### 9.5 验收标准

1. 任务步骤可视化。
2. 任务失败可以看到失败步骤。
3. 任务可以重试失败步骤。
4. AI 草稿不会自动覆盖正文。
5. 任何自动写入长期事实的步骤都需要作者确认。

---

## 10. 阶段 6：故事结构模板库

### 10.1 要解决的问题

当前项目已有大纲、分卷、章节和场景，但“小说架构”仍主要依赖用户自由填写。

### 10.2 模板类型

建议内置：

1. 三幕式。
2. 起承转合。
3. 网文升级流。
4. 悬疑反转流。
5. 爽点循环。
6. 群像多线流。
7. 副本闯关流。
8. 情感拉扯流。

### 10.3 模板内容

每个模板包含：

1. 卷级目标。
2. 幕级功能。
3. 章节节拍。
4. 爽点/压迫/反击/奖励位置。
5. 伏笔埋设和兑现建议。
6. 人物关系推进建议。
7. 风险提示。

### 10.4 前端入口

项目设置或大纲页新增：

```text
故事架构

当前模板：悬疑反转流
[更换模板] [应用到当前卷] [生成节拍建议]
```

### 10.5 验收标准

1. 创建项目时可选择结构模板。
2. 大纲页可以按模板生成章节节拍建议。
3. AI 生成章节时会收到当前结构节拍。
4. 用户可以覆盖模板建议。

---

## 11. 阶段 7：全文连续性仪表盘

### 11.1 要解决的问题

用户需要知道全文是否偏离主题、人物是否 OOC、伏笔是否遗忘、前后文是否断裂。

### 11.2 检查维度

1. 主题一致性。
2. 主线推进度。
3. 人物目标一致性。
4. 人物关系变化合理性。
5. 世界观规则一致性。
6. 时间线连续性。
7. 地点移动合理性。
8. 伏笔生命周期。
9. 爽点和节奏密度。
10. 文风漂移。

### 11.3 数据来源

1. 章节记忆。
2. 章节元素。
3. 已确认事实三元组。
4. 伏笔台账。
5. 场景时间线。
6. 写作人格。
7. 质量报告。
8. 一致性守卫报告。

### 11.4 前端入口

扩展 `ProjectHealthView.vue`：

```text
全文连续性

主题偏离：低风险
人物 OOC：顾临川最近 2 章动机变弱
伏笔风险：3 个伏笔超过预计兑现章节
节奏风险：连续 4 章没有明确反击/奖励
```

### 11.5 验收标准

1. 至少能按卷和全书查看连续性问题。
2. 每个问题必须给出证据章节。
3. 每个问题必须给出建议修复动作。
4. 不能只展示分数，必须展示原因。

---

## 12. 阶段 8：写作人格长期记忆增强

### 12.1 要解决的问题

用户希望上传大量优秀网文，形成“新的写作人格”，并在后续写作中持续发挥作用。  
当前写作人格不能只是一段 prompt，而应成为可检索、可迭代、可审查的长期记忆系统。

### 12.2 人格记忆结构

建议拆成：

1. 叙事节奏画像。
2. 冲突推进画像。
3. 爽点设计画像。
4. 人物塑造画像。
5. 对话风格画像。
6. 场景描写画像。
7. 章节收尾钩子画像。
8. 禁用模仿规则。

### 12.3 新增能力

1. 参考作品分析后生成作品级风格报告。
2. 多部作品合并生成人格。
3. 人格可以版本化。
4. 每个项目可以绑定人格版本。
5. AI 请求按场景召回人格片段。
6. 生成后检查是否过度贴近参考作品。

### 12.4 验收标准

1. 人格不是单个大 prompt，而是结构化规则和可检索片段。
2. 可以查看人格从哪些作品、哪些技巧中形成。
3. 可以禁用某类人格规则。
4. 生成正文不会出现参考作品专名、桥段复述或连续表达。

---

## 13. 阶段 9：本地化与隐私增强

### 13.1 要解决的问题

长篇小说、参考网文、写作人格和项目设定都属于高隐私内容。  
PlotPilot 的本地化方向值得借鉴，但本项目不需要迁移技术栈。

### 13.2 可学习能力

1. 本地优先部署。
2. 本地数据库备份。
3. 项目级导入导出。
4. AI Provider 可切换。
5. 可选择本地模型。
6. 参考作品文件不上传第三方，或明确提示风险。

### 13.3 验收标准

1. 用户可以导出完整项目包。
2. 用户可以恢复项目包。
3. AI 配置页明确展示数据会发送到哪个 Provider。
4. 上传参考作品前有隐私提示。

---

## 14. 不建议学习的部分

以下能力不建议直接采用：

1. 不建议迁移到 PlotPilot 的 Python / FastAPI 技术栈。
2. 不建议直接做无人值守自动生成整本书。
3. 不建议复制 PlotPilot 源码或提示词。
4. 不建议把参考网文原文直接塞进 AI 生成上下文。
5. 不建议为了自动化牺牲作者确认和 AI 信任边界。

---

## 15. 给其他 AI 的执行顺序

### 第一步：先验收已有改造

执行：

```bash
pnpm check
pnpm db:migrate
```

如涉及 schema：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

必须确认：

1. 当前项目可构建。
2. 当前迁移可重复执行。
3. 章节元素保存不会丢旧数据。
4. 新增路由没有跨项目引用。

### 第二步：做阶段 1

实现“章后自动抽取与待确认队列”。  
这是所有后续知识图谱、连续性和写作任务的基础。

### 第三步：做阶段 2

实现“AI 上下文调试器”。  
没有上下文调试器，后续很难判断 RAG、人格、事实图谱是否真正进入生成。

### 第四步：做阶段 3

实现“知识图谱推理层”。  
所有推理结果进入待确认队列，不直接污染正式事实库。

### 第五步：做阶段 4

实现“混合检索 RAG”。  
先关键词增强，再 pgvector，再图谱召回。

### 第六步：做阶段 5

实现“写作任务引擎”。  
把生成一章拆成可视化步骤，并保留人工确认点。

### 第七步：做阶段 6 到阶段 9

依次补：

1. 故事结构模板库。
2. 全文连续性仪表盘。
3. 写作人格长期记忆增强。
4. 本地化与隐私增强。

---

## 16. 最终验收标准

全部阶段完成后，项目应达到以下状态：

1. 用户可以上传参考网文，系统抽取技巧、风格和结构，不复刻原文。
2. 用户可以创建写作人格，并绑定到具体项目。
3. 用户写完章节后，系统自动抽取事实、伏笔、元素和人物变化。
4. 所有结构化变更都必须经用户确认。
5. 下一章 AI 生成会自动读取已确认事实、章节记忆、伏笔、人物关系和结构节拍。
6. AI 生成后必须经过一致性检查。
7. 用户可以查看每次 AI 请求的上下文。
8. 项目健康页能提示主题偏离、人物 OOC、伏笔遗忘、节奏下滑等问题。
9. 所有功能通过 `pnpm check`、数据库迁移和关键 UI 流程验证。

