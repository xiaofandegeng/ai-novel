# AI 小说创作工作台

面向长篇小说作者的创作辅助系统，帮助作者完成从创意、设定、人物、关系、大纲、正文、修订到质量评估的完整创作流程。

## 技术栈

| 层级     | 技术                               |
| -------- | ---------------------------------- |
| 前端     | Vue 3 + TypeScript + Vite + UnoCSS |
| 状态管理 | Pinia + VueUse                     |
| 图标     | Lucide Icons                       |
| 后端     | Hono + TypeScript                  |
| ORM      | Drizzle ORM                        |
| 数据库   | SQLite (better-sqlite3)            |
| 代码规范 | @antfu/eslint-config               |

## 前置要求

- Node.js >= 22
- pnpm >= 10

## 快速开始

```bash
# 复制环境变量
cp .env.example .env

# 安装依赖
pnpm install

# 生成并应用数据库迁移
pnpm db:generate
pnpm db:migrate

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
│   ├── web/              # Vue 3 前端
│   └── api/              # Hono 后端
├── packages/
│   ├── shared/           # 共享类型定义
│   └── ui/               # 设计系统组件（Phase 1）
├── docs/                 # 产品设计、UI 规格、开发文档
└── pnpm-workspace.yaml   # Monorepo 配置
```

## 开发命令

| 命令               | 说明                |
| ------------------ | ------------------- |
| `pnpm dev`         | 同时启动前后端      |
| `pnpm dev:web`     | 仅启动前端          |
| `pnpm dev:api`     | 仅启动后端          |
| `pnpm build`       | 构建所有包          |
| `pnpm lint`        | 检查代码规范        |
| `pnpm lint:fix`    | 自动修复代码规范    |
| `pnpm db:generate` | 生成数据库迁移文件  |
| `pnpm db:migrate`  | 应用数据库迁移      |
| `pnpm db:studio`   | 打开 Drizzle Studio |

## 代码规范

使用 `@antfu/eslint-config`，单引号、无分号、自动排序 import。提交时自动运行 lint-staged。

## 文档

- [产品设计文档](docs/product/ai-novel-workbench-product-design.md)
- [UI 设计规格](docs/design/ai-novel-workbench-ui-design-spec.md)
- [开发顺序](docs/development/ai-agent-development-sequence.md)
