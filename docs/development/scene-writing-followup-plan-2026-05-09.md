# 场景级写作闭环后续修改文档

日期：2026-05-09  
状态：待执行  
关联文档：

1. [plotpilot-next-alignment-plan-2026-05-06.md](./plotpilot-next-alignment-plan-2026-05-06.md)
2. [plotpilot-remaining-adoption-roadmap-2026-05-04.md](./plotpilot-remaining-adoption-roadmap-2026-05-04.md)
3. [frontend-structure-regression-fix-plan-2026-05-06.md](./frontend-structure-regression-fix-plan-2026-05-06.md)

范围：场景级规划、场景级写作、AI 场景生成、场景上下文、写作任务、验证环境。  
目标：在已经接入 `chapter_scenes` 的基础上，把“场景规划 -> 场景正文 -> 组装章节 -> 章后分析”的闭环做完整，并补齐可验证、可回滚、可审查的工程边界。

---

## 1. 当前状态

当前项目已经完成了场景级写作的第一轮接入：

1. 大纲页已接入 `ScenePlanner`。
2. 写作页已接入 `SceneDraftPanel`。
3. 前端已有 `scene.store.ts` 和 `api/scenes.ts`。
4. 后端已有 `routes/scenes.ts`。
5. AI 生成已支持传递 `sceneId`。
6. 场景模式下 AI 确认已改为写入当前场景内容。
7. 场景重排已加 `chapterId` 限定和事务保护。

但当前能力仍属于“可用雏形”，还没有达到完整产品闭环。下一轮应优先处理：

1. 场景 AI 批量应用的原子性。
2. 场景正文保存和错误反馈。
3. 场景级一致性检查。
4. 写作任务的 `scene_draft` 模式闭环。
5. 场景级章后分析和健康指标。
6. 当前本地验证环境的 native binding 阻塞。

---

## 2. 必须先处理的验证环境问题

### 2.1 当前问题

当前 `pnpm typecheck` 可以通过，但完整门禁仍被本地原生依赖阻塞：

1. `pnpm check` 在 lint 阶段报 `oxc-parser` native binding 缺失。
2. `pnpm build` / `pnpm test` 会被 Rollup darwin arm64 native binding 或 code signature 问题阻塞。

这类错误不是业务代码类型错误，但会导致后续 AI 无法完成完整验收。

### 2.2 修复要求

在继续功能开发前，先修复本地依赖环境：

```bash
pnpm install
pnpm check
```

如果仍失败，再按实际错误处理 native optional dependency。不要在未跑通完整门禁时宣称“全部完成”。

### 2.3 验收标准

1. `pnpm typecheck` 通过。
2. `pnpm lint` 通过。
3. `pnpm build` 通过。
4. `pnpm test` 通过。
5. 如果 native binding 仍阻塞，必须在最终说明中明确是环境阻塞，并贴出关键错误。

---

## 3. 后续开发顺序

必须按以下顺序推进：

| 顺序 | 阶段 | 优先级 | 目标 |
| --- | --- | --- | --- |
| 0 | 修复验证环境 | P0 | 恢复 `pnpm check` 可用 |
| 1 | 场景 AI 批量应用原子化 | P1 | 避免 AI 场景建议半应用 |
| 2 | 场景正文保存体验补齐 | P1 | 自动保存失败可见，离开前不丢内容 |
| 3 | 场景级一致性检查 | P1 | AI 生成场景正文后按场景约束审查 |
| 4 | `scene_draft` 写作任务闭环 | P1 | 任务流能生成、审查、写入单个场景 |
| 5 | 场景组装章节确认区 | P2 | 组装章节前给作者确认和 diff |
| 6 | 场景级章后分析 | P2 | 从场景正文抽取事件、伏笔、事实 |
| 7 | 场景健康指标 | P2 | 监控场景目标、冲突、人物出场和节奏 |

---

## 4. 阶段 1：场景 AI 批量应用原子化

### 4.1 当前问题

当前前端解析 AI 返回的 JSON 后，会循环调用：

```text
sceneStore.createScene(...)
```

这能创建场景，但不是原子操作。如果第 3 个场景创建失败，前 2 个场景已经写入，用户会得到半应用状态。

### 4.2 修改目标

新增后端批量创建接口，由后端统一校验并使用事务写入。

### 4.3 后端修改

文件：

```text
apps/api/src/routes/scenes.ts
apps/api/src/db/schema/chapter.ts
packages/shared/src/types/structure.ts
```

新增接口：

```http
POST /api/projects/:projectId/chapters/:chapterId/scenes/bulk
```

请求：

```ts
interface BulkCreateScenesInput {
  scenes: CreateSceneInput[]
  mode?: 'append' | 'replace'
}
```

要求：

1. 先校验 `chapterId` 属于 `projectId`。
2. 校验 `scenes` 是非空数组。
3. 校验每个场景至少有 `title` 或 `purpose`。
4. 校验 `sceneNumber` / `orderIndex` 合法。
5. 使用 `db.transaction` 包住全部写入。
6. `replace` 模式必须在同一事务中删除当前章节旧场景再写入新场景。
7. 返回写入后的完整场景列表，并按 `orderIndex, sceneNumber` 排序。

