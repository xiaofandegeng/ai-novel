# 全自动写作单页驾驶舱重构方案

日期：2026-05-22  
目标：完全重构当前项目，只保留必要页面，把自动写作、人物情感关系、角色关系变化、剧情走向、风险健康和结构化回写统一到一个主页面中。

## 1. 重构结论

当前项目已经积累了大量功能页面：故事设定、角色、关系、矛盾、伏笔、大纲、健康、正文、自动驾驶等。它们在数据层有关联，但在产品体验上仍像多个独立房间，用户需要不断点击左侧入口进入新页面，再返回或切换。对于“全自动写作”产品，这会造成三个问题：

- 自动写作像一个单独模块，而不是整个项目的主流程。
- 人物、关系、矛盾、伏笔、剧情走向虽然会更新，但不在同一个视野里。
- 旧的半自动编辑入口仍然存在，容易让系统变成“自动一部分、人工一部分、数据不同步”的混合状态。

本轮重构要把产品收敛为：

```text
项目书库 -> 项目自动写作驾驶舱 -> 项目设置
```

除调试入口外，所有创作过程都应在“项目自动写作驾驶舱”完成。

## 2. 保留页面

### 2.1 项目书库

路径：`/`

职责：

- 创建项目。
- 查看项目列表。
- 进入项目驾驶舱。
- 删除、导入、导出项目。

不承载任何章节、角色、关系、伏笔编辑能力。

### 2.2 项目自动写作驾驶舱

建议路径：

- `/project/:id`
- 或 `/project/:id/cockpit`

推荐最终让 `/project/:id` 直接进入驾驶舱，不再进入传统项目总览。

职责：

- 启动、暂停、放弃、继续、新建自动写作任务。
- 展示当前自动写作状态。
- 展示章节推进流程。
- 展示正文生成结果。
- 展示人物情绪状态。
- 展示角色关系变化。
- 展示矛盾强度变化。
- 展示伏笔设置与回收。
- 展示剧情走向和下一章方向。
- 展示健康风险和自动修复记录。
- 展示结构化回写事件流。

这是项目的唯一主工作台。

### 2.3 项目设置

路径：`/project/:id/settings`

职责：

- AI 服务配置。
- 模型与供应商配置。
- 写作人格配置。
- 自动驾驶策略默认值。
- 小说基础约束：题材、主题、禁忌、目标字数、风格、世界观规则。
- 导入导出。

设置页不承载日常写作工作。

### 2.4 开发调试页

建议路径：

- `/project/:id/dev/*`

职责：

- 上下文快照。
- 写作任务调试。
- 原始建议队列。
- AI 请求日志。
- 数据修复工具。

这些入口不出现在普通侧栏，只在开发模式或显式调试开关下出现。

## 3. 下线或合并页面

以下页面不再作为主产品侧栏入口出现。

| 当前页面 | 新归宿 |
| --- | --- |
| 项目总览 | 合并到驾驶舱顶部概览 |
| 正文工作区 | 合并到驾驶舱正文预览与章节抽屉 |
| 自动驾驶 | 成为驾驶舱主体，不再是独立模式 |
| 健康巡检 | 合并为驾驶舱右侧健康风险面板 |
| 故事设定集 | 合并到设置页基础设定，驾驶舱只读展示关键约束 |
| 大纲规划 | 合并到章节推进面板和章节详情抽屉 |
| 角色档案 | 合并到人物状态面板和角色详情抽屉 |
| 关系图谱 | 合并到关系变化面板 |
| 矛盾矩阵 | 合并到矛盾强度面板 |
| 伏笔台账 | 合并到伏笔追踪面板 |
| 知识库 | 合并到设置页或调试页，驾驶舱只展示召回结果 |
| 版本历史 | 合并到章节详情抽屉 |
| 创作周报 | 合并到驾驶舱统计区 |
| 章后建议 | 合并到结构化回写事件流 |
| 上下文调试 | 移入开发调试页 |
| 写作任务调试 | 移入开发调试页 |

原则：旧页面可以先保留源文件，但不能继续出现在普通用户的主导航中。

## 4. 新信息架构

### 4.1 左侧导航

左侧只保留稳定控制入口，不再展开大量模块。

```text
创作书库

自动化主流程
- 自动写作驾驶舱
- 项目设置

系统工具（开发模式才显示）
- 调试中心
```

注意：

- 左侧是控制中心，不是“返回上一页”的替代品。
- 所有主流程页面都必须保持左侧常驻。
- 不允许进入一个没有左侧导航的新房间式页面。
- 旧“返回编辑器”“返回驾驶舱”按钮要尽量删除，改成左侧入口或页面内抽屉。

