# 全自动写作全局闭环验收报告（2026-05-16）

## 结论

当前项目已经具备“自动写作”的主干能力，但还不能判定为完整的“全自动长篇写作闭环”。

已实现的主干链路：

1. 用户可在自动写作驾驶舱创建自动写作 run。
2. run 会按章节范围创建 writing job。
3. writing job 会构建上下文、生成正文、构建章节变更集、执行自动审批、应用变更集、更新健康指标。
4. 低风险变更集可自动写回章节正文。
5. 上下文引擎已经能读取故事设定、角色、人物关系、矛盾、伏笔、事实图谱、章节记忆、本章元素、知识库和写作人格。
6. 项目健康页已经能暴露部分结构风险，例如待确认结构化建议、人物关系断裂、伏笔遗忘、节奏风险、场景缺失和变更集异常。

仍未闭环的关键点：

1. 变更集没有覆盖所有结构化回写类型。
2. 自动写作任务序列没有执行章后管线和建议应用步骤。
3. 章节自动筛选只按正文长度判断，不能理解“已完成但需要续写”的章节。
4. 自动驾驶前端只能看到章节 ID，缺少正文回写、结构回写、下一章自动续写的可观察证据。

因此当前状态更准确地说是：

> 已具备自动写作骨架和部分自动回写能力，但“AI 生成 -> 全量抽取 -> 自动确认策略 -> 全局结构回写 -> 下一章上下文继承 -> 自动续写”的闭环还不完整。

## 已验证通过

### 1. 工程门禁

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
```

结果：通过。

覆盖：

- lint
- typecheck
- build
- test

### 2. 数据库迁移

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm db:migrate
```

结果：通过。

### 3. PostgreSQL 非法写法扫描

已扫描：

```bash
rg -n 'ILIKE ANY|ANY\(\(|ilike\(|like\(' apps/api/src apps/web/src packages/shared/src
```

结果：

- 未发现之前导致报错的 `ILIKE ANY(($1, $2...))` 写法。
- 当前 `ilike/or(...predicates)` 主要集中在知识库检索、事实检索和角色检索中，写法符合 Drizzle/PostgreSQL 的常规表达方式。

## 发现的问题

### Finding 1 [P1] 自动任务没有真正执行章后管线和建议应用

位置：

- `apps/api/src/services/writing-job.service.ts:32-40`
- `apps/api/src/services/writing-job.service.ts:42-52`
- `apps/api/src/services/writing-job.service.ts:54-64`
- `apps/api/src/services/writing-job.service.ts:552-604`

问题：

`executePostprocess()` 和 `executeApplySuggestions()` 已经存在，但 `draft_only`、`outline_then_draft`、`scene_draft` 的 `STEP_SEQUENCE` 当前是：

```text
prepare_context
generate_draft / generate_plan
build_change_set
review_change_set
auto_repair
apply_change_set
update_health
done
```

没有包含：

```text
postprocess
confirm_suggestions
apply_suggestions
```

影响：

- 自动写作不会在应用正文后再跑一次正式章后分析。
- `chapter_postprocess_suggestions` 的完整建议应用链路不会参与自动写作。
- 部分在 `chapter-postprocess.service.ts` 中支持的类型不会进入自动写作闭环。

修复建议：

把自动写作序列扩展为：

```text
prepare_context
generate_plan / generate_scene_draft
confirm_plan
generate_draft
build_change_set
review_change_set
auto_repair
apply_change_set
postprocess
confirm_suggestions
apply_suggestions
update_health
done
```

自动模式下：

- `confirm_suggestions` 由 `evaluateAutoApproval()` 判断是否暂停。
- `apply_suggestions` 使用 `applyAutoSuggestions()` 按 `autoApprovalLevel` 自动处理低风险建议。
- 高风险建议继续进入异常队列或待确认区。

### Finding 2 [P1] 章节变更集没有覆盖关系、矛盾、伏笔回收等关键结构化类型

位置：

- `apps/api/src/services/chapter-change-set.service.ts:158-253`
- `apps/api/src/services/chapter-change-set.service.ts:370-455`
- `packages/shared/src/types/chapter-change-set.ts:10-23`

问题：

shared 类型已经定义：

```text
relationship_create
relationship_update
conflict_create
conflict_update
foreshadowing_payoff
style_note
continuity_note
```

但 `createChangeSetItems()` 当前只创建：

```text
draft
chapter_memory
character_create
fact_create
foreshadowing_create
```

`applyChangeSet()` 当前也只真正处理：

```text
draft
character_create
fact_create
foreshadowing_create
chapter_memory
```

影响：

- AI 抽取出的关系变化不会通过变更集自动回写到人物关系网。
- 新矛盾、矛盾推进不会通过变更集自动回写到矛盾矩阵。
- 伏笔回收不会通过变更集自动更新伏笔台账。
- 风格笔记和连续性笔记不会形成可追踪数据。

