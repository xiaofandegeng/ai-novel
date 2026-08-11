# 全产品事件溯源重构设计

日期：2026-08-11  
状态：已确认，等待实施计划  
目标分支：`codex/event-sourced-rebuild`

## 1. 背景

当前系统使用 Hono、Drizzle 和 PostgreSQL 直接修改项目、章节、人物、叙事台账和自动写作任务表。虽然 API、前端目录和基础测试已经整理，但自动写作主链仍存在以下系统性问题：

- 新项目没有可达的章节初始化链路。
- 暂停或终止运行不能可靠撤销当前任务的写回授权。
- 变更集的“批准”和“应用”语义分离，前端可能显示假成功。
- 变更集和章后建议可以绕过当前运行策略或处理历史遗留数据。
- 自动运行、任务、步骤、异常、正文写回和后处理之间缺少统一事实来源。
- 项目设置、章节、人物和叙事领域仍通过可变业务表保存当前状态，无法统一回放、追踪和审计。

本设计把整个产品数据层迁移到事件溯源架构。用户明确接受清空现有数据库后直接切换，不保留旧业务数据，不实施双写或历史数据转换。

## 2. 已确认决策

1. 事件溯源覆盖整个产品数据层，而不只覆盖自动写作模块。
2. 项目设置、故事结构、章节、场景、人物、关系、冲突、伏笔、自动写作和章后处理全部通过领域事件表达。
3. 使用单一 PostgreSQL Event Store、CQRS 投影和 Transactional Outbox，不引入 Kafka 或其他外部消息平台。
4. 现有业务表重建为读模型，任何业务写入只能由 Projector 执行。
5. 现有数据库数据允许清空，最终切换采用一次性 schema 重建。
6. 新项目在驾驶舱输入目标章节数后，系统自动创建占位章节并启动自动写作。
7. 现有主要 HTTP 路径和前端三个路由入口尽量保持不变。

## 3. 目标

- 为所有产品写操作建立不可变、可排序、可回放的事实记录。
- 让暂停、终止、审批、应用、重试和隔离成为可验证的状态迁移。
- 保证 AI 只有在明确运行授权内才能产生可写回的领域事件。
- 让项目、章节、人物、叙事状态和驾驶舱都能从事件完整重建。
- 用职责单一的聚合、命令处理器、Projector 和 Process Manager 取代超大 Service。
- 为事件顺序、幂等、并发、回放、投影一致性和完整用户链路建立自动化测试。

## 4. 非目标

- 不恢复旧式故事圣经、人物、大纲或章节 CRUD 独立页面。
- 不引入 Kafka、RabbitMQ、云事件总线或微服务拆分。
- 不保留或转换现有数据库业务数据。
- 不改变产品为多用户协作系统。
- 不把 API Key、访问令牌或其他秘密明文写入事件。
- 不在本次重构中重新设计 AI Prompt 内容和生成算法。

## 5. 总体架构

```text
HTTP Command
  → Command Bus
  → Command Handler
  → Aggregate Repository
  → Load Snapshot + Events
  → Validate Command
  → Append Event Batch
  → Apply Critical Projections
  → Save Command Receipt + Outbox
  → Commit PostgreSQL Transaction

Outbox Worker
  → Process Manager / AI Worker
  → Submit Result Command
  → Append Result Events
  → Update Projections

HTTP Query
  → Query Service
  → Read Projection Tables
```

Event Store 是唯一业务事实来源。投影表、快照、搜索索引和驾驶舱统计均可删除并从事件重建。

## 6. Event Store

### 6.1 核心表

#### `aggregate_streams`

保存聚合流头部，用于乐观并发控制：

- `aggregate_type`
- `aggregate_id`
- `project_id`
- `current_version`
- `created_at`
- `updated_at`

唯一键为 `(aggregate_type, aggregate_id)`。

#### `domain_events`

- `global_position BIGSERIAL PRIMARY KEY`
- `event_id TEXT UNIQUE NOT NULL`
- `aggregate_type TEXT NOT NULL`
- `aggregate_id TEXT NOT NULL`
- `aggregate_version INTEGER NOT NULL`
- `project_id TEXT`
- `event_type TEXT NOT NULL`
- `schema_version INTEGER NOT NULL`
- `payload JSONB NOT NULL`
- `metadata JSONB NOT NULL`
- `command_id TEXT NOT NULL`
- `event_index INTEGER NOT NULL`
- `correlation_id TEXT NOT NULL`
- `causation_id TEXT`
- `occurred_at TIMESTAMPTZ NOT NULL`

唯一约束：

