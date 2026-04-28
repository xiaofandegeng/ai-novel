# AI 小说创作工作台重构后修复文档

日期：2026-04-28  
状态：待修复  
适用范围：重构后的 AI 小说创作工作台验收修复与功能补完

## 1. 当前结论

本轮重构后，项目比上一轮明显前进：

1. `pnpm build` 已通过。
2. `pnpm lint` 已通过。
3. `pnpm test` 已通过，但当前只有 `packages/shared` 的 1 个测试。
4. 基础 UI 组件、项目、故事圣经、人物、大纲、写作、人物关系、冲突矩阵、知识库索引、版本历史文件都已经出现。
5. 原先的 `openai` catalog、`chapters.summary`、`novel_projects.description` 等编译阻塞项已在代码层面处理。
6. 业务代码中未再发现原生 `confirm()`。

但项目仍不能认定为 13 个阶段全部完成，原因是：

1. 数据库迁移仍未覆盖当前 schema。
2. API 当前无法完成 live 验收。
3. `db:seed` 当前失败。
4. 写作页 AI 结果仍可直接写入正文，没有完整确认区。
5. 知识库页面只是项目内聚合索引，不是“经典小说上传、拆书、总结、知识库”。
6. 版本历史页面未接入主路由和导航。
7. 质量评估阶段尚未实现入口、数据模型和 API。
8. 前端部分 API 调用仍硬编码 `http://localhost:3000`。

当前建议阶段：

```text
阶段：重构后修复收敛阶段
目标：恢复数据库一致性、跑通 API/seed/live check，然后补齐 AI 确认区与阶段 9-11 缺口
```

在本文档完成前，不建议宣称：

1. 阶段 9 已完成。
2. 阶段 10 已完成。
3. 阶段 11 已完成。
4. 13 个开发阶段已全部交付。

## 2. 最新验收结果

### 2.1 已通过

```bash
pnpm build
pnpm lint
pnpm test
```

说明：

1. 构建和 lint 已经恢复，这是重要进展。
2. 测试覆盖仍很薄，不能代表业务功能已经可靠。

### 2.2 未通过

```bash
pnpm --filter @ai-novel/api db:seed
pnpm --filter @ai-novel/api dev
curl http://localhost:3000/api/health
```

当前失败点：

1. `db:seed` 和 `dev:api` 都失败在 `better-sqlite3` native binding 缺失。
2. `/api/health` 当前连接失败。
3. 本地 SQLite 实际表只有 5 张基础表：
   - `chapters`
   - `characters`
   - `novel_projects`
   - `story_bibles`
   - `volumes`

缺失：

1. `character_relationships`
2. `chapter_versions`
3. `conflicts`
4. `novel_projects.description`
5. `chapters.characters`
6. `chapters.goals`
7. `chapters.conflicts`
8. `chapters.events`
9. `chapters.emotional_arc`
10. `chapters.foreshadowing`
11. `chapters.ending_hook`

## 3. 修复优先级

```text
P0：数据库和运行闭环
  ↓
P1：AI 确认区、知识库、版本历史、质量评估
  ↓
P2：API 调用抽象和部署适配
  ↓
P3：测试覆盖、可访问性、响应式和最终 QA
```

## 4. P0 修复项：迁移与运行闭环

### 4.1 修复 Drizzle 迁移与 schema 不一致

问题文件：

1. `apps/api/src/db/schema.ts`
2. `apps/api/drizzle/0000_slim_siren.sql`
3. `apps/api/drizzle/meta/0000_snapshot.json`
4. 可能相关：本地 SQLite 数据库 `apps/api/data/ai-novel.db`

当前问题：

当前 schema 已包含：

```text
novel_projects.description
chapters.summary
chapters.characters
chapters.goals
chapters.conflicts
chapters.events
chapters.emotional_arc
chapters.foreshadowing
chapters.ending_hook
character_relationships
chapter_versions
conflicts
```

但当前迁移文件只创建基础 5 张表，并且：