修复建议：

在 `createChangeSetItems()` 补齐：

- `relationship_update`
- `conflict_create`
- `conflict_update`
- `foreshadowing_payoff`
- `style_note`
- `continuity_note`

在 `applyChangeSet()` 补齐对应落库逻辑，优先复用 `postprocess-suggestion.service.ts` 中已有的 `applyOneSuggestion()` 逻辑，避免两套规则分叉。

### Finding 3 [P1] 章后抽取 prompt 没有明确要求 relationshipUpdates / conflictUpdates

位置：

- `apps/api/src/services/chapter-postprocess.service.ts:147-172`
- `apps/api/src/services/chapter-postprocess.service.ts:414-459`

问题：

后续代码已经处理：

```ts
parsed.conflictUpdates
parsed.relationshipUpdates
```

但 `extractChapterChanges()` 的 JSON schema 中没有明确声明这两个字段。AI 可能不会稳定返回这些结构。

影响：

- 自动生成正文后，人物关系和矛盾变化很容易只落在自然语言字段里。
- 下次写作时，人物关系网和矛盾矩阵可能没有及时更新，导致自动续写上下文不完整。

修复建议：

在 prompt JSON schema 中补充：

```json
"relationshipUpdates": [
  {
    "characterAName": "角色A",
    "characterBName": "角色B",
    "type": "ally/enemy/lover/family/mentor/rival/acquaintance",
    "strength": 1,
    "status": "当前关系状态",
    "description": "关系变化依据",
    "confidence": 80
  }
],
"conflictUpdates": [
  {
    "title": "冲突标题",
    "newStatus": "active/escalated/stalemate/resolved/abandoned",
    "newIntensity": 1,
    "reason": "正文依据",
    "confidence": 80
  }
]
```

并要求 AI：如果无法匹配已有角色或冲突，返回 `newCharacters` / `newConflicts`，不要把新对象混入 update。

### Finding 4 [P1] 自动续写范围只按草稿字数筛选，不能识别“继续写后续章节”

位置：

- `apps/api/src/services/autonomous-writing.service.ts:112-130`

问题：

`project` 和 `next_n_chapters` 模式只选择：

```text
draft 为空，或 draft 字数小于 100 的章节
```

影响：

- 如果用户已经写完第 1 章，想让系统从第 2 章继续自动写，必须保证后续章节已建好且正文为空。
- 如果章节已有短草稿但状态不是 completed，系统只按字数判断，不理解“续写/补写/重写”的真实目标。
- 如果需要从当前章节继续写到后续章节，缺少“从当前章节之后开始”的明确策略。

修复建议：

新增自动写作范围策略：

1. `from_current_forward`
   - 从当前章节之后开始。
   - 自动跳过 `status=completed` 且正文达标的章节。

2. `continue_incomplete`
   - 选择 `status !== completed` 或正文低于目标字数的章节。

3. `rewrite_selected`
   - 明确重写指定章节，必须创建写入前快照。

同时在 UI 中明确展示：

- 将要写哪些章节。
- 哪些章节会跳过。
- 哪些章节会重写。

### Finding 5 [P2] 自动驾驶时间线可观察性不足

位置：

- `apps/web/src/features/autonomous-writing/components/AutonomousRunTimeline.vue:59-86`

问题：

时间线目前主要展示：

- 章节 ID
- writing job ID
- 状态

缺少：

- 章节标题 / 章节号。
- 当前步骤。
- 是否已写入正文。
- 已应用结构化变更数量。
- 是否生成章节记忆。
- 下一章是否已继承上下文。

影响：

用户看到“完成”但无法判断到底是否自动写作、是否回写、是否进入下一章。

修复建议：

后端 `getAutonomousRun()` 返回 jobs 时 join chapters / writing_job_steps / change_sets，前端展示：

```text
第 N 章：标题
当前步骤：生成正文 / 应用变更集 / 更新健康指标
正文：已写入 3200 字
结构回写：角色 1 / 关系 2 / 事实 5 / 伏笔 1
健康：低风险 / 中风险 / 高风险
```

### Finding 6 [P2] 项目健康页能发现问题，但还没有作为自动驾驶的硬门禁

位置：

- `apps/api/src/services/writing-job.service.ts:607-657`
- `apps/api/src/services/health-metrics.service.ts:123-263`

问题：

`update_health` 会生成健康报告，但写作任务不会根据健康风险反向决定是否暂停、修复或继续。

影响：

- 项目健康页能发现偏题、关系断裂、伏笔遗忘等风险。
- 但自动驾驶可能继续写下一章，导致风险累积。

修复建议：

新增 `review_health` 或增强 `update_health`：

- 高风险：自动 run 进入 `needs_attention`。
- 中风险：平衡/快速策略可继续，但记录异常或修复建议。
- 低风险：继续下一章。

## 当前闭环矩阵

