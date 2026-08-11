# 当前架构说明

更新日期：2026-08-11

## 产品边界

当前前端只包含：

- 项目列表
- 自动写作驾驶舱
- 项目设置

旧故事圣经、人物、大纲、关系、冲突、伏笔和写作独立页面已经移除。对应领域继续作为驾驶舱数据、自动写作上下文和后端 API 存在。

## Monorepo

```text
apps/web         Vue 3 前端
apps/api         Hono API 与自动写作编排
packages/shared  前后端领域契约
packages/ui      设计系统
docs             当前产品、设计和开发规则
```

## 前端入口

```text
/                         项目列表
/project/:id              自动写作驾驶舱
/project/:id/settings     项目设置
```

页面层只组合功能组件：

- `views/automation-cockpit-view.vue`
- `features/automation-cockpit`
- `features/settings`
- `stores/project.store.ts`
- `stores/chapter.store.ts`
- `api` 中被当前入口使用的客户端

## 后端主链

```text
autonomous run
  → writing job
  → context + narrative control
  → plan/draft generation
  → consistency check
  → change set + auto decision
  → repair/apply/isolate
  → postprocess
  → narrative ledgers + health metrics
```

关键服务：

- `autonomous-writing.service.ts`
- `writing-job.service.ts`
- `ai-context.service.ts`
- `narrative-control.service.ts`
- `chapter-change-set.service.ts`
- `auto-decision.service.ts`
- `auto-repair.service.ts`
- `chapter-postprocess.service.ts`
- `automation-cockpit.service.ts`

## 数据层

数据库使用 PostgreSQL、Drizzle ORM 和 pgvector。Schema 按领域拆分在 `apps/api/src/db/schema`，迁移保存在 `apps/api/drizzle`。

迁移历史是新环境建库和现有数据库升级的依据，不得作为“旧代码”删除。

## 依赖边界

- Vue view 只负责路由和页面编排。
- Feature 负责业务 UI 与组合式逻辑。
- Pinia store 负责前端远程状态。
- `apps/web/src/api` 负责 HTTP。
- Hono route 负责协议和状态码。
- Service 负责业务流程、事务和项目归属。
- `packages/shared` 负责跨端契约。

## 验证

普通改动运行：

```bash
pnpm check
```

数据库改动还需运行：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

