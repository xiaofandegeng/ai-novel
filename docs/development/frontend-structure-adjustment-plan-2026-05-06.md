# 前端项目结构与代码规范调整计划

日期：2026-05-06
适用范围：`apps/web`
目标：按照现有前端规范收敛项目结构、页面职责、API 调用边界和 UI 实现方式，让后续 AI 或人工开发可以稳定接手，不再把新功能继续堆进 route view。

## 1. 当前结论

当前前端已经具备较完整的基础分层：

```text
apps/web/src/
  api/
  components/
  composables/
  features/
  router/
  stores/
  styles/
  utils/
  views/
```

其中 `api`、`stores`、`features` 已经开始承担职责，但历史页面仍存在以下结构漂移：

1. 部分 route view 仍过大，承担了过多表单、列表、状态、业务编排和 UI 细节。
2. `features` 目录只覆盖了写作、大纲、知识库、质量评估，人物、关系、冲突、伏笔、项目设置、写作任务等领域还没有组件化沉淀。
3. 少数页面仍直接调用 API 模块或 `fetch`，没有统一走 store 或领域 composable。
4. 调试页 `DataViewer.vue` 体量过大，仍混在主产品 `views` 中，容易被误当作正式功能页面维护。
5. 页面级 UI 规范大体收敛，但还需要建立更明确的“新增页面模板”和“领域组件边界”，防止后续继续退化为大文件。

本计划只针对前端结构与规范调整，不改后端接口、不改数据库 schema。

## 2. 调整原则

### 2.1 页面职责

`apps/web/src/views` 只保留 route composition：

- 读取 route params
- 初始化 store
- 组合 feature 组件
- 处理页面级 loading / empty / error
- 少量页面级跳转

禁止在 `views` 继续新增：

- 大型表单实现
- 大型列表渲染
- 复杂过滤和排序算法
- AI 结果确认逻辑
- 领域状态机
- 直接拼接多个接口的流程代码

超过 300 行的 view 必须拆分；超过 500 行的 view 必须优先进入重构队列。

### 2.2 领域模块职责

推荐结构：

```text
apps/web/src/features/<domain>/
  components/
  composables/
  constants.ts
  types.ts
```

规则：

1. `components` 放该领域可复用 UI。
2. `composables` 放该领域页面编排逻辑。
3. `constants.ts` 放状态文案、选项、tab、筛选器配置。
4. `types.ts` 只放前端展示类型；领域模型优先从 `packages/shared` 引入。

### 2.3 Store 职责

Pinia store 只做：

- 保存领域状态
- 暴露 loading/error
- 调用 `apps/web/src/api`
- 提供少量领域 action

禁止：

- 在 store 中写复杂 UI 判断
- 在 store 中拼接非本领域的多接口流程
- 在 store 中使用原生 `fetch`
- 在 store 中存放临时弹窗状态

跨多个领域的流程应放到 feature composable，例如 `useWritingJobFlow`、`useProjectSettingsForm`。

### 2.4 API 职责

`apps/web/src/api` 是唯一 HTTP 边界。

规则：

1. 普通 JSON API 统一走 `api/client.ts`。
2. AI streaming、文件下载等特殊协议可以在对应 API 模块中单独封装。
3. 产品页面不得直接使用 `fetch`。
4. 健康检查、调试页如需直接 `fetch`，必须明确标注为开发工具路径。

### 2.5 UI 实现

继续遵守 `docs/development/ui-implementation-rules.md`：

- 表单优先使用 `packages/ui` 组件。
- 危险操作必须使用 `NConfirmDialog`。
- AI 结果必须进入确认区。
- 不使用 `alert`、`confirm`、`prompt`。
- 不硬编码裸色值和 localhost。
- 图标按钮必须有 `aria-label`。

## 3. 当前重点文件

按行数和职责复杂度，优先关注：

```text
apps/web/src/views/DataViewer.vue              824 行
apps/web/src/views/OutlineView.vue             651 行
apps/web/src/views/ProjectSettingsView.vue     645 行
apps/web/src/views/WritingJobView.vue          542 行
apps/web/src/views/CharactersView.vue          485 行
apps/web/src/views/DesignSystemPreview.vue     396 行
apps/web/src/views/ConflictMatrixView.vue      379 行
apps/web/src/views/TrainingSetDetailView.vue   378 行
apps/web/src/components/AIAssistantSidebar.vue 354 行
```

这些文件不是都需要一次性拆完，但后续新增需求不得继续往这些文件中直接堆逻辑。

## 4. 调整顺序

### 阶段 1：建立前端结构护栏

目标：让后续开发先按新结构落文件。

修改内容：

