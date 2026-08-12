# 本地开发与配置

更新日期：2026-08-13

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
pnpm db:seed
```

Seed 只用于明确的本地开发数据库。它使用稳定的项目与命令标识，重复执行会返回已有演示项目，不重复追加事件；产品数据始终通过 Command Bus 和受保护 Event Store 写入。若 seed 被中断并留下不完整项目，先按下文的 no-conversion 路径重建数据库，不要直接修补事件表。

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

项目内容保护需要独立的 32 字节随机主密钥。生成并写入本地 `.env`：

```bash
openssl rand -base64 32
```

```env
PROJECT_CONTENT_MASTER_KEY=上一步输出的Base64值
```

`PROJECT_CONTENT_MASTER_KEY` 必须与 `AI_CREDENTIAL_MASTER_KEY` 不同。两者都必须解码为恰好 32 字节；项目内容主密钥缺失、不是规范 Base64 或长度错误时，API、seed、replay 和相关数据库命令会在构造运行时前失败，不能降级为明文运行。主密钥不得提交、记录到日志或用于前端配置。

当前 migration 会完整创建 Event Store、stream、快照、命令回执、投影 checkpoint、Outbox 和全部产品投影，并安装 `domain_events` 的 append-only 触发器：

```bash
pnpm db:migrate
```

migration `0044_real_sugar_man.sql` 创建每项目包装数据密钥表。事件、聚合快照和成功命令回执在 Eventing Content Protector 边界以项目数据密钥加密；只有注册为无内容的元数据事件和最小删除回执可保持明文。Project、设置、Prompt、故事结构、章节、人物、关系、冲突、伏笔、叙事知识和自动化运行均使用事件作为事实来源。

迁移命令不会主动清空已有数据库。本阶段不提供明文历史事件转换；经确认允许清空的本地环境使用 no-conversion reset path：

```bash
pnpm db:rebuild
pnpm db:seed
pnpm db:replay
```

`db:rebuild` 会删除本地开发库的 `public` 与 Drizzle migration schema，数据不可恢复；脚本拒绝非本地目标。`db:replay` 会清空可重建投影并按事件全局位置恢复。

删除项目会在同一 Command Bus 事务中删除读模型和 credential vault 条目，并销毁包装后的项目数据密钥。旧事件仍保留追加式头部和加密载荷，但已无法解密；这是不可恢复的密码学删除。Replay 会先读取 `ProjectDeleted` 明文 tombstone，再整体跳过该项目，不能尝试恢复其内容。

检查当前数据库的保护状态：

```bash
pnpm db:verify-encryption
pnpm db:verify-encryption -- --project <project-id>
```

扫描器检查受保护事件、项目快照、项目命令回执、数据密钥 envelope 与 tombstone 一致性。输出只包含记录类型、记录 ID 和问题类别，不输出原始 payload、已知明文、密文、认证标签或密钥引用；非零退出码表示发现未保护、格式错误或密钥状态不一致的记录。

事件内核集成测试始终连接 `_test` 数据库：

```bash
pnpm --filter @ai-novel/api exec vitest run src/eventing
pnpm --filter @ai-novel/api test:coverage
```

Outbox worker、Process Manager 和投影重放由 API 事件内核提供；全部 handler/projector 在 `eventing-runtime.ts` 注册。route、service、seed 和维护脚本不得直接写 `domain_events`、`aggregate_streams`、`aggregate_snapshots`、`command_receipts`、Outbox 或 checkpoint，产品写入必须经 Command Bus 和 Event Store 的保护边界；静态全局 catalog 不属于项目事件流。重放规则是先调用投影的 project-aware `reset`，再以受限 `batchSize` 按全局位置扫描；失败会回滚读模型并记录诊断状态。章节版本是不可变投影，删除接口固定返回冲突响应。

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
pnpm db:replay
```

若本机环境限制进程访问 PostgreSQL，API 集成测试需要在允许连接本机 5432 端口的终端中执行。