1. `novel_projects` 没有 `description`。
2. `chapters` 只有 `summary`，没有其他扩展字段。
3. 没有 `character_relationships`。
4. 没有 `chapter_versions`。
5. 没有 `conflicts`。

推荐修复：

开发期推荐采用“干净迁移”策略：

1. 确认本地 SQLite 数据可以重建。
2. 删除旧迁移和旧本地数据库。
3. 重新生成完整初始迁移。
4. 重新 migrate。
5. 重新 seed。

如果需要保留本地数据，则采用增量迁移：

1. `ALTER TABLE novel_projects ADD COLUMN description text`
2. 给 `chapters` 补充缺失字段。
3. `CREATE TABLE character_relationships`
4. `CREATE TABLE chapter_versions`
5. `CREATE TABLE conflicts`

验收命令：

```bash
pnpm db:generate
pnpm db:migrate
sqlite3 apps/api/data/ai-novel.db ".schema novel_projects"
sqlite3 apps/api/data/ai-novel.db ".schema chapters"
sqlite3 apps/api/data/ai-novel.db ".schema character_relationships"
sqlite3 apps/api/data/ai-novel.db ".schema chapter_versions"
sqlite3 apps/api/data/ai-novel.db ".schema conflicts"
```

验收标准：

1. `novel_projects.description` 存在。
2. `chapters` 所有扩展字段存在。
3. 关系、版本、冲突 3 张表存在。
4. `apps/api/src/db/schema.ts` 与迁移 SQL 一致。

### 4.2 修复 `better-sqlite3` native binding

问题文件：

1. `pnpm-lock.yaml`
2. `node_modules`
3. 可能相关：Node 版本、pnpm ignored build scripts、`onlyBuiltDependencies`

当前问题：

`pnpm --filter @ai-novel/api db:seed` 和 `pnpm --filter @ai-novel/api dev` 失败：

```text
Error: Could not locate the bindings file
better_sqlite3.node
```

推荐修复：

1. 确认当前 Node 版本。
2. 重新允许并构建 `better-sqlite3`。
3. 重新安装依赖。

建议命令：

```bash
pnpm install
pnpm rebuild better-sqlite3
```

如果仍失败：

```bash
pnpm approve-builds
pnpm install
pnpm rebuild better-sqlite3
```

验收命令：

```bash
pnpm --filter @ai-novel/api db:seed
pnpm --filter @ai-novel/api dev
curl http://localhost:3000/api/health
curl http://localhost:3000/api/projects
```

验收标准：

1. seed 能写入项目、人物、关系、冲突、章节版本。
2. API 能启动。
3. `/api/health` 返回 database connected。
4. `/api/projects` 返回统一 `ApiResponse`。

## 5. P1 修复项：AI 写作确认区

### 5.1 写作页 AI 结果不得直接写入正文

问题文件：

1. `apps/web/src/views/WritingView.vue`
2. `apps/web/src/components/AIAssistantSidebar.vue`
3. 可能新增：`packages/ui/src/components/NAIResultPanel.vue`

当前问题：

`WritingView.vue` 中：

```ts
function applyAIResult(text: string) {
  if (selectionStart.value !== selectionEnd.value) {
    draft.value = draft.value.substring(0, selectionStart.value) + text + draft.value.substring(selectionEnd.value)
  }
  else {
    draft.value = draft.value.substring(0, selectionStart.value) + text + draft.value.substring(selectionStart.value)
  }
}
```

这会让 AI 结果通过一个 `Apply to Editor` 按钮直接进入正文。它不满足之前约定：

```text
AI 生成结果必须先进入确认区，不得直接覆盖用户正文。
```

建议修复：

新增 `pendingAIResult` 状态：

```ts
interface PendingAIResult {
  content: string
  source: 'continue' | 'polish' | 'expand' | 'shorten' | 'chat'
  selectionStart: number
  selectionEnd: number
  originalText: string
}
```

AI 返回后：

