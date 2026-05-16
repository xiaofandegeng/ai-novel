# 全自动写作流程验收报告 Round 4（2026-05-16）

## 结论

当前这一版还不能判定为“全自动化流程已完成”。

这轮代码已经补上了几个关键方向：

1. 自动写作任务序列加入了 `postprocess / confirm_suggestions / apply_suggestions`。
2. 自动驾驶新增了 `from_current_forward / continue_incomplete / rewrite_selected` 范围类型。
3. 章节变更集开始覆盖 `relationship_update / conflict_update / foreshadowing_payoff / style_note` 等结构化类型。
4. `applyChangeSet()` 开始复用 `postprocess-suggestion.service.ts` 的 `applyOneSuggestion()`，方向是对的。

但当前仍存在构建阻塞和自动流程逻辑缺口，尤其是自动驾驶策略没有传递到 writing job，导致新增的章后建议步骤很可能把“全自动”重新卡成半自动。

## 验证结果

### `pnpm check`

执行命令：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
```

结果：失败。

失败原因：

```text
apps/api/src/services/chapter-change-set.service.ts
  13:3  error  'characters' is defined but never used
  14:3  error  'foreshadowingItems' is defined but never used
  15:3  error  'storyFactTriples' is defined but never used
```

因为 `applyChangeSet()` 已经改为复用 `applyOneSuggestion()`，旧的 `characters / foreshadowingItems / storyFactTriples` 直接落库逻辑被删除，但 import 还保留。

## Findings

### Finding 1 [P0] 当前代码无法通过 lint，自动化验收被阻塞

位置：

- `apps/api/src/services/chapter-change-set.service.ts:13`
- `apps/api/src/services/chapter-change-set.service.ts:14`
- `apps/api/src/services/chapter-change-set.service.ts:15`

问题：

`characters`、`foreshadowingItems`、`storyFactTriples` 已不再直接使用，但仍从 schema 中导入。

影响：

`pnpm check` 在 lint 阶段失败，无法进入 typecheck/build/test。因此当前不能算自动化流程验收完成。

修复建议：

删除未使用 import：

```ts
characters,
foreshadowingItems,
storyFactTriples,
```

修复后重新运行：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
```

### Finding 2 [P1] 自动驾驶策略没有传给 writing job，新增章后建议步骤会默认保守暂停

位置：

- `apps/api/src/services/autonomous-writing.service.ts:181-189`
- `apps/api/src/services/writing-job-auto-approval.service.ts:160-177`

问题：

`prepareRunJobs()` 创建 writing job 时只写入：

```ts
executionMode: 'auto',
targetWords: params.targetWordsPerChapter,
autonomousRunId: runId,
```

没有根据 run 的 `strategy` 设置 `autoApprovalLevel`。

而 `writing_jobs.autoApprovalLevel` 的数据库默认值是 `conservative`。因此即使用户在自动驾驶中选择了“平衡”或“快速”，每个 writing job 仍会按保守策略执行。

这会影响新增的章后建议步骤：

```ts
function evaluateConfirmSuggestions(step, level) {
  if (level === 'conservative') {
    return {
      shouldPause: true,
      approved: false,
      reason: '保守策略要求人工确认章后建议',
      severity: 'medium',
    }
  }
}
```

影响：

自动写作现在虽然加入了：

```text
postprocess
confirm_suggestions
apply_suggestions
```

但在默认保守等级下，任务会在 `confirm_suggestions` 暂停并进入 `waiting_review / needs_attention`，无法稳定完成全自动续写。

修复建议：

在创建 writing job 时显式映射策略：

```ts
function mapRunStrategyToApprovalLevel(strategy: AutonomousStrategy) {
  if (strategy === 'safe')
    return 'conservative'
  if (strategy === 'fast')
    return 'aggressive'
  return 'balanced'
}
```

并在 `tx.insert(writingJobs).values()` 中写入：

```ts
autoApprovalLevel: mapRunStrategyToApprovalLevel(run.strategy),
```

注意：`prepareRunJobs()` 当前只拿到 `params`，需要把 `strategy` 传入 `prepareRunJobs()`。

### Finding 3 [P1] 新增自动续写范围只在后端类型和服务存在，前端驾驶舱无法选择

位置：

- `packages/shared/src/types/autonomous-writing.ts:11-18`
- `apps/api/src/services/autonomous-writing.service.ts:112-149`
- `apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue:39-42`

问题：

shared 和 API 已新增：

```text
from_current_forward
continue_incomplete
rewrite_selected
```

但前端 `scopeOptions` 仍只有：

```ts
const scopeOptions = [
  { label: '后续 N 章', value: 'next_n_chapters' },
  { label: '全书范围', value: 'project' },
]
```

