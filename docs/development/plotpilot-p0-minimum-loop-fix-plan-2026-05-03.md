# PlotPilot P0 最小闭环补齐修复文档

日期：2026-05-03  
状态：待执行  
关联文档：[plotpilot-gap-analysis-and-adoption-roadmap-2026-05-03.md](./plotpilot-gap-analysis-and-adoption-roadmap-2026-05-03.md)  
范围：章节元素结构化、AI 上下文注入、大纲页配置、写作页展示。  
目标：补齐 PlotPilot 改造路线的 P0 最小闭环，让“本章必须出现什么”从自由文本变成结构化数据，并真正影响 AI 生成。

---

## 1. 背景

当前代码已经完成：

1. `chapter_memories` 表。
2. 章节记忆唯一约束。
3. 数据库级 upsert。
4. 前序章节记忆注入 AI 上下文。

但这只解决了“写完之后如何记住”的问题，还没有解决“写之前如何约束本章必须写什么”的问题。

PlotPilot 对标文档的 P0 要求是：

1. 新增 `chapter_elements`。
2. 新增 `foreshadowing_items`。
3. 新增 `story_fact_triples`。
4. AI 上下文渲染这些新数据。

其中最小下一步明确要求：

1. 新增 `chapter_elements` 表和 shared 类型。
2. 大纲页支持给章节添加“必须出场人物”和“关键事件”。
3. `ai-context.service.ts` 把本章元素渲染进 prompt。
4. 写作页右侧显示本章元素。
5. 生成正文时要求 AI 遵守这些元素。

当前审查结论：

这部分还没有落地。代码只完成了章节记忆唯一约束修复，不能算 PlotPilot P0 第一阶段完成。

---

## 2. 本轮目标

本轮只做一个小闭环：

```text
大纲页配置章节元素
  ↓
后端保存结构化元素
  ↓
写作页展示本章元素
  ↓
AI 生成时读取并注入上下文
  ↓
生成内容受本章元素约束
```

本轮暂不做：

1. 完整伏笔台账。
2. 通用故事事实三元组。
3. 场景级规划。
4. 半自动驾驶。
5. 健康面板。

---

## 3. 新增 Shared 类型

文件：

```text
packages/shared/src/types/chapter-element.ts
packages/shared/src/types/index.ts
```

新增：

```ts
export type ChapterElementType = 'character' | 'location' | 'item' | 'organization' | 'event'

export type ChapterElementRelationType =
  | 'appears'
  | 'mentioned'
  | 'scene'
  | 'uses'
  | 'involved'
  | 'occurs'

export type ChapterElementImportance = 'major' | 'normal' | 'minor'

export interface ChapterElement {
  id: string
  projectId: string
  chapterId: string
  elementType: ChapterElementType
  elementId?: string | null
  elementName: string
  relationType: ChapterElementRelationType
  importance: ChapterElementImportance
  appearanceOrder?: number | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateChapterElementInput {
  elementType: ChapterElementType
  elementId?: string | null
  elementName: string
  relationType: ChapterElementRelationType
  importance?: ChapterElementImportance
  appearanceOrder?: number | null
  notes?: string | null
}

export interface UpdateChapterElementsInput {
  elements: CreateChapterElementInput[]
}
```

并在 `packages/shared/src/types/index.ts` 导出：

```ts
export * from './chapter-element'
```

验收标准：

1. 前后端复用同一套类型。
2. 不使用 `any` 表示章节元素。

---

## 4. 新增数据库表

文件：

```text
apps/api/src/db/schema.ts
```

修改 import：

```ts
import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
```

新增表：

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

执行：

```bash
pnpm db:generate
pnpm db:migrate
```

验收标准：

1. 迁移文件创建 `chapter_elements`。
2. 唯一索引存在。
3. 删除章节后元素级联删除。
4. 同一章节不能重复添加相同元素关系。

---

## 5. 新增后端 Service

文件：

```text
apps/api/src/services/chapter-element.service.ts
```

职责：

1. 校验章节属于项目。
2. 查询章节元素。
3. 批量替换章节元素。
4. 删除单个元素。

建议 API：

```ts
export async function listChapterElements(projectId: string, chapterId: string)

export async function replaceChapterElements(
  projectId: string,
  chapterId: string,
  input: UpdateChapterElementsInput,
)

export async function deleteChapterElement(
  projectId: string,
  chapterId: string,
  elementId: string,
)
```

必须实现的归属校验：

```ts
const [chapter] = await db
  .select({ id: chapters.id })
  .from(chapters)
  .where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))

if (!chapter)
  throw new Error('章节不存在或不属于当前项目')
```

批量替换建议：

1. 开启事务。
2. 删除当前章节旧元素。
3. 插入新元素。
4. 返回插入后的完整列表。

注意：

1. 插入时生成 `id`。
2. `importance` 默认 `normal`。
3. `appearanceOrder` 可为空。
4. 不允许空 `elementName`。

---

## 6. 新增后端 Routes

文件：

```text
apps/api/src/routes/chapters.ts
```

新增：

```http
GET /api/projects/:projectId/chapters/:id/elements
PUT /api/projects/:projectId/chapters/:id/elements
DELETE /api/projects/:projectId/chapters/:id/elements/:elementId
```

行为：

### 6.1 GET

返回当前章节元素：

```ts
ApiResponse<ChapterElement[]>
```

### 6.2 PUT

请求：

```ts
{
  elements: CreateChapterElementInput[]
}
```

响应：

```ts
ApiResponse<ChapterElement[]>
```

### 6.3 DELETE

删除指定元素，必须同时匹配：

1. `projectId`
2. `chapterId`
3. `elementId`

验收标准：

1. 不允许通过项目 A 路径操作项目 B 的章节元素。
2. 错误响应使用现有 `fail()`。
3. 成功响应使用现有 `success()`。

