# PlotPilot P0 闭环后续修复文档

日期：2026-05-04  
状态：待执行  
关联文档：[plotpilot-p0-minimum-loop-fix-plan-2026-05-03.md](./plotpilot-p0-minimum-loop-fix-plan-2026-05-03.md)  
范围：章节元素前端闭环、章节元素嵌套路由归属校验、新增关联 ID 项目归属校验。  
目标：修复当前 PlotPilot P0 实现中的三个 P1 问题，让章节元素真正可配置、可展示、可约束 AI，同时补齐新增 API 的项目数据边界。

---

## 1. 背景

当前已经新增：

1. `chapter_elements` 表。
2. 章节元素 API、store 和前端 API。
3. `foreshadowing_items`、`story_fact_triples`、`acts`、`chapter_scenes`、`writing_jobs` 等表和基础路由。
4. AI 上下文中已查询并渲染章节元素、伏笔、事实图谱。

但代码审查发现三个关键问题：

1. `chapter_elements` 还没有真正接入大纲页和写作页，用户无法配置或查看本章元素。
2. 章节元素的 `PATCH / DELETE` 路由没有校验 URL 中的 `chapterId`。
3. 新增路由写入关联 ID 时只依赖外键，没有校验关联对象属于当前项目。

这些问题会导致“看起来有表和接口，但产品流程不可用”，并且存在跨项目引用风险。

---

## 2. 必修问题 1：接通章节元素前端闭环

### 2.1 问题

文件：

```text
apps/web/src/views/OutlineView.vue
apps/web/src/views/WritingView.vue
apps/web/src/features/writing/components/WritingContextPanel.vue
apps/web/src/stores/chapter-element.store.ts
```

当前状态：

1. `useChapterElementStore` 已存在。
2. `apps/web/src/api/chapter-elements.ts` 已存在。
3. 但 `OutlineView.vue` 没有加载、编辑、保存章节元素。
4. `WritingView.vue / WritingContextPanel.vue` 没有展示本章元素。

结果：

1. 用户无法在大纲页配置“必须出场人物 / 关键事件”。
2. 写作页看不到这些硬约束。
3. AI 上下文虽然支持章节元素，但没有用户入口产生数据。

### 2.2 大纲页接入要求

文件：

```text
apps/web/src/views/OutlineView.vue
```

新增 import：

```ts
import type { ChapterElement, CreateChapterElementInput } from '@ai-novel/shared'
import { useChapterElementStore } from '../stores/projects'
```

新增 store：

```ts
const chapterElementStore = useChapterElementStore()
```

新增本地表单状态：

```ts
const chapterElementDrafts = ref<CreateChapterElementInput[]>([])
```

选择章节时加载：

```ts
async function selectChapter(id: string) {
  selectedChapterId.value = id
  ...
  await chapterElementStore.fetchElements(projectId, id)
  chapterElementDrafts.value = chapterElementStore.elements.map(e => ({
    elementType: e.elementType,
    elementId: e.elementId || undefined,
    elementName: e.elementName,
    relationType: e.relationType,
    importance: e.importance,
    appearanceOrder: e.appearanceOrder || undefined,
    notes: e.notes || undefined,
  }))
}
```

保存大纲时同步保存：

```ts
await chapterStore.updateChapter(projectId, selectedChapterId.value, data)
await chapterElementStore.replaceElements(projectId, selectedChapterId.value, {
  elements: chapterElementDrafts.value,
})
```

如果当前 store 只有单条 create/update/delete，没有 `replaceElements`，需要新增：

```ts
async function replaceElements(projectId: string, chapterId: string, data: UpdateChapterElementsInput) {
  elements.value = await elementsApi.replaceChapterElements(projectId, chapterId, data)
}
```

对应 API 若不存在，也需要新增 `PUT /elements`。

### 2.3 大纲页 UI 要求

在“登场角色”和“关键事件”附近增加“本章结构化元素”区域。

最小可用 UI：

```text
本章结构化元素

必须出场人物
[林岚] [顾临川] [+ 添加人物]

关键事件
[空白信出现] [+ 添加事件]
```

实现要求：

1. 使用设计系统组件：`NButton / NInput / NSelect / NTag`。
2. 不使用原生 `confirm`。
3. 文案全部中文。
4. 删除本地元素可以直接从 draft 中移除，保存时统一提交。
5. 每个元素至少包含：
   - `elementType`
   - `elementName`
   - `relationType`
   - `importance`

