# 自动驾驶舱一体化后续修复文档（2026-05-21）

## 1. 背景

本轮已经把自动写作主入口收敛到 `/project/:id/autopilot`，并将旧 `/project/:id/writing-job` 重定向到自动驾驶舱，同时把旧任务页迁移为系统调试入口。

当前整体方向是正确的：

- 左侧导航已收敛为自动驾驶舱、项目总览、正文工作区、健康巡检、项目设置。
- 自动驾驶舱已包含任务配置、运行控制、异常队列、章节推进、联动看板。
- 旧写作任务页不再作为主产品入口。

但代码里仍有几个会影响“全自动写作 + 实时看板 + 新一轮任务”的问题，需要继续修复。

## 2. 当前问题清单

### P1-1：自动驾驶联动看板的 SQL 写法不可靠

文件：

```text
apps/api/src/services/autonomous-writing.service.ts
```

位置：

```ts
.where(sql`${chapterChangeSets.writingJobId} IN ${jobIds}`)
```

问题：

这里直接把 `jobIds` 数组塞进 SQL 模板。PostgreSQL 下这不是可靠的 Drizzle 写法，可能生成非法 SQL，或把数组当成单个参数，导致 `/api/projects/:projectId/autonomous-runs/:runId/insight` 在有自动驾驶任务时运行失败。

影响：

- 自动驾驶舱的实时联动看板可能加载失败。
- 用户看不到角色、关系、矛盾、伏笔、事实等同步结果。
- 静态检查和 `pnpm check` 不一定能发现这个运行时问题。

修复要求：

1. 从 `drizzle-orm` 导入 `inArray`。
2. 改为：

```ts
.where(inArray(chapterChangeSets.writingJobId, jobIds))
```

3. 保留 `jobIds.length > 0` 判断，避免空数组查询。
4. 补充一个服务层测试或最小 API 验证，确保 run 下存在 job 时 insight 接口可返回。

验收标准：

- 有 run + jobs + change set items 时，`fetchAutonomousRunInsight()` 能正常返回。
- 自动驾驶舱不再展示联动看板加载失败。

### P1-2：暂停/放弃任务的状态语义混乱，可能阻塞新一轮自动驾驶

文件：

```text
apps/api/src/services/autonomous-writing.service.ts
apps/web/src/views/autopilot-view.vue
apps/web/src/features/autonomous-writing/components/autonomous-run-control-bar.vue
packages/shared/src/types/autonomous-writing.ts
apps/api/src/db/schema/ai.ts
```

当前状态：

- 后端创建新 Run 时把 `running` 和 `paused` 都视为 active blocker。
- 前端只有 `completed` / `failed` 时展示新建入口。
- 控制条按钮文案是“停止本轮”，但实际写入的是 `paused`。

问题：

“暂停”和“放弃”是两个不同语义：

- 暂停：临时停住，稍后继续，应该阻塞新任务。
- 放弃：本轮不要了，可以开启新任务。

当前系统把“停止本轮”实现成 `paused`，用户会以为任务已经放弃，但系统仍然阻止创建新任务。

推荐修复方案：

新增 `abandoned` 状态。

状态定义：

```ts
export type AutonomousRunStatus
  = | 'idle'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'abandoned'
```

后端规则：

```text
active blocker = idle | running | paused
terminal/history = completed | failed | abandoned
```

前端规则：

```ts
const terminalRunStatuses = ['completed', 'failed', 'abandoned']
```

需要新增接口：

```text
POST /api/projects/:projectId/autonomous-runs/:runId/abandon
```

行为：

- 只能对 `idle | running | paused` 的 Run 执行。
- 写入：

```ts
status: 'abandoned'
pausedReason: '用户放弃本轮自动驾驶'
finishedAt: now()
updatedAt: now()
```

- 可选：将该 Run 下未完成的 `autonomous_run_jobs` 标记为 `skipped`。

前端按钮调整：

- `running` 状态：
  - `暂停`：写入 `paused`。
  - `放弃本轮`：写入 `abandoned`。
- `paused` 状态：
  - `继续推进`：恢复 `running`。
  - `放弃本轮`：写入 `abandoned`。
- `completed | failed | abandoned`：
  - 展示“开启新一轮”。

验收标准：

- 暂停后的 Run 可以继续推进。
- 放弃后的 Run 不再阻塞新任务。
- 完成、失败、放弃后的 Run 都能作为历史记录展示，并允许新建下一轮。

### P2-1：驾驶舱顶部仍有“返回编辑器”，破坏左侧控制台心智

文件：

```text
apps/web/src/views/autopilot-view.vue
```

当前文案：

```text
返回编辑器
```

问题：

用户希望“左侧作为控制，右侧作为页面”，不希望每个模块像进入新房间。`返回编辑器` 会强化“我从编辑器跳进了自动驾驶舱，现在要返回”的心智。