- `event_id`
- `(aggregate_type, aggregate_id, aggregate_version)`
- `(command_id, event_index)`

数据库 migration 为 `domain_events` 安装禁止 `UPDATE` 和 `DELETE` 的触发器。只有明确的开发数据库重建可以删除整个 schema。

#### `aggregate_snapshots`

- `aggregate_type`
- `aggregate_id`
- `aggregate_version`
- `state`
- `schema_version`
- `created_at`

同一聚合每累计约 100 个事件生成一次快照。快照不是事实来源，可以删除重建。

#### `command_receipts`

- `command_id`
- `command_type`
- `aggregate_type`
- `aggregate_id`
- `status`
- `result`
- `error_code`
- `created_at`
- `finished_at`

重复提交同一 `command_id` 时返回第一次执行结果，不重复追加事件或触发副作用。

#### `projection_checkpoints`

- `projection_name`
- `last_global_position`
- `status`
- `last_error`
- `updated_at`

#### `event_outbox`

- `id`
- `event_id`
- `handler_name`
- `status`
- `attempt_count`
- `available_at`
- `lease_owner`
- `lease_expires_at`
- `last_error`
- `created_at`
- `completed_at`

Worker 通过租约和 `FOR UPDATE SKIP LOCKED` 领取任务。重复投递必须由命令幂等和外部请求 ID 去重。

### 6.2 追加算法

一个 Command 可以原子追加多个聚合流的事件。Event Store 按聚合键排序并锁定 `aggregate_streams`：

1. 检查每个流的 `expectedVersion`。
2. 任一版本不匹配时抛出并发冲突，整个事务不追加事件。
3. 为每个流分配连续 `aggregateVersion`。
4. 按事件批次顺序写入 `domain_events`。
5. 更新流头、命令回执、同步投影和 Outbox。
6. 任一步失败时回滚全部变更。

### 6.3 事件版本

每个事件 payload 都有 `schemaVersion`。历史事件禁止修改；事件结构演进使用逐版本 Upcaster，在聚合加载和投影回放前转换成当前内存结构。

## 7. 安全与删除

### 7.1 项目内容

章节正文、故事设定和其他用户内容使用每项目数据密钥进行信封加密。事件 payload 保存密文包装，不在 metadata 中保存正文。

`ProjectDeleted` 完成后：

1. 删除项目投影、索引和凭据。
2. 销毁项目数据密钥。
3. 保留不含正文的事件结构和审计 metadata。
4. 已加密的历史内容因密钥销毁而不可恢复。

这同时满足事件事实不可修改和用户内容实际不可恢复的要求。

### 7.2 AI 凭据

API Key 存入独立加密凭据库。领域事件只保存 `credentialRef`、Provider、模型和脱敏尾号。凭据库属于安全基础设施，不作为产品读模型回放。

### 7.3 项目归属

- 每条项目领域事件 metadata 必须包含 `projectId`。
- Command Handler 在产生事件前校验聚合与项目归属。
- Query Service 始终使用 `projectId` 过滤。
- 跨项目资源 ID 不得返回资源是否存在的信息。

## 8. 聚合与领域事件

### 8.1 Project

负责项目生命周期和基础信息。

- `ProjectCreated`
- `ProjectDetailsChanged`
- `ProjectDeletionRequested`
- `ProjectDeleted`

### 8.2 ProjectSettings

负责写作参数、模型选择、提示词和凭据引用。

- `ProjectSettingsChanged`
- `PromptTemplateSelected`
- `AIProviderSelected`
- `CredentialReferenceChanged`

### 8.3 StoryStructure

负责故事圣经、卷、幕和结构模板。

- `StoryBibleChanged`
- `VolumeCreated`
- `VolumeChanged`
- `ActCreated`
- `ActChanged`
- `StructureTemplateApplied`

### 8.4 Chapter

每个章节是独立聚合，负责大纲、正文、场景和完成状态。

- `ChapterCreated`
- `ChapterRenamed`
- `OutlineGenerated`
- `OutlineChanged`
- `ScenePlanned`
- `SceneContentApplied`
- `DraftGenerated`
- `ChapterContentApplied`
- `ChapterCompleted`

版本历史由 Chapter 事件投影产生，不接受直接版本写入。

### 8.5 Character

- `CharacterCreated`
- `CharacterChanged`
- `CharacterStateAdvanced`
- `CharacterArcChanged`

### 8.6 Relationship

- `RelationshipCreated`
- `RelationshipChanged`

### 8.7 Conflict

- `ConflictCreated`
- `ConflictEscalated`
- `ConflictChanged`
- `ConflictResolved`

