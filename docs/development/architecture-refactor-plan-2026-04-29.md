# AI 小说创作工作台架构拆分与重构执行文档

> **交给其他 AI 执行前必读：** 本文档不是新增功能清单，而是一次“控制复杂度”的架构重构计划。执行者必须先保持现有业务可运行，再逐步拆分模块、补齐类型、减少重复代码。每完成一个阶段都要运行验收命令，不允许在构建失败时继续堆新功能。

## 1. 当前结论

当前项目已经具备小说项目、故事圣经、人物、卷章、大纲、写作、关系、冲突、知识库、质量评估、版本历史等主要业务面，但代码结构开始出现明显膨胀：

- 前端多个页面超过 300 行，`DataViewer.vue`、`WritingView.vue`、`OutlineView.vue`、`KnowledgeBaseView.vue` 已承担过多 UI、状态、流程和 API 调用逻辑。
- `apps/web/src/stores/projects.ts` 同时定义 8 个 store，CRUD 逻辑重复，且关系、冲突、版本等关键模型仍大量使用 `any`。
- 后端 route 文件直接承载业务流程，例如知识库拆分、质量评分、版本快照创建都写在路由层，后续接入真实 AI 或复杂规则会继续膨胀。
- `packages/shared` 类型没有覆盖当前完整业务域，导致前端和后端靠隐式字段、`any`、字符串约定协作。
- 源码目录里存在构建产物或临时脚本痕迹，例如 `apps/web/dist/*`、`apps/web/src/views/fix_navigation.py`、`apps/web/src/views/refactor_layout.py`，需要清理或迁移。

本次重构目标：建立清晰的领域模块边界，让后续 AI 开发可以按“功能域”改动，而不是在少数大文件里继续追加代码。

## 2. 重构原则

1. 先修结构，再加能力：本轮不新增大的业务功能，只允许接线、抽取、去重、补类型、补测试。
2. 页面只做编排：`views` 目录中的页面负责路由参数、布局和组合组件，不直接承载复杂业务流程。
3. Store 只做状态：Pinia store 不直接拼复杂接口细节，接口调用下沉到 `apps/web/src/api`。
4. Route 只做 HTTP：后端 route 负责参数读取、响应返回、状态码；业务逻辑下沉到 `apps/api/src/services`。
5. Shared 是契约：跨前后端共享的数据结构必须进入 `packages/shared`，减少 `any` 和字段漂移。
6. AI 结果必须有确认边界：任何 AI 生成内容不得直接覆盖用户正文、大纲或关键数据，必须进入确认区或显式确认流程。
7. 每个阶段都必须可验收：任何阶段完成后都要通过 `pnpm lint`、`pnpm build`、`pnpm test`。

## 3. 目标目录结构

### 3.1 前端目标结构

```text
apps/web/src/
  api/
    client.ts
    projects.ts
    story-bibles.ts
    characters.ts
    volumes.ts
    chapters.ts
    relationships.ts
    conflicts.ts
    versions.ts
    knowledge.ts
    quality.ts
    ai.ts
  stores/
    project.store.ts
    story-bible.store.ts
    character.store.ts
    volume.store.ts
    chapter.store.ts
    relationship.store.ts
    conflict.store.ts
    version.store.ts
    knowledge.store.ts
    quality.store.ts
    index.ts
  features/
    writing/
      components/
        ChapterNavigator.vue
        EditorPane.vue
        AIPendingResultPanel.vue
        WritingContextPanel.vue
      composables/
        useWritingDraft.ts
        useAIResultConfirm.ts
    outline/
      components/
        VolumeChapterTree.vue
        ChapterOutlineEditor.vue
        OutlineAIPanel.vue
      composables/
        useOutlineForm.ts
    knowledge/
      components/
        KnowledgeUploadPanel.vue
        KnowledgeSourceList.vue
        KnowledgeSourceDrawer.vue
        KnowledgeSearchResults.vue
      composables/
        useKnowledgeUpload.ts
    quality/
      components/
        QualityReportSummary.vue
        QualityDimensionGrid.vue
        QualityReportHistory.vue
      composables/
        useQualityReview.ts
```