影响：

用户无法从自动驾驶 UI 使用新增的自动续写策略。也就是说“自动续写范围策略”目前只是后端能力，不是完整产品闭环。

修复建议：

在 `AutonomousRunLauncher.vue` 中补充选项：

```ts
{ label: '从当前章向后续写', value: 'from_current_forward' },
{ label: '继续未完成章节', value: 'continue_incomplete' },
{ label: '重写指定章节', value: 'rewrite_selected' },
```

同时补齐：

- `startChapterId` 选择器。
- `endChapterId` 选择器。
- 重写模式的风险提示。
- 预计处理章节预览。

### Finding 4 [P1] `from_current_forward` 没有跳过已完成章节，可能重写已有正文

位置：

- `apps/api/src/services/autonomous-writing.service.ts:112-120`

问题：

`from_current_forward` 当前选择：

```ts
chapterNumber >= startChapter.chapterNumber
```

没有排除已完成或正文已达标的章节。

影响：

用户选择“从当前章向后续写”时，如果当前章已经写完，系统仍会把当前章加入写作队列。因为自动任务后续会生成新正文并通过变更集写回，存在误重写已有章节的风险。

修复建议：

`from_current_forward` 应默认跳过：

- `status = completed`
- 或正文长度已经达到目标阈值的章节

建议条件：

```ts
or(
  isNull(chapters.draft),
  sql`char_length(coalesce(${chapters.draft}, '')) < ${params.targetWordsPerChapter * 0.6}`,
  not(eq(chapters.status, 'completed')),
)
```

或者更清晰地拆成：

- `from_current_forward`：从当前章之后开始，跳过当前已完成章。
- `rewrite_selected`：明确允许覆盖已有章节，并强制展示写入前快照提示。

### Finding 5 [P2] 新增范围类型没有数据库迁移，但当前可接受

位置：

- `apps/api/src/db/schema/ai.ts:81-82`

说明：

`scopeType` 是 PostgreSQL `text` 字段，不是数据库 enum。因此这次只扩展 TypeScript `$type`，理论上不需要生成 SQL migration。

验收建议：

仍建议运行：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm db:migrate
```

确保当前迁移状态可用。

## 当前自动化闭环判断

| 模块 | 当前状态 | 说明 |
| --- | --- | --- |
| 自动 run 创建 | 部分完成 | 后端支持新范围，前端未暴露新范围 |
| 自动任务逐章推进 | 部分完成 | 主干存在，但策略未传入 job |
| 自动正文生成 | 已实现 | `generate_draft` 存在 |
| 自动一致性检查 | 已实现 | `build_change_set` 内执行 guard |
| 自动正文回写 | 已实现 | `apply_change_set` 可写入章节/场景 |
| 自动章后分析 | 部分完成 | 步骤已加入，但会因默认保守策略暂停 |
| 自动结构化回写 | 部分完成 | 变更集覆盖范围扩大，但还需通过门禁验证 |
| 自动续写 | 部分完成 | 后端新增范围，前端不可配置，且有重写风险 |
| 全自动闭环 | 未完成 | 当前 `pnpm check` 失败，且策略链路仍会暂停 |

## 建议下一步修复顺序

### Step 1：修复 lint 阻塞

删除 `chapter-change-set.service.ts` 的未使用 import。

验收：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
```

### Step 2：把 run.strategy 映射到 writingJobs.autoApprovalLevel

修改：

- `apps/api/src/services/autonomous-writing.service.ts`

验收：

- `safe` -> `conservative`
- `balanced` -> `balanced`
- `fast` -> `aggressive`

并确认 `confirm_suggestions` 在 balanced/fast 下不会无条件暂停。

### Step 3：前端补齐自动续写范围配置

修改：

- `apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue`

验收：

- UI 可选择 `从当前章向后续写`
- UI 可选择 `继续未完成章节`
- UI 可选择 `重写指定章节`
- 重写模式有明确风险提示

### Step 4：保护 from_current_forward 不误重写已完成章节

修改：

- `apps/api/src/services/autonomous-writing.service.ts`

验收：

- 已完成且正文字数达标的章节不会进入 run jobs。
- 需要重写时必须使用 `rewrite_selected`。

### Step 5：补充自动化服务测试

建议新增：

```text
apps/api/src/services/__tests__/autonomous-writing-flow.test.ts
```

覆盖：

1. balanced 自动 run 不会在 `confirm_suggestions` 停住。
2. fast 自动 run 遇到低/中风险建议能继续。
3. from_current_forward 跳过已完成章节。
4. rewrite_selected 会创建写入前快照。
5. 变更集能应用 relationship/conflict/foreshadowing payoff。

