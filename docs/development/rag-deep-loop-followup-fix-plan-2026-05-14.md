# RAG Deep Loop Follow-up Fix Plan

日期：2026-05-14

适用范围：本计划用于修复当前 RAG 深层闭环剩余问题。上一轮门禁和基础 API 契约已经通过，本轮只处理事实图谱召回、技巧/事实向量回填、多 provider embedding 配置，以及对应验收。

## 当前状态

已通过：

```bash
pnpm check
pnpm db:migrate
```

已修复：

1. `quality.service.ts` lint 和 typecheck。
2. 前端 API client 导入问题。
3. retrieval route 统一 `ApiResponse`。
4. retrieval 前端路径统一 `/api/...`。
5. 知识库 RAG 主链路不再直接把 `knowledgeChunks.content` 塞进 AI prompt。
6. 向量检索 ID 查询已改为 `inArray`。

仍需修复：

1. `factTripleSubjects` 已传入检索服务，但检索服务没有使用。
2. `technique` 和 `fact_summary` embedding 已写入，但 RAG 检索不会返回这些类型。
3. embedding 配置仍复用 chat model，非 OpenAI provider 可能不可用。

## P1 修复 1：接通事实图谱扩展检索

### 问题

文件：

- `apps/api/src/services/ai-context.service.ts`
- `apps/api/src/services/knowledge-retrieval.service.ts`
- `apps/api/src/db/schema/postprocess.ts`

当前 `ai-context.service.ts` 已构建：

```ts
const factTripleSubjects = [
  ...allCharacters.map(c => c.name),
  ...conflictSummaries.map(c => c.title),
]
```

并传入：

```ts
retrieveKnowledgeForAI({
  projectId,
  terms: searchTerms,
  factTripleSubjects,
  limit: 5,
})
```

但 `knowledge-retrieval.service.ts` 的 `retrieve()` 只使用：

```ts
const { projectId, terms, limit = 10 } = input
```

`factTripleSubjects` 被完全丢弃。

### 修改目标

让 RAG 检索可以根据人物、冲突、事实主语召回 `story_fact_triples`，并把它们进入 AI 上下文。

### 修改要求

1. 在 `knowledge-retrieval.service.ts` 引入 `storyFactTriples`。
2. 新增 `searchFactTriples(projectId, subjects, terms)`。
3. 查询条件必须同时限制：
   - `projectId`
   - `status = 'confirmed'`，如果当前 schema 有该字段
   - `subjectName` 命中 `factTripleSubjects`
   - 或 `objectName/predicate` 命中 `terms`
4. 返回 `SearchResult` 时：
   - `source: 'fact'`
   - `title`: `事实：${subjectName} ${predicate} ${objectName}`
   - `summary`: 拼接事实、证据、相关章节
   - `importance`: 8 或 9
   - `matchedTerms`: 命中的人物/冲突/关键词
5. 在 `retrieve()` 中并入 `factResults`。
6. 修改 `fuse()` 签名，增加 `factResults` 参数，并按高权重处理。

### 建议实现

```ts
private static async searchFactTriples(
  projectId: string,
  subjects: string[],
  terms: string[],
): Promise<SearchResult[]> {
  const names = [...new Set([...subjects, ...terms].filter(Boolean))]
  if (names.length === 0)
    return []

  const rows = await db
    .select()
    .from(storyFactTriples)
    .where(and(
      eq(storyFactTriples.projectId, projectId),
      or(
        inArray(storyFactTriples.subjectName, names),
        inArray(storyFactTriples.objectName, names),
        ...terms.map(t => sql`${storyFactTriples.predicate} ILIKE ${`%${t}%`}`),
      ),
    ))
    .limit(20)

  return rows.map(row => ({
    id: row.id,
    title: `事实：${row.subjectName} ${row.predicate} ${row.objectName}`,
    summary: [
      `${row.subjectName} ${row.predicate} ${row.objectName}`,
      row.evidence ? `证据：${row.evidence}` : '',
      row.reason ? `推理：${row.reason}` : '',
    ].filter(Boolean).join('\n'),
    techniques: null,
    source: 'fact',
    matchedTerms: names.filter(name =>
      row.subjectName.includes(name)
      || row.objectName.includes(name)
      || row.predicate.includes(name),
    ),
    vectorScore: 0,
    importance: 9,
    createdAt: new Date(row.createdAt),
  }))
}
```