### 8.8 Foreshadowing

- `ForeshadowingCreated`
- `ForeshadowingProgressed`
- `ForeshadowingPaidOff`
- `ForeshadowingAbandoned`

### 8.9 AutonomousRun

- `RunPrepared`
- `RunStarted`
- `RunPauseRequested`
- `RunPaused`
- `RunResumed`
- `RunAbandonRequested`
- `RunAbandoned`
- `RunCompleted`
- `RunFailed`

合法状态：

```text
idle → running
running → pausing → paused
paused → running
running|pausing|paused → abandoning → abandoned
running → completed|failed
```

`completed`、`failed` 和 `abandoned` 都是终态，不允许重新启动。

### 8.10 WritingJob

- `JobQueued`
- `JobStarted`
- `StepStarted`
- `StepSucceeded`
- `StepFailed`
- `StepSkipped`
- `JobCompleted`
- `JobFailed`
- `JobIsolated`
- `LateResultDiscarded`

### 8.11 ChangeSet

- `ChangeSetDrafted`
- `ChangeSetEvaluated`
- `ChangeSetItemApproved`
- `ChangeSetItemRejected`
- `ChangeSetApplyRequested`
- `ChangeSetItemApplied`
- `ChangeSetApplied`
- `ChangeSetApplyFailed`
- `ChangeSetIsolated`

`ApplyChangeSet` 只能把已批准条目转换为对应领域事件。正文条目未批准时绝不产生 `ChapterContentApplied`。

### 8.12 PostprocessRun

- `PostprocessRequested`
- `SuggestionGenerated`
- `SuggestionAccepted`
- `SuggestionRejected`
- `SuggestionApplied`
- `SuggestionApplyFailed`
- `PostprocessCompleted`
- `PostprocessFailed`

### 8.13 RunException

- `ExceptionOpened`
- `ExceptionRetryRequested`
- `ExceptionResolved`
- `ExceptionIgnored`
- `ChapterSkipped`
- `ChapterIsolated`
- `RunStopRequested`

## 9. 新项目初始化

驾驶舱启动表单要求用户填写策略、推进章节数和每章目标字数。

`InitializeAutonomousWriting` 在一个事件批次内：

1. 读取项目和现有未完成章节。
2. 复用现有符合条件的章节。
3. 不足目标数量时，为缺少数量创建 `ChapterCreated` 事件。
4. 为 Run 聚合产生 `RunPrepared`。
5. 为每个章节的 Job 聚合产生 `JobQueued`。
6. `RunPrepared.targetChapterCount` 等于实际 Job 数量。

批次要么全部追加，要么全部失败，不允许出现只有章节、没有 Run 或只有 Run、没有 Job 的中间状态。

## 10. 自动写作 Process Manager

```text
RunStarted
  → JobStarted
  → StepStarted(prepare_context)
  → StepSucceeded
  → generate_plan
  → validate_plan
  → generate_draft
  → ChangeSetDrafted
  → ChangeSetEvaluated
      ├─ low: ChangeSetItemApproved → ChangeSetApplyRequested
      ├─ medium: RepairRequested → ChangeSetReevaluated
      └─ high: ChangeSetIsolated + ExceptionOpened
  → Approved domain events
  → ChangeSetApplied
  → PostprocessRequested
  → PostprocessCompleted
  → health projection update
  → JobCompleted
  → next JobStarted / RunCompleted
```

所有 AI 调用由 Outbox 触发。请求发出前和结果提交时都检查 Run 授权版本。

- `RunPauseRequested` 后不再启动新步骤。
- 当前 AI 请求完成后，结果可以记录，但暂停确认前不产生下一步或写回事件。
- `RunAbandonRequested` 立即撤销写回授权。
- 终止后的 AI 返回只产生 `LateResultDiscarded`。
- Process Manager 不直接写投影表，只提交下一个 Command。

## 11. ChangeSet 审批与应用

前端“采纳”动作改名为“采纳并应用”。完整链路：

```text
ApproveChangeSetItem
  → ChangeSetItemApproved
  → ChangeSetApplyRequested
  → ChapterContentApplied / CharacterCreated / RelationshipChanged / ...
  → ChangeSetItemApplied
  → ChangeSetApplied（全部可应用条目结束后）
```

规则：

- 只有 `approved` 条目可以转换为领域事件。
- `rejected`、`isolated`、`blocked` 或 `apply_failed` 条目不能写业务投影。
- 单个条目失败时记录 `ChangeSetApplyFailed` 和 `ExceptionOpened`，不能显示成功。
- 自动批准和人工批准使用同一 Apply Command，不维护第二套写回实现。
- 前端只在查询到 `ChangeSetItemApplied` 投影后显示“已应用”。

