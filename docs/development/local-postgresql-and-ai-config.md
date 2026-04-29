# 本地 PostgreSQL 与 AI 配置说明

日期：2026-04-29  
适用范围：AI 小说创作工作台本地开发、SQLite 数据迁移、AI 服务连通性检测

## 1. 本地 PostgreSQL

当前后端数据库已从 SQLite 切换为本地 PostgreSQL。默认数据库名：

```text
ai_novel
```

如果使用 Homebrew PostgreSQL：

```bash
brew services start postgresql@17
createdb ai_novel
```

如果数据库已经存在，可以跳过 `createdb`。当前机器已创建并验证 `ai_novel` 数据库。

## 2. 环境变量

复制 `.env.example`：

```bash
cp .env.example .env
```

根据本机 PostgreSQL 认证方式设置 `DATABASE_URL`。

本机 peer/trust 认证示例：

```env
DATABASE_URL=postgres://<你的本机用户名>@localhost:5432/ai_novel
```

用户名密码认证示例：

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_novel
```

AI 默认配置也可以放在 `.env`，但推荐后续在应用内“项目设置 → AI 服务配置”中配置：

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-xxx
AI_MODEL=gpt-4o-mini
AI_TEMPERATURE=70
```

## 3. 应用 PostgreSQL 迁移

安装依赖后执行：

```bash
pnpm install
pnpm db:migrate
```

如果本机 `.env` 没有被正确读取，可以显式传入：

```bash
DATABASE_URL=postgres://<你的本机用户名>@localhost:5432/ai_novel pnpm db:migrate
```

## 4. 从 SQLite 迁移现有数据

本仓库保留了迁移脚本：

```bash
pnpm --filter @ai-novel/api db:migrate:sqlite
```

默认读取：

```text
apps/api/data/ai-novel.db
```

如需指定旧 SQLite 文件：

```bash
SQLITE_DATABASE_PATH=/absolute/path/to/ai-novel.db pnpm --filter @ai-novel/api db:migrate:sqlite
```

迁移脚本会清空 PostgreSQL 中的业务表，再按依赖顺序迁入：

1. 项目
2. 故事设定集
3. 角色
4. 分卷
5. 章节
6. 人物关系
7. 冲突
8. 版本历史
9. 知识库来源、拆分块和笔记
10. 质量报告

迁移脚本不会迁移或覆盖 `ai_settings`，避免误覆盖本机 AI Key。

## 5. Seed 数据

如果只需要一套干净的演示数据：

```bash
pnpm --filter @ai-novel/api db:seed
```

注意：seed 会清空核心业务数据并插入一套示例项目。

## 6. AI 配置与检测

后端新增接口：

```text
GET  /api/settings/ai
PUT  /api/settings/ai
POST /api/settings/ai/test
```

前端入口：

```text
项目设置 → AI 服务配置
```

配置项：

1. 服务类型：默认 `openai-compatible`
2. Base URL：例如 `https://api.openai.com/v1`
3. 模型名称：例如 `gpt-4o-mini`、`deepseek-chat`
4. API Key：保存后不会回显
5. 温度：0-100

点击“检测可用性”会向当前配置的模型发送一次极短请求，返回连接状态与耗时。

## 7. 验证命令

```bash
pnpm check
pnpm db:migrate
pnpm --filter @ai-novel/api db:migrate:sqlite
curl http://localhost:3000/api/health
```