注意：字段名以当前 schema 为准，不要照抄不存在的 `evidence/reason` 字段。

### 验收

1. Seed 或手动创建一条事实：

```text
林澈 -> 怀疑 -> 记忆货币
```

2. 在写作或大纲 AI 请求中包含 `林澈`。
3. 查询 AI context snapshot 或 retrieval test，确认结果里出现 `source: fact`。
4. `pnpm check` 通过。

## P1 修复 2：让 `technique` 和 `fact_summary` embedding 真正参与检索

### 问题

文件：

- `apps/api/src/services/knowledge.service.ts`
- `apps/api/src/services/postprocess-suggestion.service.ts`
- `apps/api/src/services/knowledge-retrieval.service.ts`
- `apps/api/src/services/embedding.service.ts`

当前已经写入：

```ts
contentType: 'technique'
contentType: 'fact_summary'
```

但 `knowledge-retrieval.service.ts` 只处理：

```ts
s.contentType === 'knowledge_summary'
s.contentType === 'chapter_memory'
```

因此技巧和事实向量永远不会返回到 RAG 结果。

### 修改目标

向量搜索返回的 `technique` 和 `fact_summary` 必须映射回业务数据，并进入最终融合排序。

### 修改要求

#### 2.1 处理 `technique`

当前 `knowledge.service.ts` 为 `technique` embedding 写入：

```ts
sourceId
chunkId
contentType: 'technique'
```

在 `vectorSearch()` 中：

1. 将 `technique` 的 `chunkId` 也加入 `chunkIds`。
2. 对 `technique` 结果，读取对应 `knowledgeChunks`。
3. 只输出 `techniques` 或 summary，不输出原文 content。
4. 返回：

```ts
source: 'knowledge'
summary: c.techniques || c.summary
reasons: 语义相关性
```

如果 `c.techniques` 和 `c.summary` 都为空，跳过。

#### 2.2 处理 `fact_summary`

当前 `postprocess-suggestion.service.ts` 为事实创建 embedding 时使用：

```ts
sourceId: insertedFact.id
contentType: 'fact_summary'
```

在 `vectorSearch()` 中：

1. 收集 `fact_summary` 的 `sourceId`。
2. 查询 `storyFactTriples`。
3. 返回 `source: 'fact'`。
4. summary 使用结构化事实，不要查原文。

#### 2.3 保留 `persona_memory`

`persona_memory` 当前由 `persona-memory.service.ts` 单独检索，不要求混入通用知识库 RAG，除非明确需要。

### 建议代码结构

```ts
const chunkIds = similar
  .filter(s => ['knowledge_summary', 'technique'].includes(s.contentType))
  .map(s => s.chunkId)
  .filter(Boolean) as string[]

const memoryIds = similar
  .filter(s => s.contentType === 'chapter_memory')
  .map(s => s.chunkId)
  .filter(Boolean) as string[]

const factIds = similar
  .filter(s => s.contentType === 'fact_summary')
  .map(s => s.sourceId)
  .filter(Boolean) as string[]
```

在循环中按 `contentType` 分支：

```ts
if (s.contentType === 'technique' && s.chunkId) {
  const c = chunkMap.get(s.chunkId)
  if (!c || (!c.techniques && !c.summary))
    continue

  results.push({
    id: `${c.id}:technique`,
    title: c.title ? `技巧：${c.title}` : '参考技巧',
    summary: c.techniques || c.summary,
    techniques: c.techniques,
    source: 'knowledge',
    matchedTerms: [],
    vectorScore: s.similarity,
    importance: Math.max(c.importance || 5, 8),
    createdAt: new Date(c.createdAt),
  })
}
```

### 验收

运行检索测试：

1. 上传或 seed 一个带 `techniques` 的知识库 chunk。
2. 运行 retrieval test。
3. 至少有一个结果来自 `technique` embedding。
4. 结果摘要不得出现参考原文片段。

