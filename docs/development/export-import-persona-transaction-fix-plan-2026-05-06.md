# 导入导出人格配置与事务一致性修复文档

日期：2026-05-06  
优先级：P1  
适用范围：`apps/api/src/services/export-import.service.ts`

## 1. 背景

当前导入导出已经补齐了一部分项目数据，包括知识库、质量报告和章后建议。但仍存在一个关键闭环问题：

```ts
for (const pc of data.personaConfigs as Record<string, unknown>[])
  await safeInsert(projectPersonaConfigs, {
    id: remapId(pc.id as string),
    projectId,
    personaId: remapId(pc.personaId as string),
    ...pick(pc, PERSONA_CONFIG_FIELDS),
  })
```

`project_persona_configs.persona_id` 有外键约束，指向 `writing_personas.id`。但当前导出数据只包含 `personaConfigs`，没有包含对应的 `writingPersonas` 本体。

因此只要被导入的项目绑定过写作人格：

1. 导入时会把 `personaId` remap 成一个新的 ID。
2. 数据库里不存在这个新的 `writing_personas.id`。
3. 插入 `project_persona_configs` 会触发外键失败。
4. 因为导入流程没有事务，前面已插入的新项目、章节、知识库等会残留，形成半导入脏数据。

## 2. 修复目标

必须达到：

1. 带人格配置的项目导入不会外键失败。
2. 导入过程中任意一步失败必须整体回滚。
3. 导入后的人格配置语义清晰：要么人格一并导入，要么配置被明确跳过。
4. API 返回结果应说明导入了多少实体、跳过了多少人格配置。

## 3. 推荐方案

推荐采用“完整导出人格 + 事务导入”。

### Step 1：导出 writingPersonas

文件：

- `apps/api/src/services/export-import.service.ts`

新增 import：

```ts
import { writingPersonas } from '../db/schema'
```

在 `exportProjectData(projectId)` 中：

1. 查询项目人格配置。
2. 从配置中收集 `personaId`。
3. 导出这些 persona。

示例：

```ts
const personaConfigs = await db
  .select()
  .from(projectPersonaConfigs)
  .where(eq(projectPersonaConfigs.projectId, projectId))

const personaIds = personaConfigs.map(c => c.personaId)
const personas = personaIds.length > 0
  ? await db.select().from(writingPersonas).where(inArray(writingPersonas.id, personaIds))
  : []
```

导出结构增加：

```ts
writingPersonas: personas
```

需要从 `drizzle-orm` 导入 `inArray`。

### Step 2：导入 writingPersonas

新增字段白名单：

```ts
const WRITING_PERSONA_FIELDS = [
  'name',
  'description',
  'genre',
  'sourceTrainingSetId',
  'status',
  'coreAppeal',
  'pacingRules',
  'conflictRules',
  'characterRules',
  'languageRules',
  'chapterRules',
  'hookRules',
  'forbiddenRules',
  'similarityGuardrails',
]
```

在导入 `projectPersonaConfigs` 前先导入 `writingPersonas`：

```ts
for (const p of ((data.writingPersonas as Record<string, unknown>[] | undefined) || [])) {
  await safeInsert(writingPersonas, {
    id: remapId(p.id as string),
    ...pick(p, WRITING_PERSONA_FIELDS),
  })
}
```

注意：

- 如果 `sourceTrainingSetId` 不在导出数据中同步导入对应训练集，可以置为 `null`，避免外键指向不存在的训练集。
- 如果 persona 名称冲突，目前可直接生成新 ID，不需要复用旧 ID。

然后导入配置：

```ts
for (const pc of personaConfigs) {
  const oldPersonaId = pc.personaId as string | undefined
  if (!oldPersonaId)
    continue

  const mappedPersonaId = idMap.get(oldPersonaId)
  if (!mappedPersonaId) {
    skippedPersonaConfigs++
    continue
  }

  await safeInsert(projectPersonaConfigs, {
    id: remapId(pc.id as string),
    projectId,
    personaId: mappedPersonaId,
    ...pick(pc, PERSONA_CONFIG_FIELDS),
  })
}
```

