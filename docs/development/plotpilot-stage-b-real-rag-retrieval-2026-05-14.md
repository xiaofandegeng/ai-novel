# 阶段 B：真实向量 RAG 与知识召回修改文档

日期：2026-05-14  
状态：待实施  
前置阶段：阶段 A 半自动驾驶写作舱 v1

## 1. 目标

把知识库从“关键词检索 + 摘要展示”升级为真实语义 RAG。

关键原则：

1. 只召回摘要、技巧、结构模式、风格指纹。
2. 不把参考网文原文连续片段放进生成 prompt。
3. 知识召回结果必须可追踪来源和分数。

## 2. 修改范围

```text
apps/api/src/db/schema/knowledge.ts
apps/api/src/services/embedding.service.ts
apps/api/src/services/knowledge.service.ts
apps/api/src/services/knowledge-retrieval.service.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/services/ai-context-renderer.ts
apps/api/src/routes/knowledge.ts
apps/api/src/routes/ai-context-snapshots.ts
apps/api/src/scripts/init-vector.ts
apps/web/src/views/KnowledgeBaseView.vue
apps/web/src/views/AIContextSnapshotsView.vue
packages/shared/src
```

## 3. 数据模型

确认 `knowledge_embeddings` 支持：

```text
id
project_id
source_id
chunk_id
embedding_model
embedding_vector
content_type
content_hash
created_at
updated_at
```

如果使用 PostgreSQL pgvector：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

建议维度由 provider 配置决定，不要硬编码到业务层。

## 4. Embedding 写入时机

以下内容应生成 embedding：

1. `knowledge_chunks.summary`
2. `knowledge_chunks.techniques`
3. `chapter_memories.summary`
4. `story_fact_triples` 的摘要描述
5. `persona_memory_cards.content`
6. 章节风格指纹摘要

以下内容禁止生成或进入 prompt：

1. API Key。
2. 原文全文。
3. 未经 AI 总结的参考网文大段片段。

## 5. Embedding 服务要求

新增或完善：

```text
apps/api/src/services/embedding.service.ts
```

接口建议：

```ts
interface CreateEmbeddingInput {
  projectId: string
  sourceId?: string
  chunkId?: string
  contentType: 'knowledge_summary' | 'technique' | 'chapter_memory' | 'fact_summary' | 'persona_memory' | 'style_fingerprint'
  content: string
}
```

要求：

1. 使用项目 AI 配置或全局默认 embedding provider。
2. 根据 `content_hash` 去重。
3. provider 不支持 embedding 时返回结构化错误。
4. embedding 失败时知识源不能显示为“完整可用于 RAG”。

## 6. 检索流程

`retrieveKnowledgeForAI()` 改成四路融合：

```text
关键词检索
  + 向量检索
  + 事实图谱扩展
  + 当前章节/人物/冲突关联
  -> 融合排序
  -> 去重
  -> 版权安全过滤
  -> 返回摘要和技巧
```

建议分数：

```text
finalScore =
  keywordScore * 0.25
  + vectorScore * 0.45
  + graphScore * 0.20
  + projectRelevanceScore * 0.10
```

## 7. 上下文渲染要求

AI prompt 的知识区块只能展示：

```text
标题
摘要
技巧
适用场景
召回原因
```

禁止展示：

```text
content 原文
连续参考片段
章节全文
```

## 8. 前端要求

知识库页面需要显示：

1. 知识源分析状态。
2. embedding 生成状态。
3. 可用于 RAG / 不可用于 RAG。
4. 检索测试输入框。
5. 检索结果分数：
   - 关键词分
   - 向量分
   - 图谱分
   - 综合分

AI 上下文快照页面需要显示：

1. 本次 AI 请求召回了哪些知识。
2. 召回原因。
3. 是否有版权安全过滤。
4. 最终进入 prompt 的文本。

## 9. 验收场景

### 场景 1：非精确关键词召回

上传参考作品后，用户输入与原文不完全一致的问题，系统仍能召回相关技巧摘要。

### 场景 2：禁止原文入 prompt

打开 AI 上下文快照，确认知识区块没有参考作品连续原文片段。

### 场景 3：provider 不支持 embedding

切换到不支持 embedding 的 provider，上传知识源应给出明确错误或 fallback，而不是假完成。

## 10. 验收命令

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

## 11. 完成标准

- [ ] 上传知识源后生成 embedding。
- [ ] 检索服务真实读取 embedding。
- [ ] RAG 结果进入 AI 上下文快照。
- [ ] prompt 不包含参考作品原文连续片段。
- [ ] 检索结果有来源和分数。
- [ ] provider 不支持 embedding 时有明确错误状态。

