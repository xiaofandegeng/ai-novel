# AI 小说创作工作台流程逻辑修复文档

日期：2026-04-29  
状态：待修复  
适用范围：当前项目的流程闭环、业务逻辑和数据边界修复

## 1. 当前结论

当前项目已经从“无法构建/无法 seed”的状态推进到可基础验收：

1. `pnpm lint` 已通过。
2. `pnpm build` 已通过。
3. `pnpm test` 已通过。
4. `pnpm --filter @ai-novel/api db:seed` 已通过。
5. SQLite 当前已有核心表：
   - `novel_projects`
   - `story_bibles`
   - `characters`
   - `volumes`
   - `chapters`
   - `character_relationships`
   - `conflicts`
   - `chapter_versions`
   - `knowledge_sources`
   - `knowledge_chunks`
   - `knowledge_notes`
   - `quality_reports`

但当前仍存在流程和逻辑问题，不能直接判定为完整交付：

1. 前端存在重复路由注册。
2. 质量评估页面仍未调用后端评估 API。
3. 知识库上传流程的 loading 和错误处理不可靠。
4. 部分后端详情/删除接口未校验 `projectId` 数据归属。
5. API live check 当前受端口残留进程影响，仍需要重新确认。

当前建议阶段：

```text
阶段：流程逻辑修复阶段
目标：让已存在的功能入口真正形成可用闭环，并补齐项目级数据隔离
```

## 2. 最新验收结果

已通过：

```bash
pnpm lint
pnpm build
pnpm test
pnpm --filter @ai-novel/api db:seed
```

数据库验证：

```bash
sqlite3 apps/api/data/ai-novel.db ".tables"
```

已确认存在：

```text
chapter_versions
character_relationships
conflicts
knowledge_chunks
knowledge_notes
knowledge_sources
quality_reports
```

仍需重新确认：

```bash
pnpm --filter @ai-novel/api dev
curl http://localhost:3000/api/health
curl http://localhost:3000/api/projects
```

注意：当前端口 3000 曾出现残留 node 进程监听但 curl 不通的情况。修复前建议先清理旧进程，再启动 API。

## 3. 修复优先级

```text
P1：修复流程闭环和数据边界
  ↓
P2：统一错误状态和交互反馈
  ↓
P3：补测试覆盖和最终验收
```

## 4. P1 修复项：重复路由注册

### 4.1 删除重复的 versions / quality 路由

问题文件：

`apps/web/src/router/index.ts`

当前问题：

`/project/:id/versions` 和 `/project/:id/quality` 各注册了两次：

```ts
{
  path: '/project/:id/versions',
  name: 'versions',
  component: () => import('@/views/VersionHistoryView.vue'),
},
{
  path: '/project/:id/quality',
  name: 'quality',
  component: () => import('@/views/QualityReviewView.vue'),
},
{
  path: '/project/:id/versions',
  name: 'versions',
  component: () => import('@/views/VersionHistoryView.vue'),
},
{
  path: '/project/:id/quality',
  name: 'quality',
  component: () => import('@/views/QualityReviewView.vue'),
},
```

影响：

1. Vue Router 的 name 映射会被覆盖。
2. 后续用 name 跳转、面包屑、权限守卫、埋点时可能出现不可预期行为。
3. 维护者会误判路由结构。

修复要求：

只保留一组：

```ts
{
  path: '/project/:id/versions',
  name: 'versions',
  component: () => import('@/views/VersionHistoryView.vue'),
},
{
  path: '/project/:id/quality',
  name: 'quality',
  component: () => import('@/views/QualityReviewView.vue'),
},
```

验收：

```bash
rg "name: 'versions'|name: 'quality'" apps/web/src/router/index.ts
pnpm lint
pnpm build
```

期望：

1. `versions` 只出现一次。
2. `quality` 只出现一次。
3. lint/build 通过。

## 5. P1 修复项：质量评估闭环

### 5.1 QualityReviewView 必须调用后端质量评估 API

问题文件：

1. `apps/web/src/views/QualityReviewView.vue`
2. `apps/api/src/routes/quality.ts`
3. 可能新增或扩展：`apps/web/src/stores/projects.ts`

当前问题：

`QualityReviewView.vue` 当前分数来自前端硬编码：

```ts
const qualityDimensions = computed(() => [
  { label: '节奏密度', score: hasEnoughText.value ? 76 : 0 },
  { label: '冲突强度', score: hasEnoughText.value ? 68 : 0 },
])
```

按钮没有调用后端：

```vue
<NButton variant="primary" size="sm" :disabled="!hasEnoughText">
  生成质量报告
</NButton>
```

但后端已经有：

```text
POST /api/projects/:projectId/chapters/:chapterId/quality-check
GET  /api/projects/:projectId/quality/reports
GET  /api/projects/:projectId/quality/reports/:id
```

修复要求：

前端新增状态：