### 4.2 驾驶舱页面布局

建议三栏加底部事件流：

```text
┌──────────────────────────────────────────────┐
│ 项目方向 / 当前任务 / 全局健康 / 主要操作       │
├──────────────┬────────────────┬──────────────┤
│ 自动写作控制  │ 章节推进与正文   │ 叙事状态总览  │
│              │                │              │
│ 策略          │ 当前章节流程     │ 人物情绪      │
│ 范围          │ 正文预览         │ 关系变化      │
│ 启动/暂停     │ 自动修复记录      │ 矛盾变化      │
│ 新建任务      │ 写回状态         │ 伏笔状态      │
│              │                │ 剧情走向      │
├──────────────┴────────────────┴──────────────┤
│ 自动回写事件流 / 隔离队列 / 风险处理记录          │
└──────────────────────────────────────────────┘
```

桌面端：

- 左侧固定自动写作控制。
- 中间展示章节流水线和正文。
- 右侧展示人物、关系、矛盾、伏笔、剧情走向。

移动端：

- 自动写作控制置顶折叠。
- 章节流水线优先。
- 叙事状态改为 tabs。
- 事件流放底部。

## 5. 驾驶舱核心模块

### 5.1 自动写作控制面板

功能：

- 写作策略：稳健、平衡、高速。
- 推进范围：当前章、后续 N 章、整卷。
- 每章目标字数。
- 启动自动写作。
- 暂停当前任务。
- 放弃当前任务。
- 当前任务完成、失败、放弃后允许新建任务。

状态规则：

| 状态 | 是否允许新建任务 | 操作 |
| --- | --- | --- |
| running | 否 | 暂停、查看 |
| paused | 否 | 继续、放弃 |
| waiting_review | 否 | 自动处理或人工接管 |
| completed | 是 | 新建任务、查看结果 |
| failed | 是 | 重试、放弃、新建任务 |
| abandoned | 是 | 新建任务 |

不能再出现“已完成任务只能删除后才能新建”的流程。

### 5.2 章节推进流水线

每章展示完整自动流程：

```text
构建上下文
生成大纲
拆分场景
生成正文
一致性检查
自动修复
写回正文
章后分析
同步台账
更新健康指标
完成
```

每一步必须有：

- 状态：pending、running、completed、failed、blocked。
- 开始时间。
- 结束时间。
- 错误信息。
- 产物摘要。
- 可展开详情。

### 5.3 正文预览与章节详情

驾驶舱中间区域展示当前章节正文预览。

章节详情用抽屉，不跳转页面：

- 章节标题。
- 当前正文。
- 场景列表。
- 本章硬约束。
- 本章记忆。
- 版本快照。
- 章后分析结果。

正文编辑保留为应急能力，但不作为主流程入口。

### 5.4 人物情绪状态面板

展示每个关键人物：

- 当前目标。
- 当前恐惧。
- 当前秘密。
- 当前情绪。
- 当前关系压力。
- 最近变化来源章节。
- AI 自动抽取置信度。

人物变化来源：

- 自动写作正文。
- 章后分析。
- 用户设置。
- 关系变化推理。

低置信度或冲突变化进入隔离队列，高置信度自动写回。

### 5.5 角色关系变化面板

展示：

- 主要关系边。
- 关系类型。
- 亲密度。
- 信任度。
- 冲突度。
- 最近变化。
- 变化原因。
- 来源章节。

新角色创建后必须自动生成关系候选：

- 和主角关系。
- 和相关配角关系。
- 和当前冲突关系。
- 和当前章节场景关系。

关系候选不能直接污染数据库，先进入回写事件流；高置信度可自动确认，低置信度隔离。

### 5.6 矛盾变化面板

展示：

- 当前活跃矛盾。
- 强度变化曲线。
- 参与人物。
- 当前阶段。
- 最近升级或缓和原因。
- 后续推进建议。

正文写回后必须触发矛盾状态抽取。

### 5.7 伏笔追踪面板

展示：

- 已埋伏笔。
- 待回收伏笔。
- 可能遗忘伏笔。
- 已回收伏笔。
- 预计回收章节。
- 最近文本证据摘要。

章后分析发现伏笔时生成候选；发现回收时绑定原伏笔 ID 后再更新，不能出现“已应用但无实际更新”。

### 5.8 剧情走向面板

展示：

- 当前主线方向。
- 下一章目标。
- 下一章关键事件。
- 风险：偏题、节奏断裂、人物跑偏、伏笔遗忘。
- AI 自动修复建议。

