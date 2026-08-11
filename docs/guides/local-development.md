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

### 事件溯源内核

当前 migration 会增量创建 Event Store、stream、快照、命令回执、投影 checkpoint 和 Outbox 表，并安装 `domain_events` 的 append-only 触发器：

```bash
pnpm db:migrate
```

这一步会创建事件内核以及当前已落地的读模型。Project、项目 AI 设置、项目 Prompt 覆盖、故事圣经、卷、幕、章节、场景和章节版本已使用事件作为事实来源；人物、叙事知识与自动化运行仍在后续批次迁移。`0030` 会把章节到卷的删除行为改为 `SET NULL`，确保结构投影重放不会级联删除章节。迁移命令本身不会清空数据，已确认的全量清空只在所有领域完成后执行一次。

事件内核集成测试始终连接 `_test` 数据库：

```bash
pnpm --filter @ai-novel/api exec vitest run src/eventing
pnpm --filter @ai-novel/api test:coverage
```

Outbox worker 和投影重放由 API 事件内核提供；Project、设置、Prompt、StoryStructure 和 Chapter 的 handler/projector 已在 `eventing-runtime.ts` 注册。不得在 route 内直接操作 Event Store、Outbox 或 checkpoint，也不得从自动化服务直接写这些领域的投影表。重放规则是先调用投影的 project-aware `reset`，再以受限 `batchSize` 按全局位置扫描；失败会回滚读模型并记录诊断状态。章节版本是不可变投影，删除接口固定返回冲突响应。

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

# 保存项目 API Key 时必填；必须是 32 字节随机值的 base64 编码
AI_CREDENTIAL_MASTER_KEY=base64-encoded-32-byte-key
```

API Key 保存后使用 AES-256-GCM 加密，不会进入事件、命令回执或项目设置投影，也不会在页面中回显。所有 AI 执行接口都要求明确的项目 ID。

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
