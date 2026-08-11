# 工程规范

版本：v1.0  
更新日期：2026-08-11

## 1. 规范入口

根目录 `AGENTS.md` 是所有 coding agent 的统一入口；文档导航见 `docs/README.md`，目录与依赖事实见 `docs/architecture/overview.md`。

规则必须具体、可执行、可验收。临时计划完成后删除，把仍有效的结论合并进长期文档。

## 2. 模块边界

### 前端

- `views` 只组合路由页面。
- `features/<domain>` 共同维护该领域的 API、components、composables 和 stores。
- `shared/api` 维护通用 HTTP client，`shared/utils` 只放纯工具。
- `packages/ui` 维护设计系统，`packages/shared` 维护跨端契约。
- 业务组件不直接调用 `fetch`，不从其他 feature 深层导入内部组件。

### 后端

- `modules/<domain>` 同处该领域的 route 与 service。
- `modules/index.ts` 是唯一 HTTP 模块组合入口。
- route 只读取协议输入、调用 service、选择状态码和统一响应。
- `config` 读取运行时配置，`db` 维护连接和 schema，`shared` 只维护跨领域基础能力。
- 所有带 `projectId` 的详情、更新、删除和自动处理必须校验资源归属。

### 共享代码判断

只有同时满足下列条件才进入公共层：

1. 至少两个领域实际使用。
2. 不包含某个领域独有的状态或流程。
3. 有稳定、清晰、可测试的输入输出。

TypeScript 优先使用命名纯函数和小模块，不创建无状态的静态“Utils 类”。

## 3. API 与契约

统一 JSON 响应：

```ts
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
```

- 成功和失败使用 `shared/http` 提供的统一 helper。
- 流式 AI 响应必须封装在 AI 模块。
- 跨端 payload 优先使用 `packages/shared` 类型。
- 禁止前后端分别维护同名但字段不同的领域模型。

## 4. 数据库

- schema 变更必须同步 migration。
- Drizzle 条件使用从 `drizzle-orm` 显式导入的 `eq`、`and`、`or` 等函数。
- 不写入 schema 不存在的字段。
- migration 是完整建库与升级依据，不得清理历史文件。
- seed 只允许在明确的本地开发数据库执行。

## 5. TypeScript 与文件卫生

- 不用 `any` 掩盖领域契约；第三方异常对象也应尽快收窄为 `unknown`。
- 不用断言掩盖真实字段不匹配。
- 文件名说明职责；后端路由使用 `*.routes.ts`，服务使用 `*.service.ts`，前端领域调用使用 `*.api.ts`，状态使用 `*.store.ts`。
- 不在业务源码目录保留生成物、实验脚本、日志或临时修复文件。
- 删除文件前检查静态可达性与文档引用，删除后运行全仓搜索确认无残留。

## 6. 配置

- 支持的环境变量全部记录在 `.env.example`。
- API 运行时代码通过 `apps/api/src/config/environment.ts` 读取环境变量。
- 前端 API 使用 `/api` 与 Vite proxy，不硬编码后端地址。
- 测试数据库必须使用 `_test` 后缀并由测试启动器隔离。

## 7. 测试与验收

按风险补测试：

- 纯工具、共享契约、配置解析：单元测试。
- 领域 service：单元或集成测试。
- Vue composable / Pinia store：Vitest。
- HTTP 契约：API 集成测试。
- 可见 UI 行为：浏览器检查桌面、平板、移动端。

普通改动必须执行：

```bash
pnpm check
```

覆盖率门禁：

```bash
pnpm test:coverage
```

数据库变更额外执行：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

## 8. 审查优先级

1. 构建、类型、测试和迁移阻塞。
2. 数据丢失、跨项目读写和测试库误用。
3. AI 写回与作者授权边界。
4. 目录依赖倒置、重复实现和公共层污染。
5. UI 设计系统与可访问性。
6. 缺少变更行为的自动化测试。
