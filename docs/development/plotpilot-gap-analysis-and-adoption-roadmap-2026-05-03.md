# PlotPilot 对比分析与能力借鉴改造文档

日期：2026-05-03  
状态：待执行  
参考项目：[shenminglinyi/PlotPilot](https://github.com/shenminglinyi/PlotPilot)  
参考资料：

1. [PlotPilot README](https://github.com/shenminglinyi/PlotPilot)
2. [PlotPilot 架构文档](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/refs/heads/master/docs/ARCHITECTURE.md)
3. [知识检索设计](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/knowledge_search_design.md)
4. [故事结构完整设计](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/story_structure_complete_design.md)
5. [知识图谱自动感知设计](https://raw.githubusercontent.com/shenminglinyi/PlotPilot/master/docs/knowledge_graph_auto_inference.md)

范围：产品流程、长篇写作上下文、章后记忆、知识图谱、故事结构、伏笔台账、半自动驾驶写作。  
目标：对比 PlotPilot 与当前 AI 小说创作工作台的差异，将可借鉴能力转化为本项目的独立实现路线。

---

## 1. 总结结论

PlotPilot 更像“自动驾驶型长篇生成引擎”，当前项目更像“作者可控的结构化创作工作台”。

两者方向接近，但产品重心不同：

1. PlotPilot 强调后台守护进程持续生成、章后自动沉淀、知识图谱和风格监控。
2. 当前项目强调作者确认、AI 结果审查、写作人格、项目级设定和多 AI Provider 配置。
3. 当前项目不应直接照搬全自动生成，而应吸收 PlotPilot 的长篇闭环能力，形成“半自动驾驶 + 作者确认”的可控流程。

本项目应优先补齐：

1. 章节元素结构化。
2. 章后管线扩展。
3. 伏笔台账。
4. 故事事实三元组。
5. 场景级规划。
6. 作品健康监控。
7. 半自动驾驶流程。

---

## 2. 关键差异

| 维度 | PlotPilot | 当前项目 | 改造方向 |
| --- | --- | --- | --- |
| 产品定位 | 自动驾驶长篇生成系统 | 作者主控的 AI 小说工作台 | 保持作者主控，增加半自动驾驶 |
| 技术架构 | Python + FastAPI + DDD 四层 | TypeScript monorepo + Hono + Vue + Drizzle | 不迁移技术栈，借鉴边界划分 |
| 数据库 | SQLite + 本地向量能力 | PostgreSQL | 后续用 PostgreSQL + pgvector |
| 章节结构 | 部 / 卷 / 幕 / 章 / 场景 | 卷 / 章为主 | 增加幕和场景层 |
| 章节元素 | 人物、地点、道具、组织、事件关联章节 | 章节字段多为文本 | 新增 `chapter_elements` |
| 章后处理 | 摘要、事件、三元组、伏笔、向量索引统一落库 | 已有 `chapter_memories` 初版 | 扩展为完整章后管线 |
| 知识图谱 | 通用三元组、置信度、来源章节、确认/拒绝 | 人物关系 + 冲突矩阵 | 新增 `story_fact_triples` |
| 伏笔 | 独立台账，追踪闭合 | 章节字段内记录伏笔 | 新增 `foreshadowing_items` |
| 自动推进 | 守护进程自动生成章节 | 用户手动触发 | 新增可暂停的半自动任务 |
| 风格监控 | 文风相似度、漂移告警 | 写作人格 + 一致性守卫 | 增加健康面板和漂移趋势 |

---

## 3. 借鉴原则

### 3.1 只借鉴产品机制，不复制代码

PlotPilot 许可证包含 Commons Clause 限制。当前项目不得复制其源码或商业化复用其实现。

允许借鉴：

1. 公开 README 描述的产品机制。
2. 架构分层思想。
3. 数据模型设计思路。
4. 工作流编排方式。

不允许：

1. 复制具体源码。
2. 复制专有提示词。
3. 复刻带版权风险的实现细节。

### 3.2 保持 AI 信任边界

当前项目已有硬规则：

1. AI 结果不得直接覆盖正文。
2. 生成结果必须进入确认区。
3. 一致性检查失败时不得静默放行。
4. 参考作品只能提炼抽象技巧，不得复刻桥段、专名或连续表达。

后续所有 PlotPilot 借鉴能力都必须遵守这些规则。

### 3.3 先半自动，后自动驾驶

不要一步到位做无人值守写作。

推荐流程：

```text
系统生成下一步建议
  ↓
作者审查和编辑
  ↓
作者确认写入
  ↓
系统执行章后管线
  ↓
系统准备下一章上下文
```

---

## 4. 阶段 1：章节元素结构化

### 4.1 问题

当前 `chapters` 表已有：

1. `characters`
2. `goals`
3. `conflicts`
4. `events`
5. `emotionalArc`
6. `foreshadowing`
7. `endingHook`

但这些字段以文本为主，系统无法稳定回答：

1. 本章谁必须出场？
2. 本章发生在哪些地点？
3. 本章涉及哪个组织？
4. 本章使用了哪个道具？
5. 本章推进了哪个事件？
6. 哪些元素只是提及，哪些必须实际出现？

### 4.2 新增表

文件：

```text
apps/api/src/db/schema.ts
```

新增：

```ts
export const chapterElements = pgTable('chapter_elements', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  elementType: text('element_type').$type<'character' | 'location' | 'item' | 'organization' | 'event'>().notNull(),
  elementId: text('element_id'),
  elementName: text('element_name').notNull(),
  relationType: text('relation_type').$type<'appears' | 'mentioned' | 'scene' | 'uses' | 'involved' | 'occurs'>().notNull(),
  importance: text('importance').$type<'major' | 'normal' | 'minor'>().notNull().default('normal'),
  appearanceOrder: integer('appearance_order'),
  notes: text('notes'),
  ...timestamps,
}, table => ({
  chapterElementUnique: uniqueIndex('chapter_elements_unique')
    .on(table.projectId, table.chapterId, table.elementType, table.elementName, table.relationType),
}))
```

说明：

1. `elementId` 可为空，支持先用名称记录，后续再绑定正式人物/地点/道具。
2. 第一阶段可以先只支持 `character` 和 `event`，UI 稳定后再开放地点、道具、组织。

### 4.3 API

```http
GET    /api/projects/:projectId/chapters/:chapterId/elements
POST   /api/projects/:projectId/chapters/:chapterId/elements
PUT    /api/projects/:projectId/chapters/:chapterId/elements
DELETE /api/projects/:projectId/chapters/:chapterId/elements/:elementId
```

所有接口必须校验：

1. `chapterId` 属于 `projectId`。
2. 不允许跨项目读取或写入元素。

### 4.4 前端入口

修改：

```text
apps/web/src/views/OutlineView.vue
apps/web/src/views/WritingView.vue
```

大纲页：

1. 在章节编辑区增加“章节元素”区域。
2. 支持添加人物、事件、地点。
3. 支持标记重要性。

写作页：

1. 右侧上下文面板展示本章必须出场人物、场景地点、关键事件。
2. 生成正文时这些元素进入 AI 上下文。

### 4.5 验收标准

1. 同一章节不能重复添加相同元素关系。
2. AI 上下文能看到章节元素。
3. 删除章节时元素随章节级联删除。
4. `pnpm db:generate && pnpm db:migrate && pnpm check` 通过。

---

## 5. 阶段 2：章后管线扩展

### 5.1 当前状态

当前项目已有：

1. `chapter_memories` 表。
2. `chapter-postprocess.service.ts`。
3. 写作页“更新记忆”按钮。
4. AI 上下文召回前序章节记忆。

仍需扩展：

1. 自动触发时机。
2. 结构化事实提取。
3. 伏笔新增/回收检测。
4. 冲突推进更新。
5. 失败重试和状态展示。

### 5.2 修改要求

扩展 `ChapterPostprocessResult`：

```ts
export interface ChapterPostprocessResult {
  memory: ChapterMemory
  extractedTriples: StoryFactTriple[]
  foreshadowingUpdates: ForeshadowingItem[]
  conflictUpdates: ConflictProgressUpdate[]
  warnings: string[]
}
```

新增触发点：

1. 手动点击“更新记忆”。
2. 保存快照后可提示更新记忆。
3. 章节状态改为 `completed` 时自动运行。
4. 半自动驾驶完成一章后自动运行。

### 5.3 失败处理

新增字段或表：

```text
chapter_postprocess_runs
```

字段：

1. `id`
2. `projectId`
3. `chapterId`
4. `status`: `pending | running | completed | failed`
5. `trigger`
6. `errorMessage`
7. `startedAt`
8. `finishedAt`

验收标准：

1. 章后处理失败不能显示为成功。
2. 用户可以查看失败原因。
3. 用户可以重试失败的章后处理。

---

## 6. 阶段 3：伏笔台账

### 6.1 目标

把伏笔从章节文本字段升级为可追踪对象。

新增表：

```ts
export const foreshadowingItems = pgTable('foreshadowing_items', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  setupChapterId: text('setup_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  expectedPayoffChapterId: text('expected_payoff_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  payoffChapterId: text('payoff_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  status: text('status').$type<'open' | 'progressing' | 'paid_off' | 'abandoned'>().notNull().default('open'),
  importance: text('importance').$type<'major' | 'normal' | 'minor'>().notNull().default('normal'),
  relatedCharacters: text('related_characters'),
  relatedEvents: text('related_events'),
  notes: text('notes'),
  ...timestamps,
})
```

### 6.2 UI

新增页面：

```text
apps/web/src/views/ForeshadowingLedgerView.vue
```

入口：

1. 项目侧边栏：伏笔台账。
2. 大纲页当前章节右侧：本章伏笔。
3. 写作页一致性面板：待回收伏笔提醒。

### 6.3 AI 上下文

`ai-context.service.ts` 增加：

1. 当前章节应铺设伏笔。
2. 当前章节应回收伏笔。
3. 最近未回收的重要伏笔。

生成约束：

```text
不得无故回收未到时机的伏笔。
不得引入无法追踪的新重大伏笔。
如果新增伏笔，必须在章后管线登记。
```

---

## 7. 阶段 4：故事事实三元组

### 7.1 目标

新增通用事实图谱，补足现有“人物关系”和“冲突矩阵”的局限。

新增表：

```ts
export const storyFactTriples = pgTable('story_fact_triples', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  subjectType: text('subject_type').notNull(),
  subjectName: text('subject_name').notNull(),
  predicate: text('predicate').notNull(),
  objectType: text('object_type').notNull(),
  objectName: text('object_name').notNull(),
  confidence: integer('confidence').notNull().default(70),
  sourceType: text('source_type').$type<'manual' | 'ai_extracted' | 'auto_inferred'>().notNull().default('manual'),
  sourceChapterId: text('source_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  status: text('status').$type<'pending' | 'confirmed' | 'rejected'>().notNull().default('pending'),
  relatedChapters: text('related_chapters'),
  notes: text('notes'),
  ...timestamps,
}, table => ({
  tripleUnique: uniqueIndex('story_fact_triples_unique')
    .on(table.projectId, table.subjectType, table.subjectName, table.predicate, table.objectType, table.objectName),
}))
```

### 7.2 自动推断规则

第一批规则：

1. 多人物同章主要出场：推断“认识/互动”。
2. 人物多次出现在同一地点：推断“常驻/熟悉地点”。
3. 人物与事件同章出现：推断“参与事件”。
4. 事件与地点同章出现：推断“发生于”。
5. 道具与人物同章出现：推断“使用/持有”。

每条自动推断都必须：

1. 有 `confidence`。
2. 有 `sourceChapterId`。
3. 默认 `pending`，需要用户确认。

### 7.3 知识库检索升级

知识库页从“参考作品知识库”扩展为两个 Tab：

1. 参考作品知识。
2. 本书事实图谱。

事实图谱支持：

1. 按人物、地点、事件、组织、道具筛选。
2. 搜索“某人的师父”“某地发生过什么”“某道具由谁持有”。
3. 点击事实跳转来源章节。

---

## 8. 阶段 5：故事结构升级

### 8.1 目标

在现有 `volumes / chapters` 上补充“幕”和“场景”。

推荐最小实现：

1. 不立刻替换现有 `volumes / chapters`。
2. 新增 `acts` 表。
3. 新增 `chapter_scenes` 表。

### 8.2 新增表

```ts
export const acts = pgTable('acts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  volumeId: text('volume_id').references(() => volumes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  theme: text('theme'),
  keyEvents: text('key_events'),
  targetChapterCount: integer('target_chapter_count'),
  orderIndex: integer('order_index').notNull(),
  ...timestamps,
})
```

```ts
export const chapterScenes = pgTable('chapter_scenes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  sceneNumber: integer('scene_number').notNull(),
  title: text('title'),
  location: text('location'),
  timeline: text('timeline'),
  purpose: text('purpose'),
  summary: text('summary'),
  characters: text('characters'),
  targetWords: integer('target_words'),
  content: text('content'),
  orderIndex: integer('order_index').notNull(),
  ...timestamps,
})
```

### 8.3 AI 能力

新增 AI 操作：

1. 生成全书结构：部/卷/幕。
2. 为当前幕生成章节。
3. 为当前章节生成 3-5 个场景。
4. 根据场景逐段生成正文。

所有 AI 输出仍必须进入确认区。

---

## 9. 阶段 6：作品健康面板

### 9.1 目标

把质量评估从单次报告升级成趋势监控。

页面：

```text
apps/web/src/views/ProjectHealthView.vue
```

指标：

1. 每章冲突强度。
2. 每章节奏评分。
3. 每章情绪曲线。
4. 人物出场频率。
5. 未回收伏笔数量。
6. 人格贴合度。
7. 风格漂移趋势。
8. 设定冲突数量。

### 9.2 数据来源

1. `quality_reports`
2. `chapter_memories`
3. `foreshadowing_items`
4. `story_fact_triples`
5. `chapter_elements`
6. `persona-drift-check`

### 9.3 UI 要求

1. 不做营销式大卡片。
2. 使用紧凑工作台布局。
3. 图表优先使用折线、柱状和小型趋势图。
4. 每个告警都必须能跳转到对应章节或设定项。

---

## 10. 阶段 7：半自动驾驶

### 10.1 目标

实现“系统推进、作者确认”的长篇写作流程。

流程：

```text
选择项目与起始章节
  ↓
构建上下文
  ↓
生成下一章大纲或正文
  ↓
一致性检查
  ↓
作者确认
  ↓
保存章节
  ↓
运行章后管线
  ↓
生成下一章任务
```

### 10.2 新增表

```ts
export const writingJobs = pgTable('writing_jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  currentChapterId: text('current_chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  mode: text('mode').$type<'outline_only' | 'draft_only' | 'outline_then_draft'>().notNull(),
  status: text('status').$type<'idle' | 'running' | 'waiting_review' | 'paused' | 'completed' | 'failed'>().notNull().default('idle'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
})
```

### 10.3 接口

```http
POST /api/projects/:projectId/writing-jobs
POST /api/projects/:projectId/writing-jobs/:jobId/start
POST /api/projects/:projectId/writing-jobs/:jobId/pause
POST /api/projects/:projectId/writing-jobs/:jobId/continue
GET  /api/projects/:projectId/writing-jobs/:jobId
```

### 10.4 守则

1. 不允许后台直接覆盖正文。
2. 每一章必须进入确认区。
3. 一致性检查失败时任务进入 `waiting_review` 或 `paused`。
4. 章后管线失败时不得继续生成下一章。

---

## 11. 推荐实施顺序

### P0：先补数据基础

1. `chapter_elements`
2. `foreshadowing_items`
3. `story_fact_triples`
4. AI 上下文渲染这些新数据

### P1：补长篇闭环

1. 章后管线扩展。
2. 章节完成自动触发记忆。
3. 章后失败记录和重试。
4. 写作页展示本章元素、前序记忆、待回收伏笔。

### P2：补规划深度

1. `acts`
2. `chapter_scenes`
3. 幕级规划。
4. 场景级正文生成。

### P3：补监控和自动推进

1. 作品健康面板。
2. 半自动驾驶任务。
3. SSE 或轮询任务状态。
4. 风格漂移趋势。

---

## 12. 验收标准

每个阶段都必须满足：

1. `pnpm check` 通过。
2. 数据库改动必须执行：

```bash
pnpm db:generate
pnpm db:migrate
```

3. 所有新增 API 必须校验 `projectId` 归属。
4. AI 生成结果必须进入确认区。
5. 不允许新增原生 `alert / confirm / prompt`。
6. 不允许前端硬编码 `localhost`。
7. 新增表必须在 `packages/shared` 补类型。
8. 新增页面必须接入导航和路由。

---

## 13. 不建议照搬的内容

1. 不建议迁移到 Python/FastAPI。
2. 不建议回退到 SQLite。
3. 不建议一开始做无人值守自动驾驶。
4. 不建议直接复刻 PlotPilot 的提示词或源码。
5. 不建议让参考网文知识库输出原文片段参与生成。

---

## 14. 最小下一步任务

建议下一轮开发只做一个小闭环：

1. 新增 `chapter_elements` 表和 shared 类型。
2. 大纲页支持给章节添加“必须出场人物”和“关键事件”。
3. `ai-context.service.ts` 把本章元素渲染进 prompt。
4. 写作页右侧显示本章元素。
5. 生成正文时要求 AI 遵守这些元素。

这样可以最快提升“章节不跑偏”的能力，同时为伏笔台账、三元组和半自动驾驶打基础。