1. 新增或更新前端开发说明，明确 `views / features / stores / api` 职责。
2. 在 `docs/development` 中维护本计划，作为后续 AI 修改依据。
3. 为新增功能规定默认落点：
   - 新页面：`views` 只做组合。
   - 新领域 UI：`features/<domain>/components`。
   - 新流程逻辑：`features/<domain>/composables`。
   - 新接口：`api/<domain>.ts`。
   - 新状态：`stores/<domain>.store.ts`。

验收：

```bash
pnpm check
```

### 阶段 2：拆分大纲页

目标：让 `OutlineView.vue` 从大页面变成大纲工作台组合层。

建议结构：

```text
apps/web/src/features/outline/
  components/
    OutlineWorkspaceHeader.vue
    VolumeChapterTree.vue
    ChapterOutlineEditor.vue
    ChapterElementsPanel.vue
    OutlineAIPanel.vue
  composables/
    useOutlineWorkspace.ts
    useChapterElementEditing.ts
```

具体改动：

1. 将章节选择、分卷章节树、章节元素编辑、AI 大纲助手从 `OutlineView.vue` 中拆出。
2. `OutlineView.vue` 只保留 route id、store 初始化、保存事件汇总。
3. 章节元素相关 UI 必须归入 `features/outline/components`，不要散落到 view。
4. 大纲 AI 结果继续走确认区，不得直接写入章节字段。

验收：

```bash
pnpm check
```

人工检查：

- `/project/:id/outline`
- 章节切换
- 新增分卷
- 新增章节
- 保存大纲
- 章节元素编辑
- AI 建议确认

### 阶段 3：拆分项目设置页

目标：把基础信息、AI 配置、写作人格配置、风格配置分区组件化。

建议结构：

```text
apps/web/src/features/settings/
  components/
    ProjectBasicSettingsForm.vue
    ProjectStyleSettingsForm.vue
    ProjectAIProviderSettings.vue
    ProjectPersonaSettings.vue
    AIProviderHealthCheck.vue
  composables/
    useProjectSettings.ts
    useAIProviderTest.ts
```

具体改动：

1. `ProjectSettingsView.vue` 只负责加载项目和组合设置分区。
2. AI provider 检测逻辑进入 `useAIProviderTest`。
3. 写作人格绑定逻辑进入 `ProjectPersonaSettings.vue`。
4. 每个设置分区独立 loading/error，不要一个表单失败阻塞全部设置页。

验收：

```bash
pnpm check
```

人工检查：

- 基础信息保存
- AI provider 保存
- AI provider 可用性检测
- 写作人格绑定与启用场景保存

### 阶段 4：拆分写作任务页

目标：让写作任务页体现真实任务流，而不是把状态机和 UI 堆在一个 view。

建议结构：

```text
apps/web/src/features/writing-jobs/
  components/
    WritingJobLauncher.vue
    WritingJobStepTimeline.vue
    WritingJobStepDetail.vue
    WritingJobConfirmPanel.vue
    WritingJobLogPanel.vue
  composables/
    useWritingJobController.ts
    useWritingJobPolling.ts
```

具体改动：

1. `WritingJobView.vue` 只负责 route、store 和布局。
2. 任务轮询、重试、批准、拒绝放入 composable。
3. 确认应用正文必须展示生成内容、一致性检查结果和风险说明。
4. 所有危险操作使用设计系统确认组件。

验收：

```bash
pnpm check
```

人工检查：

- 创建任务
- 启动任务
- 任务步骤推进
- 批准/拒绝确认点
- 重试失败步骤
- 正文写回后写作页可见

### 阶段 5：拆分人物、关系、冲突、伏笔领域

目标：补齐尚未进入 `features` 的核心小说结构模块。

建议新增：

```text
apps/web/src/features/characters/
apps/web/src/features/relationships/
apps/web/src/features/conflicts/
apps/web/src/features/foreshadowing/
```

每个领域至少包含：

```text
components/
  <Domain>List.vue
  <Domain>Editor.vue
  <Domain>EmptyState.vue
composables/
  use<Domain>Workspace.ts
constants.ts
```

具体改动：

1. `CharactersView.vue` 拆出角色列表、角色编辑器、角色搜索。
2. `RelationshipsView.vue` 拆出关系图/关系列表/关系编辑器。
3. `ConflictMatrixView.vue` 拆出冲突列表、冲突详情、冲突状态控件。
4. `ForeshadowingLedgerView.vue` 拆出伏笔列表、伏笔详情、回收状态控件。

验收：

```bash
pnpm check
```

人工检查：

- 搜索、筛选、编辑、删除
- 焦点态可见
- 删除确认
- 中文 toast

