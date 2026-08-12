# 生产加固与新书规划流程设计

日期：2026-08-12  
状态：已确认，等待书面规格复核  
基线提交：`69f5a5c`

## 1. 背景

当前产品已经完成全产品事件溯源切换，具备项目、设置、故事结构、章节、人物、叙事状态和自动写作的 Command Bus、Event Store、Projection、Outbox 与重放链路。下一阶段不恢复旧式 CRUD 工作台，而是在现有驾驶舱内完成两项工作：

1. 补齐项目内容信封加密、密钥销毁删除、Worker 运行健康和真实 AI Provider 协议验收。
2. 建立“创意定位 → 世界观 → 人物群像 → 故事结构 → 章节规划 → 可选自动写作”的新书规划流程。

用户已确认可以再次清空本地开发数据库，不保留当前演示数据，也不编写明文历史事件转换程序。

## 2. 已确认决策

1. 新书规划同时支持“逐阶段确认”和“全自动推进”，由作者启动前选择。
2. 全自动模式遇到高风险或校验失败时必须停下等待作者，不能绕过安全边界。
3. “规划完成后自动开始正文”是独立勾选项，默认关闭。
4. 新书规划使用独立 `BookSetup` 聚合和 Process Manager，不扩张现有 `AutonomousRun` 状态机。
5. 前端使用专注式规划工作区：桌面端左侧阶段导航、右侧编辑与校验；移动端全屏单列。
6. 项目内容事件使用每项目数据密钥加密，删除项目时销毁密钥。
7. 自动测试不消费真实 AI 额度；真实 Provider 通过显式 `pnpm smoke:ai` 验收。
8. 开发期间使用窄测试完成 TDD，所有内容完成后再执行完整数据库、覆盖率和浏览器验收。
9. 持续维护开发记忆和交接文档，完成的临时实施计划最终删除。

## 3. 目标

- 活动项目的敏感领域事件 payload 在 PostgreSQL 中不以明文保存。
- 删除项目后，历史内容在保留事件审计结构的同时不可恢复。
- Worker 重启、租约过期和 AI 请求失败不会使流程永久卡住或重复写回。
- 作者可以从一个基础项目开始，完成可恢复、可暂停、可审查的新书规划。
- 逐阶段和全自动模式共享相同的事件、验证、应用和异常处理链路。
- 规划结果通过现有领域 Command 原子写入，所有投影仍可从事件重建。
- 规划完成后，正文写作必须获得独立授权并复用现有自动写作流程。
- 自动化测试覆盖安全、领域状态机、HTTP、重放、UI 和完整用户链路。

## 4. 非目标

- 不恢复故事圣经、人物、关系、冲突、伏笔或章节的独立 CRUD 页面。
- 不引入 Kafka、RabbitMQ、外部工作流引擎或微服务拆分。
- 不迁移当前明文开发事件；数据库采用清空重建。
- 不在本阶段实现多用户协作、角色权限、出版发行或计费。
- 不让默认测试访问真实 AI Provider 或消耗额度。
- 不把规划流程合并进 `AutonomousRun`，也不让规划授权隐式扩大为正文授权。
- 不实现在线主密钥轮换；数据结构保留 `keyVersion`，后续可增加轮换流程。

## 5. 总体架构

```text
Vue focused setup workspace
  → BookSetup HTTP command
  → Command Bus
  → BookSetup aggregate
  → Event Store + encrypted payload
  → synchronous setup projections + Outbox
  → BookSetup Process Manager
  → AI stage worker
  → structured stage candidate
  → validation + risk decision
  → author approval / automatic approval
  → atomic existing-domain commands
  → Project / StoryBible / Character / Structure / Chapter events
  → setup stage applied
  → next stage or setup completed
  → optional explicit AutonomousRun command
```

`BookSetup` 只拥有规划流程状态、候选修订、验证结果和授权。项目、人物、结构与章节的最终事实仍由现有领域聚合拥有，不能复制一套第二事实源。

## 6. 项目内容信封加密

### 6.1 密钥层级

新增安全基础设施表 `project_data_keys`：

