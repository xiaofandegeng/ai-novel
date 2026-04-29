# Engineering Standards

版本：v0.1
日期：2026-04-29
用途：约束 AI 小说创作工作台的项目结构、编码边界、验收流程和重构纪律。

## 1. 规则来源

本规范结合了本项目已有产品文档、UI 设计文档、开发顺序、修复文档和公开 AI coding agent 规则实践。

参考资料：

- AGENTS.md 官方说明：`https://agents.md/`
- agentsmd GitHub 仓库：`https://github.com/agentsmd/agents.md`
- Cursor Project Rules 文档：`https://docs.cursor.com/en/context/rules`

核心取法：

1. 使用根目录 `AGENTS.md` 作为跨 AI 工具统一入口。
2. 使用 `.cursor/rules/*.mdc` 承载可版本化、可分层的项目规则。
3. 规则必须具体、可执行、可验收，避免“写好代码”这类空泛表达。

## 2. 架构边界

### 2.1 Monorepo 职责

```text
apps/web
  Vue 前端应用。只负责浏览器端 UI、交互、状态编排和 API 调用。

apps/api
  Hono 后端应用。负责 HTTP API、数据库访问、AI provider 调用和后端业务流程。

packages/shared
  前后端共享类型、API 响应结构、枚举、输入输出契约。

packages/ui
  设计系统组件、token、基础交互组件。

docs
  产品、设计、开发、修复、架构、AI agent 规则。
```

### 2.2 前端分层

推荐结构：

```text
apps/web/src/
  api/          HTTP client and endpoint modules
  components/   App-level shared components
  composables/  Cross-feature Vue composables
  features/     Feature-level components and composables
  router/       Route declarations only
  stores/       Pinia stores by domain
  styles/       Global CSS only
  views/        Route page composition
```

规则：

1. `views` 只做页面编排，不承载复杂业务算法。
2. `stores` 只维护状态和调用领域 API，不直接散落拼接 fetch。
3. `api` 统一处理 HTTP 路径、响应解析和错误。
4. 大于 300 行的业务页面必须优先拆分。
5. 同一领域的组件放入 `features/<domain>`，不要全部堆到全局 `components`。

### 2.3 后端分层

推荐结构：

```text
apps/api/src/
  routes/       HTTP route registration
  services/     Business logic
  db/           Drizzle schema and database connection
  utils/        Response helpers, ids, errors
  scripts/      Seed and maintenance scripts
```

规则：

1. route 读取参数、调用 service、返回响应。
2. service 负责业务判断、数据库组合查询、项目归属校验和事务。
3. 数据库 schema 变更必须同步 migration。
4. Drizzle 查询必须使用显式导入的 `eq`、`and`、`or` 等 SQL 表达式。
5. 所有带 `projectId` 的资源详情、更新、删除接口必须校验归属。

### 2.4 Shared 契约

`packages/shared` 是前后端契约层。以下模型必须优先在 shared 定义：

- `NovelProject`
- `StoryBible`
- `Character`
- `Volume`
- `Chapter`
- `CharacterRelationship`
- `Conflict`
- `ChapterVersion`
- `KnowledgeSource`
- `KnowledgeChunk`
- `KnowledgeNote`
- `QualityReport`
- `AIMessage`
- `AIResultProposal`
- API response and input payload types

禁止：

1. 前端 store 使用 `any[]` 表示领域模型。
2. 后端返回 schema 中不存在的字段。
3. 前后端各自定义同名但字段不同的类型。

## 3. API 规范

统一响应：

```ts
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
```

规则：

1. 成功响应使用 `success(data, message?)` 或等价统一 helper。
2. 失败响应使用 `fail(error, code?)` 或等价统一 helper。
3. 不在 route 中临时拼不同响应结构。
4. 前端只依赖统一响应结构，不为每个接口写特殊解析。
5. 流式 AI 接口可以使用非 JSON 响应，但必须单独封装在 `api/ai.ts`。

## 4. 数据库与迁移

规则：

1. 修改 `apps/api/src/db/schema.ts` 后必须生成 migration。
2. migration 必须能在新环境完整建库。
3. seed 数据必须覆盖关键功能入口：项目、人物、卷章、关系、冲突、版本、知识库、质量报告。
4. 不允许出现 schema 已有字段但 migration 缺列的状态。
5. 不允许代码写入 schema 不存在的字段。

验收：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
pnpm build
```

## 5. TypeScript 规范

规则：

1. 新业务代码必须使用 TypeScript 类型。
2. `any` 只能用于无法表达的第三方事件对象，并且范围要小。
3. API payload 使用 shared input 类型。
4. 不用类型断言掩盖真实字段不匹配。
5. 导出类型优先使用 `type` 或 `interface`，保持命名清晰。

检查：

```bash
rg -n "any\[\]|: any|as any" apps packages
pnpm typecheck
```

## 6. 测试与验收

普通开发完成后必须运行：

```bash
pnpm check
```

`pnpm check` 等价于：

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

按风险添加测试：

1. shared 类型或 helper：单元测试。
2. API service：服务层或集成测试。
3. Vue composable：单元测试。
4. 关键用户流程：浏览器手动验收或自动化测试。

## 7. 文件卫生

禁止提交：

- `apps/web/dist/*`
- `apps/api/data/*.db*`
- 临时修复脚本放在 `src/views`
- `.env`
- log 文件

临时脚本如仍需保留，放入：

```text
scripts/archive/
```

并在脚本头部说明用途和是否仍可执行。

## 8. 代码审查标准

审查时按优先级看：

1. 是否阻塞 `pnpm check`
2. 是否破坏数据库迁移或 schema 一致性
3. 是否绕过项目归属校验
4. 是否绕过 AI 结果确认区
5. 是否绕过设计系统组件
6. 是否引入重复 store、重复 route、重复 API client
7. 是否缺少必要测试

