# 自动写作流程与展示面板一体化改造文档（2026-05-21）

## 1. 当前结论

当前项目已经把一部分全自动写作流程和展示面板放到同一个入口里，但还没有完全合并成“单一自动写作驾驶舱”。

已有一体化能力：

- `/project/:id/autopilot` 已作为自动驾驶主入口。
- `AutopilotView.vue` 同时展示：
  - 自动驾驶任务配置。
  - 当前自动驾驶 Run 控制条。
  - 待处理异常队列。
  - 实时联动看板。
  - 章节推进与写回状态。
  - 自动同步范围说明。
- `AutonomousLiveInsight.vue` 已能展示自动写作和结构化同步的实时状态。
- `AutonomousRunTimeline.vue` 已能展示每章 job 的推进过程。
- `AutonomousJobDetailModal.vue` 已能在驾驶舱内查看单章任务详情，而不是跳到另一个独立页面。

仍未完全一体化的地方：

- `/project/:id/writing-job` 仍然是独立的旧任务页面。
- `WritingJobView.vue` 仍保留单任务创建、启动、暂停、删除、重试等旧入口。
- 侧边栏仍同时存在“自动驾驶舱”和若干基础模块入口，用户会感觉自动写作、健康、设定、台账是分开的页面，而不是同一个驾驶舱的不同视角。
- 健康巡检、创作周报、台账详情仍主要是独立页面，不是驾驶舱内的可切换面板。
- 自动写作完成后，虽然后端会更新部分结构化数据，但前端驾驶舱没有把“哪些人物、关系、矛盾、伏笔、事实被同步更新”作为主流程证据展示出来。

因此当前状态应判断为：

```text
自动驾驶主入口：已建立
流程与展示面板初步合并：已完成一部分
全局一体化驾驶舱：未完成
旧半自动任务入口：仍残留
```

## 2. 产品目标

自动写作不应像一个孤立任务页，也不应让用户在多个页面之间来回跳。后续目标是：

```text
左侧：稳定控制台入口
右侧：自动写作驾驶舱内容
驾驶舱内：配置、运行、监控、健康、结构同步、异常处理全部可见
独立模块页：保留为详情页或高级编辑页，但不再作为自动写作主流程入口
```

用户进入项目后，主要工作流应是：

```text
项目总览
-> 自动驾驶舱
-> 配置自动写作范围和策略
-> 启动自动驾驶
-> 实时看到章节推进
-> 实时看到正文、角色、关系、矛盾、伏笔、事实、健康指标同步变化
-> 只处理异常队列
-> 完成后可直接开启下一轮
```

## 3. 信息架构调整

### 3.1 左侧导航收敛

左侧只保留高频主入口：

```text
自动驾驶舱
项目总览
正文工作区
健康巡检
项目设置
```

基础设定和台账类入口折叠到二级分组：

```text
基础设定
- 故事设定集
- 角色管理
- 人物关系
- 矛盾矩阵
- 伏笔台账
- 知识库
- 大纲规划

系统工具
- 版本历史
- 创作周报
- 上下文快照
- 调试工具
```

注意：

- 自动写作主流程不要把用户引到 `writing-job` 旧页。
- 旧页如果保留，只能作为系统工具或调试入口，不能作为主导航。

### 3.2 自动驾驶舱页面分区

`AutopilotView.vue` 应成为唯一自动写作主页面，建议改为四区布局：

```text
顶部：项目状态和主操作
左列：自动驾驶配置与运行控制
中列：章节推进时间线和当前章节写回状态
右列：实时联动看板、健康风险、异常队列
底部：结构化同步记录
```

具体模块：

1. 自动驾驶配置
   - 写作策略。
   - 推进范围。
   - 目标章节数。
   - 每章目标字数。
   - 风险策略。
   - 是否自动续写下一轮。

2. 运行控制
   - 启动。
   - 暂停。
   - 继续。
   - 停止。
   - 新建下一轮。
   - 刷新状态。