这样即使旧导出文件没有 `writingPersonas`，也不会外键失败，而是跳过配置。

### Step 3：整个 importProjectData 使用事务

当前导入流程逐条 `await safeInsert(...)`，任意一步失败都会留下半导入数据。

需要改为：

```ts
export async function importProjectData(data: Record<string, unknown>) {
  return db.transaction(async (tx) => {
    // 所有 insert 都使用 tx
  })
}
```

把 `safeInsert` 改为接收 tx：

```ts
function safeInsert(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: any,
  values: Record<string, unknown>,
) {
  return tx.insert(table).values(values as any)
}
```

如果类型不好写，可以在当前项目风格下先用局部类型，但不要让事务外的 `db.insert` 混进导入流程。

### Step 4：返回导入统计

建议返回：

```ts
return {
  projectId,
  importedEntities: idMap.size,
  skippedPersonaConfigs,
}
```

如果跳过了人格配置，前端后续可提示：

```text
项目已导入，但部分人格配置因缺少人格本体被跳过。
```

## 4. 兼容旧导出文件

必须兼容没有 `writingPersonas` 字段的旧文件。

规则：

1. `data.writingPersonas` 不存在时，不报错。
2. 导入 `personaConfigs` 时，如果无法找到 remap 后的 persona id，则跳过。
3. 跳过数量写入 `skippedPersonaConfigs`。

不要：

- 不要把缺失的 personaId remap 成新 ID 后直接插入配置。
- 不要为了通过外键，创建空白人格。

## 5. 验收案例

### Case 1：带人格配置的新导出文件

准备项目：

- 项目 A 绑定一个已发布写作人格。
- 导出项目 A。
- 导入导出文件。

预期：

- 新项目导入成功。
- 新项目有项目人格配置。
- 对应 `writing_personas` 也被导入。
- 项目设置页能看到人格配置。
- AI 上下文能读取到人格 prompt。

### Case 2：旧导出文件只有 personaConfigs，没有 writingPersonas

准备旧格式导出文件：

- 包含 `personaConfigs`
- 不包含 `writingPersonas`

预期：

- 导入成功。
- `skippedPersonaConfigs > 0`。
- 不出现半导入数据。
- API 不抛外键错误。

### Case 3：导入中途失败回滚

构造错误导入文件：

- project 正常。
- chapters 中有非法字段或必填字段缺失。

预期：

- API 返回失败。
- 数据库中没有残留的新项目。
- 没有残留的 chapters/knowledge/suggestions。

## 6. 验证命令

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

如果没有 schema 改动，可以不跑 `db:generate`，但必须跑：

```bash
pnpm db:migrate
pnpm check
```

专项扫描：

```bash
rg -n "writingPersonas|projectPersonaConfigs|skippedPersonaConfigs|db.transaction|safeInsert" apps/api/src/services/export-import.service.ts
```

验收标准：

1. `importProjectData` 使用事务。
2. 导出结构包含项目绑定的人格本体。
3. 导入 `projectPersonaConfigs` 前已导入或确认存在对应 persona。
4. 缺失 persona 时跳过配置而不是外键失败。
5. `pnpm check` 和 `pnpm db:migrate` 通过。

## 7. 交给 AI 的执行提示词

```text
请按照 docs/development/export-import-persona-transaction-fix-plan-2026-05-06.md 修复导入导出人格配置和事务一致性。

重点：
1. exportProjectData 导出项目绑定的 writingPersonas。
2. importProjectData 先导入 writingPersonas，再导入 projectPersonaConfigs。
3. 如果旧导出文件没有 writingPersonas，则跳过无法匹配的人格配置，并返回 skippedPersonaConfigs。
4. 整个 importProjectData 必须用 db.transaction 包裹，任何错误都要回滚。
5. 不要创建空白人格来绕过外键。
6. 最后运行 pnpm db:migrate 和 pnpm check。
```
