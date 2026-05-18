# 全自动写作总流程校正文档（2026-05-18）

## 1. 本文目标

本轮先不处理格式、lint、测试、类型细节，只检查并校正“全自动写作总流程”是否成立。

目标不是让代码马上看起来干净，而是先保证系统主链路正确：

```text
启动自动写作
-> 选择下一章 / 下一场景
-> 构建上下文
-> 生成大纲 / 场景 / 正文
-> 一致性检查
-> 自动修复或隔离
-> 自动写回正文
-> 章后分析
-> 结构化抽取进入确认 / 自动分级应用
-> 更新记忆、事实、伏笔、人物、关系、矛盾、健康指标
-> 下一章继续
```

## 2. 当前总流程判断

当前项目已经有自动化骨架，但总流程还没有完全闭合。

已具备的部分：

- 自动驾驶 Run。
- 写作 Job。
- Step 序列。
- 上下文构建。
- AI 生成大纲 / 正文。
- 变更集。
- 一致性检查。
- 自动修复。
- 隔离状态。
- 章后处理。
- 健康指标。

仍不正确的地方：

- 自动驾驶 Run 仍可能进入 `waiting_review` / `needs_attention`。
- 写作任务仍保留 `approveStep` / `rejectStep` 这种人工推进入口。
- “确认继续 / 驳回”仍可能作为主产品交互出现。
- 高风险章节应该自动修复、隔离或跳过，而不是让全书任务停住。
- 章后建议需要明确自动分级策略，否则仍像半自动确认区。
- 下一章上下文必须明确读取上一章的结构化结果，否则只是“逐章生成”，不是“连续写作”。

因此，当前应视为：

> 自动化能力已具备，但流程控制仍混入半自动旧逻辑。

## 3. 正确的全自动主流程

### 3.1 Run 层流程

Run 是全书或多章节级别的自动驾驶任务。

正确状态流：

```text
idle
-> running
-> completed
```

异常状态：

```text
running
-> failed
```

允许存在章节级隔离，但不应该让整个 Run 进入人工等待。

推荐 Run 状态：

- `idle`：尚未启动。
- `running`：正在自动写作。
- `paused`：用户主动暂停，不是系统等待人工确认。
- `completed`：任务完成。
- `failed`：系统级失败，无法继续。
- `completed_with_isolations`：可选，表示整体完成但有章节被隔离。

不建议继续保留为主流程状态：

- `needs_attention`
- `waiting_review`

如果为了兼容旧数据暂时保留，也只能作为历史状态读取，不应在新流程写入。

### 3.2 Job 层流程

Job 是单章或单场景写作任务。

推荐状态：

- `idle`
- `running`
- `repairing`
- `isolated`
- `skipped`
- `completed`
- `failed`

禁止新流程写入：

- `waiting_review`

正确行为：

- 单章失败不应默认阻断全书。
- 可修复错误进入 `repairing`。
- 修复失败进入 `isolated`。
- 被隔离章节记录原因，并让 Run 继续下一章。
- 只有系统级错误才让 Run 失败。

### 3.3 Step 层流程

Step 不再表达“人工确认”，只表达“自动写作机器的内部步骤”。

推荐步骤序列：

#### outline_only

```text
prepare_context
-> generate_plan
-> validate_plan
-> auto_repair
-> update_health
-> done
```

#### draft_only

```text
prepare_context
-> generate_draft
-> build_change_set
-> evaluate_change_set
-> auto_repair
-> apply_change_set
-> postprocess
-> classify_suggestions
-> apply_suggestions
-> update_health
-> done
```

#### outline_then_draft

```text
prepare_context
-> generate_plan
-> validate_plan
-> generate_draft
-> build_change_set
-> evaluate_change_set
-> auto_repair
-> apply_change_set
-> postprocess
-> classify_suggestions
-> apply_suggestions
-> update_health
-> done
```

#### scene_draft

