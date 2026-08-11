# 本地开发与配置

更新日期：2026-08-11

## 1. 环境要求

- Node.js 22+
- pnpm 10+
- PostgreSQL 15+
- pgvector 扩展

## 2. 初始化

```bash
cp .env.example .env
pnpm install
pnpm db:init-vector
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

Seed 会重建演示数据，只能用于明确的本地开发数据库。

## 3. 配置来源

`.env.example` 是支持环境变量的完整清单。API 运行时、Drizzle 和 pgvector 初始化统一通过 `apps/api/src/config/environment.ts` 读取配置。

### 服务

```env
PORT=3000
CORS_ORIGINS=http://localhost:5173
```

多个前端来源使用逗号分隔，例如：

```env
CORS_ORIGINS=http://localhost:5173,https://preview.example.com
```

### 数据库

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_novel
```

未设置时默认使用当前系统用户连接本机 `ai_novel`。

API 集成测试使用独立配置：

```env
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_novel_test
```

测试启动器拒绝任何数据库名不以 `_test` 结尾的地址。不要把开发库或生产库地址复制到该变量。

### AI 与 Embedding

推荐通过“项目设置 → AI 服务配置”维护 Provider、Base URL、模型、API Key 和温度。环境变量只提供默认值：

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-xxx
AI_MODEL=gpt-4o-mini
AI_TEMPERATURE=70

AI_EMBEDDING_PROVIDER=openai-compatible
AI_EMBEDDING_BASE_URL=https://api.openai.com/v1
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_EMBEDDING_API_KEY=sk-xxx
```

API Key 保存后不会在页面中回显。

## 4. 启动

```bash
pnpm dev
```

- Web：<http://localhost:5173>
- API health：<http://localhost:3000/api/health>

也可以分别运行 `pnpm dev:web` 和 `pnpm dev:api`。

## 5. 验证

```bash
pnpm check
pnpm test:coverage
```

若本机环境限制进程访问 PostgreSQL，API 集成测试需要在允许连接本机 5432 端口的终端中执行。
