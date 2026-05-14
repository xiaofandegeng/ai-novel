# Check Gate and RAG Contract Fix Plan

日期：2026-05-14

适用范围：本计划用于修复“已按照文档完成开发，请检查”后暴露的当前阻塞问题。它只处理本轮检查发现的门禁、质量评估、前端 API 契约、知识库检索和 AI 信任边界问题，不扩展新功能。

## 当前结论

当前项目仍不能进入写作验收阶段。

已验证：

- `pnpm check` 失败，当前卡在 lint。
- `pnpm --filter @ai-novel/api typecheck` 失败。
- `pnpm --filter @ai-novel/web typecheck` 失败。
- `pnpm db:migrate` 通过。

本轮修复必须先保证：

```bash
pnpm check
pnpm db:migrate
```

全部通过后，才能继续做 UI 或业务流程验收。

## P0 修复 1：恢复全仓库门禁

### 问题 1.1：`quality.service.ts` lint 阻塞

文件：

- `apps/api/src/services/quality.service.ts`

现象：

`pnpm check` 在 lint 阶段失败：

```text
apps/api/src/services/quality.service.ts
   9:5  error  Should not have line breaks between items, in node CallExpression
  10:5  error  Should not have line breaks between items, in node CallExpression
  15:5  error  Should not have line breaks between items, in node CallExpression
```

修改要求：

1. 调整 Drizzle 链式调用格式，符合当前 `antfu/consistent-chaining` 规则。
2. 不要为了通过 lint 改变查询语义。
3. 修改后单独运行：

```bash
pnpm lint
```

建议写法：

```ts
return db.select().from(qualityReports).where(eq(qualityReports.projectId, projectId)).orderBy(desc(qualityReports.createdAt))
```

或使用项目中其他已通过 lint 的 Drizzle 查询格式。

### 问题 1.2：质量评估读取了不存在的章节字段

文件：

- `apps/api/src/services/quality.service.ts`

现象：

`pnpm --filter @ai-novel/api typecheck` 失败：

```text
Property 'content' does not exist on type Chapter
```

原因：

当前章节正文模型没有 `content` 字段。质量评估 prompt 使用了：

```ts
chapter.content
```

修改要求：

1. 改为当前真实草稿字段，例如 `chapter.draft`。
2. 如果需要评估已完成正文，应先确认 schema 和 shared contract 中的正式字段，不要临时猜字段。
3. 空正文时返回中文占位，例如 `（当前章节暂无正文草稿）`。

建议：

```ts
const chapterDraft = chapter.draft || '（当前章节暂无正文草稿）'
```

然后在 prompt 中使用 `chapterDraft`。

### 问题 1.3：质量报告错误类型没有收窄

文件：

- `apps/api/src/routes/quality.ts`

现象：

`pnpm --filter @ai-novel/api typecheck` 失败：

```text
Argument of type '{}' is not assignable to parameter of type 'string'
```

原因：

当前 `getReport` 返回 `report | { error: string }`，route 使用 `'error' in report` 后，TypeScript 没有稳定收窄到 `string`。

修改要求：

1. 服务层返回更明确的 discriminated union，或 route 显式判断 `typeof report.error === 'string'`。
2. 推荐统一为：

```ts
type ServiceResult<T> = { ok: true, data: T } | { ok: false, error: string }
```

3. 如果不做 service result 重构，至少在 route 中写：

```ts
if ('error' in report && typeof report.error === 'string')
  return c.json(fail(report.error), 404)
```

验收：

```bash
pnpm --filter @ai-novel/api typecheck
```

## P0 修复 2：统一前端 API client 契约

### 问题 2.1：多个前端 API 模块导入了不存在的 `client`

文件：

- `apps/web/src/api/prompt-templates.ts`
- `apps/web/src/api/retrieval.ts`
- `apps/web/src/api/story-structure.ts`
- `apps/web/src/api/client.ts`

现象：

`pnpm --filter @ai-novel/web typecheck` 失败：

```text
Module '"./client"' has no exported member 'client'
```

原因：

`apps/web/src/api/client.ts` 当前只导出：

- `apiGet`
- `apiPost`
- `apiPatch`
- `apiPut`
- `apiDel`
- `createCrudApi`

但新增模块使用：

```ts
import { client } from './client'
```

修改要求：

优先方案：不要新增第二套 client，全部改成现有 helper。

示例：

```ts
import { apiGet, apiPost } from './client'

export const storyStructureApi = {
  listTemplates: (genre?: string) => {
    const query = genre ? `?genre=${genre}` : ''
    return apiGet<StoryStructureTemplate[]>(`/api/story-structure/templates${query}`)
  },
  applyTemplate: (projectId: string, templateId: string) =>
    apiPost(`/api/projects/${projectId}/story-structure/apply`, { templateId }),
}
```

