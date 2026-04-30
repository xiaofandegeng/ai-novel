# 流程与逻辑审计修复文档

日期：2026-04-29  
范围：项目主流程、API 连通、AI 协作边界、知识库、质量评估、数据归属校验。  
结论：当前项目已经能构建、能迁移、能启动，项目、设定、角色、关系、冲突、大纲、正文、版本等基础 CRUD 大体可用；但仍有几个流程级问题会让用户感觉“功能有入口但没有真正调通”。

## 1. 本次已验证通过的内容

运行结果：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
pnpm db:migrate
```

结果：

- `pnpm check` 通过：lint、typecheck、build、test 均通过。
- PostgreSQL migration 可重复执行并成功。
- 后端健康检查正常，返回 `databaseType: postgresql`。
- 前端 dev server 可访问 `http://localhost:5173/`。
- API 基础 GET 流程可用：
  - `/api/projects`
  - `/api/projects/:projectId/story-bible`
  - `/api/projects/:projectId/characters`
  - `/api/projects/:projectId/volumes`
  - `/api/projects/:projectId/chapters`
  - `/api/projects/:projectId/relationships`
  - `/api/projects/:projectId/conflicts`
  - `/api/projects/:projectId/knowledge/sources`
  - `/api/projects/:projectId/quality/reports`
- 浏览器检查：
  - 大纲页可正常加载，之前的 `[object HTMLTextAreaElement]` 问题已消失。
  - 质量评估页可打开，但历史报告未正确显示，见 P0-1。

## 2. P0 必修复问题

### P0-1 质量评估页面 API 解析错误，导致报告列表和新报告不能进入 UI

位置：

- `apps/web/src/views/QualityReviewView.vue:62-85`
- `apps/web/src/composables/useApi.ts:8-21`

问题：

`useApi().get()` 和 `useApi().post()` 已经会解包统一响应，只返回 `json.data`。但 `QualityReviewView.vue` 仍把返回值当成 `{ success, data }` 处理：

```ts
const res = await api.get<{ success: boolean, data: QualityReport[] }>(...)
if (res && res.success) {
  reports.value = res.data
}
```

实际返回的是 `QualityReport[]`，所以 `res.success` 为 `undefined`。后果：

1. 历史报告接口实际有数据，但页面显示“尚无评估历史”。
2. 点击“生成质量报告”后，后端会创建报告，但前端不会显示，也不会 toast 成功。
3. 用户会认为质量评估功能没有调通。

修复要求：

1. 删除页面中直接使用 `useApi` 的质量评估请求。
2. 改为使用已有的 `useQualityStore()` 或 `apps/web/src/api/quality.ts`。
3. `fetchReports()` 直接接收 `QualityReport[]`。
4. `runQualityCheck()` 直接接收 `QualityReport`。
5. 生成报告后必须刷新报告列表并选中新报告。

建议实现：

```ts
import { useQualityStore } from '../stores/quality.store'

const qualityStore = useQualityStore()

async function fetchReports() {
  await qualityStore.fetchReports(projectId)
  reports.value = qualityStore.reports
  selectedReport.value ||= reports.value[0] || null
}

async function runQualityCheck() {
  const report = await qualityStore.runQualityCheck(projectId, selectedChapterId.value)
  selectedReport.value = report
  reports.value = qualityStore.reports
  toast.add('质量报告已成功生成', 'success')
}
```

验收：

1. 访问 `/project/:id/quality` 能看到历史报告。
2. 点击“生成质量报告”后，新报告立即显示在右侧评估区。
3. 刷新页面后报告仍存在。

## 3. P1 高优先级问题

### P1-1 质量评估后端仍是随机 mock，不是产品要求的 AI 质量评估

位置：

- `apps/api/src/services/quality.service.ts:28-46`

问题：

当前质量评估使用 `Math.random()` 生成分数，并返回英文固定建议：

```ts
score: Math.floor(Math.random() * 30) + 70
issues: JSON.stringify(['Rhythm starts slow', ...])
```

这只能验证“报告能保存”，不能验证“AI 质量评估可用”。同一章节多次评估会得到随机变化的分数，缺少可信度。

修复要求：

1. 接入 `ai.service.ts` 中的已配置 AI provider。
2. 如果 API Key 未配置，返回明确错误：`AI 服务未配置，请先在项目设置中完成 AI 配置检测`。
3. 使用结构化 JSON 输出，字段包括：
   - `score`
   - `rhythmScore`
   - `conflictScore`
   - `logicScore`
   - `characterScore`
   - `styleScore`
   - `issues`
   - `suggestions`