### 4.4 前端修改

文件：

```text
apps/web/src/api/scenes.ts
apps/web/src/stores/scene.store.ts
apps/web/src/features/outline/composables/useOutlineWorkspace.ts
apps/web/src/features/outline/components/ScenePlanner.vue
```

要求：

1. `applySceneSuggestion` 不再循环调用 `createScene`。
2. 调用 `sceneStore.bulkCreateScenes`。
3. UI 提供两个动作：
   - `追加到场景列表`
   - `替换当前场景列表`
4. 替换动作必须用设计系统确认弹窗，说明会覆盖当前章节场景列表。
5. 解析失败时保留 AI 原文，不清空建议。

### 4.5 验收标准

1. AI 返回 5 个场景时，一次请求写入。
2. 任意一个场景数据非法时，旧场景不丢失。
3. 替换模式失败时，旧场景不丢失。
4. `pnpm check` 通过。

---

## 5. 阶段 2：场景正文保存体验补齐

### 5.1 当前问题

当前 `useSceneDraft.ts` 会自动保存场景正文，但保存失败只 `console.error`，用户不可见。离开场景或切换章节时也没有明确的保存失败提示。

### 5.2 修改目标

让场景正文保存状态和错误对用户可见，并避免静默丢失。

### 5.3 修改文件

```text
apps/web/src/features/writing/composables/useSceneDraft.ts
apps/web/src/views/WritingView.vue
apps/web/src/features/writing/components/SceneDraftPanel.vue
```

### 5.4 修改要求

`useSceneDraft` 增加：

```ts
const saveError = ref<string | null>(null)
const dirty = computed(() => sceneContent.value !== lastSavedContent.value)
```

行为：

1. 自动保存失败时设置 `saveError`。
2. 写作页顶部展示“场景保存失败”。
3. 切换场景前，如果当前场景有未保存内容，应先保存；保存失败则阻止切换。
4. 切换章节前，如果当前场景保存失败，应阻止切换并提示用户。
5. 手动保存按钮应在场景模式下保存场景正文。

### 5.5 验收标准

1. 断网或接口失败时，用户能看到保存失败。
2. 保存失败时切换场景不会静默丢内容。
3. 恢复后可以手动保存成功。

---

## 6. 阶段 3：场景级一致性检查

### 6.1 当前问题

AI 生成已经能传 `sceneId`，但一致性检查还需要明确使用场景约束。否则 AI 正文可能符合章节大纲，却偏离当前场景目标。

### 6.2 后端修改

文件：

```text
apps/api/src/routes/consistency.ts
apps/api/src/services/consistency-guard.service.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/services/ai-context-renderer.ts
packages/shared/src/types/ai-context.ts
```

要求：

1. 一致性检查输入支持 `sceneId`。
2. `runConsistencyGuard` 构建上下文时传入 `sceneId`。
3. 如果 scene 为 `draft` 且存在 `sceneId`，检查项必须包含：
   - 是否完成场景目的。
   - 是否出现指定角色。
   - 是否使用指定地点 / 时间线。
   - 是否推进场景冲突。
   - 是否偏离章节目标。
4. 风险报告中标明风险来源是“章节级”还是“场景级”。

### 6.3 前端修改

文件：

```text
apps/web/src/api/ai.ts
apps/web/src/features/ai-assistant/composables/useAIAssistantSession.ts
apps/web/src/features/ai-assistant/components/AIAssistantSidebar.vue
apps/web/src/features/writing/components/WritingContextPanel.vue
```

要求：

1. `checkConsistency` 支持传 `sceneId`。
2. 场景模式下将当前 `sceneId` 传给一致性检查。
3. 一致性检查失败时继续保持“禁止应用”状态。

### 6.4 验收标准

1. 场景正文生成后，一致性报告能引用当前场景目标。
2. 偏离当前场景目的时，会出现风险项。
3. 审查失败不会允许直接应用。

---

## 7. 阶段 4：`scene_draft` 写作任务闭环

### 7.1 当前问题

当前写作任务已有 `scene_draft` 类型迹象，但需要确认它能完整执行：

```text
准备场景上下文
  ↓
生成场景草稿
  ↓
一致性检查
  ↓
作者确认
  ↓
写入 chapter_scenes.content
  ↓
更新场景状态
```

### 7.2 修改文件

```text
apps/api/src/services/writing-job.service.ts
apps/api/src/routes/writing-jobs.ts
apps/web/src/features/writing-jobs/components/WritingJobLauncher.vue
apps/web/src/features/writing-jobs/components/WritingJobStepTimeline.vue
apps/web/src/features/writing-jobs/composables/useWritingJobController.ts
packages/shared/src/types/writing-job.ts
```

### 7.3 修改要求

1. 创建 `scene_draft` 任务时必须选择 `chapterId + sceneId`。
2. 后端校验 `sceneId` 属于 `chapterId + projectId`。
3. `generate_draft` 输出写入任务步骤 output，不直接写场景正文。
4. `confirm_apply` 通过后新增或复用 `apply_draft`，写入 `chapter_scenes.content`。
5. 场景写入成功后更新 `chapter_scenes.status = reviewed` 或 `completed`。
6. 写作任务 Timeline 展示当前场景标题。