---

## 7. 新增前端 API 层

文件：

```text
apps/web/src/api/chapter-elements.ts
```

新增：

```ts
import type { ChapterElement, UpdateChapterElementsInput } from '@ai-novel/shared'
import { apiDel, apiGet, apiPut } from './client'

export function listChapterElements(projectId: string, chapterId: string) {
  return apiGet<ChapterElement[]>(`/api/projects/${projectId}/chapters/${chapterId}/elements`)
}

export function replaceChapterElements(
  projectId: string,
  chapterId: string,
  data: UpdateChapterElementsInput,
) {
  return apiPut<ChapterElement[]>(`/api/projects/${projectId}/chapters/${chapterId}/elements`, data)
}

export function deleteChapterElement(projectId: string, chapterId: string, elementId: string) {
  return apiDel(`/api/projects/${projectId}/chapters/${chapterId}/elements/${elementId}`)
}
```

验收标准：

1. 不直接 `fetch`。
2. 不硬编码 `localhost`。
3. 业务页面通过 API 层调用。

---

## 8. 大纲页支持编辑章节元素

文件：

```text
apps/web/src/views/OutlineView.vue
```

最小实现：

1. 选择章节时加载 `listChapterElements()`。
2. 在章节编辑区域增加“本章元素”小节。
3. 支持添加两类元素：
   - 必须出场人物：`elementType='character'`，`relationType='appears'`
   - 关键事件：`elementType='event'`，`relationType='occurs'`
4. 支持删除元素。
5. 保存大纲时同步调用 `replaceChapterElements()`。

UI 要求：

1. 使用现有 `NButton / NInput / NSelect / NTag`。
2. 不使用原生 `confirm`。
3. 删除元素可以直接移出本地列表，保存时统一提交；如果要即时删除，使用设计系统确认组件。
4. 文案全部中文。
5. 输入框必须有可见 focus 状态。

建议交互：

```text
本章元素
  必须出场人物
    [林岚] [顾临川] [+ 添加人物]
  关键事件
    [空白信出现] [+ 添加事件]
```

验收标准：

1. 大纲页能新增、删除、保存章节元素。
2. 切换章节时显示对应章节元素。
3. 刷新页面后元素仍存在。

---

## 9. 写作页展示本章元素

文件：

```text
apps/web/src/views/WritingView.vue
```

最小实现：

1. 当前章节变化时加载 `listChapterElements()`。
2. 在右侧上下文面板或章节信息区展示：
   - 必须出场人物
   - 关键事件
   - 其他元素
3. 若没有元素，显示中文空状态：“本章尚未配置结构化元素”。

验收标准：

1. 写作页能看到大纲页配置的元素。
2. 切换章节时元素同步更新。
3. 不影响现有 AI 确认区和一致性检查。

---

## 10. AI 上下文注入章节元素

文件：

```text
packages/shared/src/types/ai-context.ts
apps/api/src/services/ai-context.service.ts
```

### 10.1 Shared 类型

在 `BuiltAIContext` 中增加：

```ts
chapterElements: {
  elementType: ChapterElementType
  elementName: string
  relationType: ChapterElementRelationType
  importance: ChapterElementImportance
  notes?: string
}[]
```

### 10.2 查询

在 `buildProjectAIContext` 中，如果存在 `currentChapterData`：

```ts
const currentChapterElements = await db
  .select()
  .from(chapterElements)
  .where(and(
    eq(chapterElements.projectId, projectId),
    eq(chapterElements.chapterId, currentChapterData.id),
  ))
```

### 10.3 渲染 Prompt

在 `renderAIContext()` 中增加：

```ts
if (context.chapterElements.length > 0) {
  const elementList = context.chapterElements
    .map(e => `- ${e.elementName}：${e.elementType}/${e.relationType}/${e.importance}${e.notes ? `。备注：${e.notes}` : ''}`)
    .join('\n')
  sections.push(`【本章结构化元素】\n以下元素是本章写作硬约束：\n${elementList}`)
}
```

并在输出约束中补充：

```text
必须遵守本章结构化元素；major 元素必须实际出现，不能只轻描淡写提及。
如果无法合理安排某个元素，必须在生成结果中说明风险，不得擅自忽略。
```

验收标准：

1. `/api/projects/:projectId/ai/generate` 生成 prompt 时包含本章元素。
2. `draft / outline / polish / quality` 场景都能读取当前章节元素。
3. 不会读取其他项目的章节元素。

---

## 11. 验证命令

完成后运行：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

建议补充手动验证：

1. 创建/打开测试项目。
2. 进入大纲页。
3. 给某章添加：
   - 必须出场人物：林岚
   - 关键事件：空白信出现
4. 保存大纲。
5. 刷新页面，确认元素仍存在。
6. 进入写作页，确认右侧显示这些元素。
7. 触发 AI 续写，检查后端 prompt 或生成内容是否遵守元素约束。

---

## 12. 验收标准总表

本轮完成后必须满足：

1. 新增 `chapter_elements` 表和迁移。
2. 新增 shared 类型并导出。
3. 新增章节元素 API。
4. 所有章节元素 API 校验项目归属。
5. 大纲页能配置本章人物和事件。
6. 写作页能展示本章元素。
7. AI 上下文包含本章元素。
8. `pnpm db:generate` 通过。
9. `pnpm db:migrate` 通过。
10. `pnpm check` 通过。

---

## 13. 后续阶段

完成本轮后，再继续：

1. `foreshadowing_items` 伏笔台账。
2. `story_fact_triples` 故事事实图谱。
3. `chapter_scenes` 场景规划。
4. 章后管线自动抽取三元组和伏笔。
5. 半自动驾驶任务流。
