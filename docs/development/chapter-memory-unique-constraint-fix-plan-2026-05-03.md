# 章节记忆唯一约束修复文档

日期：2026-05-03  
状态：待执行  
范围：`chapter_memories` 表结构、迁移、章节记忆写入逻辑。  
目标：为每个项目内的每个章节只保留一条结构化记忆，避免并发更新或自动任务重复插入导致 AI 上下文重复、不稳定。

---

## 1. 背景

当前章节记忆管线已经完成以下修复：

1. 读取章节记忆时按 `projectId + chapterId` 查询。
2. 生成章节记忆前校验章节属于当前项目。
3. AI 上下文只召回当前章之前的前序章节记忆。
4. 新建记忆使用 `.returning()` 返回完整数据库行。

但仍存在一个数据一致性隐患：

`chapter_memories` 表没有 `(project_id, chapter_id)` 唯一约束。服务层虽然先查 `existing` 再决定 update/insert，但在并发场景下，两个请求可能同时查不到已有记录，然后各自插入一条记忆。

典型触发场景：

1. 用户手动点击“更新记忆”时，自动保存或后台任务也在触发章后处理。
2. 后续实现“章节完成自动更新记忆”后，同一章节可能短时间内多次调用。
3. 网络重试或队列重放导致同一章节重复执行 postprocess。

影响：

1. AI 上下文可能召回同一章节的多条记忆。
2. 前序记忆内容顺序和版本不稳定。
3. 后续如果做“重试失败章节 / 查看记忆历史”，会难以区分主记录和重复脏数据。

---

## 2. 必修问题

### 2.1 给 `chapter_memories` 增加章节级唯一约束

文件：

```text
apps/api/src/db/schema.ts
```

当前结构：

```ts
export const chapterMemories = pgTable('chapter_memories', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  ...
})
```

修改要求：

从 `drizzle-orm/pg-core` 导入 `uniqueIndex`：

```ts
import { integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
```

给 `chapterMemories` 增加第三个参数：

```ts
export const chapterMemories = pgTable('chapter_memories', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => novelProjects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  summary: text('summary'),
  keyEvents: text('key_events'),
  newFacts: text('new_facts'),
  characterStateChanges: text('character_state_changes'),
  relationshipChanges: text('relationship_changes'),
  conflictProgress: text('conflict_progress'),
  foreshadowingAdded: text('foreshadowing_added'),
  foreshadowingResolved: text('foreshadowing_resolved'),
  themeProgress: text('theme_progress'),
  styleNotes: text('style_notes'),
  ...timestamps,
}, table => ({
  projectChapterUnique: uniqueIndex('chapter_memories_project_chapter_unique')
    .on(table.projectId, table.chapterId),
}))
```

验收标准：

1. Drizzle schema 明确表达“同一项目同一章节只能有一条记忆”。
2. `pnpm db:generate` 能生成对应唯一索引迁移。
3. `pnpm db:migrate` 能在本地 PostgreSQL 正常执行。

---

### 2.2 迁移前清理历史重复数据

文件：

```text
apps/api/drizzle/*.sql
```

问题说明：

如果本地或测试库已经存在重复的 `chapter_memories(project_id, chapter_id)`，直接创建唯一索引会失败。因此迁移需要先去重，再创建唯一索引。

修改要求：

生成迁移后，检查 SQL 是否只包含 `CREATE UNIQUE INDEX`。如果没有去重逻辑，需要手动在创建索引前加入清理语句。

推荐迁移片段：

```sql
DELETE FROM chapter_memories a
USING chapter_memories b
WHERE a.project_id = b.project_id
  AND a.chapter_id = b.chapter_id
  AND a.updated_at < b.updated_at;

DELETE FROM chapter_memories a
USING chapter_memories b
WHERE a.project_id = b.project_id
  AND a.chapter_id = b.chapter_id
  AND a.updated_at = b.updated_at
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS "chapter_memories_project_chapter_unique"
ON "chapter_memories" ("project_id", "chapter_id");
```

