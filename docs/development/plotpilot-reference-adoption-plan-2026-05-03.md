# PlotPilot 对标分析与可借鉴能力落地文档

日期：2026-05-03  
状态：待执行  
参考项目：[shenminglinyi/PlotPilot](https://github.com/shenminglinyi/PlotPilot)  
范围：长篇小说自动驾驶、章后记忆管线、知识图谱、伏笔台账、风格漂移监控、实时任务状态。  
目标：对比 PlotPilot 与当前 AI 小说创作工作台的差异，将值得借鉴的能力转化为本项目后续可开发的阶段计划。

---

## 1. 背景

PlotPilot（墨枢）是一个 AI 驱动的长篇创作平台，README 中明确包含：

1. 自动驾驶模式：后台守护进程持续生成章节，SSE 实时推送。
2. Story Bible：人物、地点、世界设定结构化管理。
3. 知识图谱：自动提取故事三元组，语义检索历史内容。
4. 伏笔台账：追踪并自动闭合叙事钩子。
5. 风格分析：作者声音漂移检测与文体指纹。
6. 节拍表与故事结构：三幕式、章节节拍规划。
7. 统一章后管线：章末提取摘要、关键事件、人物三元组、伏笔、故事线进展，并建立本地向量索引。

当前项目已经具备：

1. 项目管理。
2. 故事设定集。
3. 角色管理。
4. 人物关系。
5. 矛盾矩阵。
6. 大纲规划。
7. 正文写作。
8. 知识库拆书。
9. 写作人格。
10. AI 上下文工程。
11. 一致性守卫阶段 1。
12. 多 AI 配置源。

但当前项目仍偏“作者手动触发的 AI 工作台”，还没有形成完整的“写完一章 -> 自动沉淀记忆 -> 进入下一章”的长篇闭环。

---

## 2. 产品定位差异

| 维度 | PlotPilot | 当前项目 |
| --- | --- | --- |
| 产品定位 | 长篇自动驾驶创作系统 | 作者主控的 AI 小说创作工作台 |
| 生成模式 | 后台持续生成，自动推进章节 | 用户手动触发 AI 生成 |
| 记忆系统 | Story Bible、分章摘要、向量检索、伏笔台账、时间轴 | Story Bible、角色、关系、冲突、知识库、上下文工程 |
| 章后处理 | 章末统一管线，自动提取摘要、事件、三元组、伏笔 | 暂无完整章后自动记忆更新 |
| 伏笔管理 | 独立伏笔台账，追踪和闭合钩子 | 章节字段中有伏笔，但没有独立台账 |
| 风格监控 | 文风相似度、漂移告警、文体指纹 | 写作人格 + 一致性守卫，尚未量化风格漂移 |
| 实时状态 | SSE 推送自动驾驶进度 | 普通请求和局部流式输出 |
| 架构 | Python / FastAPI / SQLite / FAISS / Vue / Tauri | TypeScript / Hono / PostgreSQL / Drizzle / Vue / Pinia |

---

## 3. 借鉴原则

### 3.1 借鉴产品机制，不复制代码

PlotPilot 许可证包含 Commons Clause 限制，不应复制其实现代码用于商业产品。  
本项目只借鉴公开 README 中描述的产品机制和架构思路，并使用当前技术栈独立实现。

### 3.2 保持作者主控，不直接全自动

PlotPilot 强调自动驾驶。  
当前项目更适合先做“半自动驾驶”：

```text
AI 准备下一步
  ↓
用户审阅
  ↓
用户确认
  ↓
系统沉淀记忆
  ↓
进入下一步
```

不建议一开始让系统无人值守写完整本书。

### 3.3 优先补长篇闭环

最应该优先借鉴的是：

1. 统一章后管线。
2. 伏笔台账。
3. 故事事实三元组。
4. 人物运行状态。
5. 连续写作任务状态。

---

## 4. 优先级最高：统一章后管线

### 4.1 目标

每次章节正文保存或标记完成后，自动沉淀结构化记忆：

1. 章节摘要。
2. 关键事件。
3. 新增事实。
4. 人物状态变化。
5. 人物关系变化。
6. 冲突推进。
7. 伏笔新增。
8. 伏笔回收。
9. 主题推进。
10. 风格摘要。

这些记忆会参与后续章节 AI 上下文，避免越写越跑偏。

### 4.2 后端服务

新增：

```text
apps/api/src/services/chapter-postprocess.service.ts
```

核心函数：

```ts
export async function runChapterPostprocess(input: {
  projectId: string
  chapterId: string
  content: string
  trigger: 'manual_save' | 'mark_completed' | 'auto_drive'
}): Promise<ChapterPostprocessResult>
```

### 4.3 Shared 类型

新增：

```text
packages/shared/src/types/chapter-memory.ts
```

建议类型：

```ts
export interface ChapterMemory {
  id: string
  projectId: string
  chapterId: string
  summary?: string
  keyEvents?: string
  newFacts?: string
  characterStateChanges?: string
  relationshipChanges?: string
  conflictProgress?: string
  foreshadowingAdded?: string
  foreshadowingResolved?: string
  themeProgress?: string
  styleNotes?: string
  createdAt: string
  updatedAt: string
}

export interface ChapterPostprocessResult {
  memory: ChapterMemory
  extractedTriples: StoryFactTriple[]
  foreshadowingUpdates: ForeshadowingLedgerEntry[]
  warnings: string[]
}
```

### 4.4 数据表

新增：

```ts
chapter_memories {
  id: text primary key
  project_id: text not null
  chapter_id: text not null
  summary: text
  key_events: text
  new_facts: text
  character_state_changes: text
  relationship_changes: text
  conflict_progress: text
  foreshadowing_added: text
  foreshadowing_resolved: text
  theme_progress: text
  style_notes: text
  created_at: timestamp
  updated_at: timestamp
}
```

### 4.5 API

```http
POST /api/projects/:projectId/chapters/:chapterId/postprocess
```

请求：

```ts
{
  content: string
  trigger: 'manual_save' | 'mark_completed' | 'auto_drive'
}
```

响应：

```ts
ApiResponse<ChapterPostprocessResult>
```

---

## 5. 伏笔台账

### 5.1 目标

把章节里的 `foreshadowing` 字段升级为独立管理模块。

### 5.2 数据模型

```ts
foreshadowing_ledger {
  id: text primary key
  project_id: text not null
  title: text not null
  description: text
  introduced_chapter_id: text
  expected_resolution_chapter_id: text
  resolved_chapter_id: text
  related_character_ids: text
  related_conflict_ids: text
  status: text not null
  payoff_plan: text
  risk_note: text
  created_at: timestamp
  updated_at: timestamp
}
```

状态：

```ts
type ForeshadowingStatus =
  | 'introduced'
  | 'reinforced'
  | 'ready_to_resolve'
  | 'resolved'
  | 'forgotten_risk'
  | 'abandoned'
```

### 5.3 功能

1. 章后管线自动识别新增伏笔。
2. 章后管线自动识别伏笔回收。
3. 一致性守卫检查是否提前回收、忘记回收、制造无来源伏笔。
4. 大纲页显示当前章节相关伏笔。
5. 项目首页显示“遗漏风险伏笔”。

---

## 6. 故事事实三元组与知识图谱

### 6.1 目标

从每章正文中提取事实关系，形成可检索的故事知识图谱。

示例：

```text
林岚 -> 知道 -> 顾临川隐瞒档案
顾临川 -> 背叛 -> 旧组织
镜中城 -> 禁止 -> 复制记忆
```

### 6.2 数据模型

```ts
story_fact_triples {
  id: text primary key
  project_id: text not null
  chapter_id: text
  subject: text not null
  predicate: text not null
  object: text not null
  confidence: integer
  source_excerpt: text
  status: text not null
  created_at: timestamp
}
```

状态：

```ts
type StoryFactStatus =
  | 'active'
  | 'contradicted'
  | 'superseded'
  | 'uncertain'
```

### 6.3 用途

1. 防止角色知道不该知道的信息。
2. 防止地点、规则、组织关系前后矛盾。
3. 一致性守卫可检查新增事实是否与旧事实冲突。
4. AI 上下文可按角色名、地点名、冲突名检索相关事实。

---

## 7. 人物运行状态

### 7.1 目标

除了角色静态档案，还要记录角色在当前剧情进度中的状态。

### 7.2 数据模型

```ts
character_runtime_states {
  id: text primary key
  project_id: text not null
  character_id: text not null
  current_location: text
  current_emotion: text
  current_goal: text
  current_knowledge: text
  relationship_changes: text
  unresolved_internal_conflict: text
  last_appearance_chapter_id: text
  updated_at: timestamp
}
```

### 7.3 用途

1. 防止角色情绪跳变。
2. 防止角色目标突然变化。
3. 防止角色知道未发生的信息。
4. 让 AI 续写时知道每个人“此刻处在什么状态”。

---

## 8. 风格漂移与张力曲线

### 8.1 风格漂移

每章完成后生成：

1. 叙事视角。
2. 句长节奏。
3. 对话比例。
4. 描写密度。
5. 爽点/压迫/悬念强度。
6. 与写作人格的相似度。

建议字段：

```ts
chapter_style_reports {
  id: text primary key
  project_id: text not null
  chapter_id: text not null
  style_score: integer
  persona_similarity: integer
  drift_risks: text
  style_fingerprint: text
  created_at: timestamp
}
```

### 8.2 张力曲线

每章记录：

```ts
chapter_tension_reports {
  id: text primary key
  project_id: text not null
  chapter_id: text not null
  tension_score: integer
  conflict_density: integer
  reveal_intensity: integer
  emotional_pressure: integer
  hook_strength: integer
  created_at: timestamp
}
```

用途：

1. 项目首页展示章节张力曲线。
2. 大纲页识别连续低张力章节。
3. AI 可建议在哪些章节增加冲突或信息揭露。

---

## 9. 半自动驾驶写作模式

### 9.1 不直接做全自动

不建议一开始无人值守写完整本书。  
应先做半自动驾驶：

```text
选择章节范围
  ↓
系统生成下一章大纲
  ↓
用户确认
  ↓
系统生成正文草稿
  ↓
一致性守卫
  ↓
用户审阅
  ↓
章后管线更新记忆
  ↓
进入下一章
```

### 9.2 数据模型

```ts
writing_jobs {
  id: text primary key
  project_id: text not null
  status: text not null
  mode: text not null
  current_stage: text
  chapter_id: text
  requested_chapters: integer
  completed_chapters: integer
  last_error: text
  created_at: timestamp
  updated_at: timestamp
}
```

状态：

```ts
type WritingJobStatus =
  | 'queued'
  | 'running'
  | 'waiting_review'
  | 'paused'
  | 'completed'
  | 'failed'
```

阶段：

```ts
type WritingJobStage =
  | 'planning'
  | 'outline_generation'
  | 'draft_generation'
  | 'consistency_check'
  | 'review'
  | 'postprocess'
  | 'memory_update'
```

---

## 10. SSE 实时任务状态

### 10.1 目标

长任务必须让用户知道系统正在做什么。

### 10.2 API

```http
GET /api/projects/:projectId/writing-jobs/:jobId/events
```

事件示例：

```json
{
  "stage": "draft_generation",
  "message": "正在生成第 12 章正文草稿",
  "progress": 45
}
```

前端显示：

1. 当前阶段。
2. 当前章节。
3. 进度。
4. 最近日志。
5. 暂停 / 继续 / 终止按钮。

---

## 11. 推荐开发顺序

### 阶段 1：章后记忆管线

目标：先让每章写完后能沉淀结构化记忆。

任务：

1. 新增 `chapter_memories` 表和迁移。
2. 新增 `chapter-postprocess.service.ts`。
3. 新增 postprocess API。
4. 写作页保存章节后可手动触发“更新章节记忆”。
5. `ai-context.service.ts` 读取章节记忆参与上下文。

验收：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

### 阶段 2：伏笔台账

任务：

1. 新增 `foreshadowing_ledger` 表。
2. 新增伏笔管理页。
3. 章后管线自动注册和回收伏笔。
4. 一致性守卫接入伏笔台账。

### 阶段 3：故事事实三元组

任务：

1. 新增 `story_fact_triples` 表。
2. 章后管线自动提取事实。
3. AI 上下文按当前章节/人物/冲突召回相关事实。
4. 一致性守卫检查事实冲突。

### 阶段 4：人物运行状态

任务：

1. 新增 `character_runtime_states` 表。
2. 章后管线更新人物当前状态。
3. 角色页展示“当前剧情状态”。
4. AI 上下文读取人物运行状态。

### 阶段 5：张力与风格监控

任务：

1. 新增章节张力报告。
2. 新增风格漂移报告。
3. 项目首页展示曲线。
4. 质量评估页接入趋势分析。

### 阶段 6：半自动驾驶写作

任务：

1. 新增 `writing_jobs` 表。
2. 新增写作任务服务。
3. 新增 SSE 事件接口。
4. 前端新增“连续写作任务”面板。
5. 每章都经过一致性守卫和用户审阅。

---

## 12. 验证标准

每个阶段必须满足：

1. `pnpm check` 通过。
2. 如果改 schema，必须运行：

```bash
pnpm db:generate
pnpm db:migrate
```

3. AI 生成内容仍必须进入确认区。
4. 不能绕过一致性守卫。
5. 不能把参考小说原文塞入生成 prompt。

---

## 13. 非目标

本计划不做：

1. 直接迁移到 PlotPilot 技术栈。
2. 复制 PlotPilot 代码。
3. 一步到位无人值守全自动写完整本书。
4. 放弃作者确认权。
5. 引入 SQLite/FAISS 替代 PostgreSQL。

---

## 14. 完成后的目标状态

最终本项目应形成以下闭环：

```text
项目设定 / 人物 / 冲突 / 知识库 / 写作人格
  ↓
章节大纲
  ↓
AI 生成正文
  ↓
一致性守卫
  ↓
用户确认
  ↓
章后管线
  ↓
章节记忆 / 伏笔台账 / 事实三元组 / 人物状态 / 风格张力报告
  ↓
下一章 AI 上下文
```

这个闭环才是长篇小说不跑偏、人物不崩、前后文连贯的核心。