扫描：

```bash
rg -n "contentType === 'technique'|contentType === 'fact_summary'" apps/api/src/services/knowledge-retrieval.service.ts
```

预期：有明确处理分支。

## P1 修复 3：补齐 embedding 模型配置

### 问题

文件：

- `apps/api/src/services/embedding.service.ts`
- `apps/api/src/services/ai.service.ts`
- `apps/api/src/db/schema/settings.ts` 或当前 AI settings schema
- `apps/web/src/views/ProjectSettingsView.vue`
- `packages/shared`

当前 `embedding.service.ts` 使用：

```ts
model: settings.provider === 'openai'
  ? 'text-embedding-3-small'
  : settings.model
```

这只适合少数情况。很多 provider 的 chat model 和 embedding model 不是同一个。

### 修改目标

AI 设置中增加独立 embedding 配置，使 Kimi、GLM、Gemini、GPT、火山等 provider 可以分别配置 chat 与 embedding。

### 最小字段设计

在 shared 和后端 schema 中增加：

```ts
embeddingProvider?: string
embeddingBaseUrl?: string
embeddingModel?: string
embeddingApiKey?: string
embeddingEnabled?: boolean
```

如果不希望增加单独 API key，可先复用 `apiKey`：

```ts
embeddingApiKey = apiKey
```

但 UI 上要明确提示：默认复用当前 AI Key。

### Provider 默认建议

配置默认值时，只做推荐，不硬编码不可覆盖：

```ts
const DEFAULT_EMBEDDING_MODELS = {
  openai: 'text-embedding-3-small',
  gemini: 'text-embedding-004',
  zhipu: 'embedding-3',
  volcengine: 'doubao-embedding-text-240715',
}
```

Kimi 是否支持 embedding 要以当前 provider 文档和实际接口为准。如果不支持，应在 UI 中显示“该 provider 暂不支持向量化，请选择其他 embedding provider”。

### 后端要求

1. 新增 `getEffectiveEmbeddingSettings()`。
2. `callAIEmbedding()` 使用 embedding settings，而不是 chat settings。
3. 不支持 embedding 时抛结构化错误：

```ts
throw new Error('当前向量化配置不可用，请在项目设置中配置 Embedding Provider')
```

4. `embedding.service.ts` 写入 `embeddingModel` 时使用实际 embedding model。
5. `searchSimilarEmbeddings()` 查询向量时必须使用同一个 embedding model，否则不同维度/模型的向量不可比较。

建议：

```ts
.where(and(
  eq(knowledgeEmbeddings.projectId, projectId),
  eq(knowledgeEmbeddings.embeddingModel, model),
  contentType ? eq(knowledgeEmbeddings.contentType, contentType) : undefined,
))
```

### 前端要求

在项目设置或全局 AI 设置中增加“向量化配置”区块：

1. Provider 下拉：
   - OpenAI
   - Gemini
   - GLM / 智谱
   - 火山引擎
   - 自定义 OpenAI-compatible
2. Base URL。
3. Embedding Model。
4. API Key，可选择复用聊天 API Key。
5. “测试向量化配置”按钮。

测试按钮调用后端接口：

```text
POST /api/ai/settings/test-embedding
```

返回：

```ts
{
  success: true,
  data: {
    provider: string
    model: string
    dimensions: number
  }
}
```

### 数据库和迁移

如果 AI settings 表新增字段，必须：

```bash
pnpm db:generate
pnpm db:migrate
```

并检查新环境迁移通过。

### 验收

1. 设置 OpenAI embedding，点击测试，返回 dimensions。
2. 设置一个不支持 embedding 的 provider，点击测试，显示中文错误。
3. 上传知识库后能生成 embedding。
4. retrieval test 能返回 vector 分数。
5. `pnpm check` 通过。
6. `pnpm db:migrate` 通过。

## P1 修复 4：为 knowledge embedding 增加幂等唯一约束

### 问题

文件：

- `apps/api/src/db/schema/knowledge.ts`
- `apps/api/src/services/embedding.service.ts`

