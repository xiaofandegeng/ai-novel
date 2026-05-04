# 章后记忆管线修复文档

日期：2026-05-03  
状态：待执行  
范围：章节记忆归属校验、前序记忆召回顺序、新建记忆返回值。  
目标：修复当前章后记忆管线阶段 1 的三个问题，确保章节记忆不会跨项目泄漏，AI 上下文不会拿到未来章节或随机章节记忆，并且 API 返回值与 shared 类型一致。

---

## 1. 背景

当前已经实现阶段 1 的章后记忆管线：

1. 新增 `chapter_memories` 表和迁移。
2. 新增 `apps/api/src/services/chapter-postprocess.service.ts`。
3. 新增章节记忆读取和 `postprocess` API。
4. 写作页增加“更新记忆”入口。
5. `ai-context.service.ts` 已把前序章节记忆加入 AI 上下文。

但代码审查发现三个问题：

1. 章节记忆接口未校验章节归属，存在跨项目读取/写入风险。
2. 前序章节记忆选择顺序不可靠，可能把未来章节记忆塞进 AI 上下文。
3. 新建记忆时没有使用 `.returning()`，响应对象缺少数据库默认时间字段。

---

## 2. 必修问题

### 2.1 章节记忆接口必须校验项目归属

文件：

```text
apps/api/src/services/chapter-postprocess.service.ts
apps/api/src/routes/chapters.ts
```

当前问题：

```ts
export async function getChapterMemory(chapterId: string) {
  const [row] = await db.select().from(chapterMemories).where(eq(chapterMemories.chapterId, chapterId))
  return row || null
}
```

以及：

```ts
const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId))
```

问题说明：

1. 路由是 `/api/projects/:projectId/chapters/:id/memory`，但 service 只按 `chapterId` 查询。
2. 如果用户拿到其他项目的 chapter id，就可能通过当前项目路径读取其他项目章节记忆。
3. `runChapterPostprocess` 也只按 `chapterId` 查章节，随后用路由里的 `projectId` 写入记忆，可能把其他项目章节挂到当前项目记忆下。

修改要求：

调整 service 签名：

```ts
export async function getChapterMemory(projectId: string, chapterId: string): Promise<ChapterMemory | null>
```

查询必须同时约束：

```ts
const [row] = await db
  .select()
  .from(chapterMemories)
  .where(and(
    eq(chapterMemories.projectId, projectId),
    eq(chapterMemories.chapterId, chapterId),
  ))
```

`runChapterPostprocess` 中查询章节也必须同时约束：

```ts
const [chapter] = await db
  .select()
  .from(chapters)
  .where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  ))
```

如果查不到：

```ts
throw new Error('章节不存在或不属于当前项目')
```

路由同步修改：

```ts
const projectId = c.req.param('projectId')
const id = c.req.param('id')
const memory = await postprocessService.getChapterMemory(projectId, id)
```

验收标准：

1. 不能通过项目 A 的路径读取项目 B 的章节记忆。
2. 不能通过项目 A 的路径为项目 B 的章节生成记忆。
3. 所有章节记忆读写都同时校验 `projectId + chapterId`。

---

### 2.2 前序章节记忆必须按章节顺序召回

文件：

```text
apps/api/src/services/ai-context.service.ts
```

当前问题：

```ts
const memories = await db
  .select()
  .from(chapterMemories)
  .where(eq(chapterMemories.projectId, projectId))

const prevMemories = memories
  .filter(m => m.chapterId !== currentChapterData.id)
  .slice(-3)
```

问题说明：

1. 没有 `orderBy`，数据库返回顺序不稳定。
2. 没有按章节号过滤当前章之前的章节。
3. 可能包含当前章之后的未来章节记忆。
4. 可能跨分卷拿到不相关章节。

修改要求：

建议查询时 join `chapters`，并按同卷/章节号筛选。

简单可接受实现：