```text
prepare_context
-> generate_scene_draft
-> validate_plan
-> generate_draft
-> build_change_set
-> evaluate_change_set
-> auto_repair
-> apply_change_set
-> postprocess
-> classify_suggestions
-> apply_suggestions
-> update_health
-> done
```

不应再作为主流程 Step：

- `confirm_plan`
- `confirm_apply`
- `confirm_suggestions`
- `review_change_set`

## 4. 决策规则

全自动流程必须有统一决策器，不允许每个模块自己决定是否暂停。

统一输出：

- `continue`：继续下一步。
- `repair`：进入自动修复。
- `isolate`：隔离当前章节 / 场景，Run 继续。
- `skip`：跳过当前章节 / 场景，Run 继续。
- `stop_run`：停止整个 Run。

### 4.1 风险等级处理

#### none / low

直接继续。

#### medium

根据策略：

- safe：自动修复。
- balanced：可继续或轻量修复。
- fast：继续。

#### high

根据策略：

- safe：自动修复，失败隔离。
- balanced：自动修复，失败隔离。
- fast：隔离或跳过，不应直接污染正文。

#### critical

任何策略都必须 `stop_run`。

critical 不能因为 fast 策略而继续。

## 5. 自动修复流程

当一致性检查、变更集评估或结构化抽取发现风险时：

```text
发现风险
-> decideNextAction
-> repair
-> auto_repair
-> 重新生成或修补 draft / change set
-> 重新 evaluate_change_set
-> 通过则 apply_change_set
-> 仍失败则 isolate
```

要求：

- 修复必须最多有次数限制，避免死循环。
- 修复失败必须写入隔离报告。
- 隔离后 Run 继续下一章。
- 不允许回退到人工确认。

## 6. 自动写回流程

正文写回必须走变更集，不建议直接覆盖。

正确流程：

```text
generate_draft
-> build_change_set
-> evaluate_change_set
-> apply_change_set
-> chapters.draft / chapter_scenes.content 更新
-> save_version
```

如果当前系统已经取消 `save_version` 独立 step，也必须确保 `apply_change_set` 或后续步骤负责保存版本快照。

关键要求：

- AI 草稿不能只存在 step output。
- 自动通过后必须真实写回章节正文或场景正文。
- 写回前必须有变更集或等价的审计记录。
- 写回后必须有版本快照。

## 7. 章后分析与结构化回写流程

章后处理不是简单生成摘要，而是自动抽取可用于下一章的结构化信息。

正确流程：

```text
postprocess
-> 抽取 chapter_memory
-> 抽取 facts
-> 抽取 foreshadowing
-> 抽取 character_state_changes
-> 抽取 relationship_changes
-> 抽取 conflict_changes
-> 抽取 style_notes / continuity_notes
-> classify_suggestions
-> apply_suggestions
```

### 7.1 建议分级

建议不再等用户逐条确认，而是自动分级：

- `safe_auto_apply`：低风险，自动应用。
- `needs_repair`：可修复，进入自动修复。
- `isolate`：高风险，不应用，进入隔离池。
- `ignore`：无效或重复建议，记录后忽略。

### 7.2 自动应用范围

低风险建议可以自动写入：

- 章节记忆。
- 事实图谱。
- 伏笔台账。
- 人物状态。
- 人物关系。
- 矛盾矩阵。
- 章节元素。
- 健康指标输入。

高风险建议不得污染数据库主表，只能进入隔离建议池。

## 8. 下一章上下文闭环

全自动写作最重要的不是生成一章，而是保证下一章读取上一章的结果。

下一章 `prepare_context` 必须包含：

- 项目基础设定。
- 故事设定集。
- 当前章节大纲。
- 当前场景目标。
- 上一章记忆。
- 最近 3 章摘要。
- 本章必须出场人物。
- 人物目标、恐惧、秘密、欲望、弱点、成长弧。
- 人物关系变化。
- 当前矛盾状态。
- 未回收伏笔。
- 已确认事实图谱。
- 最近健康报告。
- 写作人格。
- 知识库摘要与技巧，不直接塞参考原文。