3. 章节推进
   - 当前章节。
   - 当前步骤。
   - 生成正文。
   - 一致性检查。
   - 自动修复。
   - 写回正文。
   - 章后分析。
   - 台账同步。
   - 健康更新。

4. 实时联动看板
   - 新增角色。
   - 更新角色。
   - 新增关系。
   - 更新关系。
   - 新增矛盾。
   - 解决矛盾。
   - 新增伏笔。
   - 回收伏笔。
   - 新增事实。
   - 待处理低置信建议。

5. 健康风险
   - 偏题风险。
   - 人物跑偏。
   - 伏笔遗忘。
   - 关系断裂。
   - 节奏异常。
   - 上下文不足。

6. 异常队列
   - 致命错误。
   - 高风险冲突。
   - 无法自动修复的问题。
   - 用户需要决策的方向性问题。

## 4. 需要修改的文件

### 4.1 前端路由

文件：

```text
apps/web/src/router/index.ts
```

修改要求：

1. 保留 `/project/:id/autopilot` 作为自动写作主入口。
2. 将 `/project/:id/writing-job` 从主流程中移除。
3. 如果仍需保留旧任务页，迁移为：

```text
/project/:id/system/writing-job-debug
```

或直接删除路由。

验收标准：

- 用户不能从主导航进入旧半自动任务页。
- 自动写作相关入口全部指向 `/project/:id/autopilot`。

### 4.2 左侧导航

文件：

```text
apps/web/src/components/AppSidebar.vue
```

修改要求：

1. 左侧主入口只保留自动驾驶相关高频页面。
2. 删除或隐藏旧 `writing-job` 入口。
3. `自动驾驶舱` 文案作为第一入口。
4. 基础设定和台账进入折叠组。

验收标准：

- 左侧不会出现两个“自动写作 / 自动驾驶”入口。
- 用户能通过左侧随时切换项目总览、自动驾驶舱、正文工作区、健康巡检。

### 4.3 自动驾驶舱

文件：

```text
apps/web/src/views/AutopilotView.vue
apps/web/src/features/autonomous-writing/components/AutonomousRunLauncher.vue
apps/web/src/features/autonomous-writing/components/AutonomousRunControlBar.vue
apps/web/src/features/autonomous-writing/components/AutonomousRunTimeline.vue
apps/web/src/features/autonomous-writing/components/AutonomousLiveInsight.vue
apps/web/src/features/autonomous-writing/components/AutonomousExceptionQueue.vue
```

修改要求：

1. `AutopilotView.vue` 继续作为统一页面，不再跳转到 `WritingJobView.vue`。
2. 运行中、已完成、已失败、已隔离状态都在同一页面展示。
3. 已完成或已中止的 Run 不阻止新建下一轮。
4. 新建下一轮不要求删除旧 Run。
5. 任务详情通过 modal/drawer 展示，不跳到新页面。
6. 实时联动看板必须显示结构化同步结果，而不是只写说明文案。

验收标准：

- 启动自动驾驶后，同一页面能看到配置、运行、时间线、异常、同步结果。
- 点击某个章节 job 只打开详情弹窗或抽屉。
- 完成后能直接开启下一轮。

### 4.4 旧写作任务页

文件：

```text
apps/web/src/views/WritingJobView.vue
apps/web/src/features/writing-jobs/*
apps/web/src/stores/writing-job.store.ts
apps/web/src/api/writing-jobs.ts
```

处理策略二选一。

推荐策略 A：迁移为调试能力。

```text
apps/web/src/features/devtools/writing-jobs/*
```

要求：

- 不出现在主导航。
- 页面标题明确为“写作任务调试”。
- 所有操作按钮标注调试用途。

策略 B：删除前端旧页面。

要求：

- 删除 `WritingJobView.vue` 路由。
- 删除主导航入口。
- 保留 API 给自动驾驶内部使用。

不建议继续把 `WritingJobView.vue` 作为产品入口。