1. 只写入 `pendingAIResult`。
2. 不直接修改 `draft`。
3. 页面展示确认区。

确认区必须提供：

1. 插入到光标位置。
2. 替换选中文本。
3. 追加到章节末尾。
4. 保存为备选。
5. 丢弃。

推荐交互：

```text
标题：AI 建议
说明：AI 内容尚未写入正文，请选择如何处理。
按钮：插入 / 替换 / 保存为备选 / 丢弃
```

验收：

1. AI 生成后 `draft` 不自动变化。
2. 用户点击明确动作后才修改 `draft`。
3. 替换操作必须显示将被替换的原文摘要。
4. 丢弃后正文不变。
5. 保存为备选后可在版本历史或 AI 备选列表中找到。

## 6. P1 修复项：经典小说上传与拆书知识库

### 6.1 当前 KnowledgeBaseView 只能算项目内知识索引

问题文件：

1. `apps/web/src/views/KnowledgeBaseView.vue`
2. 需要新增：知识库数据表
3. 需要新增：上传/解析 API
4. 需要新增：拆书总结 API

当前问题：

当前 `KnowledgeBaseView.vue` 聚合：

1. 故事圣经。
2. 人物。
3. 冲突。

它没有实现产品文档要求的：

1. 上传经典小说或参考作品。
2. 文本解析。
3. 自动拆分卷、章、场景。
4. AI 总结。
5. 写作技巧提炼。
6. 持久化知识条目。
7. 后续写作时检索引用。

建议新增数据模型：

```text
knowledge_sources
- id
- project_id
- title
- author
- source_type
- file_name
- file_size
- status
- created_at
- updated_at

knowledge_chunks
- id
- source_id
- project_id
- chunk_type
- title
- content
- summary
- techniques
- order_index
- created_at

knowledge_notes
- id
- source_id
- project_id
- title
- content
- tags
- created_at
```

建议新增 API：

```text
POST /api/projects/:projectId/knowledge/sources
GET  /api/projects/:projectId/knowledge/sources
GET  /api/projects/:projectId/knowledge/sources/:sourceId
POST /api/projects/:projectId/knowledge/sources/:sourceId/analyze
GET  /api/projects/:projectId/knowledge/search?q=
```

MVP 拆书流程：

1. 上传 `.txt` 或粘贴文本。
2. 保存 source。
3. 按章节标题正则进行初步拆分。
4. 每个 chunk 生成摘要。
5. 提炼人物塑造、冲突推进、节奏、伏笔、文风技巧。
6. 在写作页 AI 上下文中可选择引用知识库片段。

验收：

1. 能上传或粘贴一部参考作品。
2. 系统能拆分至少 3 个章节。
3. 每章有摘要。
4. 能搜索知识库。
5. 写作页 AI 上下文能引用知识库结果。

## 7. P1 修复项：版本历史路由与导航

### 7.1 VersionHistoryView 未接入主流程

问题文件：

1. `apps/web/src/router/index.ts`
2. `apps/web/src/components/AppSidebar.vue`
3. `apps/web/src/views/WritingView.vue`
4. `apps/web/src/views/VersionHistoryView.vue`

当前问题：

仓库中已有：

1. `apps/web/src/views/VersionHistoryView.vue`
2. `apps/api/src/routes/versions.ts`
3. `useVersionStore`

但 router 没有版本历史路径，侧边栏也没有入口，用户无法从主流程进入。

推荐路由：

```ts
{
  path: '/project/:id/versions',
  name: 'versions',
  component: () => import('@/views/VersionHistoryView.vue'),
}
```

如果版本历史必须绑定章节，推荐支持 query：

```text
/project/:id/versions?chapter=:chapterId
```

写作页入口：

1. 当前章节标题区增加“历史版本”按钮。
2. 点击跳转 `/project/:id/versions?chapter=currentChapterId`。

侧边栏入口：

```text
Version History
```

验收：