| 能力 | 当前状态 | 说明 |
| --- | --- | --- |
| 自动启动写作 | 已实现 | `autonomous-runs` 可创建并启动 run |
| 自动逐章推进 | 部分实现 | 可逐章创建 job，但范围策略偏粗 |
| 自动构建上下文 | 已实现 | 上下文包含设定、角色、关系、矛盾、伏笔、事实、记忆、知识库 |
| 自动生成正文 | 已实现 | `generate_draft` 调用 AI JSON |
| 自动一致性检查 | 已实现 | 通过 `build_change_set` 内部执行 guard |
| 自动修复 | 部分实现 | 中风险可进入 `auto_repair`，但策略来源还较弱 |
| 自动写回正文 | 已实现 | `apply_change_set` 写入 chapter draft 或 scene content |
| 自动抽取事实 | 部分实现 | 变更集支持 fact_create |
| 自动抽取角色 | 部分实现 | 支持 character_create，但风险高时会暂停 |
| 自动关联人物关系 | 不完整 | suggestion 服务支持，变更集链路未覆盖 |
| 自动更新矛盾矩阵 | 不完整 | suggestion 服务支持，变更集链路未覆盖 |
| 自动登记伏笔 | 部分实现 | 支持新增伏笔，不完整支持回收 |
| 自动生成章节记忆 | 已实现 | 变更集和章后管线都可写 chapter_memory |
| 自动进入下一章上下文 | 部分实现 | 上下文读取前序记忆，但需要确认上一章结构回写完整 |
| 自动健康检查 | 已实现 | 但未作为自动驾驶硬门禁 |
| 全自动长篇闭环 | 未完成 | 仍需补齐全局回写和健康门禁 |

## 下一步修改顺序

### 阶段 1：补齐变更集全局回写

目标：

让 `build_change_set -> review_change_set -> apply_change_set` 真正覆盖正文、角色、关系、矛盾、伏笔、事实、章节记忆。

修改点：

- `apps/api/src/services/chapter-change-set.service.ts`
- `apps/api/src/services/postprocess-suggestion.service.ts`
- `packages/shared/src/types/chapter-change-set.ts`

验收：

- AI 生成新关系后，应用变更集能更新 `character_relationships`。
- AI 推进矛盾后，应用变更集能更新 `conflicts` 和 `conflict_timeline_events`。
- AI 回收伏笔后，应用变更集能更新 `foreshadowing_items.status = paid_off`。

### 阶段 2：把章后管线接回自动任务序列

目标：

应用变更集后，再跑章后分析和自动建议应用，作为第二层结构化兜底。

修改点：

- `apps/api/src/services/writing-job.service.ts`
- `apps/api/src/services/writing-job-auto-approval.service.ts`

验收：

- 自动任务完成后存在 `chapter_postprocess_runs`。
- 低风险建议自动应用，高风险建议进入异常队列。

### 阶段 3：改造自动续写范围策略

目标：

从“只找空正文”升级为“理解章节状态、目标字数、当前章节位置和重写意图”。

修改点：

- `packages/shared/src/types/autonomous-writing.ts`
- `apps/api/src/services/autonomous-writing.service.ts`
- `apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue`

验收：

- 可从当前章节向后自动续写。
- 可跳过已完成章节。
- 重写章节必须有明确提示和写入前快照。

### 阶段 4：健康报告成为自动驾驶门禁

目标：

自动写作不是盲目继续，而是在章节完成后根据项目健康风险决定继续、修复、暂停。

修改点：

- `apps/api/src/services/writing-job.service.ts`
- `apps/api/src/services/health-metrics.service.ts`
- `apps/api/src/services/autonomous-writing.service.ts`

验收：

- 高风险健康报告会让 run 进入 `needs_attention`。
- 中风险在平衡策略下记录异常但可继续。
- 快速策略跳过或继续时必须记录 ignored exception。

### 阶段 5：增强自动驾驶 UI 可观察性

目标：

用户能看懂系统是否真的自动写作、是否回写、是否续写。

修改点：

- `apps/api/src/services/autonomous-writing.service.ts`
- `apps/web/src/features/autonomous-writing/components/AutonomousRunTimeline.vue`
- `apps/web/src/features/autonomous-writing/components/AutonomousExceptionQueue.vue`

验收：

- 每章显示标题、步骤、字数、变更集数量、结构回写数量和健康状态。
- 异常能跳转到对应章节、变更集或建议确认页。

## 推荐验收脚本

完成下一轮修改后，至少运行：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm db:migrate
```

建议新增自动化服务测试：

```text
apps/api/src/services/__tests__/autonomous-writing-flow.test.ts
```

覆盖场景：

1. 自动 run 写完 2 章后状态变为 completed。
2. 第 1 章生成的章节记忆进入第 2 章上下文。
3. 低风险变更集自动应用。
4. 高风险关系/角色变更进入 needs_attention。
5. 快速策略跳过失败章节后仍能完成 run。