## 5. 后端数据接口调整

### 5.1 自动驾驶 Run 应成为主查询对象

主页面应优先使用：

```text
GET /api/projects/:projectId/autonomous-runs/active
GET /api/projects/:projectId/autonomous-runs/:runId
```

不应直接以单个 writing job 作为主状态。

### 5.2 写作 Job 应成为 Run 的内部步骤

`writing_jobs` 应继续存在，但语义变为：

```text
一个 autonomous_run 下面的章节执行单元
```

它不再是用户主动创建的独立任务。

### 5.3 联动数据接口

自动驾驶舱需要一个聚合接口：

```text
GET /api/projects/:projectId/autonomous-runs/:runId/insight
```

返回：

```ts
interface AutonomousRunInsight {
  runId: string
  projectId: string
  status: string
  currentChapter?: {
    id: string
    title: string
    status: string
    wordCount: number
  }
  progress: {
    completedChapters: number
    totalChapters: number
    writtenWords: number
    targetWords: number
  }
  syncSummary: {
    createdCharacters: number
    updatedCharacters: number
    createdRelationships: number
    updatedRelationships: number
    createdConflicts: number
    updatedConflicts: number
    createdForeshadowing: number
    paidOffForeshadowing: number
    createdFacts: number
    pendingSuggestions: number
    appliedSuggestions: number
  }
  health: {
    score: number
    themeRisk: number
    characterRisk: number
    continuityRisk: number
    foreshadowingRisk: number
    rhythmRisk: number
  }
  recentEvents: Array<{
    id: string
    type: string
    title: string
    description: string
    createdAt: string
  }>
}
```

验收标准：

- 驾驶舱不再用多个页面拼凑状态。
- 用户能看到“自动写作实际更新了什么”。

## 6. 自动写作完成后的新任务逻辑

已完成、已失败、已中止、已隔离的 Run 或 Job 都不能阻塞新任务。

前端规则：

```ts
const terminalStatuses = ['completed', 'failed', 'paused', 'isolated']
```

后端规则：

```text
active = idle | running
history = completed | failed | paused | isolated
```

如果存在 active run：

- 展示当前 run。
- 不允许再创建并行 run。

如果只有 history run：

- 展示最近一轮历史。
- 允许创建下一轮。

如果没有 run：

- 展示创建入口。

## 7. 展示面板和流程合并后的页面结构

建议最终页面结构：

```vue
<AutopilotView>
  <AutopilotHeader />
  <AutopilotRunControl />
  <AutopilotProgressSummary />
  <AutopilotCurrentChapterPanel />
  <AutopilotRunTimeline />
  <AutopilotSyncInsight />
  <AutopilotHealthPanel />
  <AutopilotExceptionQueue />
  <AutopilotRecentEvents />
  <AutopilotJobDetailDrawer />
</AutopilotView>
```

不再需要用户进入多个页面理解自动写作状态。

## 8. 分阶段开发顺序

### 阶段 1：清理入口

目标：用户只看到一个自动写作入口。

任务：

1. 从 `AppSidebar.vue` 移除旧 `writing-job` 产品入口。
2. 将所有“自动写作”跳转改为 `/project/:id/autopilot`。
3. 保留或迁移 `WritingJobView.vue` 到调试入口。

验收：

- 左侧只有一个自动驾驶入口。
- 页面之间不会出现“自动驾驶舱”和“自动写作任务页”并存的产品入口。

### 阶段 2：驾驶舱显示历史与新建下一轮

目标：已完成任务不阻塞下一轮。

任务：

1. `AutopilotView.vue` 支持 terminal run 下展示新建入口。
2. `AutonomousRunLauncher.vue` 支持 currentRun 为历史 run 时展示“开启下一轮”。
3. `AutonomousRunControlBar.vue` 对已完成、已失败、已隔离 run 展示历史状态。

验收：

- 完成一轮后，不删除旧任务也能开启下一轮。
- 旧 run 仍可查看时间线和详情。

