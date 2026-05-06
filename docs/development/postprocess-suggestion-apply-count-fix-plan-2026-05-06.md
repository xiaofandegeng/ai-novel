# 章后建议应用计数与状态语义修复文档

日期：2026-05-06  
优先级：P1  
适用范围：`apps/api/src/services/postprocess-suggestion.service.ts`、`apps/api/src/routes/postprocess-suggestions.ts`、`apps/web/src/views/PostChapterAnalysisView.vue`、`packages/shared`

## 1. 背景

当前章后分析已经可以从章节正文中抽取多种待确认建议，包括：

- `fact_triple`
- `foreshadowing_add`
- `foreshadowing_payoff`
- `chapter_element`
- `character_state`
- `continuity_note`
- `style_note`

但是 `applyAcceptedSuggestions(projectId, chapterId)` 只真正处理了前四类建议。其余类型会绕过业务落库逻辑，直接走到通用 `status = 'applied'` 更新。

同时，`foreshadowing_payoff` 在缺少 `foreshadowingId` 或未更新到伏笔记录时会被 `continue` 跳过，但函数最后仍返回 `accepted.length`。前端会提示“已应用 N 条建议”，其中 N 可能包含没有实际应用的建议。

这会造成两个问题：

1. 用户看到“已应用”，但业务数据没有变化。
2. 系统失去章后建议的可追踪性，后续无法判断哪些建议真实落地、哪些只是被确认阅读、哪些需要人工处理。

## 2. 修复目标

本轮只修复章后建议应用语义，不扩展新的 AI 能力。

必须达到：

1. `applied` 只表示建议已经真实写入对应业务数据。
2. 没有落库目标的建议不能标记为 `applied`。
3. API 返回值必须是真实应用数量，而不是 accepted 总数。
4. 跳过、失败、待人工处理的建议必须保留可解释状态。
5. 前端 toast 文案与接口返回一致。

## 3. 修改顺序

### Step 1：明确建议状态模型

文件：

- `packages/shared/src/types/postprocess-suggestion.ts`
- `apps/api/src/db/schema/postprocess.ts`
- 对应 Drizzle migration

建议将状态扩展为：

```ts
export type SuggestionStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'applied'
  | 'acknowledged'
  | 'apply_failed'
```

状态含义：

- `pending`：待用户确认。
- `accepted`：用户接受，等待应用。
- `rejected`：用户拒绝。
- `applied`：已经写入结构化业务数据。
- `acknowledged`：用户确认记录，但当前没有对应结构化落库目标。
- `apply_failed`：尝试应用失败，可重试或人工处理。

如果短期不想改 schema 枚举，可先用当前 text 字段直接写入新状态；但 shared 类型、前端展示和 API 文档必须同步。

### Step 2：改造应用函数返回结构

文件：

- `apps/api/src/services/postprocess-suggestion.service.ts`
- `apps/api/src/routes/postprocess-suggestions.ts`
- `apps/web/src/api/postprocess-suggestions.ts`

将返回值从单个数字改为结构化结果：

```ts
interface ApplyAcceptedSuggestionsResult {
  applied: number
  acknowledged: number
  failed: number
  skipped: number
}
```

接口响应：

```ts
return c.json(success(result))
```

前端 API 类型同步：

```ts
return apiPost<ApplyAcceptedSuggestionsResult>(...)
```

### Step 3：只在真实落库后标记 applied

文件：

- `apps/api/src/services/postprocess-suggestion.service.ts`

推荐实现策略：

```ts
let applied = 0
let acknowledged = 0
let failed = 0
let skipped = 0

for (const suggestion of accepted) {
  try {
    const resultStatus = await applyOneSuggestion(...)

    await db.update(chapterPostprocessSuggestions).set({
      status: resultStatus,
      updatedAt: now(),
    }).where(eq(chapterPostprocessSuggestions.id, suggestion.id))

    if (resultStatus === 'applied')
      applied++
    else if (resultStatus === 'acknowledged')
      acknowledged++
    else
      skipped++
  }
  catch (error) {
    failed++
    await db.update(chapterPostprocessSuggestions).set({
      status: 'apply_failed',
      error: error instanceof Error ? error.message : '应用失败',
      updatedAt: now(),
    }).where(eq(chapterPostprocessSuggestions.id, suggestion.id))
  }
}

return { applied, acknowledged, failed, skipped }
```

注意：

- 如果当前 schema 没有 `error` 字段，可先不写 error，或新增 `applyError` 字段并生成 migration。
- 不允许 catch 后静默吞掉失败。
- 不允许最后返回 `accepted.length`。

### Step 4：补齐各类型应用语义

#### 4.1 fact_triple

行为：

- 插入 `story_fact_triples`。
- 使用 `onConflictDoNothing()` 时，如果因为重复未插入，也可视为 `applied`，因为目标事实已经存在。

状态：

- 成功或已存在：`applied`
- 数据缺字段：`apply_failed`

#### 4.2 foreshadowing_add

行为：