1. 用户可以从侧边栏进入版本历史。
2. 用户可以从写作页当前章节进入版本历史。
3. 版本历史能读取当前章节快照。
4. 恢复版本仍使用确认弹窗。

## 8. P1 修复项：质量评估阶段

### 8.1 阶段 10 当前未实现

问题文件：

1. `apps/web/src/router/index.ts`
2. 需要新增：`apps/web/src/views/QualityReviewView.vue`
3. 需要新增：`apps/api/src/routes/quality.ts`
4. 需要新增：质量评估数据表

当前问题：

产品文档要求质量评估：

1. 章节质量评估。
2. 全书质量评估。
3. 节奏、冲突、逻辑、人物一致性、风格一致性。
4. 给出问题、建议和评分。

当前项目没有质量评估页面、路由、API 或数据模型。

建议新增数据模型：

```text
quality_reports
- id
- project_id
- chapter_id
- scope
- score
- rhythm_score
- conflict_score
- logic_score
- character_score
- style_score
- issues
- suggestions
- created_at
```

建议新增 API：

```text
POST /api/projects/:projectId/quality/reports
GET  /api/projects/:projectId/quality/reports
GET  /api/projects/:projectId/quality/reports/:id
DELETE /api/projects/:projectId/quality/reports/:id
```

建议新增页面：

```text
/project/:id/quality
```

页面结构：

1. 左侧：章节列表。
2. 中间：评分卡和问题清单。
3. 右侧：AI 编辑建议和可执行修订项。

验收：

1. 用户能选择章节生成质量报告。
2. 报告能持久化。
3. 刷新后报告不丢失。
4. 报告至少包含 5 个维度评分。
5. AI 建议不会直接改正文，只进入确认区。

## 9. P2 修复项：统一前端 API 调用

### 9.1 移除硬编码 localhost

问题文件：

1. `apps/web/src/components/AIAssistantSidebar.vue`
2. `apps/web/src/stores/projects.ts`
3. `apps/web/src/views/ProjectHomeView.vue`
4. 其他直接 `fetch('http://localhost:3000/...')` 的文件

当前问题：

部分代码直接调用：

```ts
fetch('http://localhost:3000/api/ai/chat')
fetch(`http://localhost:3000/api/projects/${projectId}/chapters`)
```

这会导致：

1. 部署环境不可用。
2. 端口变更不可用。
3. Vite proxy 被绕过。
4. 错误处理和 `ApiResponse` 解析不统一。

建议修复：

统一使用已有 `apps/web/src/composables/useApi.ts`，或升级为 API client：

```ts
const { get, post, patch, del } = useApi()
```

AI streaming 可单独提供：

```ts
stream('/api/ai/chat', payload, onChunk)
```

验收：

```bash
rg "http://localhost:3000" apps/web/src
```

必须无结果。

## 10. 建议执行顺序

### 第 1 步：恢复本地运行能力

目标：

1. 修复 `better-sqlite3` binding。
2. `pnpm --filter @ai-novel/api dev` 能启动。

验收：

```bash
pnpm --filter @ai-novel/api dev
curl http://localhost:3000/api/health
```

### 第 2 步：修复迁移

目标：

1. 迁移覆盖当前 schema。
2. seed 能写入所有核心数据。

验收：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
sqlite3 apps/api/data/ai-novel.db ".tables"
```

### 第 3 步：接回版本历史入口

目标：

1. router 增加 `/project/:id/versions`。
2. sidebar 增加 Version History。
3. 写作页当前章节增加历史入口。

验收：

1. 可从侧边栏打开。
2. 可从写作页打开。
3. 能查看和恢复快照。

### 第 4 步：修写作页 AI 确认区

目标：

1. AI 结果先进入确认区。
2. 用户明确选择后才写入正文。

验收：

1. AI 生成后正文不自动变化。
2. 插入、替换、保存为备选、丢弃都可用。

### 第 5 步：统一 API client

目标：

1. 移除硬编码 localhost。
2. 所有普通 JSON API 走 `useApi`。
3. streaming API 有统一封装。