如果这些没有进入 prompt，就不算完整自动写作，只是批量调用 AI。

## 9. 当前应优先校正的流程问题

### P1. Run 不应再写入 `needs_attention`

当前问题：

自动驾驶在失败或等待审查时仍会把 Run 置为 `needs_attention`。

应改为：

- 可继续：隔离当前 Job，Run 继续。
- 不可继续：Run `failed`。
- 用户主动暂停：Run `paused`。

### P1. Job 不应再写入 `waiting_review`

当前问题：

Job 在某些分支仍可能写入 `waiting_review`。

应改为：

- `repairing`
- `isolated`
- `failed`

### P1. `resolveAutonomousException` 不应调用 `approveStep`

当前问题：

异常解决时仍走“审批某个步骤”的老路径。

应改为：

- 如果异常可自动恢复，重新运行该 Job。
- 如果异常被忽略，标记对应 Job 为 `skipped`，Run 继续。
- 如果异常被人工覆盖，记录 override audit，然后重新进入自动执行，而不是批准旧步骤。

### P1. 前端不应出现确认动作

当前问题：

任务时间线仍保留“确认继续 / 驳回”。

应改为：

- “查看决策报告”
- “查看修复记录”
- “重新运行”
- “跳过本章”
- “停止任务”

确认 / 驳回只允许在调试页或管理员工具里出现。

### P1. `reviewRequired` 应停止写入

当前问题：

即使步骤已经改名，`reviewRequired` 仍然把自动决策结果表达成“需要审查”。

应改为：

- `decisionAction`
- `decisionReason`
- `riskLevel`
- `isolationReason`

## 10. 不处理格式和测试时的流程验收标准

本轮只看流程，不看格式和测试时，至少要满足：

```bash
rg -n "waiting_review|needs_attention|approveStep|rejectStep|确认继续|驳回|人工确认|reviewRequired" apps/api/src apps/web/src packages/shared/src
```

允许命中：

- 历史迁移脚本。
- 明确标记为 debug/admin override 的代码。
- 文档。

不允许命中：

- 自动驾驶 Run 主流程。
- 写作 Job 主流程。
- 普通产品 UI。
- shared 主合同。

## 11. 建议的下一轮代码修改顺序

### 第一步：清理 Run 阻塞状态

- 删除 `handleAutonomousJobCompletion` 中 `waiting_review` 分支。
- failed 分支不要把 Run 写成 `needs_attention`。
- 单章失败默认隔离或跳过，除非是 critical。

### 第二步：清理 Job 人工状态

- `runNextSteps` 不再写入 `waiting_review`。
- manual execution mode 如果还要保留，迁移到 debug job，不进入自动驾驶 Run。
- `approveStep/rejectStep` 从主服务中移出。

### 第三步：清理前端确认 UI

- 普通任务面板删除确认 / 驳回。
- 自动驾驶详情页只读展示决策。
- 异常处理区改成“重跑 / 跳过 / 停止”。

### 第四步：改 shared contract

- 删除 `waiting_review`。
- 删除 `needs_attention`。
- 删除 `reviewRequired`。
- 删除 `autoApprovalLevel`。
- 使用 `strategy` / `riskPolicy` / `decisionAction`。

### 第五步：确认上下文闭环

- 检查 `prepare_context` 是否读取章后结构化结果。
- 检查 `apply_suggestions` 是否真实更新角色、关系、矛盾、伏笔、事实。
- 检查下一章 prompt 是否包含这些更新。

## 12. 完成定义

当以下条件全部满足，才能称为“总流程正确”：

- 自动驾驶启动后不需要点击确认。
- 单章高风险不会污染正文。
- 单章失败不会默认阻断全书。
- 修复失败会隔离，Run 继续。
- critical 会停止整轮 Run。
- 正文会真实写回章节 / 场景。
- 章后结构化结果会进入下一章上下文。
- 前端只展示自动决策和异常处理，不展示逐步确认。