```ts
const memoryRows = await db
  .select({
    memory: chapterMemories,
    chapterTitle: chapters.title,
    chapterNumber: chapters.chapterNumber,
    volumeId: chapters.volumeId,
  })
  .from(chapterMemories)
  .innerJoin(chapters, eq(chapterMemories.chapterId, chapters.id))
  .where(and(
    eq(chapterMemories.projectId, projectId),
    eq(chapters.projectId, projectId),
    currentChapterData.volumeId
      ? eq(chapters.volumeId, currentChapterData.volumeId)
      : sql`1=1`,
    lt(chapters.chapterNumber, currentChapterData.chapterNumber),
  ))
  .orderBy(desc(chapters.chapterNumber))
  .limit(3)
```

然后渲染时再反转为正序：

```ts
for (const row of memoryRows.reverse()) {
  const m = row.memory
  const parts = [`章节 ${row.chapterNumber}. ${row.chapterTitle}:`]
  ...
}
```

需要从 `drizzle-orm` 导入：

```ts
desc
lt
```

验收标准：

1. AI 上下文只包含当前章节之前的记忆。
2. 优先取同一分卷内最近 3 章。
3. 不会包含未来章节记忆。
4. 返回顺序稳定。

---

### 2.3 新建记忆必须返回数据库完整行

文件：

```text
apps/api/src/services/chapter-postprocess.service.ts
```

当前问题：

```ts
const row = {
  id: crypto.randomUUID(),
  projectId,
  chapterId,
  ...fields,
}
await db.insert(chapterMemories).values(row)
memory = row as ChapterMemory
```

问题说明：

`chapter_memories` 的 `createdAt` 和 `updatedAt` 是数据库默认生成字段。这里直接返回手写对象，会缺少 `createdAt / updatedAt`，与 `ChapterMemory` 类型不一致。

修改要求：

使用 `.returning()`：

```ts
const [created] = await db
  .insert(chapterMemories)
  .values({
    id: crypto.randomUUID(),
    projectId,
    chapterId,
    ...fields,
  })
  .returning()

memory = created
```

验收标准：

1. 新建记忆 API 返回包含 `createdAt` 和 `updatedAt`。
2. update 分支和 insert 分支返回结构一致。
3. 不再使用 `as ChapterMemory` 强转绕过类型。

---

## 3. 推荐实施顺序

1. 修改 `getChapterMemory(projectId, chapterId)` 签名和查询条件。
2. 修改 `runChapterPostprocess` 中章节查询，加入 `projectId`。
3. 修改章节路由调用方式。
4. 修改 insert 分支为 `.returning()`。
5. 修改 `ai-context.service.ts` 前序章节记忆查询逻辑。
6. 运行门禁和迁移检查。

---

## 4. 验证命令

必须运行：

```bash
pnpm check
pnpm db:migrate
```

如果修改了 schema，额外运行：

```bash
pnpm db:generate
```

本轮理论上不需要改 schema。

---

## 5. 手工验收流程

准备两个项目 A 和 B，各有章节和章节记忆。

### 5.1 跨项目读取验证

请求：

```http
GET /api/projects/:projectAId/chapters/:projectBChapterId/memory
```

预期：

1. 不返回项目 B 的记忆。
2. 可以返回 `null` 或 404，但不能泄漏数据。

### 5.2 跨项目写入验证

请求：

```http
POST /api/projects/:projectAId/chapters/:projectBChapterId/postprocess
```

预期：

1. 返回错误。
2. 不创建 `projectAId + projectBChapterId` 的错误记忆。

### 5.3 前序记忆验证

准备同一卷 5 章：

1. 第 1-4 章都有记忆。
2. 当前章节为第 5 章。

触发 AI 生成时，prompt 中应包含：

```text
第 2 章
第 3 章
第 4 章
```

不应包含第 5 章或未来章节。

---

## 6. 禁止事项

1. 不要只按 `chapterId` 读写章节记忆。
2. 不要用数据库自然顺序决定前序记忆。
3. 不要把未来章节记忆塞进 AI 上下文。
4. 不要用类型强转掩盖返回字段缺失。
5. 不要扩展到伏笔台账、三元组、人物运行状态，本轮只修阶段 1 问题。

---

## 7. 完成标准

完成后必须满足：

1. `pnpm check` 通过。
2. `pnpm db:migrate` 通过。
3. 章节记忆读写都校验 `projectId + chapterId`。
4. 前序记忆只召回当前章之前的最近章节。
5. 新建记忆响应包含 `createdAt / updatedAt`。