```ts
const reports = ref<any[]>([])
const selectedReport = ref<any | null>(null)
const evaluating = ref(false)
```

新增方法：

```ts
async function fetchReports() {
  reports.value = await api.get(`/api/projects/${projectId}/quality/reports`)
}

async function runQualityCheck() {
  if (!selectedChapterId.value)
    return
  evaluating.value = true
  try {
    const report = await api.post(
      `/api/projects/${projectId}/chapters/${selectedChapterId.value}/quality-check`,
      {},
    )
    selectedReport.value = report
    await fetchReports()
  }
  finally {
    evaluating.value = false
  }
}
```

UI 需要展示：

1. 当前报告的总分。
2. 5 个维度分数。
3. issues 列表。
4. suggestions 列表。
5. 历史报告列表。
6. loading / error / empty 状态。

注意：

后端当前是 mock 分析，但前端必须真实调用后端 API，并展示后端返回结果。不要继续用前端硬编码分数冒充流程闭环。

验收：

```bash
pnpm --filter @ai-novel/api dev
curl -X POST http://localhost:3000/api/projects/<projectId>/chapters/<chapterId>/quality-check
curl http://localhost:3000/api/projects/<projectId>/quality/reports
pnpm lint
pnpm build
```

页面验收：

1. 点击“生成质量报告”会进入 loading。
2. 成功后评分从 API 返回。
3. 刷新页面后历史报告仍能加载。
4. 未选章节或正文为空时有明确提示。

## 6. P1 修复项：知识库上传异步流程

### 6.1 修复 FileReader onload 不被 await 的问题

问题文件：

`apps/web/src/views/KnowledgeBaseView.vue`

当前问题：

当前流程：

```ts
const reader = new FileReader()
reader.onload = async (e) => {
  const content = e.target?.result as string
  await api.post(`/api/projects/${projectId}/knowledge/sources/${source.id}/analyze`, { content })
  toast.add('Reference material uploaded and analyzed', 'success')
  fetchSources()
}
reader.readAsText(file)
```

然后外层 `finally` 会立即执行：

```ts
finally {
  uploading.value = false
  input.value = ''
}
```

影响：

1. 文件尚未读取/分析完成，上传状态就结束。
2. `reader.onload` 内部报错不会被外层 `catch` 捕获。
3. 用户可能看到“没有 loading 但后台还在分析”的错觉。
4. 分析失败时错误反馈不可靠。

修复要求：

把 FileReader 封装成 Promise：

```ts
function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
```

然后在 `handleFileUpload` 中完整 await：

```ts
uploading.value = true
try {
  const source = await api.post(...)
  const content = await readFileAsText(file)
  await api.post(`/api/projects/${projectId}/knowledge/sources/${source.id}/analyze`, { content })
  await fetchSources()
  toast.add('Reference material uploaded and analyzed', 'success')
}
catch (error) {
  toast.add('Upload failed', 'error')
}
finally {
  uploading.value = false
  input.value = ''
}
```

建议补充：

1. 限制文件类型为 `.txt`。
2. 大文件给出大小提示。
3. 分析中禁用上传按钮。
4. source 状态从 pending/processing/completed/failed 显示到列表。

验收：

1. 上传过程中 loading 一直保持到 analyze 完成。
2. analyze 失败时能显示错误 toast。
3. 成功后 source 状态变为 completed。
4. `fetchSources()` 被 await。

## 7. P1 修复项：后端数据归属校验

### 7.1 知识库 source 详情必须校验 projectId

问题文件：

`apps/api/src/routes/knowledge.ts`

当前问题：

```ts
const [source] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, id))
```

只按 `source.id` 查询，没有限制 `projectId`。

修复要求：

```ts
const [source] = await db
  .select()
  .from(knowledgeSources)
  .where(and(
    eq(knowledgeSources.id, id),
    eq(knowledgeSources.projectId, projectId),
  ))
```

同文件还需要检查：

1. `POST /knowledge/sources/:id/analyze`
2. `GET /knowledge/search`
3. `GET /knowledge/notes`

其中 analyze 也应先确认 source 属于当前 project，再允许写 chunks 和改 status。

验收：

1. 使用 A 项目的路径访问 B 项目的 source id，应返回 404。
2. 使用 A 项目的路径 analyze B 项目的 source id，应返回 404。

### 7.2 质量报告详情必须校验 projectId

问题文件：

`apps/api/src/routes/quality.ts`

当前问题：

```ts
const [report] = await db.select().from(qualityReports).where(eq(qualityReports.id, id))
```

只按 report id 查询，没有限制 `projectId`。

修复要求：

```ts
where(and(
  eq(qualityReports.id, id),
  eq(qualityReports.projectId, projectId),
))
```

验收：

使用 A 项目的路径访问 B 项目的 report id，应返回 404。

### 7.3 版本删除必须校验 projectId

问题文件：