修复要求：

将按钮改为中性快捷动作：

```text
打开正文工作区
```

或：

```text
查看正文
```

同时图标不要使用明显的返回箭头，可以使用 `PenLine` 或 `BookOpen`。

验收标准：

- 页面中不出现“返回编辑器”。
- 用户仍可从左侧或按钮进入正文工作区。

### P2-2：联动看板的已写字数是估算值，不是真实写回字数

文件：

```text
apps/api/src/services/autonomous-writing.service.ts
```

当前逻辑：

```ts
const writtenWords = run.completedChapterCount * run.targetWordsPerChapter
```

问题：

这只是估算值，不是实际章节正文长度。自动驾驶舱看板会让用户误以为这些字数是真实写回结果。

修复要求：

从当前 Run 的章节实际 draft 统计字数。

推荐实现：

1. 从 `autonomousRunJobs` 找出本轮 chapterId。
2. 查询对应 `chapters.draft`。
3. 统计实际长度：

```ts
const writtenWords = chaptersForRun.reduce((sum, chapter) => {
  return sum + (chapter.draft?.length || 0)
}, 0)
```

4. 如果要更贴近中文字数，可后续封装 `countChineseNovelWords()`，本轮先用 `draft.length` 即可。

验收标准：

- 自动驾驶写回正文后，`writtenWords` 与章节正文实际长度相关。
- 未写回正文的章节不会被目标字数虚假计入。

## 3. 推荐开发顺序

### 阶段 1：修复 insight SQL

优先级最高，因为它可能直接导致看板接口报错。

修改：

```text
apps/api/src/services/autonomous-writing.service.ts
```

步骤：

1. 导入 `inArray`。
2. 替换 `sql IN ${jobIds}`。
3. 本地用已有项目请求：

```bash
curl -s http://localhost:3000/api/projects/<projectId>/autonomous-runs/<runId>/insight
```

### 阶段 2：拆分暂停与放弃

修改：

```text
packages/shared/src/types/autonomous-writing.ts
apps/api/src/db/schema/ai.ts
apps/api/src/routes/autonomous-runs.ts
apps/api/src/services/autonomous-writing.service.ts
apps/web/src/api/autonomous-runs.ts
apps/web/src/features/autonomous-writing/composables/useAutonomousRun.ts
apps/web/src/features/autonomous-writing/components/autonomous-run-control-bar.vue
apps/web/src/views/autopilot-view.vue
```

步骤：

1. 加 `abandoned` 状态类型。
2. 如数据库 enum/check 不存在，则只更新 text 类型约束；如果迁移中有状态约束，补迁移。
3. 新增 abandon service 和 route。
4. 前端新增 `abandonAutonomousRun()` API。
5. 控制条新增“放弃本轮”。
6. `AutonomousRunLauncher` 的显示条件纳入 `abandoned`。
7. 后端 active blocker 不包含 `abandoned`。

### 阶段 3：调整驾驶舱顶部文案

修改：

```text
apps/web/src/views/autopilot-view.vue
```

步骤：

1. `返回编辑器` 改为 `打开正文工作区`。
2. `ChevronLeft` 改为 `PenLine` 或 `BookOpen`。
3. 保持按钮位置，但不要使用“返回”语义。

### 阶段 4：真实字数统计

修改：

```text
apps/api/src/services/autonomous-writing.service.ts
```

步骤：

1. 在 `getAutonomousRunInsight()` 中根据 run jobs 查询章节。
2. 用章节草稿真实长度计算 `writtenWords`。
3. 保留 `targetWords` 作为目标值。

## 4. 建议测试

### 4.1 自动检查

```bash
pnpm check
```

### 4.2 手工流程

1. 打开 `/project/:id/autopilot`。
2. 创建一轮自动驾驶任务。
3. 启动任务。
4. 查看联动看板是否正常加载。
5. 暂停任务，确认不能开启新任务，但可以继续。
6. 放弃任务，确认可以开启新一轮。
7. 完成一轮任务后，确认可以开启新一轮。
8. 检查“写作进度”的已写字数是否接近真实章节正文长度。

### 4.3 API 验证

```bash
curl -s http://localhost:3000/api/projects/<projectId>/autonomous-runs/latest
curl -s http://localhost:3000/api/projects/<projectId>/autonomous-runs/<runId>/insight
curl -s -X POST http://localhost:3000/api/projects/<projectId>/autonomous-runs/<runId>/abandon
```

## 5. 验收标准

完成后必须满足：

- 自动驾驶舱 insight 接口不再因为 PostgreSQL 数组查询失败。
- 暂停和放弃语义清晰。
- 放弃、完成、失败后的 Run 不阻塞新一轮。
- 页面不再出现“返回编辑器”这种新房间式文案。
- 自动驾驶舱展示的已写字数来自真实正文，而不是目标字数估算。
- `pnpm check` 通过。