4. JSON 解析失败时返回可读错误，不保存伪报告。
5. 建议内容必须是中文。

验收：

1. 未配置 AI Key 时，质量评估页面展示明确配置提示。
2. 配置可用 AI 后，报告内容与章节正文相关。
3. 同一章节重复评估允许有差异，但不能是随机空泛建议。

### P1-2 知识库拆书仍是占位摘要，未形成真正知识库

位置：

- `apps/api/src/services/knowledge.service.ts:70-108`

问题：

当前知识库分析只按正则拆章节，并写入：

```ts
summary: `Summary of ${title}`
summary: 'Full text summary'
```

这导致上传经典小说后只是“保存文本分片”，没有完成产品要求的章节总结、技巧提炼、冲突推进分析，也无法真正服务后续写作。

修复要求：

1. 保留现有章节拆分作为第一步，但新增 AI 分析步骤。
2. 对每个 chunk 生成：
   - 中文摘要 `summary`
   - 写作技巧 `techniques`
   - 人物/冲突推进方式
   - 可复用结构建议
3. 长文本要分批处理，避免一次请求超过模型上下文。
4. AI 失败时 source 状态应为 `failed`，并返回失败原因。
5. 后续写作引用知识库时，只引用结构和技巧，不直接仿写原文表达。

验收：

1. 上传 `.txt` 后 source 状态从 `pending -> processing -> completed`。
2. chunk 详情中不再出现 `Summary of ...` 或 `Full text summary`。
3. 搜索知识库时能搜到 AI 生成的摘要/技巧内容。

### P1-3 知识库前端声明了创建笔记 API，但后端没有对应路由

位置：

- `apps/web/src/api/knowledge.ts:28-30`
- `apps/api/src/routes/knowledge.ts:55-58`

问题：

前端 API 暴露了：

```ts
createNote(projectId, data)
```

但后端只实现了 `GET /knowledge/notes`，没有 `POST /knowledge/notes`。如果后续 UI 调用该方法，会得到 404，知识条目无法持久化。

修复要求：

1. 在 `knowledge.service.ts` 增加 `createNote(projectId, input)`。
2. 在 `knowledge.ts` route 增加：

```text
POST /api/projects/:projectId/knowledge/notes
```

3. 校验 `sourceId` 归属当前 `projectId`，没有 sourceId 时允许创建项目级笔记。
4. 前端知识库页面补充“保存为知识条目”入口，或删除未使用的 `createNote` API，避免假能力。

验收：

1. 能创建知识笔记。
2. 刷新页面后笔记仍存在。
3. 不能用 A 项目路径给 B 项目的 source 创建 note。

### P1-4 部分写入接口没有校验关联资源归属，存在跨项目数据串联风险

位置：

- `apps/api/src/routes/chapters.ts:25-49`
- `apps/api/src/routes/chapters.ts:53-75`
- `apps/api/src/routes/relationships.ts:14-23`
- `apps/api/src/services/version.service.ts:14-35`

问题：

这些接口只使用 URL 中的 `projectId` 写入当前资源，但没有校验关联 ID 是否也属于同一项目：

1. 创建/更新章节时，`volumeId` 可能来自其他项目。
2. 创建/更新人物关系时，`characterAId` 和 `characterBId` 可能来自其他项目。
3. 创建版本快照时，`chapterId` 可能来自其他项目，但快照会被写成当前 URL 的 `projectId`。

这会破坏项目数据边界，后续导出、版本恢复、关系图都会出现跨项目污染。

修复要求：

1. 新增 service 层校验函数：
   - `assertVolumeBelongsToProject(projectId, volumeId)`
   - `assertChapterBelongsToProject(projectId, chapterId)`
   - `assertCharactersBelongToProject(projectId, ids)`
2. 创建/更新章节前校验 `volumeId`。
3. 创建/更新关系前校验两个角色 ID。
4. 创建版本快照前校验章节归属。
5. 校验失败返回 400 或 404，不能写入数据库。

验收：

1. 使用其他项目的 `volumeId` 创建章节会失败。
2. 使用其他项目的 `characterId` 创建关系会失败。
3. 使用其他项目的 `chapterId` 创建快照会失败。

### P1-5 AI 聊天/大纲/写作生成在未配置 Key 时缺少前置拦截

位置：