### 阶段 6：收口 AI 侧栏

目标：让 `AIAssistantSidebar.vue` 只做通用容器，具体场景由调用方传入。

建议结构：

```text
apps/web/src/features/ai-assistant/
  components/
    AIAssistantSidebar.vue
    AIMessageList.vue
    AIMessageComposer.vue
    AIConsistencyReport.vue
    AIApplyActions.vue
  composables/
    useAIAssistantSession.ts
    useAIConsistencyGuard.ts
```

具体改动：

1. 将当前全局 `components/AIAssistantSidebar.vue` 移入 `features/ai-assistant/components`。
2. 将流式请求、错误状态、一致性守卫、应用按钮状态拆成 composable。
3. AI 请求必须显式传入 scene：`draft`、`outline`、`polish`、`quality`。
4. 一致性检查失败时默认禁止应用，必须由用户明确选择跳过。

验收：

```bash
pnpm check
```

人工检查：

- AI 未配置提示
- 流式生成
- 生成失败不出现“应用到编辑器”
- 一致性检查失败不静默放行

### 阶段 7：隔离调试页

目标：避免 `DataViewer.vue` 继续污染主产品结构。

建议方案二选一：

方案 A：保留但迁移到开发工具目录

```text
apps/web/src/devtools/DataViewer.vue
```

并把路由改为：

```text
/dev/debug
```

方案 B：删除页面，改为后端 seed/API smoke 文档。

最低要求：

1. 页面顶部标注“开发调试页”。
2. 不在主导航出现。
3. 不作为产品验收页面。
4. 不继续新增业务能力。

验收：

```bash
pnpm check
```

### 阶段 8：统一前端文案与错误处理

目标：减少页面里散落的 toast 文案和特殊错误处理。

建议新增：

```text
apps/web/src/utils/error-message.ts
apps/web/src/utils/toast-message.ts
```

规则：

1. API 错误统一转中文用户文案。
2. 技术错误只进入 console 或调试页，不直接暴露给普通用户。
3. 高频动作 toast 文案集中维护。
4. 允许模型名、provider key、技术枚举保留英文。

验收扫描：

```bash
rg -n "Failed to|Loading\\.\\.\\.|Apply|Delete|Create|Update" apps/web/src
pnpm check
```

## 5. 新增功能落地模板

后续新增一个前端功能时，默认按以下文件创建：

```text
apps/web/src/api/<domain>.ts
apps/web/src/stores/<domain>.store.ts
apps/web/src/features/<domain>/components/<Domain>Panel.vue
apps/web/src/features/<domain>/composables/use<Domain>.ts
apps/web/src/views/<Domain>View.vue
```

`<Domain>View.vue` 示例职责：

```ts
const route = useRoute()
const projectId = computed(() => route.params.id as string)
const store = useDomainStore()

onMounted(() => {
  store.fetch(projectId.value)
})
```

模板只允许做组合，不允许把领域表单、复杂列表和 AI 确认流程直接写在 view 中。

## 6. 禁止新增的反模式

以下写法后续 PR 或 AI 修改应直接退回：

```ts
fetch('/api/...')
fetch('http://localhost:3000/...')
alert('...')
confirm('...')
prompt('...')
```

以下结构也应避免：

```text
views/SomeView.vue 超过 500 行仍继续新增功能
components/ 放入只有单一业务页面使用的大型领域组件
stores/ 中直接写 UI 弹窗状态
api/ 中返回 any
features/ 中重复定义 shared 已有领域模型
```

## 7. 验收命令

每一阶段完成后运行：

```bash
pnpm check
```

UI 或交互调整还需要人工检查：

```text
1440px 桌面
1024px 窄桌面
390px 移动宽度
```

重点确认：

1. 页面无遮挡、无溢出。
2. 键盘焦点可见。
3. 删除、覆盖、恢复类操作有确认弹窗。
4. AI 结果进入确认区。
5. 用户可见文案为中文。
6. 主业务页仍符合三栏工作台定位。

## 8. 推荐执行顺序

建议后续开发按以下顺序交给其他 AI：

1. 拆分 `OutlineView.vue`，建立大纲领域模板。
2. 拆分 `ProjectSettingsView.vue`，收口 AI provider 和写作人格设置。
3. 拆分 `WritingJobView.vue`，把任务控制器独立出来。
4. 拆分人物、关系、冲突、伏笔页面。
5. 收口 AI 侧栏到 `features/ai-assistant`。
6. 隔离或删除 `DataViewer.vue`。
7. 统一 toast、错误文案和英文残留扫描。

每一步都必须保持 `pnpm check` 通过，不允许以“后续阶段再修”为理由提交不可构建状态。