必须注意：

1. 前端普通 API 路径必须以 `/api` 开头。
2. 不要硬编码 `http://localhost:3000`。
3. 除 AI stream 外，所有接口都走统一 `ApiResponse<T>` 解析。

验收：

```bash
pnpm --filter @ai-novel/web typecheck
```

## P1 修复 3：修复检索测试接口前后端响应契约

### 问题 3.1：后端 retrieval route 返回裸 JSON

文件：

- `apps/api/src/routes/retrieval.ts`
- `apps/web/src/api/retrieval.ts`
- `apps/web/src/api/knowledge.ts`

现象：

后端当前返回：

```ts
return c.json({
  query,
  terms,
  results,
})
```

但前端 `apiPost` 期望：

```ts
{
  success: boolean
  data?: T
  error?: string
}
```

修改要求：

1. `apps/api/src/routes/retrieval.ts` 引入统一 helper：

```ts
import { fail, success } from '../utils'
```

2. 空 query 返回：

```ts
return c.json(fail('请输入检索内容'), 400)
```

3. 成功返回：

```ts
return c.json(success({
  query,
  terms,
  results,
}))
```

4. 前端 `apps/web/src/api/retrieval.ts` 使用：

```ts
apiPost<{ query: string, terms: string[], results: RetrievalResult[] }>(
  `/api/projects/${projectId}/retrieval/test`,
  { query, limit },
)
```

5. 检查 `apps/web/src/api/knowledge.ts` 是否还保留同名 `testRetrieval`。如果存在两个检索 API：
   - 统一保留一个出口；
   - 组件只从一个 API 模块导入；
   - 避免同一接口两套类型。

验收：

```bash
pnpm --filter @ai-novel/api typecheck
pnpm --filter @ai-novel/web typecheck
```

浏览器验收：

1. 打开知识库检索测试面板。
2. 输入一个与测试小说相关的词，例如 `镜中城`、`林澈`、`记忆`。
3. 确认页面展示结果，而不是静默失败或控制台报错。

## P1 修复 4：知识库检索不得把参考原文塞进 AI prompt

### 问题 4.1：关键词检索仍匹配原文 content

文件：

- `apps/api/src/services/knowledge-retrieval.service.ts`

当前问题：

```ts
sql`${knowledgeChunks.content} ILIKE ${pattern}`
```

这会让检索直接命中经典网文原文，不符合“只用拆解摘要、技巧、结构经验，不让 AI 模仿原文”的边界。

修改要求：

1. 检索字段优先限制为：
   - `title`
   - `summary`
   - `techniques`
   - `tags`，如果当前 schema 有
2. 不要检索 `knowledgeChunks.content` 用于写作 prompt。
3. 如果需要原文定位，只能用于知识库详情页，不进入 AI 生成上下文。

建议：

```ts
return [
  sql`${knowledgeChunks.title} ILIKE ${pattern}`,
  sql`${knowledgeChunks.summary} ILIKE ${pattern}`,
  sql`${knowledgeChunks.techniques} ILIKE ${pattern}`,
]
```

### 问题 4.2：向量结果缺摘要时回退到原文片段

文件：

- `apps/api/src/services/knowledge-retrieval.service.ts`

当前问题：

```ts
summary: c.summary || c.content.substring(0, 200)
```

修改要求：

1. 如果 `summary` 为空，跳过该 chunk。
2. 不允许回退到 `content`。
3. 可以记录 reason：`缺少 AI 摘要，已跳过`，但不要把原文进入 prompt。

建议：

```ts
if (!c.summary)
  continue
```

验收扫描：

```bash
rg -n "knowledgeChunks\\.content|content\\.substring|summary \\|\\|" apps/api/src/services/knowledge-retrieval.service.ts apps/api/src/services/ai-context.service.ts
```

预期：

- 不再出现 `knowledgeChunks.content` 参与 AI 检索。
- 不再出现 `content.substring` 作为 AI prompt 摘要回退。

## P1 修复 5：修复向量检索 ID 查询

### 问题 5.1：`IN ${array}` SQL 拼接不可靠

文件：

- `apps/api/src/services/knowledge-retrieval.service.ts`

当前问题：

```ts
sql`${knowledgeChunks.id} IN ${chunkIds}`
sql`${chapterMemories.id} IN ${memoryIds}`
```

风险：

数组参数不会稳定展开成 SQL `IN (...)`，可能导致运行时查询失败或返回空结果。

修改要求：

1. 从 `drizzle-orm` 引入 `inArray`。
2. 改为：