- `project_id TEXT PRIMARY KEY`
- `wrapped_key JSONB`
- `key_version INTEGER NOT NULL`
- `algorithm TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `destroyed_at TIMESTAMPTZ`

每个项目创建一个随机 256 位数据密钥。数据密钥由环境变量 `PROJECT_CONTENT_MASTER_KEY` 提供的 256 位主密钥使用 AES-256-GCM 包装。AI 凭据继续使用独立的 `AI_CREDENTIAL_MASTER_KEY`，两个主密钥不得复用。

活动密钥的 `wrapped_key` 只保存密文、IV 和认证标签，不保存明文数据密钥。活动记录必须满足 `wrapped_key IS NOT NULL AND destroyed_at IS NULL`；销毁 tombstone 必须满足 `wrapped_key IS NULL AND destroyed_at IS NOT NULL`。内存中的明文密钥不得进入日志、事件 metadata、命令回执或导出。

### 6.2 事件 payload 格式

事件注册定义增加 payload 保护级别：

```ts
type EventPayloadProtection = 'none' | 'project-content'
```

包含项目标题、主题、设定、提示词、人物描述、关系描述、冲突、伏笔、章节大纲、场景、正文、知识内容或 AI 候选内容的事件必须使用 `project-content`。

受保护 payload 在 `domain_events.payload` 中保存为：

```ts
interface EncryptedEventPayload {
  encrypted: true
  algorithm: 'aes-256-gcm'
  keyVersion: 1
  iv: string
  ciphertext: string
  authTag: string
}
```

Base64 只用于编码二进制值，不提供安全性。加密使用以下稳定 AAD，防止密文被移动到另一个事件或项目：

```text
eventId | aggregateType | aggregateId | aggregateVersion |
projectId | eventType | schemaVersion
```

事件头部、顺序、类型、聚合标识、项目标识、schemaVersion、commandId、correlationId、causationId 和时间保持明文，以支持并发、幂等、审计和删除项目识别。非敏感生命周期事件可以使用 `none`，但 payload 不得包含用户内容。

`aggregate_snapshots.state` 和可能包含领域返回值的 `command_receipts.result` 使用同一项目密钥保护，不能成为事件 payload 之外的明文副本。Outbox 只保存事件引用和处理状态，不复制领域 payload。活动项目的业务投影为查询需要保留解密后的当前状态；数据库平台仍需启用磁盘与备份加密，项目删除事务必须清除这些投影。

### 6.3 加解密边界

Event Store 在事件注册校验之后、写入数据库之前加密；读取事件后先校验信封与 AAD、解密，再执行 Upcaster 和当前版本 payload 校验。Aggregate、Command Handler 和 Projector 只接触解密后的领域对象。

创建项目时，Event Store 的事务路径在处理首个 `ProjectCreated` 前创建项目数据密钥，再追加受保护事件。只有 `ProjectCreated` 可以触发缺失密钥创建，其他受保护事件遇到缺失或已销毁密钥必须失败。

`PROJECT_CONTENT_MASTER_KEY` 在开发与生产启动时为必填的 Base64 256 位密钥；测试启动器注入隔离测试密钥。值缺失、长度错误或与现有 `keyVersion` 不匹配时必须在接受请求前失败。

测试和开发日志只能报告事件 ID、类型和错误类别，不能输出解密后的 payload 或密钥材料。

### 6.4 项目删除与重放

删除项目使用以下原子顺序：

1. 追加不含用户内容的 `ProjectDeletionRequested` 与 `ProjectDeleted`。
2. 同步删除项目投影、知识索引、Embedding 与 AI 凭据。
3. 安全删除 `wrapped_key` 并写入 `destroyed_at` tombstone。
4. 提交事务后，历史受保护事件只剩不可解密密文。

删除安全处理器属于基础设施，不是普通业务 Projector；它在同一 Command Bus 事务内执行。失败时整个删除命令回滚。

全量重放先通过明文事件头部收集已 `ProjectDeleted` 的项目集合，再重放活动项目。已删除项目的全部内容事件被跳过且投影保持为空。针对已删除项目的聚合加载和命令直接返回统一的不存在响应，不尝试解密历史内容。

### 6.5 安全验收

- 数据库搜索已知标题、人物描述和章节正文时不得命中事件 payload、快照或命令回执。
- 修改 IV、密文、认证标签或 AAD 任一字段必须导致确定性的解密失败。
- A 项目的密文不能由 B 项目的数据密钥解密。
- 销毁数据密钥后不能加载项目内容，且全量投影重放仍能完成。
- 项目导出只包含作者可见内容，不包含密钥、密文信封、credentialRef 或凭据尾号以外的信息。

## 7. 新书规划领域

### 7.1 聚合与状态

`BookSetup` 聚合以 `setupId` 为聚合 ID，并绑定唯一 `projectId`。同一项目最多有一个非终态规划流程。

流程状态：

```text
draft
  → running
  → generating_stage
  → waiting_review
  → applying_stage
  → running
  → completed

