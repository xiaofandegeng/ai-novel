# 本地 PostgreSQL 与 AI 配置

更新日期：2026-08-11

## 环境要求

- Node.js 22+
- pnpm 10+
- PostgreSQL 15+
- pgvector 扩展

## 初始化

```bash
cp .env.example .env
pnpm install
pnpm db:init-vector
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

默认数据库连接为：

```text
postgres://<当前系统用户>@localhost:5432/ai_novel
```

推荐在根目录 `.env` 中显式设置：

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_novel
```

## AI 配置

推荐通过“项目设置 → AI 服务配置”维护 Provider、Base URL、模型、API Key 和温度。

也可以提供环境变量作为默认值：

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-xxx
AI_MODEL=gpt-4o-mini
AI_TEMPERATURE=70
```

API Key 保存后不会在页面中回显。

## 启动与验证

```bash
pnpm dev
pnpm check
curl http://localhost:3000/api/health
```

前端默认地址：`http://localhost:5173`  
后端默认地址：`http://localhost:3000`

Seed 会重建演示数据，只应在本地开发数据库执行。