当前 `getOrCreateEmbedding()` 先按：

```ts
projectId + contentHash + embeddingModel
```

查询已有记录，但插入时：

```ts
onConflictDoUpdate({
  target: knowledgeEmbeddings.id,
})
```

`id` 每次都是新生成的，因此这个 upsert 基本不会处理重复内容。

### 修改目标

同一项目、同一模型、同一内容 hash、同一内容类型最多只有一条 embedding。

### 修改要求

1. 在 `knowledgeEmbeddings` schema 增加唯一索引：

```ts
uniqueIndex('knowledge_embeddings_content_unique')
  .on(
    table.projectId,
    table.embeddingModel,
    table.contentType,
    table.contentHash,
  )
```

2. 生成 migration。
3. 插入前先清理历史重复数据，或 migration 中保留最早记录。
4. `onConflictDoUpdate` target 改成该唯一索引对应字段。

示例：

```ts
}).onConflictDoUpdate({
  target: [
    knowledgeEmbeddings.projectId,
    knowledgeEmbeddings.embeddingModel,
    knowledgeEmbeddings.contentType,
    knowledgeEmbeddings.contentHash,
  ],
  set: {
    embeddingVector: vector,
    sourceId: input.sourceId,
    chunkId: input.chunkId,
    updatedAt: timestamp,
  },
})
```

### 验收

1. 对同一 chunk 重复调用 `getOrCreateEmbedding()`。
2. 数据库只保留一条对应 embedding。
3. `pnpm db:migrate` 通过。

## P2 修复 5：检索测试结果展示中文化与可解释性

### 问题

文件：

- `apps/web/src/features/knowledge/components/KnowledgeRetrievalTest.vue`

当前权重 label 仍直接显示：

```text
keyword
vector
recency
importance
```

这不影响功能，但作为作者产品，建议中文化，提升诊断可读性。

### 修改要求

增加映射：

```ts
const scoreLabelMap = {
  keyword: '关键词',
  vector: '语义',
  recency: '新近度',
  importance: '重要性',
}
```

模板中显示中文。

同时增加来源标签映射：

```ts
knowledge: '知识库'
memory: '章节记忆'
bible: '故事设定'
character: '人物设定'
fact: '事实图谱'
```

## 推荐执行顺序

不要跳过顺序：

1. 接入 `storyFactTriples` 检索。
2. 处理 `technique` 和 `fact_summary` 向量结果。
3. 给 embedding 查询增加 `embeddingModel` 过滤。
4. 增加 embedding 唯一约束和 upsert target。
5. 增加 embedding provider/model 配置。
6. 增加 embedding 测试接口。
7. 更新项目设置 UI。
8. 优化检索测试中文展示。
9. 跑完整验收。

## 最终验收命令

必须运行：

```bash
pnpm check
pnpm db:migrate
```

如果修改 schema：

```bash
pnpm db:generate
pnpm db:migrate
```

建议补充扫描：

```bash
rg -n "factTripleSubjects|storyFactTriples|contentType === 'technique'|contentType === 'fact_summary'|getEffectiveEmbeddingSettings|test-embedding" apps/api/src apps/web/src packages/shared
```

验收标准：

1. `factTripleSubjects` 被检索服务实际使用。
2. retrieval test 可以返回 `source: fact` 的结果。
3. `technique` embedding 可以回到检索结果。
4. `fact_summary` embedding 可以回到检索结果。
5. RAG 输出不包含参考原文片段。
6. embedding 查询只比较同一 embedding model 的向量。
7. 项目设置能测试 embedding 配置。
8. `pnpm check` 和 `pnpm db:migrate` 全部通过。

## 不在本轮处理

以下内容不要混入本轮：

1. 新增完整 prompt 模板市场。
2. 重做知识库上传 UI。
3. 新增更多小说结构理论。
4. 改写全文写作任务引擎。
5. 重构所有 AI provider。

本轮目标是把已有 RAG 数据真正流动起来，让“知识库、事实图谱、章节记忆、技巧拆解”都能被 AI 写作上下文召回，而不是只写入数据库后沉睡。