### 阶段 3：联动看板从说明变成真实数据

目标：用户看到自动写作同步了什么。

任务：

1. 增加或完善 run insight 聚合接口。
2. `AutonomousLiveInsight.vue` 使用真实 run 维度数据。
3. 显示最近同步事件：
   - 角色新增/更新。
   - 关系新增/更新。
   - 矛盾新增/更新。
   - 伏笔新增/回收。
   - 事实新增。
   - 健康指标更新。

验收：

- 自动写完一章后，看板数字变化。
- 最近事件能说明具体更新对象。

### 阶段 4：健康巡检嵌入驾驶舱

目标：健康不是另一个页面，而是自动驾驶门禁的一部分。

任务：

1. 在 `AutopilotView.vue` 加 `AutopilotHealthPanel`。
2. 展示当前 run 的健康风险。
3. 高风险时显示自动修复、隔离或停止原因。
4. 独立 `ProjectHealthView.vue` 保留为详情页，但驾驶舱内必须有摘要。

验收：

- 自动驾驶过程中能直接看到偏题、人物跑偏、伏笔遗忘、关系断裂风险。

### 阶段 5：任务详情改为抽屉或弹窗

目标：点击章节任务不跳出驾驶舱。

任务：

1. `AutonomousJobDetailModal.vue` 升级为右侧 drawer 或保持 modal。
2. 详情里展示：
   - 输入上下文摘要。
   - AI 生成结果。
   - 一致性检查报告。
   - 自动修复结果。
   - 写回正文结果。
   - 章后分析结果。
   - 结构化同步结果。

验收：

- 用户不需要点击返回。
- 左侧导航和驾驶舱上下文一直保留。

### 阶段 6：旧半自动能力降级为调试工具

目标：产品主流程完全自动化。

任务：

1. `WritingJobView.vue` 从产品入口移除。
2. `writing-jobs` API 保留给自动驾驶内部调用。
3. 前端 `writing-job.store.ts` 只被自动驾驶详情/调试工具使用。
4. 文案中避免“确认继续”“手动批准”等半自动措辞，改为：
   - 自动修复。
   - 已隔离。
   - 重试该步骤。
   - 查看决策报告。

验收：

- 产品主链路不再出现半自动写作任务页面。

## 9. 验收标准

完成后必须满足：

- 用户从左侧进入 `自动驾驶舱` 后，可以完成自动写作配置、启动、监控、异常处理、下一轮创建。
- 自动写作完成后，用户无需删除旧任务即可开启下一轮。
- 自动写作不是单独页面，而是同屏显示流程、健康、台账同步、异常队列。
- 角色、关系、矛盾、伏笔、事实、健康指标变化可以在驾驶舱内看到。
- 点击章节任务详情不会离开当前驾驶舱上下文。
- 旧 `WritingJobView.vue` 不再作为产品主入口。

## 10. 建议验证命令

```bash
pnpm check
```

前端手工验收：

```text
1. 打开 /project/:id/autopilot。
2. 启动 1 章自动驾驶。
3. 等待任务完成。
4. 查看章节推进时间线是否完成。
5. 查看正文是否写回。
6. 查看实时联动看板是否更新。
7. 查看健康摘要是否更新。
8. 不删除旧任务，直接开启下一轮。
9. 点击章节详情，确认只打开弹窗/抽屉，不跳出驾驶舱。
10. 左侧导航随时可切换，不需要浏览器返回键。
```

## 11. 当前优先级

P0：

- 移除旧 `writing-job` 产品入口。
- 自动驾驶舱支持历史 Run + 新建下一轮。
- 自动驾驶舱显示真实结构化同步数据。

P1：

- 健康巡检嵌入驾驶舱。
- 章节任务详情改为 drawer/modal。
- 最近同步事件流展示。

P2：

- 旧写作任务页迁移到调试工具。
- 创作周报和健康详情保留深层入口，但不再干扰主流程。

