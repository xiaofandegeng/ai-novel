# AI 小说创作工作台

面向长篇小说作者的自动写作工作台。当前产品以单项目驾驶舱为中心，把章节生成、叙事状态、变更写回和健康检查汇总在一条可观察流水线中。

## 技术栈

| 层级     | 技术                               |
| -------- | ---------------------------------- |
| 前端     | Vue 3 + TypeScript + Vite + UnoCSS |
| 状态管理 | Pinia                              |
| 图标     | Lucide Icons                       |
| 后端     | Hono + TypeScript                  |
| ORM      | Drizzle ORM                        |
| 数据库   | PostgreSQL + Drizzle ORM           |
| 代码规范 | @antfu/eslint-config               |

## 前置要求

- Node.js >= 22
- pnpm >= 10
- PostgreSQL >= 15

## 快速开始

```bash
# 复制环境变量
cp .env.example .env

# 安装依赖
pnpm install

# 初始化 pgvector 并应用数据库迁移
pnpm db:init-vector
pnpm db:migrate
pnpm db:seed

# 启动开发服务器
pnpm dev
```

启动后访问：

- 前端：<http://localhost:5173>
- 后端：<http://localhost:3000/api/health>

## 项目结构

```text
ai-novel/
├── apps/
│   ├── web/              # Vue 3 前端：features + shared + views
│   └── api/              # Hono 后端：modules + config + db + shared
├── packages/
│   ├── shared/           # 共享类型定义
│   └── ui/               # 设计系统组件
├── docs/                 # 带索引的产品、设计、架构、指南和规范
└── pnpm-workspace.yaml   # Monorepo 配置
```

后端按 `project`、`story`、`character`、`narrative`、`ai`、`automation` 六个领域模块组织；前端按 `projects`、`settings`、`automation-cockpit` 三个 feature 组织。详细依赖方向见架构总览。

## 开发命令

| 命令                  | 说明                            |
| --------------------- | ------------------------------- |
| `pnpm dev`            | 同时启动前后端                  |
| `pnpm dev:web`        | 仅启动前端                      |
| `pnpm dev:api`        | 仅启动后端                      |
| `pnpm build`          | 构建所有包                      |
| `pnpm lint`           | 检查代码规范                    |
| `pnpm lint:fix`       | 自动修复代码规范                |
| `pnpm test`           | 运行全仓自动化测试              |
| `pnpm test:coverage`  | 运行测试并校验覆盖率门禁        |
| `pnpm check`          | 执行 lint、类型、构建和测试     |
| `pnpm db:init-vector` | 初始化 PostgreSQL pgvector 扩展 |
| `pnpm db:generate`    | 生成数据库迁移文件              |
| `pnpm db:migrate`     | 应用数据库迁移                  |
| `pnpm db:rebuild`     | 清空本地开发库并完整重放迁移    |
| `pnpm db:replay`      | 从领域事件重建全部读模型        |
| `pnpm db:seed`        | 写入可重复的演示项目与运行数据  |
| `pnpm db:studio`      | 打开 Drizzle Studio             |

## 代码规范

使用 `@antfu/eslint-config`，单引号、无分号、自动排序 import。提交时自动运行 lint-staged。

API 集成测试默认使用当前系统用户连接本机 `ai_novel_test`，也可通过 `TEST_DATABASE_URL` 覆盖。测试启动器只接受以 `_test` 结尾的数据库名，并会在每个用例前清空测试表，禁止将开发库或生产库配置给它。

## 文档

- [文档索引](docs/README.md)
- [当前开发状态](docs/status/current-state.md)
- [开发记忆](docs/status/development-memory.md)
- [开发交接](docs/status/handoff.md)
- [产品设计](docs/product/product-design.md)
- [UI 设计规格](docs/design/ui-design-spec.md)
- [架构总览](docs/architecture/overview.md)
- [本地开发与配置](docs/guides/local-development.md)
- [工程规范](docs/standards/engineering.md)