剧情走向不是单独编辑页，而是驾驶舱持续更新的方向盘。

### 5.9 自动回写事件流

所有结构化变化统一进入事件流：

- 新增角色。
- 更新角色状态。
- 新增关系。
- 更新关系。
- 新增矛盾。
- 更新矛盾。
- 新增伏笔。
- 回收伏笔。
- 新增事实。
- 更新章节记忆。
- 更新健康指标。

事件状态：

```text
auto_applied     高置信度已自动写回
pending_review   需要确认
isolated         被隔离，不能自动写回
failed           写回失败
ignored          明确忽略
```

驾驶舱必须显示这些事件，不再让用户去独立“章后建议”页面查找。

## 6. 后端重构方案

### 6.1 新增聚合服务

新增：

```text
apps/api/src/services/automation-cockpit.service.ts
```

职责：

- 聚合项目基础信息。
- 聚合当前自动写作任务。
- 聚合章节推进状态。
- 聚合人物状态。
- 聚合关系变化。
- 聚合矛盾状态。
- 聚合伏笔状态。
- 聚合剧情方向。
- 聚合健康风险。
- 聚合自动回写事件。

不要把这些聚合逻辑散落在 route 中。

### 6.2 新增聚合 API

新增：

```text
GET /api/projects/:projectId/cockpit
GET /api/projects/:projectId/cockpit/events
GET /api/projects/:projectId/cockpit/chapters/:chapterId
```

其中 `GET /cockpit` 返回驾驶舱首屏需要的全部数据：

```ts
interface AutomationCockpitPayload {
  project: CockpitProjectSummary
  run: CockpitRunSummary | null
  chapters: CockpitChapterProgress[]
  currentChapter: CockpitChapterDetail | null
  characters: CockpitCharacterState[]
  relationships: CockpitRelationshipState[]
  conflicts: CockpitConflictState[]
  foreshadowing: CockpitForeshadowingState[]
  plotDirection: CockpitPlotDirection
  health: CockpitHealthSummary
  events: CockpitNarrativeEvent[]
}
```

### 6.3 自动写作服务职责

`autonomous-writing.service.ts` 保留为执行引擎，但不直接决定前端展示结构。

执行链路必须稳定为：

```text
create run
lock project active run
select target chapters
for each chapter:
  build context
  generate outline if missing
  generate scenes
  generate draft
  run consistency guard
  auto repair when needed
  write draft to chapter
  save version
  run postprocess
  extract narrative changes
  apply high confidence events
  isolate low confidence events
  update health metrics
complete run
unlock project active run
```

### 6.4 回写规则

AI 生成正文后，必须自动抽取：

- 角色变化。
- 人物关系变化。
- 情感状态变化。
- 矛盾变化。
- 伏笔新增和回收。
- 事实图谱。
- 章节记忆。
- 剧情方向。

抽取结果不直接全部写库，统一进入 `authoring_events` 或现有等价事件表：

- 高置信度：自动写回并标记 `auto_applied`。
- 中低置信度：进入 `pending_review` 或 `isolated`。
- 写回失败：标记 `failed`，保留原因。

### 6.5 任务互斥规则

一个项目同一时间只能有一个 active run。

Active 状态：

```text
running
paused
waiting_review
```

Non-active 状态：

```text
completed
failed
abandoned
cancelled
```

新建任务只阻止 active run，不阻止 completed/failed/abandoned。

## 7. 前端重构方案

### 7.1 新目录

新增：

```text
apps/web/src/features/automation-cockpit/
  api/
    automation-cockpit.api.ts
  components/
    cockpit-header.vue
    automation-control-panel.vue
    chapter-pipeline-panel.vue
    chapter-detail-drawer.vue
    narrative-state-board.vue
    character-emotion-panel.vue
    relationship-dynamics-panel.vue
    conflict-trend-panel.vue
    foreshadowing-tracker-panel.vue
    plot-direction-panel.vue
    health-risk-panel.vue
    narrative-event-stream.vue
    cockpit-empty-state.vue
  composables/
    useAutomationCockpit.ts
    useCockpitPolling.ts
  stores/
    automation-cockpit.store.ts
```

新增或替换：

```text
apps/web/src/views/automation-cockpit-view.vue
```

### 7.2 旧页面处理

第一阶段不要急着删除文件，先从路由和侧栏下线。

处理方式：