### 7.4 验收标准

1. 用户能从写作任务创建一个场景草稿任务。
2. 任务确认前不会写入场景正文。
3. 确认后只写入目标场景，不影响章节草稿。
4. 拒绝或失败后可以重试。

---

## 8. 阶段 5：场景组装章节确认区

### 8.1 当前问题

当前写作页可以把多个场景内容组装进章节草稿，但这个动作会直接写入章节草稿并保存，缺少确认区和 diff。

### 8.2 修改目标

组装章节应遵守“AI / 自动结果不得直接覆盖作者内容”的边界。即使场景正文来自作者，也应在覆盖章节草稿前展示确认。

### 8.3 修改文件

```text
apps/web/src/views/WritingView.vue
apps/web/src/features/writing/components/ChapterAssembleConfirmPanel.vue
```

### 8.4 修改要求

新增确认区：

1. 展示当前章节草稿字数。
2. 展示场景组装后字数。
3. 展示将被覆盖的范围说明。
4. 支持：
   - 替换章节草稿
   - 追加到章节草稿末尾
   - 保存为版本备选
   - 取消

### 8.5 验收标准

1. 点击“组装章节”不会立即覆盖章节草稿。
2. 用户确认后才写入。
3. 写入前自动保存一份版本快照。

---

## 9. 阶段 6：场景级章后分析

### 9.1 当前问题

章后分析目前以章节正文为单位。进入场景写作后，系统应能从单个场景中抽取结构化信息，但不应过早把场景内容当成整章结论。

### 9.2 修改目标

新增场景级分析结果，最终由章节级分析汇总。

### 9.3 建议数据模型

可以先不新增表，复用 `chapter_postprocess_suggestions`，但 payload 中增加：

```ts
{
  scope: 'scene'
  sceneId: string
}
```

如果后续复杂度上升，再新增：

```text
scene_postprocess_runs
scene_postprocess_suggestions
```

### 9.4 修改要求

1. 场景保存后不自动写正式事实库。
2. 场景级事实、伏笔、人物状态进入待确认队列。
3. 场景级建议在 UI 上标记来源场景。
4. 章节组装完成后，再运行章节级章后分析。

### 9.5 验收标准

1. 单个场景可以生成结构化建议。
2. 建议能显示“来源场景”。
3. 用户确认后才写入正式事实、伏笔或章节元素。

---

## 10. 阶段 7：场景健康指标

### 10.1 当前问题

项目健康页已有基础指标，但还没有场景级维度。

### 10.2 修改文件

```text
apps/api/src/services/health-metrics.service.ts
apps/web/src/views/ProjectHealthView.vue
packages/shared/src/types/health.ts
```

### 10.3 新增指标

1. 未规划场景的章节数。
2. 有场景但无正文的场景数。
3. 已完成场景字数和目标字数偏差。
4. 场景目的为空的场景数。
5. 场景冲突为空的场景数。
6. 人物出场不符合章节元素约束的场景数。
7. 场景状态分布。

### 10.4 验收标准

1. 健康页能指出哪些章节缺少场景规划。
2. 能跳转到对应章节的大纲页或写作页。
3. 指标不只是统计，还要给出修复动作。

---

## 11. 测试计划

### 11.1 必跑命令

```bash
pnpm check
pnpm db:migrate
```

如果改了 schema：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

### 11.2 建议新增测试

后端：

1. `scenes` bulk create 事务测试。
2. `scenes/reorder` 跨章节 ID 拒绝测试。
3. `writing-job` scene_draft 归属校验测试。
4. `consistency-guard` sceneId 上下文测试。

前端：

1. AI 场景建议解析成功测试。
2. AI 场景建议解析失败保留文本测试。
3. 场景模式 AI 确认写入 `sceneContent` 测试。
4. 场景保存失败提示测试。
5. 组装章节确认区测试。

### 11.3 手工验收流程

1. 创建项目。
2. 创建章节。
3. 在大纲页用 AI 生成场景。
4. 应用场景建议。
5. 进入写作页，切换场景模式。
6. 选择一个场景。
7. 使用 AI 生成场景正文。
8. 通过一致性检查后确认写入。
9. 保存场景。
10. 组装章节。
11. 确认写入章节草稿。
12. 运行章后分析。
13. 查看健康页风险变化。

---

## 12. 给后续 AI 的执行提示

1. 先修复验证环境，不要绕过 `pnpm check`。
2. 不要再新增平行的场景 store 或场景表。
3. 不要让 AI 生成场景直接覆盖用户已有场景。
4. 批量写入必须使用后端事务。
5. 所有嵌套路由都必须校验 `projectId + chapterId + sceneId`。
6. 场景正文、章节正文、AI 建议必须保持不同状态，不要混用同一个 ref 导致写错目标。
7. 所有 AI 输出进入确认区后再写入。
8. 完成后必须说明：
   - 修改了哪些文件。
   - 跑了哪些验证。
   - 哪些验证未跑通以及原因。