验收：

```bash
rg "http://localhost:3000" apps/web/src
pnpm lint
pnpm build
```

### 第 6 步：补知识库上传拆书

目标：

1. 增加知识库数据表。
2. 增加上传/粘贴文本。
3. 增加章节拆分、总结、技巧提炼。
4. 写作页可引用知识库。

验收：

1. 能上传或粘贴参考作品。
2. 能拆分章节。
3. 能搜索和引用。

### 第 7 步：补质量评估

目标：

1. 增加质量评估数据表。
2. 增加质量评估 API。
3. 增加 QualityReviewView。
4. AI 建议进入确认区。

验收：

1. 能生成章节质量报告。
2. 能保存并查看历史报告。
3. 报告包含评分、问题、建议。

## 11. 交给其他 AI 的开发提示词

可以直接复制下面内容给其他 AI：

```text
请先不要宣称项目已完成。当前任务是修复重构后的 AI 小说创作工作台，让它从“页面和模块已铺开”进入“可运行、可验收、功能闭环”。

请阅读：
1. docs/product/ai-novel-workbench-product-design.md
2. docs/design/ai-novel-workbench-ui-design-spec.md
3. docs/development/ai-agent-development-sequence.md
4. docs/development/remediation-plan-2026-04-28.md

当前已通过：
- pnpm build
- pnpm lint
- pnpm test

当前必须修复：
1. 修复 better-sqlite3 native binding，让 api dev 和 db:seed 能运行。
2. 修复 Drizzle 迁移，使迁移完整覆盖当前 schema，包括 description、章节扩展字段、character_relationships、chapter_versions、conflicts。
3. 接入 VersionHistoryView 到 router、sidebar 和写作页。
4. 改造 WritingView 的 AI 应用流程：AI 结果必须先进入确认区，支持插入、替换、保存为备选、丢弃。
5. 将 KnowledgeBaseView 从项目内聚合索引升级为经典小说上传、拆分、总结、技巧提炼、检索知识库。
6. 实现质量评估阶段：数据表、API、页面、评分维度、历史报告。
7. 移除前端所有 `http://localhost:3000` 硬编码，统一走 API client 或 Vite proxy。

每完成一步必须运行对应验收命令，并在最终回复中列出：
- 修改文件
- 修复内容
- 验收命令
- 验收结果
- 剩余风险

最终必须跑：
pnpm lint
pnpm build
pnpm test
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
curl http://localhost:3000/api/health
curl http://localhost:3000/api/projects
rg "http://localhost:3000" apps/web/src
```

## 12. 完成标准

只有同时满足以下条件，才能把当前阶段标记为完成：

1. `pnpm lint` 成功。
2. `pnpm build` 成功。
3. `pnpm test` 成功，并且至少覆盖关键 store/API client 或后端 route。
4. `pnpm db:generate` 成功。
5. `pnpm db:migrate` 成功。
6. `pnpm --filter @ai-novel/api db:seed` 成功。
7. `GET /api/health` 返回 database connected。
8. `GET /api/projects` 返回 seed 项目。
9. 迁移表结构与 schema 一致。
10. 写作页 AI 结果必须先进入确认区。
11. 版本历史能从主流程访问。
12. 知识库支持上传/拆书/总结/检索。
13. 质量评估支持生成和保存报告。
14. `rg "http://localhost:3000" apps/web/src` 无结果。

## 13. 阶段状态建议

当前建议状态：

```text
阶段 0-1：基本完成
阶段 2：构建通过，但数据库迁移和 live API 未验收，不能算完成
阶段 3-6：页面已成型，需在 API/DB 修复后重新验收闭环
阶段 7：AI 聊天有雏形，但缺少完整 provider 抽象、操作记录和确认区
阶段 8：关系/冲突代码有雏形，但迁移缺表，需重新验收
阶段 9：未完成，当前只是知识索引
阶段 10：未完成
阶段 11：部分实现，版本历史未接入主流程
阶段 12：未系统验收
```