draft|running|generating_stage|waiting_review|applying_stage
  → pausing → paused → running

非终态 → abandoning → abandoned
生成或应用失败 → failed（可通过 retry 恢复到原阶段）
```

规划模式：

- `guided`：每个阶段生成后进入 `waiting_review`。
- `automatic`：结构校验通过且风险不是 `high` 时自动批准；否则进入 `waiting_review`。

独立授权字段：

- `startWritingAfterPlanning: boolean`，默认 `false`。
- 该字段只允许在规划开始前或等待作者确认时显式修改。
- 即使为 `true`，也必须在规划完成事件之后提交一个新的 `InitializeAutonomousWriting` Command。

### 7.2 固定阶段

| 顺序 | 阶段 | 输入 | 结构化输出 | 应用目标 |
| --- | --- | --- | --- | --- |
| 1 | `idea` | 作者意图、题材、受众、篇幅与禁区 | 标题候选、核心命题、故事承诺、基调 | Project |
| 2 | `world` | 已确认创意 | 世界背景、规则、地点、势力、关键事实 | StoryBible、NarrativeKnowledge |
| 3 | `characters` | 创意与世界观 | 人物、人物弧、关系、初始冲突 | Character、Relationship、Conflict |
| 4 | `structure` | 前三阶段 | 卷、幕、主冲突、伏笔与高潮节点 | StoryStructure、Conflict、Foreshadowing |
| 5 | `chapters` | 已确认结构与目标篇幅 | 章节标题、大纲、场景计划、目标字数 | Chapter、StoryStructure |

每个阶段的 AI 输出使用共享契约进行严格结构校验。未知字段被拒绝；缺少必填字段、引用不存在的人物或结构前后矛盾会生成验证问题，不能进入应用。

### 7.3 修订与 SetupChangeSet

每次 AI 生成、重新生成或作者编辑都会创建一个不可变修订。修订包含：

- `revision`
- `source: 'ai' | 'author'`
- `content`
- `validationIssues`
- `riskLevel`
- `decision: 'pending' | 'approved' | 'rejected' | 'isolated'`
- `applyStatus: 'not_applied' | 'applying' | 'applied' | 'failed'`
- `createdAt`、`decidedAt`、`appliedAt`

该结构就是规划领域的 `SetupChangeSet`。旧修订只读保留，当前修订由事件明确选择，不能原地覆盖。

已应用阶段允许回看。作者修改已应用阶段时，系统生成新修订和结构化差异；新增、更新和删除均成为显式条目。删除既有领域实体属于高风险，自动模式不得自动应用。

### 7.4 Command 与 Event

核心 Command：

- `CreateBookSetup`
- `ChangeBookSetupOptions`
- `StartBookSetup`
- `RequestSetupStageGeneration`
- `SubmitSetupStageCandidate`
- `EditSetupStageCandidate`
- `RegenerateSetupStage`
- `ApproveSetupStage`
- `RejectSetupStage`
- `ApplySetupStage`
- `PauseBookSetup`
- `ResumeBookSetup`
- `RetryBookSetupStage`
- `AbandonBookSetup`
- `CompleteBookSetup`
- `LaunchWritingFromSetup`

核心 Event：

- `BookSetupCreated`
- `BookSetupOptionsChanged`
- `BookSetupStarted`
- `SetupStageGenerationRequested`
- `SetupStageCandidateGenerated`
- `SetupStageCandidateEdited`
- `SetupStageRegenerationRequested`
- `SetupStageValidated`
- `SetupStageApproved`
- `SetupStageRejected`
- `SetupStageApplyRequested`
- `SetupStageApplied`
- `SetupStageApplyFailed`
- `BookSetupPauseRequested`
- `BookSetupPaused`
- `BookSetupResumed`
- `BookSetupAbandonRequested`
- `BookSetupAbandoned`
- `BookSetupCompleted`
- `SetupWritingLaunchRequested`
- `SetupWritingRunCreated`

全部 Event 在 Event Registry 注册、声明 schemaVersion 和 payload 保护级别。全部 Command 使用稳定 commandId，重复提交返回首次回执。

### 7.5 Process Manager 与原子应用

`BookSetup Process Manager` 只根据投影状态提交下一个 Command，不直接写投影或调用 AI。

阶段 AI 请求通过 Outbox 处理。请求使用 `setupId + stage + revision` 作为 externalRequestId；迟到结果必须验证当前状态、阶段和修订，不匹配时记录丢弃事件。

`ApplySetupStage` 在 `commandBus.runAtomically` 中执行：

1. 加载当前规划聚合并确认修订已批准。
2. 根据阶段构造现有领域 Command。
3. 使用 `setupId + stage + revision + itemIndex` 生成稳定资源 ID 和 commandId。
4. 原子提交全部领域事件和 `SetupStageApplied`。
5. 任一领域规则失败时回滚，并提交独立的 `SetupStageApplyFailed` 诊断命令。

该流程不直接写 Project、StoryBible、Character、Relationship、Conflict、Foreshadowing、StoryStructure 或 Chapter 投影。

## 8. 数据库投影

新增可重建投影：

### `book_setups`

- 当前模式、整体状态和阶段
- 暂停、终止和错误状态
- 正文启动授权
- 当前修订号
- 创建、更新和完成时间

### `book_setup_stage_revisions`

- `setup_id`、`project_id`、`stage`、`revision`
- 来源、解密后的当前投影内容
- 校验问题、风险、决策和应用状态
- 创建、决定和应用时间

### `workflow_worker_heartbeats`

- Worker 名称、实例 ID、最后心跳、当前租约数量和最后错误类别
- 这是运行基础设施状态，不是业务事实，不参与领域重放

`book_setups` 与 `book_setup_stage_revisions` 可以从事件完全重建。Projection Registry 增加独立 reset，项目级重放不能影响其他项目。

## 9. HTTP 契约

新增领域 HTTP 面：

```text
GET    /api/projects/:projectId/book-setup
POST   /api/projects/:projectId/book-setup
PATCH  /api/projects/:projectId/book-setup/options
POST   /api/projects/:projectId/book-setup/start
POST   /api/projects/:projectId/book-setup/stages/:stage/regenerate
PATCH  /api/projects/:projectId/book-setup/stages/:stage/candidate
POST   /api/projects/:projectId/book-setup/stages/:stage/approve
POST   /api/projects/:projectId/book-setup/stages/:stage/reject
POST   /api/projects/:projectId/book-setup/pause
POST   /api/projects/:projectId/book-setup/resume
POST   /api/projects/:projectId/book-setup/retry
POST   /api/projects/:projectId/book-setup/abandon
GET    /api/system/workflow-health
```

所有详情与操作同时校验 URL `projectId` 和聚合归属。写接口只提交 Command，读接口只查询投影。失败响应使用现有统一 `ApiResponse<T>`，不得泄露内部密钥、AI 原始响应或跨项目资源是否存在。

`GET /api/system/workflow-health` 只返回计数、位置、状态和脱敏错误类别，不返回事件 payload、提示词、正文、URL 中的密钥或 Provider 凭据。

## 10. 专注式规划工作区

新书规划仍位于 `/project/:id`，不增加旧式领域路由。

桌面端：

```text
顶部：项目名称 / 保存状态 / 当前模式 / 暂停与终止
左侧：五阶段导航、状态与风险标记
右侧：阶段说明、结构化候选编辑、校验结果、修订记录与操作
底部：重新生成 / 拒绝 / 确认并继续
```

进入规则：

- 新项目没有规划流程时，驾驶舱显示“开始规划新书”。
- 存在非终态规划时，默认恢复专注式工作区。
- 已完成规划时，默认显示自动写作驾驶舱，并提供“查看规划”入口。
- 规划工作区支持关闭返回驾驶舱，但后台自动模式继续运行；关闭不等于暂停。

交互规则：

- 启动前选择 `guided` 或 `automatic`，并单独勾选是否在规划完成后开始正文。
- 表单明确展示模式影响、五个阶段和正文授权边界。
- 逐阶段模式提供编辑、重新生成、拒绝、确认并继续。
- 全自动模式展示当前阶段、已自动应用内容和暂停原因。
- 高风险、应用失败和 Provider 失败使用现有异常表达，不显示假成功。
- 所有危险操作使用 `NConfirmDialog`，状态反馈使用设计系统组件。

响应式：

- 1440px：固定阶段侧栏和完整编辑区。
- 1024px：侧栏收窄，修订记录放入抽屉。
- 390px：全屏单列，顶部阶段进度条，编辑区和校验区纵向排列。
- 不出现横向滚动；键盘焦点、Esc 关闭和 `prefers-reduced-motion` 遵循现有 UI 规则。

## 11. Worker 运行可靠性

API 进程启动后执行一次过期 Outbox 租约恢复，再以受限批次周期唤醒 Worker。进程关闭时停止领取新任务，等待当前数据库事务结束后关闭连接。

Worker 必须满足：

- 租约过期后可由其他实例重新领取。
- 外部请求使用稳定 externalRequestId。
- 结果提交使用幂等 Command。
- 暂停、终止或修订变化后的迟到结果只记录丢弃，不写回规划或正文。
- 重试采用现有退避与最大次数；超过上限进入终态失败并在 UI 可见。

健康查询聚合：

- Event Store 最新全局位置。
- 每个 Projection checkpoint 和 lag。
- Outbox pending、processing、retrying、failed 数量及最老等待时间。
- Process Manager 最近成功推进时间。
- Worker 最近心跳。
- AI Provider 聊天与 Embedding 是否已配置，不返回值本身。

## 12. 真实 AI Provider 验收

自动化 Provider 协议测试启动本地 OpenAI-compatible HTTP 服务，覆盖：

- 普通 JSON 响应。
- SSE 流式增量与结束标记。
- 429/5xx 重试。
- 超时、连接中断和无效 JSON。
- AbortSignal 取消。
- 请求头和 body 不把 API Key 写入日志。

新增 `pnpm smoke:ai`：

- 没有显式 `AI_SMOKE=1` 时拒绝执行真实请求。
- 必须通过 `AI_SMOKE_PROJECT_ID` 指定已配置 Provider 的本地项目，且校验项目归属。
- 从项目凭据库解析 Provider 配置，不在命令行打印密钥。
- 使用最小 token 预算发送一次固定无敏感内容请求。
- 只报告 Provider、模型、延迟、响应是否有效和用量摘要。
- 不属于 `pnpm check`，最终验收时根据是否配置真实凭据报告“通过”或“未执行”。

## 13. 错误处理与恢复

- 结构解析失败：保存脱敏错误类别，允许重新生成。
- 阶段校验失败：保留候选与问题，进入 `waiting_review`。
- Provider 失败：按 Outbox 策略重试，耗尽后进入可重试失败。
- 领域应用失败：事务回滚，候选保持批准但未应用，显示具体可操作原因。
- 暂停：不启动下一 AI 请求或应用命令；当前迟到结果只做记录。
- 终止：撤销全部后续授权，已应用领域事实保留，不自动回滚作者已确认内容。
- 正文启动失败：规划保持 `completed`，写作 Run 显示失败，可单独重试创建。

## 14. 测试策略

### 14.1 安全

- 密钥生成、包装、解包和认证失败单元测试。
- Event Store 加密写入与解密读取集成测试。
- 已知明文数据库扫描、AAD 篡改、跨项目密钥和密钥销毁测试。
- 删除项目后全量 replay 成功且投影为空。

### 14.2 BookSetup

- Aggregate 合法状态迁移与非法命令拒绝。
- guided 在每阶段等待审批。
- automatic 自动推进低/中风险，高风险停下。
- 修订、作者编辑、重新生成和幂等。
- 暂停、恢复、终止与迟到结果。
- 阶段跨聚合原子应用和失败回滚。
- 规划完成后正文授权关闭/开启两条路径。

### 14.3 HTTP 与投影

- 每个写端点提交正确 Command。
- Query 严格限定 `projectId`。
- 规划投影的项目级与全量 replay。
- 健康端点只返回脱敏状态。

### 14.4 前端

- Store/composable 的 loading、empty、error 和轮询状态。
- guided 编辑、重新生成和批准。
- automatic 进度、高风险暂停和失败恢复。
- 正文独立授权默认关闭。
- 规划完成后进入驾驶舱并可重新查看。

### 14.5 端到端

确定性 Fake AI Provider 覆盖两条完整链：

```text
创建项目 → guided 逐阶段生成/编辑/批准 → 完成规划
→ 手动启动正文 → 完成章节 → replay → UI 状态一致
```

```text
创建项目 → automatic + 自动开始正文授权
→ 五阶段自动应用 → 自动写作完成 → replay → UI 状态一致
```

另覆盖 automatic 高风险停下、作者修正后继续，以及 Worker 重启恢复未完成 Outbox。

## 15. 最终验证

所有实现任务完成后统一执行：

```bash
pnpm check
pnpm test:coverage
pnpm db:generate
pnpm db:rebuild
pnpm db:seed
pnpm db:replay
```

随后执行：

1. 检查 `domain_events.payload` 不包含 seed 明文内容。
2. 检查 `domain_events` 只追加触发器。
3. 检查所有活动投影 checkpoint 追平最新位置。
4. 检查 Outbox 无非预期积压和永久 processing。
5. 在 1440px、1024px 和 390px 验收项目列表、规划工作区、自动写作驾驶舱和设置。
6. 配置了真实凭据时执行 `AI_SMOKE=1 AI_SMOKE_PROJECT_ID=<project-id> pnpm smoke:ai`；未配置则明确记录未执行。

## 16. 数据库切换与回滚

数据库最终切换继续使用现有本地目标保护：解析并显示数据库名，拒绝生产标识和不明确目标。用户已授权清空当前本地开发数据库。

切换顺序：

```text
确认本地开发数据库
→ 清空 schema
→ 完整 migrations
→ 事件溯源 seed
→ 投影 replay
→ 安全检查
→ 自动化与浏览器验收
```

回滚只支持回退代码后重新建立空数据库。明文历史不转换，密钥销毁后的项目内容不可恢复。

## 17. 文档记忆与交接

实施期间维护：

- `docs/status/development-memory.md`：确认决策、阶段完成记录、不变量、验证证据和仍有效风险。
- `docs/status/handoff.md`：当前分支、基线、最近完成、正在进行、下一命令、阻塞和恢复说明。

最终交付时同步更新：

- `docs/status/current-state.md`
- `docs/architecture/overview.md`
- `docs/product/product-design.md`
- `docs/design/ui-design-spec.md`
- `docs/guides/local-development.md`
- `.env.example`

实施计划只用于执行跟踪；完成后删除，把长期有效结论合并进上述文档。

## 18. 验收标准

只有全部满足以下条件才算完成：

1. 活动项目的敏感事件 payload 在数据库中为认证加密信封。
2. 项目删除同时清理投影、索引、凭据并销毁数据密钥。
3. 删除项目不阻塞全量 replay，且内容不可恢复。
4. guided 模式能完成五阶段生成、编辑、重新生成、审批和应用。
5. automatic 模式能自动完成安全阶段，并在高风险或失败时停下。
6. 规划授权与正文授权分离，默认不自动启动正文。
7. 五个阶段的应用只通过现有领域 Command，且跨聚合失败原子回滚。
8. Worker 重启和过期租约可以恢复，迟到结果不能写回。
9. 健康端点和 UI 能显示投影延迟、Outbox 与 Worker 状态且不泄密。
10. 本地 Provider 协议测试覆盖成功、流式、重试、超时、取消和无效响应。
11. 两条完整规划/写作端到端链和 replay 一致性通过。
12. 浏览器在 1440px、1024px 和 390px 通过验收。
13. `pnpm check`、覆盖率、数据库重建、seed 和 replay 全部通过。
14. 开发记忆、交接、架构、产品、UI 和本地开发文档与代码一致。

## 19. 主要风险与缓解

- **删除后无法解密历史事件**：回放先识别删除 tombstone，再跳过整个已删除项目。
- **加密破坏 Event Registry 与 Upcaster**：固定为“解密 → upcast → 当前 payload 校验”的单一读取顺序。
- **跨领域阶段应用部分成功**：全部领域 Command 与 `SetupStageApplied` 在同一个 Command Bus 事务执行。
- **自动模式扩大授权**：正文启动使用独立布尔授权和独立 Command，不从模式推断。
- **AI 输出结构漂移**：共享严格 schema、本地 Provider 协议测试和可重试候选修订。
- **Worker 重启造成重复调用**：租约、externalRequestId、commandId 和结果状态共同去重。
- **大文件重新形成**：BookSetup 按 aggregate、commands、events/projector、process-manager、provider executor、queries 和 routes 拆分。