## 12. 章后处理策略

建议查询必须同时限定 `projectId`、`chapterId`、`autonomousRunId` 和 `postprocessRunId`。

| 策略 | 自动应用规则 |
| --- | --- |
| safe | 仅置信度不低于 90 的低风险记忆和章节元素 |
| balanced | 置信度不低于 80 的低风险内容 |
| fast | 置信度不低于 70 的低风险和中风险内容 |

所有策略下，人物删除、正文覆盖、跨章节冲突、高风险结构变化和无法定位的变更都不能直接自动应用。

## 13. 投影

### 13.1 同步关键投影

随 Command 事务同步更新，为写接口提供 read-your-write：

- 项目和项目设置
- 故事结构、章节、场景和正文
- 人物、关系、冲突和伏笔
- Run、Job、Step、ChangeSet 和 Exception 当前状态

同步 Projector 失败时整个事务回滚。

### 13.2 异步派生投影

- 驾驶舱聚合统计
- 健康指标
- 搜索和知识索引
- AI 用量统计
- 跨章节趋势

异步 Projector 使用 `projection_checkpoints` 保证顺序消费。失败时重试并记录 `ProjectionFailed` 系统事件；驾驶舱显示“状态同步中”及最近同步位置。

### 13.3 回放

提供可维护的回放命令：

```text
projection replay --all
projection replay --name <projection>
projection replay --project <projectId>
```

回放先清空目标投影，再按 `global_position` 处理事件。Projector 必须确定性且幂等。

## 14. API 和模块边界

保留现有主要 HTTP 路径。写接口生成 Command，读接口查询 Projection。

```text
apps/api/src/
├── eventing/
│   ├── event-store.ts
│   ├── command-bus.ts
│   ├── aggregate-repository.ts
│   ├── event-registry.ts
│   ├── projection-runner.ts
│   ├── outbox-worker.ts
│   └── replay.ts
├── modules/<domain>/
│   ├── *.aggregate.ts
│   ├── *.commands.ts
│   ├── *.events.ts
│   ├── *.projector.ts
│   ├── *.queries.ts
│   └── *.routes.ts
└── db/schema/
    ├── eventing.ts
    └── projections/
```

职责约束：

- Aggregate 是纯状态和业务规则，不访问数据库或网络。
- Command Handler 加载聚合、调用聚合规则并返回事件。
- Projector 是业务投影表唯一写入者。
- Query Service 只读投影。
- Route 只转换 HTTP 协议并调用 Command Bus 或 Query Service。
- Eventing 基础设施不导入小说领域模块。

## 15. 前端体验

### 15.1 运行控制

驾驶舱显示：

- `idle`
- `running`
- `pausing`
- `paused`
- `abandoning`
- `abandoned`
- `completed`
- `failed`

暂停和终止必须显示处理中状态，只有投影确认对应事件后才显示最终状态。

### 15.2 异常中心

每条异常展示 Run、章节、步骤、ChangeSet、原因和内容影响，并提供：

- 重试当前步骤
- 跳过章节
- 隔离章节
- 终止本轮

所有操作提交 Command 并产生解决事件。

### 15.3 页面状态

- 项目列表、设置和驾驶舱覆盖 loading、empty 和 error。
- Store 不吞异常。
- 危险操作使用设计系统确认组件。
- 1440px 使用双栏，1024px 收窄，390px 使用单栏和全屏抽屉。
- 不增加旧式独立 CRUD 页面。

## 16. 实施分期

代码增量实现，最终数据一次性切换：

1. Event Store、Command Bus、快照、Projector、Outbox 和回放基础设施。
2. 项目、项目设置、凭据引用和提示词领域。
3. 故事结构、章节、场景、正文和版本领域。
4. 人物、关系、冲突、伏笔、事实和知识领域。
5. Run、Job、Step、ChangeSet、Postprocess、Exception 和健康流程。
6. 前端初始化、控制状态、异常中心、审批反馈和响应式。
7. 删除所有旧直接写入口，清空开发数据库，执行新 migration 和 seed。

不实施旧表与事件库双写。每个阶段保持仓库可构建、可测试，最终切换前旧功能仍由尚未迁移的领域实现提供。

## 17. 数据库切换

清库前必须解析并打印准确数据库名：

- 只允许明确的开发数据库。
- 测试数据库必须以 `_test` 结尾。
- 数据库名无法确认或包含生产标识时拒绝执行。