- 插入 `foreshadowing_items`。

状态：

- 插入成功：`applied`
- 标题为空或数据库失败：`apply_failed`

#### 4.3 foreshadowing_payoff

行为：

- 必须有 `payload.foreshadowingId`。
- 更新对应 `foreshadowing_items.status = 'paid_off'`。
- 同时校验 `projectId`。

状态：

- 更新到记录：`applied`
- 缺少 `foreshadowingId`：`acknowledged` 或保留 `accepted` 并提示“需人工匹配”
- 未更新到记录：`apply_failed`

推荐短期选择：

```text
缺少 foreshadowingId -> acknowledged
```

原因：AI 已识别“可能回收了伏笔”，但系统无法自动定位目标伏笔，不能假装已回收。

#### 4.4 chapter_element

行为：

- 插入 `chapter_elements`。
- 如果有唯一约束冲突，可视为目标约束已存在。

状态：

- 成功或已存在：`applied`
- 缺少 elementName：`apply_failed`

#### 4.5 character_state

短期行为：

- 不直接修改角色卡，避免 AI 自动覆盖人物设定。
- 标记为 `acknowledged`。

后续增强：

- 新增 `character_state_changes` 表，保存角色状态变化记录，供人物页确认吸收。

#### 4.6 continuity_note

短期行为：

- 标记为 `acknowledged`。

后续增强：

- 新增 `continuity_notes` 表，作为项目连续性备忘。

#### 4.7 style_note

短期行为：

- 标记为 `acknowledged`。

后续增强：

- 写入项目风格记忆或写作人格素材池，但必须有用户确认入口。

## 4. 前端修改

文件：

- `apps/web/src/views/PostChapterAnalysisView.vue`
- `apps/web/src/stores/postprocess-suggestion.store.ts`
- `apps/web/src/api/postprocess-suggestions.ts`

### 4.1 Toast 文案

从：

```ts
toast.add(`已应用 ${result.applied} 条建议`, 'success')
```

改为：

```ts
toast.add(
  `已应用 ${result.applied} 条，已记录 ${result.acknowledged} 条，失败 ${result.failed} 条`,
  result.failed > 0 ? 'warning' : 'success',
)
```

### 4.2 状态标签

在章后分析列表中补充：

- `acknowledged`：`已记录`
- `apply_failed`：`应用失败`

不要把 `acknowledged` 展示成 `已应用`。

### 4.3 失败重试

如果本轮时间允许，为 `apply_failed` 增加“重试应用”按钮。

如果不做按钮，也必须保证：

- 失败状态可见。
- 用户知道该建议没有落库。

## 5. 测试要求

### 5.1 单元测试

建议新增或更新 API service 测试，覆盖：

1. `fact_triple` 成功应用后 `applied + 1`。
2. `foreshadowing_payoff` 缺少 `foreshadowingId` 时不标记 `applied`。
3. `character_state` 被标记为 `acknowledged`。
4. 其中一条失败时，其余建议仍可继续处理。
5. 返回统计与数据库状态一致。

### 5.2 手动验收

准备一个章节，制造以下 accepted suggestions：

- 1 条事实三元组。
- 1 条新增伏笔。
- 1 条可匹配的伏笔回收。
- 1 条无法匹配的伏笔回收。
- 1 条人物状态变化。
- 1 条风格记录。

点击“应用已接受建议”后检查：

- 事实写入 `story_fact_triples`。
- 新伏笔写入 `foreshadowing_items`。
- 可匹配伏笔变为 `paid_off`。
- 无法匹配伏笔不显示为 `已应用`。
- 人物状态变化显示为 `已记录`。
- toast 数量和实际状态一致。

## 6. 验证命令

普通门禁：

```bash
pnpm check
```

如果修改 schema：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
pnpm check
```

专项扫描：

```bash
rg -n "return accepted.length|status: 'applied'|acknowledged|apply_failed" apps/api/src/services/postprocess-suggestion.service.ts apps/web/src/views/PostChapterAnalysisView.vue packages/shared/src
```

验收标准：

1. 不再出现 `return accepted.length`。
2. `applied` 只在实际落库后写入。
3. 不能自动落库的建议使用 `acknowledged` 或保留待处理状态。
4. 前端不再把所有 accepted 数量显示为已应用数量。
5. `pnpm check` 通过。

## 7. 交给 AI 的执行提示词

```text
请按照 docs/development/postprocess-suggestion-apply-count-fix-plan-2026-05-06.md 修复章后建议应用流程。

重点：
1. applyAcceptedSuggestions 不能再返回 accepted.length。
2. applied 只表示真实写入业务数据。
3. character_state / continuity_note / style_note 暂时标记 acknowledged，不要假装 applied。
4. foreshadowing_payoff 缺少 foreshadowingId 时不能标记 applied。
5. 同步 shared 类型、API 返回类型、前端 toast 和状态标签。
6. 如果改 schema，必须生成 migration。
7. 最后运行 pnpm check；如果有 migration，额外运行 pnpm db:migrate。
```