`apps/api/src/routes/versions.ts`

当前问题：

```ts
db.delete(chapterVersions).where(eq(chapterVersions.id, id))
```

忽略了路由中的 `projectId`。

修复要求：

```ts
const projectId = c.req.param('projectId')
const row = db.delete(chapterVersions).where(and(
  eq(chapterVersions.id, id),
  eq(chapterVersions.projectId, projectId),
)).returning().get()
```

验收：

使用 A 项目的路径删除 B 项目的 version id，应返回 404，且 B 项目快照仍存在。

## 8. P2 修复项：API live check 与端口清理

### 8.1 重新确认 API 服务可访问

当前观察：

1. `db:seed` 已通过。
2. 端口 3000 曾显示已有 node 进程监听。
3. `curl http://localhost:3000/api/health` 曾连接失败。
4. 新启动 API 时出现过 `EADDRINUSE`。

建议处理：

1. 清理残留 API dev 进程。
2. 重新启动 API。
3. 使用 `127.0.0.1` 和 `localhost` 分别检查。

命令：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
pnpm --filter @ai-novel/api dev
curl http://127.0.0.1:3000/api/health
curl http://localhost:3000/api/health
curl http://127.0.0.1:3000/api/projects
```

验收：

1. API 只有一个有效监听进程。
2. health 返回 connected。
3. projects 返回 seed 项目。

## 9. 建议执行顺序

### 第 1 步：修重复路由

范围：

`apps/web/src/router/index.ts`

验收：

```bash
rg "name: 'versions'|name: 'quality'" apps/web/src/router/index.ts
pnpm lint
pnpm build
```

### 第 2 步：修后端数据归属

范围：

1. `apps/api/src/routes/knowledge.ts`
2. `apps/api/src/routes/quality.ts`
3. `apps/api/src/routes/versions.ts`

验收：

```bash
pnpm build
pnpm --filter @ai-novel/api db:seed
```

建议补测试：

1. 跨项目读取 source 返回 404。
2. 跨项目读取 report 返回 404。
3. 跨项目删除 version 返回 404。

### 第 3 步：修知识库上传异步状态

范围：

`apps/web/src/views/KnowledgeBaseView.vue`

验收：

```bash
pnpm lint
pnpm build
```

页面验收：

1. 上传分析期间 loading 不提前结束。
2. 成功/失败 toast 准确。

### 第 4 步：补质量评估前后端闭环

范围：

1. `apps/web/src/views/QualityReviewView.vue`
2. 可能新增 quality store/composable。

验收：

1. 点击生成质量报告会调用后端。
2. 页面展示后端返回报告。
3. 历史报告刷新后仍存在。

### 第 5 步：完整验收

命令：

```bash
pnpm lint
pnpm build
pnpm test
pnpm --filter @ai-novel/api db:seed
pnpm --filter @ai-novel/api dev
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/projects
```

## 10. 交给其他 AI 的开发提示词

可以直接复制下面内容给其他 AI：

```text
请修复 AI 小说创作工作台当前的流程和逻辑问题，不要新增无关功能。

请先阅读：
1. docs/product/ai-novel-workbench-product-design.md
2. docs/design/ai-novel-workbench-ui-design-spec.md
3. docs/development/ai-agent-development-sequence.md
4. docs/development/remediation-plan-2026-04-28.md

当前已通过：
- pnpm lint
- pnpm build
- pnpm test
- pnpm --filter @ai-novel/api db:seed

需要修复：
1. 删除 apps/web/src/router/index.ts 中重复的 versions / quality 路由注册。
2. 让 QualityReviewView 调用后端 `/quality-check` API，并展示/保存/刷新质量报告。
3. 修复 KnowledgeBaseView 上传流程，把 FileReader 封装成 Promise，确保 loading 和错误处理覆盖读取与 analyze 全流程。
4. 修复后端 projectId 数据归属校验：
   - knowledge source detail/analyze
   - quality report detail
   - version delete
5. 清理 API 端口残留并重新确认 `/api/health` 与 `/api/projects`。

每一步完成后运行对应验收命令。最终必须汇报：
- 修改文件
- 修复内容
- 验收命令
- 验收结果
- 剩余风险
```

## 11. 完成标准

只有同时满足以下条件，才能把当前流程逻辑修复阶段标记为完成：

1. `versions` / `quality` 路由不重复。
2. 质量评估页面真实调用后端 API。
3. 质量报告能持久化并刷新后可见。
4. 知识库上传 loading 覆盖读取和 analyze 全流程。
5. 知识库上传失败有可靠错误提示。
6. 后端 source/report/version 操作都校验 `projectId`。
7. `pnpm lint` 通过。
8. `pnpm build` 通过。
9. `pnpm test` 通过。
10. `pnpm --filter @ai-novel/api db:seed` 通过。
11. `/api/health` 可访问。
12. `/api/projects` 返回 seed 项目。