默认规则：

```ts
// 添加必须出场人物
{
  elementType: 'character',
  elementName: character.name,
  elementId: character.id,
  relationType: 'appears',
  importance: 'major',
}

// 添加关键事件
{
  elementType: 'event',
  elementName: inputValue,
  relationType: 'occurs',
  importance: 'major',
}
```

验收标准：

1. 切换章节时加载对应章节元素。
2. 保存大纲后刷新页面，章节元素仍存在。
3. 大纲页能添加、删除“必须出场人物”和“关键事件”。
4. 没有原生弹窗。

---

## 3. 必修问题 2：写作页展示本章元素

### 3.1 问题

文件：

```text
apps/web/src/views/WritingView.vue
apps/web/src/features/writing/components/WritingContextPanel.vue
```

当前 `WritingContextPanel` 只展示：

1. 大纲字段。
2. 人物。
3. 世界观。
4. AI 面板。

没有展示 `chapter_elements`。

### 3.2 修改要求

`WritingView.vue`：

1. 引入 `useChapterElementStore`。
2. 当前章节变化时调用 `fetchElements(projectId, currentChapterId)`。
3. 把 `chapterElementStore.elements` 传给 `WritingContextPanel`。

示例：

```ts
const chapterElementStore = useChapterElementStore()

watch(currentChapterId, async (id) => {
  if (id)
    await chapterElementStore.fetchElements(projectId, id)
  else
    chapterElementStore.clear()
}, { immediate: true })
```

模板：

```vue
<WritingContextPanel
  ...
  :chapter-elements="chapterElementStore.elements"
/>
```

`WritingContextPanel.vue`：

新增 props：

```ts
import type { ChapterElement } from '@ai-novel/shared'

const props = defineProps<{
  ...
  chapterElements: ChapterElement[]
}>()
```

在“大纲” Tab 中增加：

```text
本章硬约束
- 必须出场人物
- 关键事件
- 其他元素
```

建议按类型分组：

1. `character + appears`：必须出场人物。
2. `event + occurs`：关键事件。
3. 其他：其他元素。

空状态：

```text
本章尚未配置结构化元素
```

验收标准：

1. 写作页切换章节时，本章元素同步刷新。
2. 写作页右侧能看到大纲页配置的元素。
3. 没有元素时显示中文空状态。

---

## 4. 必修问题 3：章节元素嵌套路由必须校验 `chapterId`

### 4.1 问题

文件：

```text
apps/api/src/routes/chapter-elements.ts
```

当前 `PATCH / DELETE` 只匹配：

```ts
and(eq(chapterElements.id, id), eq(chapterElements.projectId, projectId))
```

但路由路径是：

```http
PATCH  /api/projects/:projectId/chapters/:chapterId/elements/:id
DELETE /api/projects/:projectId/chapters/:chapterId/elements/:id
```

风险：

只要拿到同项目其他章节的 element id，就能通过当前章节路径修改或删除它。

### 4.2 修改要求

在 `PATCH / DELETE` 中：

1. 读取 `chapterId`。
2. 调用 `assertChapterBelongsToProject(projectId, chapterId)`。
3. where 条件同时匹配 `chapterElements.chapterId`。

示例：

```ts
const projectId = c.req.param('projectId')
const chapterId = c.req.param('chapterId')
const id = c.req.param('id')

await assertChapterBelongsToProject(projectId, chapterId)

const [row] = await db.update(chapterElements).set({
  ...body,
  updatedAt: new Date().toISOString(),
}).where(and(
  eq(chapterElements.id, id),
  eq(chapterElements.projectId, projectId),
  eq(chapterElements.chapterId, chapterId),
)).returning()
```

DELETE 同理。

验收标准：

1. 不能通过章节 A 的路径修改章节 B 的元素。
2. 不能通过项目 A 的路径修改项目 B 的元素。
3. 路由错误返回 404 或明确错误。

---

## 5. 必修问题 4：新增关联 ID 必须校验项目归属

### 5.1 问题

当前新增路由中，部分字段只靠数据库外键：

1. `foreshadowing.setupChapterId`
2. `foreshadowing.expectedPayoffChapterId`
3. `foreshadowing.payoffChapterId`
4. `storyFactTriples.sourceChapterId`
5. `acts.volumeId`
6. `writingJobs.currentChapterId`
7. `chapterScenes.chapterId` 的 PATCH/DELETE 路由也需要匹配 URL `chapterId`