切换顺序：

```text
确认数据库目标
→ 清空旧 schema
→ 执行新 migrations
→ 执行 seed
→ 回放全部投影
→ 运行 API 集成测试
→ 运行浏览器端到端测试
→ pnpm check
→ pnpm test:coverage
```

用户已接受旧业务数据不可恢复。代码可以回退，数据不能恢复。

## 18. 测试策略

### 18.1 Eventing 核心

- 单流和多流事件顺序。
- 版本冲突。
- Command 幂等。
- 批量追加原子性。
- 快照加载。
- Upcaster 链。
- Outbox 租约、重试和重复投递。
- 投影 checkpoint 和回放。

### 18.2 每个领域

- Aggregate：Command 产生的事件和非法状态拒绝。
- Projector：事件到读模型。
- Query：项目归属和响应契约。
- HTTP：写接口提交 Command，读接口返回 Projection。

### 18.3 自动写作

- 正常逐章完成。
- AI 请求失败和重试。
- 暂停后不启动新步骤。
- 终止后迟到结果不写回。
- 正文条目被拒绝后正文保持不变。
- 高风险变更隔离。
- Postprocess 只处理当前 Run 的建议。
- 异常重试、跳过、隔离和停止。

### 18.4 回放一致性

执行完整链路后保存全部投影摘要，清空投影并从 `domain_events` 回放，回放后的规范化摘要必须完全相同。

### 18.5 浏览器端到端

使用确定性的 Fake AI Provider 验证：

```text
创建项目
→ 保存设置
→ 输入 3 章
→ 自动创建章节
→ 启动 Run
→ 生成大纲和正文
→ 变更集审核与应用
→ 章后记忆和健康更新
→ RunCompleted
→ 投影回放
→ 驾驶舱状态一致
```

检查 1440px、1024px 和 390px。

### 18.6 覆盖率门禁

- Eventing、Aggregate、Projector 和 Process Manager 的语句与分支覆盖率均不低于 90%。
- API 全局语句覆盖率不低于 80%。
- Web 全局语句覆盖率不低于 75%。
- 核心端到端测试必须通过，不能用覆盖率替代行为验证。

## 19. 架构测试

自动检查：

- Route 只能调用 Command Bus 或 Query Service。
- Aggregate 和 Command Handler 不得写投影表。
- 除 Event Store、Projector 和凭据库外，不得执行业务 `insert`、`update` 或 `delete`。
- 每个 Command、Event 和 Projector 必须在注册表登记。
- 每个事件声明 `schemaVersion`。
- 每个项目资源事件包含 `projectId`。
- AI Worker 不能直接写章节、人物或叙事投影。
- 前端写 API 必须使用共享 Command 响应契约。

## 20. 验收标准

只有全部满足以下条件才算完成：

1. 所有产品写接口都通过 Command 和 Event Store。
2. 业务投影表不存在非 Projector 写入口。
3. 新项目可以从驾驶舱自动创建章节并完成一次自动写作运行。
4. 暂停和终止能可靠关闭后续步骤与写回授权。
5. 所有正文和叙事写回来自已批准的 ChangeSet 条目事件。
6. Postprocess 遵循 Run 策略且按 Run 隔离。
7. 异常可以在驾驶舱重试、跳过、隔离或终止。
8. 清空投影后完整回放，结果与回放前一致。
9. 跨项目 Command 和 Query 均被拒绝。
10. API Key 不出现在事件、日志或导出中。
11. 前端在 1440px、1024px 和 390px 通过交互验收。
12. `pnpm check`、数据库验证、覆盖率门禁和核心端到端测试全部通过。

## 21. 风险与缓解

- **范围大**：按领域分期，每期必须具备独立测试和明确接口。
- **事件模型错误会长期保留**：事件注册表、schemaVersion、Upcaster 和设计审查先于领域迁移。
- **投影漂移**：建立回放一致性测试和 checkpoint 监控。
- **AI 副作用重复**：Outbox、commandId、externalRequestId 和结果命令共同去重。
- **终止竞态**：所有副作用结果提交和写回 Command 都验证 Run 授权版本。
- **删除与不可变历史冲突**：项目内容信封加密，通过销毁项目密钥实现不可恢复删除。
- **最终清库不可恢复**：严格限制目标数据库并在执行前显示准确名称。

## 22. 回滚

最终清库之前，代码可以切回旧实现。清库之后只支持：

1. 重新执行新 migration。
2. 从 Event Store 回放新投影。
3. 重新 seed 示例数据。

旧业务数据不保留，因此不存在数据层面的旧版本回滚。