| 文件 | 处理 |
| --- | --- |
| `project-home-view.vue` | 替换为 cockpit redirect 或删除路由 |
| `writing-view.vue` | 改为 cockpit 内章节详情抽屉可复用组件 |
| `project-health-view.vue` | 面板化，合入 health-risk-panel |
| `characters-view.vue` | 面板化，合入 character-emotion-panel |
| `relationships-view.vue` | 面板化，合入 relationship-dynamics-panel |
| `conflict-matrix-view.vue` | 面板化，合入 conflict-trend-panel |
| `foreshadowing-ledger-view.vue` | 面板化，合入 foreshadowing-tracker-panel |
| `outline-view.vue` | 面板化，合入 chapter-pipeline-panel |
| `story-bible-view.vue` | 基础设定移入 settings |

### 7.3 Router 目标

最终普通路由只保留：

```ts
[
  { path: '/', name: 'projects' },
  {
    path: '/project/:id',
    component: projectShell,
    children: [
      { path: '', name: 'automation-cockpit', component: automationCockpitView },
      { path: 'settings', name: 'project-settings', component: projectSettingsView },
      { path: 'dev/:tool?', name: 'project-dev-tools', component: projectDevToolsView },
    ],
  },
]
```

不再保留普通用户可访问的：

```text
/bible
/characters
/relationships
/conflicts
/foreshadowing
/outline
/health
/write
/autopilot
/writing-job
```

如果短期需要兼容旧链接，应 redirect 到驾驶舱并带 query：

```text
/project/:id/characters -> /project/:id?panel=characters
/project/:id/relationships -> /project/:id?panel=relationships
/project/:id/write -> /project/:id?panel=chapter
```

### 7.4 Sidebar 目标

`AppSidebar.vue` 最终只展示：

```text
创作书库

自动化主流程
- 自动写作驾驶舱
- 项目设置

系统工具（开发模式）
- 调试中心
```

删除普通用户侧栏中的：

```text
项目总览
正文工作区
健康巡检
故事设定集
大纲规划
角色档案
关系图谱
矛盾矩阵
伏笔台账
```

这些内容都在驾驶舱中以面板、抽屉、事件流出现。

## 8. Shared 类型调整

新增：

```text
packages/shared/src/types/automation-cockpit.ts
```

建议类型：

```ts
export interface CockpitProjectSummary {
  id: string
  title: string
  genre?: string
  theme?: string
  targetWordCount?: number
  currentWordCount: number
}

export interface CockpitRunSummary {
  id: string
  status: 'running' | 'paused' | 'waiting_review' | 'completed' | 'failed' | 'abandoned' | 'cancelled'
  strategy: 'safe' | 'balanced' | 'fast'
  targetChapterCount: number
  completedChapterCount: number
  currentChapterId?: string
  startedAt?: string
  finishedAt?: string
}

export interface CockpitCharacterState {
  id: string
  name: string
  role: string
  emotion?: string
  goal?: string
  fear?: string
  relationshipPressure?: string
  lastChangedChapterId?: string
  confidence?: number
}

export interface CockpitRelationshipState {
  id: string
  sourceCharacterId: string
  targetCharacterId: string
  sourceName: string
  targetName: string
  type: string
  intimacy?: number
  trust?: number
  conflict?: number
  recentChange?: string
  lastChangedChapterId?: string
}

export interface CockpitNarrativeEvent {
  id: string
  type: string
  status: 'auto_applied' | 'pending_review' | 'isolated' | 'failed' | 'ignored'
  title: string
  summary: string
  sourceChapterId?: string
  confidence?: number
  createdAt: string
}
```

所有前后端围绕 shared 类型对齐，不允许页面自己定义散乱模型。

## 9. 实施顺序

### 阶段 1：收口产品边界

目标：先让产品入口变少，但不破坏现有能力。

任务：

1. 新增 `automation-cockpit-view.vue`。
2. 新增 `automation-cockpit` shared 类型。
3. 新增 `GET /api/projects/:projectId/cockpit` 空聚合接口，先返回真实基础数据和空数组。
4. 新增 cockpit API 和 store。
5. 修改 router，让 `/project/:id` 进入 cockpit。
6. 修改 AppSidebar，只保留驾驶舱和设置。
7. 旧路由先 redirect 到 cockpit 对应 panel。

验收：

- 进入项目后默认就是驾驶舱。
- 左侧没有旧模块列表。
- 用户不再需要“返回编辑器”。
- `pnpm check` 通过。

### 阶段 2：驾驶舱首屏聚合

目标：让一个页面能看到全局写作状态。

任务：