```ts
inArray(knowledgeChunks.id, chunkIds)
inArray(chapterMemories.id, memoryIds)
```

3. 保留 `projectId` 过滤。

示例：

```ts
db
  .select()
  .from(knowledgeChunks)
  .where(and(
    eq(knowledgeChunks.projectId, projectId),
    inArray(knowledgeChunks.id, chunkIds),
  ))
```

验收：

1. seed 后确保存在 embedding 数据。
2. 调用 retrieval test。
3. 返回结果中能看到 `scoreBreakdown.vector > 0` 的条目。

## P1 修复 6：Embedding provider 不应硬编码 OpenAI

### 问题 6.1：embedding model 被写死

文件：

- `apps/api/src/services/embedding.service.ts`

当前问题：

```ts
const model = 'text-embedding-3-small'
```

风险：

项目已要求支持 Kimi、GLM、Gemini、GPT、火山引擎等多个 AI 配置源。Embedding 也属于 AI 能力的一部分，不应写死 OpenAI 模型，否则：

1. 用户配置非 OpenAI provider 后，知识库向量化仍可能失败。
2. 检索和生成使用不同 provider，排查困难。
3. 本地验收会出现“聊天可用、RAG 不可用”的割裂。

修改要求：

第一阶段可以做最小可用：

1. 增加统一的 embedding 配置读取函数。
2. 优先读取项目 AI 配置中的 embedding provider/model。
3. 如果没有单独 embedding 配置，则使用支持 embedding 的默认 provider。
4. 不支持 embedding 的 provider 要返回结构化错误，不要静默降级。

建议接口：

```ts
interface EmbeddingRuntimeConfig {
  provider: string
  model: string
  baseUrl?: string
  apiKey: string
}
```

第二阶段再做：

1. embedding 健康检查。
2. RAG 面板显示 embedding provider/model。
3. 知识库 source 显示向量化状态。

验收：

```bash
pnpm --filter @ai-novel/api typecheck
```

手动验收：

1. 在项目设置里配置当前可用 AI provider。
2. 上传或 seed 一段知识库内容。
3. 确认能生成 embedding。
4. 检索测试能返回向量召回结果。

## P2 修复 7：检索测试 UI 错误反馈

文件：

- `apps/web/src/features/knowledge/components/KnowledgeRetrievalTest.vue`

修改要求：

1. 请求失败不要只 `console.error`。
2. 使用现有 toast 或页面内错误状态展示中文提示。
3. loading、empty、error 三态要清晰：
   - `正在检索...`
   - `没有找到相关知识片段`
   - `检索失败，请检查知识库分析状态或 AI 配置`

验收：

1. 临时断开 API 或传空 query。
2. 页面必须展示中文错误，不得只在控制台报错。

## 推荐执行顺序

按以下顺序修，不要跳：

1. 修 `quality.service.ts` lint。
2. 修 `quality.service.ts` 字段错误和 `routes/quality.ts` 错误类型。
3. 跑 `pnpm --filter @ai-novel/api typecheck`。
4. 修前端 `client` 导入问题。
5. 跑 `pnpm --filter @ai-novel/web typecheck`。
6. 修 retrieval route 的 `ApiResponse` 契约和 `/api` 路径。
7. 修知识库原文进入 prompt 的问题。
8. 修向量检索 `inArray`。
9. 修 embedding provider 配置硬编码。
10. 补检索测试 UI 错误反馈。
11. 跑完整门禁。

## 最终验收命令

必须运行：

```bash
pnpm check
pnpm db:migrate
```

建议补充：

```bash
pnpm --filter @ai-novel/api typecheck
pnpm --filter @ai-novel/web typecheck
rg -n "from './client'|client\\.|knowledgeChunks\\.content|content\\.substring|summary \\|\\|" apps/web/src/api apps/api/src/services
```

验收标准：

1. `pnpm check` 通过。
2. `pnpm db:migrate` 通过。
3. Web API 模块不再导入不存在的 `client`。
4. 普通 JSON API 全部返回统一 `ApiResponse`。
5. 知识库检索不会把参考原文塞进 AI prompt。
6. 向量检索能实际返回 embedding 召回结果。
7. 检索测试 UI 有中文 loading、empty、error 状态。

## 不在本轮处理的内容

以下内容不要混入本轮，避免扩大风险：

1. 新增小说写作功能。
2. 大规模 UI 改版。
3. 新增 provider 管理后台。
4. 改动数据库主模型字段。
5. 重构整套 AI prompt 模板系统。

本轮目标只有一个：让当前已开发内容真正通过门禁，并保证 RAG/质量评估/前端 API 契约不会在写作流程中断裂。