外键只能保证记录存在，不能保证属于当前 `projectId`。

### 5.2 修改文件

```text
apps/api/src/routes/foreshadowing.ts
apps/api/src/routes/triples.ts
apps/api/src/routes/acts.ts
apps/api/src/routes/writing-jobs.ts
apps/api/src/routes/scenes.ts
apps/api/src/services/ownership.service.ts
```

### 5.3 复用归属校验

已有：

```ts
assertChapterBelongsToProject(projectId, chapterId)
assertVolumeBelongsToProject(projectId, volumeId)
```

新增辅助函数：

```ts
export async function assertOptionalChapterBelongsToProject(projectId: string, chapterId?: string | null) {
  if (!chapterId)
    return
  await assertChapterBelongsToProject(projectId, chapterId)
}

export async function assertOptionalVolumeBelongsToProject(projectId: string, volumeId?: string | null) {
  if (!volumeId)
    return
  await assertVolumeBelongsToProject(projectId, volumeId)
}
```

### 5.4 各路由修复要求

#### foreshadowing.ts

POST / PATCH 写入前校验：

```ts
await assertOptionalChapterBelongsToProject(projectId, body.setupChapterId)
await assertOptionalChapterBelongsToProject(projectId, body.expectedPayoffChapterId)
await assertOptionalChapterBelongsToProject(projectId, body.payoffChapterId)
```

#### triples.ts

POST / PATCH 写入前校验：

```ts
await assertOptionalChapterBelongsToProject(projectId, body.sourceChapterId)
```

#### acts.ts

POST / PATCH 写入前校验：

```ts
await assertOptionalVolumeBelongsToProject(projectId, body.volumeId)
```

#### writing-jobs.ts

POST 写入前校验：

```ts
await assertOptionalChapterBelongsToProject(projectId, body.currentChapterId)
```

如果后续支持修改 `currentChapterId`，PATCH 也必须校验。

#### scenes.ts

PATCH / DELETE 当前只按 `scene id + projectId`，需要同时匹配 URL `chapterId`：

```ts
await assertChapterBelongsToProject(projectId, chapterId)

where(and(
  eq(chapterScenes.id, id),
  eq(chapterScenes.projectId, projectId),
  eq(chapterScenes.chapterId, chapterId),
))
```

验收标准：

1. 不能在项目 A 的伏笔中引用项目 B 的章节。
2. 不能在项目 A 的事实三元组中引用项目 B 的章节。
3. 不能在项目 A 的幕结构中引用项目 B 的分卷。
4. 不能在项目 A 的写作任务中引用项目 B 的章节。
5. 不能通过章节 A 的路径修改或删除章节 B 的场景。

---

## 6. 建议补充 API 测试

至少覆盖以下用例：

1. 项目 A 路径 + 项目 B 章节 ID 创建伏笔，应失败。
2. 项目 A 路径 + 项目 B 分卷 ID 创建幕，应失败。
3. 章节 A 路径 + 章节 B 元素 ID 删除，应失败。
4. 章节 A 路径 + 章节 B 场景 ID 更新，应失败。
5. 正常项目内创建章节元素、刷新写作页能展示。

如果当前 API 测试基础薄弱，可以先加 service/route 级最小测试，或者增加手动验收脚本。

---

## 7. 验证命令

完成修复后运行：

```bash
pnpm check
pnpm db:migrate
```

如果修改了 schema 或迁移：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

前端手动验收：

1. 打开大纲页。
2. 给章节添加必须出场人物和关键事件。
3. 保存大纲。
4. 刷新页面，确认元素仍存在。
5. 打开写作页，确认右侧展示本章元素。
6. 切换章节，确认元素随章节变化。
7. 触发 AI 续写，确认生成内容遵守本章元素。

---

## 8. 完成标准

本轮修复完成后必须满足：

1. `OutlineView` 能配置章节元素。
2. `WritingView / WritingContextPanel` 能展示章节元素。
3. `chapter-elements` PATCH/DELETE 同时校验 `projectId + chapterId + elementId`。
4. `scenes` PATCH/DELETE 同时校验 `projectId + chapterId + sceneId`。
5. 伏笔、三元组、幕、写作任务写入关联 ID 时校验项目归属。
6. `pnpm check` 通过。
7. `pnpm db:migrate` 通过。