保留 `apps/web/src/views`，但每个 view 应逐步变成 80-180 行左右的页面编排层。`DataViewer.vue` 仅作为 `/debug` 开发调试页，不进入主业务导航。

### 3.2 后端目标结构

```text
apps/api/src/
  routes/
    projects.ts
    story-bibles.ts
    characters.ts
    volumes.ts
    chapters.ts
    relationships.ts
    conflicts.ts
    versions.ts
    knowledge.ts
    quality.ts
    ai.ts
  services/
    project.service.ts
    chapter.service.ts
    relationship.service.ts
    conflict.service.ts
    version.service.ts
    knowledge.service.ts
    quality.service.ts
    ai.service.ts
  utils/
    http.ts
    ids.ts
    errors.ts
```

后端 route 文件不应直接包含大段业务算法。比如章节拆分、质量评分、版本快照、项目归属校验都应进入 service。

### 3.3 共享类型目标结构

```text
packages/shared/src/types/
  api.ts
  novel.ts
  knowledge.ts
  quality.ts
  ai.ts
  inputs.ts
  index.ts
```

当前 `novel.ts` 只覆盖基础项目、故事圣经、人物、卷、章节。需要补齐：

- `CharacterRelationship`
- `Conflict`
- `ChapterVersion`
- `KnowledgeSource`
- `KnowledgeChunk`
- `KnowledgeNote`
- `QualityReport`
- `AIMessage`
- `AIResultProposal`
- 创建/更新 payload 类型，例如 `CreateChapterInput`、`UpdateChapterInput`、`CreateKnowledgeSourceInput`、`RunQualityCheckInput`

## 4. 分阶段执行顺序

### 阶段 A：项目卫生清理

目标：移除容易误导后续 AI 的源码污染。

执行事项：

1. 检查 `apps/web/dist/*` 是否被 Git 跟踪。如果已跟踪，确认后从版本库移除；如果未跟踪，保持 `.gitignore` 覆盖。
2. 将 `apps/web/src/views/fix_navigation.py` 和 `apps/web/src/views/refactor_layout.py` 移出源码目录。若只是一次性脚本，应删除；若仍有参考价值，应移动到 `scripts/archive/` 并加说明。
3. 确认 `.gitignore` 至少包含：

```gitignore
apps/web/dist/
apps/api/data/*.db
apps/api/data/*.db-shm
apps/api/data/*.db-wal
```

验收：

```bash
rg --files apps/web/src/views | rg "\.py$|dist"
rg --files apps/web apps/api | rg "dist/|\.db-shm|\.db-wal"
pnpm lint
pnpm build
pnpm test
```

### 阶段 B：共享类型补齐

目标：先统一数据契约，再拆前后端。

执行事项：

1. 在 `packages/shared/src/types` 中拆出 `knowledge.ts`、`quality.ts`、`ai.ts`、`inputs.ts`。
2. 把当前 schema 中真实存在的表字段映射成共享类型。
3. 用共享类型替换前端 store 和页面中的核心 `any`。
4. 不要为了“类型好看”更改数据库字段名，字段名以当前 schema 和迁移为准。

重点替换位置：

- `apps/web/src/stores/projects.ts`
- `apps/web/src/views/KnowledgeBaseView.vue`
- `apps/web/src/views/QualityReviewView.vue`
- `apps/web/src/views/RelationshipsView.vue`
- `apps/web/src/views/ConflictMatrixView.vue`
- `apps/web/src/views/VersionHistoryView.vue`

验收：

```bash
rg -n "any\[\]|: any|as any" apps/web/src packages/shared/src
pnpm --filter @ai-novel/shared test
pnpm build
```

允许阶段 B 后仍少量保留事件对象类 `any`，但业务模型不得继续使用 `any[]`。

### 阶段 C：前端 API 层拆分

