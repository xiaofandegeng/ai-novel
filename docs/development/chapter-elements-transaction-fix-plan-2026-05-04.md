# 章节元素批量替换事务修复文档

日期：2026-05-04  
状态：待执行  
范围：`PUT /api/projects/:projectId/chapters/:chapterId/elements` 批量替换接口。  
目标：修复章节元素批量替换时“先删旧数据，后插新数据”的非事务风险，避免大纲保存失败导致本章硬约束被清空。

---

## 1. 背景

当前大纲页保存章节元素时会调用：

```http
PUT /api/projects/:projectId/chapters/:chapterId/elements
```

该接口当前逻辑是：

1. 校验章节属于当前项目。
2. 删除当前章节全部旧元素。
3. 批量插入新元素。
4. 返回新元素列表。

问题在于：删除和插入没有放在同一个数据库事务中。

如果插入阶段失败，例如：

1. `incoming` 里有重复元素，触发 `chapter_elements_unique` 唯一索引。
2. `elementName` 为空，触发业务校验或数据库异常。
3. 字段枚举值非法。
4. 数据库连接中断。

那么旧元素已经被删除，新元素却没有成功插入。  
这个接口正被大纲页保存流程调用，因此失败会造成作者已经配置好的章节硬约束丢失。

---

## 2. 必修问题

### 2.1 使用事务包住 delete + insert

文件：

```text
apps/api/src/routes/chapter-elements.ts
```

当前问题代码：

```ts
await db.delete(chapterElements).where(
  and(eq(chapterElements.projectId, projectId), eq(chapterElements.chapterId, chapterId)),
)

const rows = incoming.length > 0
  ? await db.insert(chapterElements).values(incoming.map(el => ({
      id: generateId(),
      projectId,
      chapterId,
      elementType: el.elementType,
      elementId: el.elementId || null,
      elementName: el.elementName,
      relationType: el.relationType,
      importance: el.importance || 'normal' as const,
      appearanceOrder: el.appearanceOrder || null,
      notes: el.notes || null,
    }))).returning()
  : []
```

修改要求：

```ts
const rows = await db.transaction(async (tx) => {
  await tx.delete(chapterElements).where(
    and(eq(chapterElements.projectId, projectId), eq(chapterElements.chapterId, chapterId)),
  )

  if (normalized.length === 0)
    return []

  return tx.insert(chapterElements).values(normalized.map(el => ({
    id: generateId(),
    projectId,
    chapterId,
    ...el,
  }))).returning()
})
```

要求：

1. 删除和插入必须在同一个 transaction 中。
2. 插入失败时，旧数据必须回滚保留。
3. 不要在事务外先删除。

---

## 3. 必须增加输入校验

### 3.1 空名称校验

写入前过滤和校验：

```ts
const incoming = Array.isArray(body.elements) ? body.elements : []

const normalized = incoming
  .map(el => ({
    elementType: el.elementType,
    elementId: el.elementId || null,
    elementName: typeof el.elementName === 'string' ? el.elementName.trim() : '',
    relationType: el.relationType,
    importance: el.importance || 'normal',
    appearanceOrder: el.appearanceOrder ?? null,
    notes: el.notes || null,
  }))
  .filter(el => el.elementName.length > 0)
```

如果存在空元素，也可以选择直接返回 400：

```ts
if (incoming.some(el => !el.elementName?.trim()))
  return c.json(fail('章节元素名称不能为空'), 400)
```

推荐：返回 400，而不是静默过滤。这样用户知道保存失败原因。

### 3.2 枚举值校验

必须校验：

```ts
const elementTypes = ['character', 'location', 'item', 'organization', 'event']
const relationTypes = ['appears', 'mentioned', 'scene', 'uses', 'involved', 'occurs']
const importanceTypes = ['major', 'normal', 'minor']
```

若非法：

```ts
return c.json(fail('章节元素类型不合法'), 400)
```

### 3.3 重复元素校验

由于数据库有唯一索引：

```text
project_id + chapter_id + element_type + element_name + relation_type
```

接口应在写入前提前检测重复，避免靠数据库异常返回 500。

示例：

```ts
const seen = new Set<string>()
for (const el of normalized) {
  const key = `${el.elementType}:${el.elementName}:${el.relationType}`
  if (seen.has(key))
    return c.json(fail(`章节元素重复：${el.elementName}`), 400)
  seen.add(key)
}
```

验收标准：

1. 空名称返回 400。
2. 非法枚举返回 400。
3. 重复元素返回 400。
4. 以上失败都不能删除旧元素。

---

## 4. 建议提取工具函数

为了避免 route 过长，可在同文件或 service 中提取：

```ts
function normalizeChapterElements(input: unknown): NormalizedChapterElement[] | ApiError
```

或者新增：

```text
apps/api/src/services/chapter-element.service.ts
```

推荐长期结构：

```ts
export async function replaceChapterElements(projectId: string, chapterId: string, input: unknown) {
  await assertChapterBelongsToProject(projectId, chapterId)
  const normalized = normalizeChapterElements(input)

  return db.transaction(async (tx) => {
    await tx.delete(chapterElements).where(...)
    if (normalized.length === 0)
      return []
    return tx.insert(chapterElements).values(...).returning()
  })
}
```

本轮可以先在 route 内实现，后续再重构到 service。

---

## 5. 测试建议

至少覆盖以下场景：

1. 已有旧元素时，提交重复元素，接口返回 400，旧元素仍存在。
2. 已有旧元素时，提交空 `elementName`，接口返回 400，旧元素仍存在。
3. 已有旧元素时，提交非法 `elementType`，接口返回 400，旧元素仍存在。
4. 正常提交多个元素，旧元素被替换为新元素。
5. 提交空数组，旧元素被清空，这是合法操作。

如果暂时没有 API 测试框架，可用手动验证：

1. 在大纲页给章节添加一个必须出场人物并保存。
2. 用 curl 或临时前端状态提交重复元素。
3. 确认接口失败后，刷新大纲页，原元素仍存在。

---

## 6. 验证命令

完成修复后运行：

```bash
pnpm check
pnpm db:migrate
```

如果没有 schema 变化，不需要运行 `pnpm db:generate`。

---

## 7. 完成标准

本修复完成后必须满足：

1. `PUT /elements` 使用事务。
2. 插入失败不会清空旧章节元素。
3. 空名称、非法枚举、重复元素返回 400。
4. 合法空数组仍可清空当前章节元素。
5. `pnpm check` 通过。
6. `pnpm db:migrate` 通过。