- `apps/api/src/routes/ai.ts`
- `apps/api/src/services/ai.service.ts`
- `apps/web/src/components/AIAssistantSidebar.vue`
- `apps/web/src/views/OutlineView.vue`
- `apps/web/src/views/WritingView.vue`

问题：

AI 设置页已经能检测 Key，但实际生成接口没有先判断 `hasApiKey`。未配置时，后端仍尝试调用 OpenAI compatible client，最后把错误写进 stream。用户看到的是聊天框中的 `[Error: ...]`，而不是明确的配置引导。

修复要求：

1. `streamChat()` 在创建 client 前检查 apiKey。
2. 未配置时抛出业务错误：`AI 服务未配置，请先到项目设置完成配置检测`。
3. 前端 AI 面板捕获该错误，展示中文提示，并提供跳转“项目设置”的按钮。
4. 大纲页和写作页的 AI 按钮在未配置 AI 时可禁用或提示配置。

验收：

1. 未配置 Key 时，不发起外部模型请求。
2. 用户能从错误提示直接跳转设置页。
3. 配置并检测成功后，AI 生成能进入确认区。

## 4. P2 中优先级问题

### P2-1 API 层仍有少量绕过，架构重构未完全收口

位置：

- `apps/web/src/views/ProjectHomeView.vue:81`
- `apps/web/src/views/QualityReviewView.vue`
- `apps/web/src/features/knowledge/composables/useKnowledgeUpload.ts`

问题：

仍有页面或 composable 直接使用 `fetch` / `useApi` 拼路径，而不是使用 `apps/web/src/api/*` 的领域 API。

修复要求：

1. 新增 `apps/web/src/api/export.ts`，封装项目导出。
2. `QualityReviewView.vue` 使用 `quality.store.ts`。
3. `useKnowledgeUpload.ts` 使用 `knowledgeApi.analyzeSource()`。
4. 保留 `HealthCheck.vue` 的 `/api/health` 直接 fetch 可以接受，因为它是独立诊断页。

验收：

```bash
rg -n "fetch\\(|useApi\\(" apps/web/src/views apps/web/src/features
```

除 `HealthCheck.vue` 和通用 API client 外，主业务页面不应再直接拼业务接口。

### P2-2 测试数据存在重复空章节，影响大纲和质量评估体验

现象：

测试项目中存在两个 `chapterNumber = 4` 的章节，其中一个是空的“第 4 章”。质量评估页和大纲页都会显示它。

修复要求：

1. 清理当前测试数据中的空章节。
2. 在 seed 脚本里避免创建重复 `chapterNumber`。
3. 可选：数据库层增加 `(project_id, volume_id, chapter_number)` 唯一约束，或在 service 中校验同卷章节序号唯一。

验收：

1. 大纲树不再出现重复章节序号。
2. 质量评估章节列表不再出现空白测试章节。
3. 新增章节时序号按当前分卷递增。

### P2-3 质量评估页面文案暗示“AI 深度分析”，但当前并非真实 AI

位置：

- `apps/web/src/views/QualityReviewView.vue`

问题：

页面文案写着“基于 AI 深度分析章节的创作质量”，但后端目前是随机 mock。修复 P1-1 前，文案会误导用户。

修复要求：

1. 如果暂时不接真实 AI，页面文案改为“基础质量检查”并明确“当前为规则评估”。
2. 如果完成 P1-1，则保留 AI 文案。

## 5. 建议执行顺序

1. 修复 `QualityReviewView.vue` 的 API 解包错误，让质量评估 UI 真正调通。
2. 补资源归属校验，防止跨项目数据污染。
3. 给 AI 生成接口增加未配置 Key 的前置拦截和中文引导。
4. 将质量评估从随机 mock 改为真实 AI 结构化报告。
5. 将知识库拆书从占位摘要改为 AI 摘要/技巧提炼。
6. 补 `POST /knowledge/notes` 或删除前端未使用的 `createNote` 假接口。
7. 收口剩余 API 调用绕过。
8. 清理测试数据和 seed 里的重复空章节。

## 6. 完成后的验收命令

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
pnpm db:migrate
```

功能验收：

1. 创建项目 -> 编辑设置 -> 配置并检测 AI。
2. 创建故事设定、角色、关系、冲突。
3. 创建分卷和章节，保存大纲。
4. 写正文，保存快照，恢复版本。
5. 上传 `.txt` 参考文本，等待拆分与摘要完成。
6. 生成章节质量报告，刷新后仍能看到历史报告。
7. 导出项目 Markdown。