目标：所有 HTTP 细节集中到 `apps/web/src/api`，页面和 store 不再直接拼接散落的接口逻辑。

执行事项：

1. 新建 `apps/web/src/api/client.ts`，从 `useApi` 中抽取通用 request 能力。
2. 按领域创建 API 文件：
   - `projects.ts`
   - `story-bibles.ts`
   - `characters.ts`
   - `volumes.ts`
   - `chapters.ts`
   - `relationships.ts`
   - `conflicts.ts`
   - `versions.ts`
   - `knowledge.ts`
   - `quality.ts`
   - `ai.ts`
3. 保留 `useApi` 作为组合式状态包装，但底层调用 `api/client.ts`。
4. `ai.ts` 单独支持 streaming，不要把流式读取塞进普通 JSON request。
5. 所有前端接口必须走相对路径 `/api/...`，不得硬编码 `http://localhost:3000`。

验收：

```bash
rg -n "fetch\(|http://localhost:3000" apps/web/src
pnpm lint
pnpm build
```

允许 `api/client.ts` 和 `api/ai.ts` 使用 `fetch`，其他文件原则上不直接使用。

### 阶段 D：Pinia Store 拆分

目标：把 `apps/web/src/stores/projects.ts` 拆成按领域维护的小 store。

执行事项：

1. 迁移 `useProjectStore` 到 `project.store.ts`。
2. 迁移 `useStoryBibleStore` 到 `story-bible.store.ts`。
3. 迁移 `useCharacterStore` 到 `character.store.ts`。
4. 迁移 `useVolumeStore` 到 `volume.store.ts`。
5. 迁移 `useChapterStore` 到 `chapter.store.ts`。
6. 迁移 `useRelationshipStore` 到 `relationship.store.ts`。
7. 迁移 `useConflictStore` 到 `conflict.store.ts`。
8. 迁移 `useVersionStore` 到 `version.store.ts`。
9. 新增 `knowledge.store.ts` 和 `quality.store.ts`，不要让知识库和质量评估页面自己维护完整远程状态。
10. 在 `stores/index.ts` 统一导出，降低调用方迁移成本。

注意：

- 拆分过程中保持 store id 不变，避免 Pinia devtools 和缓存行为突变。
- 迁移一个 store 后立即更新引用，不要同时大范围改动导致定位困难。
- 如果多个 store 有重复的列表 CRUD 模式，可以抽 `createListStoreActions`，但不要过度泛型化。

验收：

```bash
rg -n "from ['\"]@/stores/projects|from ['\"]../stores/projects" apps/web/src
wc -l apps/web/src/stores/*.ts
pnpm lint
pnpm build
```

最终 `apps/web/src/stores/projects.ts` 应删除或只作为兼容导出文件，不能继续承载全部 store 实现。

### 阶段 E：大型页面组件化

目标：把复杂页面拆成页面编排层、业务组件、组合式逻辑。

优先级：

1. `WritingView.vue`
2. `OutlineView.vue`
3. `KnowledgeBaseView.vue`
4. `QualityReviewView.vue`
5. `DataViewer.vue`

拆分建议：

- `WritingView.vue`
  - `ChapterNavigator.vue`：章节列表、切换、状态展示
  - `EditorPane.vue`：正文编辑、保存状态、字数统计
  - `AIPendingResultPanel.vue`：AI 结果确认区，支持插入、替换、保存为备选、丢弃
  - `WritingContextPanel.vue`：人物、大纲、冲突上下文
  - `useWritingDraft.ts`：草稿加载、自动保存、快照触发
  - `useAIResultConfirm.ts`：AI 建议暂存和确认动作

- `OutlineView.vue`
  - `VolumeChapterTree.vue`：卷章树
  - `ChapterOutlineEditor.vue`：章节大纲表单
  - `OutlineAIPanel.vue`：AI 大纲建议确认区
  - `useOutlineForm.ts`：表单初始化、保存、校验