说明：

1. 第一条删除同一章节下较旧的记忆，保留 `updated_at` 最新的一条。
2. 第二条处理 `updated_at` 相同的极端情况，保留 `id` 较大的记录。
3. `IF NOT EXISTS` 可降低本地半迁移状态重复执行的风险。

验收标准：

1. 有重复历史数据时，迁移不会失败。
2. 迁移后每个 `(project_id, chapter_id)` 最多只有一条记忆。
3. 唯一索引存在。

可用 SQL 验证：

```sql
SELECT project_id, chapter_id, COUNT(*)
FROM chapter_memories
GROUP BY project_id, chapter_id
HAVING COUNT(*) > 1;
```

结果应为空。

---

### 2.3 写入侧改成数据库级 upsert

文件：

```text
apps/api/src/services/chapter-postprocess.service.ts
```

当前写法：

```ts
const [existing] = await db.select().from(chapterMemories).where(and(
  eq(chapterMemories.projectId, projectId),
  eq(chapterMemories.chapterId, chapterId),
))

let memory: ChapterMemory
if (existing) {
  const [updated] = await db
    .update(chapterMemories)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(eq(chapterMemories.id, existing.id))
    .returning()
  memory = updated
}
else {
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
}
```

问题说明：

这属于“先查再写”，无法防止并发插入。加唯一索引后仍建议改为数据库级 upsert，避免并发时抛唯一冲突错误。

修改要求：

用 `onConflictDoUpdate`：

```ts
const [memory] = await db
  .insert(chapterMemories)
  .values({
    id: crypto.randomUUID(),
    projectId,
    chapterId,
    ...fields,
  })
  .onConflictDoUpdate({
    target: [chapterMemories.projectId, chapterMemories.chapterId],
    set: {
      ...fields,
      updatedAt: new Date().toISOString(),
    },
  })
  .returning()
```

注意：

1. `id` 只在 insert 时生效。
2. conflict update 不应覆盖 `id / projectId / chapterId / createdAt`。
3. 仍然保留前面的章节归属校验，不允许跨项目写入。

验收标准：

1. 不再使用 `select existing -> if update else insert` 的写法。
2. 并发调用同一章节的 postprocess 时，最终仍只有一条记忆。
3. API 返回完整 `ChapterMemory`。

---

## 3. 建议补充测试

优先添加 API service 层测试。如果当前项目还没有 API 测试框架，可以至少添加一个脚本级或集成测试，覆盖以下行为：

1. 同一 `projectId + chapterId` 连续执行两次 `runChapterPostprocess` 后，`chapter_memories` 只有一条记录。
2. 第二次执行会更新 `summary / keyEvents / updatedAt`，不会插入新行。
3. 使用项目 A 的 `projectId` 处理项目 B 的 `chapterId` 会失败。
4. AI 上下文召回前序记忆时不会重复显示同一章节。

如果 AI 调用难以在测试中稳定运行，可以 mock `createOpenAIClient` 或把 JSON 解析后的写入逻辑抽成可测函数。

---

## 4. 验证命令

完成修改后运行：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

如果本地库已有历史数据，迁移后再执行：

```bash
psql "$DATABASE_URL" -c "
SELECT project_id, chapter_id, COUNT(*)
FROM chapter_memories
GROUP BY project_id, chapter_id
HAVING COUNT(*) > 1;
"
```

验收标准：

1. `pnpm db:generate` 成功，生成唯一索引迁移。
2. `pnpm db:migrate` 成功。
3. `pnpm check` 成功。
4. 重复数据检查结果为空。
5. 手动连续点击同一章节“更新记忆”多次，不会生成多条章节记忆。

---

## 5. 不在本轮范围

本轮只修复章节记忆唯一性和并发写入问题，不处理以下事项：

1. 章节记忆历史版本。
2. 章节记忆失败重试队列。
3. 自动保存触发频率控制。
4. 长章节分段记忆。
5. 记忆质量评分。

这些能力可以在后续“章节记忆阶段 2”中单独设计。
