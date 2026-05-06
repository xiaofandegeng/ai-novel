# 章后建议无效 Payload 状态修复文档

日期：2026-05-06  
优先级：P2  
适用范围：`apps/api/src/services/postprocess-suggestion.service.ts`、`apps/web/src/views/PostChapterAnalysisView.vue`

## 1. 背景

当前 `applyAcceptedSuggestions(projectId, chapterId)` 已经修复了 `applied` 误统计问题，但仍存在一个边界：

```ts
try {
  payload = JSON.parse(suggestion.payload)
}
catch {
  skipped++
  continue
}
```

当某条 accepted 建议的 `payload` 不是合法 JSON 时，服务端只递增 `skipped`，不会更新该建议状态。前端执行后会重新拉取建议列表，这条坏数据仍然保持 `accepted`，导致：

1. “批量应用已接受”按钮计数不会减少。
2. 用户可以反复点击同一批坏数据。
3. UI 没有解释为什么没有被应用。
4. `skipped` 当前没有进入 toast，用户不可见。

## 2. 修复目标

本轮只处理无效 payload 的状态和用户反馈，不新增业务落库逻辑。

必须达到：

1. JSON 解析失败的建议不能继续停留在 `accepted`。
2. 解析失败应标记为 `apply_failed`。
3. 返回结果中的 `skipped` 必须在前端 toast 中展示。
4. 刷新列表后，坏建议应显示“应用失败”。

## 3. 修改顺序

### Step 1：服务端解析失败写入 apply_failed

文件：

- `apps/api/src/services/postprocess-suggestion.service.ts`

将 JSON parse catch 从只计数改成状态更新：

```ts
try {
  payload = JSON.parse(suggestion.payload)
}
catch {
  skipped++
  await db.update(chapterPostprocessSuggestions).set({
    status: 'apply_failed',
    updatedAt: now(),
  }).where(eq(chapterPostprocessSuggestions.id, suggestion.id))
  continue
}
```

注意：

- 如果未来新增 `applyError` 字段，可写入 `payload JSON 解析失败`。
- 当前没有错误字段时，不要为这个 P2 单独扩 schema，除非同一轮已经在做 schema 迁移。

### Step 2：前端 toast 展示 skipped

文件：

- `apps/web/src/views/PostChapterAnalysisView.vue`

当前 toast 只展示：

- `applied`
- `acknowledged`
- `failed`

需要补充：

```ts
if (result.skipped)
  parts.push(`跳过 ${result.skipped} 条`)
```

toast variant 建议：

```ts
const hasProblem = result.failed > 0 || result.skipped > 0
toast.add(parts.join('，') || '没有需要处理的建议', hasProblem ? 'warning' : 'success')
```

### Step 3：确认状态标签已覆盖 apply_failed

文件：

- `apps/web/src/views/PostChapterAnalysisView.vue`

确认现有状态展示包含：

```text
apply_failed -> 应用失败
```

如果已经存在，无需重复修改。

## 4. 验收案例

手动构造一条 accepted 建议：

```text
status = accepted
payload = "{broken json"
```

点击“批量应用已接受”后应满足：

1. 接口返回 `skipped: 1`。
2. 数据库中该建议状态变为 `apply_failed`。
3. 前端 toast 显示“跳过 1 条”或等价提示。
4. 列表刷新后该建议显示“应用失败”。
5. “批量应用已接受”按钮计数不再包含这条建议。

## 5. 验证命令

```bash
pnpm check
```

专项扫描：

```bash
rg -n "JSON.parse\\(suggestion.payload\\)|skipped|apply_failed|跳过" apps/api/src/services/postprocess-suggestion.service.ts apps/web/src/views/PostChapterAnalysisView.vue
```

验收标准：

1. JSON parse 失败路径会更新 suggestion 状态。
2. `skipped` 不再是用户不可见的内部计数。
3. `pnpm check` 通过。

## 6. 交给 AI 的执行提示词

```text
请按照 docs/development/postprocess-suggestion-invalid-payload-fix-plan-2026-05-06.md 修复章后建议无效 payload 的状态处理。

重点：
1. JSON.parse(suggestion.payload) 失败时，把该 suggestion 状态更新为 apply_failed。
2. 不要让坏数据继续停留在 accepted。
3. 前端批量应用 toast 要展示 skipped 数量。
4. 确认列表中 apply_failed 显示为“应用失败”。
5. 最后运行 pnpm check。
```