- `KnowledgeBaseView.vue`
  - `KnowledgeUploadPanel.vue`：上传、读取文件、状态展示
  - `KnowledgeSourceList.vue`：来源列表
  - `KnowledgeSourceDrawer.vue`：来源详情和 chunk 展示
  - `KnowledgeSearchResults.vue`：项目知识检索
  - `useKnowledgeUpload.ts`：把 FileReader 包成 Promise，确保 loading 和错误状态准确

- `QualityReviewView.vue`
  - `QualityReportSummary.vue`：总分和风险摘要
  - `QualityDimensionGrid.vue`：节奏、冲突、逻辑、人物、风格评分
  - `QualityReportHistory.vue`：历史报告
  - `useQualityReview.ts`：调用后端质量检查、读取报告、选择报告

验收：

```bash
wc -l apps/web/src/views/*.vue
pnpm lint
pnpm build
pnpm test
```

建议目标：核心业务 view 控制在 180 行以内；复杂逻辑进入 composable；重复 UI 进入 feature component。

### 阶段 F：后端 Service 层抽取

目标：route 文件只处理 HTTP，业务逻辑进入 service。

执行事项：

1. 新建 `apps/api/src/services/knowledge.service.ts`：
   - `listSources(projectId)`
   - `createSource(projectId, input)`
   - `getSourceDetail(projectId, sourceId)`
   - `analyzeSource(projectId, sourceId, content)`
   - `searchKnowledge(projectId, query)`
2. 新建 `apps/api/src/services/quality.service.ts`：
   - `listReports(projectId)`
   - `runChapterQualityCheck(projectId, chapterId)`
   - `getReport(projectId, reportId)`
   - 当前 mock 评分可以保留，但必须封装在 service 内，后续替换真实 AI 时不改 route。
3. 新建 `apps/api/src/services/version.service.ts`：
   - `listChapterVersions(projectId, chapterId)`
   - `createSnapshot(projectId, chapterId, input)`
   - `deleteVersion(projectId, versionId)`
4. AI 客户端抽到 `apps/api/src/services/ai.service.ts`，避免 route 中直接初始化 provider。
5. 所有详情、删除、恢复、分析类接口必须同时校验 `projectId` 归属。

验收：

```bash
wc -l apps/api/src/routes/*.ts
rg -n "Math\.random|matchAll|db\.insert|db\.update|db\.delete" apps/api/src/routes
pnpm lint
pnpm build
pnpm test
```

允许基础 CRUD route 保留少量 `db.select`，但复杂流程必须进入 service。

### 阶段 G：流程与安全边界统一

目标：修复仍可能出现的流程不一致和数据越权风险。

执行事项：

1. 统一确认弹窗：
   - 删除、恢复、覆盖、AI 替换正文等危险操作必须使用设计系统 `NConfirmDialog` 或统一封装。
   - 不允许在业务页面继续使用原生 `confirm()`。
2. 统一 AI 结果确认区：
   - 大纲 AI 建议、写作 AI 结果、质量建议转正文等操作必须先进入 pending result。
   - 用户明确选择后才能插入、替换、保存为备选或丢弃。
3. 统一项目归属校验：
   - 知识库 source/chunk/note
   - 质量报告
   - 版本快照
   - 关系和冲突
4. 统一错误响应：
   - 后端使用 `success()` / `fail()` 或统一 `http.ts`。
   - 前端 toast 和页面错误状态不要各写一套。

验收：

```bash
rg -n "confirm\(" apps/web/src
rg -n "where\\(eq\\([^,]+\\.id" apps/api/src/routes apps/api/src/services
pnpm lint
pnpm build
```

## 5. 关键文件修改清单

优先修改：

- `packages/shared/src/types/*`
- `apps/web/src/api/*`
- `apps/web/src/stores/*`
- `apps/web/src/features/*`
- `apps/web/src/views/WritingView.vue`
- `apps/web/src/views/OutlineView.vue`
- `apps/web/src/views/KnowledgeBaseView.vue`
- `apps/web/src/views/QualityReviewView.vue`
- `apps/api/src/services/*`
- `apps/api/src/routes/knowledge.ts`
- `apps/api/src/routes/quality.ts`
- `apps/api/src/routes/versions.ts`