1. 聚合项目、章节、当前 run、健康指标。
2. 展示自动写作控制面板。
3. 展示章节推进流水线。
4. 展示当前正文预览。
5. 展示最近自动回写事件。
6. 增加轮询或手动刷新。

验收：

- 启动自动写作后，驾驶舱能看到 run 状态变化。
- 完成任务后能看到章节正文和字数变化。
- completed/failed/abandoned 后能启动新任务。

### 阶段 3：叙事状态总览

目标：人物、关系、矛盾、伏笔、剧情方向在同一页可见。

任务：

1. 后端 cockpit 聚合 characters。
2. 后端 cockpit 聚合 relationships。
3. 后端 cockpit 聚合 conflicts。
4. 后端 cockpit 聚合 foreshadowing。
5. 后端 cockpit 聚合 plot direction。
6. 前端实现 narrative-state-board。
7. 点击人物、关系、伏笔时打开详情抽屉，不跳路由。

验收：

- 自动写作后，人物情绪变化出现在驾驶舱。
- 自动写作后，关系变化出现在驾驶舱。
- 自动写作后，矛盾强度变化出现在驾驶舱。
- 自动写作后，伏笔新增/回收出现在驾驶舱。

### 阶段 4：结构化自动回写闭环

目标：AI 生成内容后自动抽取结构化变化，并同步展示。

任务：

1. 统一章后抽取结果进入 narrative event。
2. 高置信度自动写回。
3. 低置信度进入 pending/isolated。
4. cockpit events 展示所有回写结果。
5. 修复事件失败状态，不能假 applied。
6. 新角色生成后自动创建关系候选。

验收：

- 正文生成后自动产生角色、关系、矛盾、伏笔、事实变化。
- 写回成功的事件能在对应面板看到结果。
- 写回失败的事件能看到失败原因。
- 隔离事件不会污染业务表。

### 阶段 5：移除半自动入口

目标：从产品体验上彻底去掉半自动工作台。

任务：

1. 删除普通导航中的旧入口。
2. 删除旧页面之间的“返回”按钮。
3. 将旧编辑能力做成 cockpit drawer。
4. 将旧调试能力移到 `/dev`。
5. 清理不再使用的 view。

验收：

- 普通用户只看到驾驶舱和设置。
- 不存在“点进去像新房间”的页面体验。
- 所有核心信息都能从驾驶舱打开。

### 阶段 6：自动化稳定性

目标：自动写作能够连续跑完，不依赖半自动确认。

任务：

1. 统一 run active 状态判断。
2. completed/failed/abandoned 允许新任务。
3. running/paused/waiting_review 阻止新任务。
4. 修复 PostgreSQL 不合法写法，例如 `IN ${jobIds}` 改为 `inArray`。
5. 所有写回操作使用事务或可恢复状态。
6. 自动写作失败后保留可读错误，不吞异常。

验收：

- 多次启动自动写作不会卡死在旧任务。
- 自动写作完成后可以直接开启下一轮。
- 数据写回失败不会造成半写入。

## 10. 验证清单

### 命令验证

```bash
pnpm check
```

涉及数据库结构时：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

### 手动流程验证

1. 新建项目。
2. 配置 AI。
3. 配置故事基础约束。
4. 进入项目后默认看到自动写作驾驶舱。
5. 启动自动写作。
6. 观察章节流程从构建上下文到完成。
7. 观察正文写回。
8. 观察人物状态更新。
9. 观察人物关系更新。
10. 观察矛盾变化。
11. 观察伏笔新增或回收。
12. 观察剧情方向更新。
13. 观察健康风险更新。
14. 任务完成后再次启动新任务。

## 11. 不做事项

本轮不要做：

- 不直接删除数据库表。
- 不重写全部 AI 生成逻辑。
- 不做新的知识库训练中心。
- 不做复杂可视化图谱。
- 不做多用户权限系统。
- 不做移动端独立设计。

先把自动写作主流程和单页驾驶舱打通。

## 12. 完成标准

满足以下条件才算本轮重构完成：

- 普通侧栏只剩“自动写作驾驶舱”和“项目设置”。
- 项目默认页面就是自动写作驾驶舱。
- 自动写作不是独立页面，而是整个项目主页面。
- 人物情绪、角色关系、矛盾、伏笔、剧情走向、健康风险在同一页可见。
- 自动写作生成正文后，结构化变化自动抽取、自动写回或进入隔离队列。
- 旧半自动页面不再作为普通用户入口出现。
- 完成、失败、放弃的任务不会阻塞新任务。
- 所有主流程不依赖“返回”按钮切换页面。
- `pnpm check` 通过。