谨慎修改：

- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/*`
- `packages/ui/src/components/*`

除非发现 schema 和迁移仍不一致，否则本轮不要随意改数据库结构。若必须改 schema，必须同时生成并验证迁移。

## 6. 验收标准

整体完成后必须满足：

```bash
pnpm lint
pnpm build
pnpm test
pnpm --filter @ai-novel/api db:seed
```

并执行以下结构检查：

```bash
rg -n "http://localhost:3000" apps/web/src
rg -n "confirm\(" apps/web/src
rg -n "any\[\]|: any|as any" apps/web/src packages/shared/src
wc -l apps/web/src/views/*.vue apps/web/src/stores/*.ts apps/api/src/routes/*.ts
```

验收目标：

- `apps/web/src/stores/projects.ts` 不再作为巨型 store 文件存在。
- 前端业务模型不再使用 `any[]`。
- `WritingView.vue`、`OutlineView.vue`、`KnowledgeBaseView.vue`、`QualityReviewView.vue` 明显瘦身。
- 知识库上传 loading 不提前结束，错误能被捕获并反馈。
- 质量评估页面真实调用后端 `/quality-check` 并展示保存后的报告。
- 版本历史、质量评估、知识库详情等接口均校验 `projectId` 归属。
- `pnpm lint`、`pnpm build`、`pnpm test` 全部通过。

## 7. 建议提交顺序

建议拆成 6 个小提交或 6 个 AI 任务：

1. `chore: clean generated artifacts and source hygiene`
2. `refactor(shared): add complete domain types`
3. `refactor(web): introduce typed api clients`
4. `refactor(web): split pinia stores by domain`
5. `refactor(web): extract large page feature components`
6. `refactor(api): move knowledge quality version logic into services`

每个提交都必须可构建。不要把所有阶段压成一个巨大 diff。

## 8. 可直接交给其他 AI 的任务提示词

```text
你正在接手 /Users/lhw/code/ai-novel 项目。请严格按照 docs/development/architecture-refactor-plan-2026-04-29.md 执行架构拆分与重构。

工作目标：
1. 不新增大型业务功能，优先降低冗余、拆分模块、补齐类型、保持现有功能可用。
2. 前端将 API、store、feature components 分层；后端将复杂业务从 routes 抽到 services。
3. 所有跨前后端数据模型必须进入 packages/shared。
4. AI 生成结果不得直接覆盖用户内容，危险操作必须走设计系统确认。
5. 每完成一个阶段运行 pnpm lint、pnpm build、pnpm test，并在最终回复中列出结果。

执行顺序：
A. 项目卫生清理
B. 共享类型补齐
C. 前端 API 层拆分
D. Pinia store 拆分
E. 大型页面组件化
F. 后端 Service 层抽取
G. 流程与安全边界统一

约束：
- 不要重置或回滚用户未要求的改动。
- 不要随意改数据库 schema；如果改 schema，必须同步迁移并验证。
- 不要把多个无关阶段混成一个不可审查的大改动。
- 保持 UI 设计系统一致，不引入原生 confirm/alert。
- 修改完成后给出文件清单、验证命令结果、仍未处理的风险。
```

## 9. 当前优先风险排序

1. 类型契约不足：`any` 会继续掩盖字段漂移，是后续功能不稳定的根源。
2. 页面和 store 膨胀：继续追加功能会让 AI 和人类都难以安全修改。
3. route 承载业务：知识库、质量评估、版本历史后续会接入 AI，必须提前抽 service。
4. 流程边界不一致：AI 结果确认、危险操作确认、项目归属校验必须统一。
5. 源码污染：构建产物和临时脚本会误导后续 AI 修改错误位置。

本轮重构完成后，再继续推进更深的 AI 能力、经典小说学习策略、质量评分模型和导出交付体验。
