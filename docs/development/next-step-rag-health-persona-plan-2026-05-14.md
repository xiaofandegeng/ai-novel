# 下一步 RAG、健康监控与人格记忆实施文档

日期：2026-05-14
状态：待实施
前置假设：

1. `docs/development/next-step-data-flow-implementation-plan-2026-05-14.md` 已完成。
2. `docs/development/next-step-graph-writing-loop-plan-2026-05-14.md` 已完成。
3. 图谱推理已经能产生人物关系、矛盾、伏笔候选。
4. 矛盾和伏笔已经能与角色建立结构化关联。
5. 写作任务已经能完成计划、生成、审查、确认、写入、章后分析。
6. AI 上下文快照已经能记录关键 AI 请求。

目标：完成 PlotPilot 对齐路线中更偏“长篇持续写作质量”的后续能力，包括真实语义检索、长篇健康监控、写作人格记忆和最终全链路验收。

---

## 1. 本轮实施范围

本轮只做 4 件事：

1. 真实语义检索 RAG。
2. 长篇健康监控与风险解释。
3. 参考作品写作人格记忆增强。
4. 全链路写作验收脚本与测试样本。

暂不做：

- 多人协作权限系统。
- 云端发布和商业化功能。
- 编辑器复杂排版能力。
- 非小说品类扩展。

---

## 2. 阶段 A：真实语义检索 RAG

### 2.1 目标

当前知识库检索以关键词和图谱扩展为主。下一步需要加入 embedding，让 AI 能基于语义召回参考作品分析结果、项目设定、章节记忆和事实摘要。

注意：参考作品原文不能直接进入生成 prompt。RAG 只召回摘要、技巧、结构、风格指纹和知识卡片。

### 2.2 修改范围

```text
apps/api/src/db/schema/knowledge.ts
apps/api/src/services/embedding.service.ts
apps/api/src/services/knowledge.service.ts
apps/api/src/services/knowledge-retrieval.service.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/routes/knowledge.ts
apps/web/src/views/KnowledgeBaseView.vue
packages/shared/src
```

### 2.3 数据模型

确认或新增：

```text
knowledge_embeddings
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

字段建议：

```text
embedding_vector vector(1536) 或 vector(1024)
```

维度取决于默认 embedding provider。

### 2.4 Embedding 服务

新增 `embedding.service.ts`：

```ts
interface EmbeddingInput {
  projectId: string
  text: string
  contentType: 'knowledge_summary' | 'technique' | 'chapter_memory' | 'fact_summary' | 'persona_memory'
}
```

要求：

1. 支持项目 AI 配置中的 provider。
2. 如果 provider 不支持 embedding，使用 fallback provider 或返回明确错误。
3. 同一 `content_hash` 不重复生成 embedding。
4. embedding 失败时知识库 source 不得标记为完整可用。

### 2.5 写入时机

以下内容需要生成 embedding：

1. 知识库 chunk 的 summary。
2. 知识库 chunk 的 techniques。
3. 章节记忆 summary。
4. 事实三元组摘要。
5. 写作人格 memory card。

禁止生成 embedding：

1. 参考作品原文全文。
2. 用户 API Key。
3. provider 配置。

### 2.6 检索流程

`retrieveKnowledgeForAI()` 改为三路召回：

```text
关键词检索
  +
向量检索
  +
事实图谱扩展
  ↓
融合排序
  ↓
去重
  ↓
版权安全过滤
  ↓
返回摘要、技巧、结构建议
```

融合排序建议：

```text
score = keywordScore * 0.3 + vectorScore * 0.5 + graphScore * 0.2
```

### 2.7 AI 上下文要求

AI prompt 中知识库区块只能包含：

- 摘要
- 技巧
- 结构模式
- 风格指纹
- 适用场景

不得包含参考作品原文连续片段。

### 2.8 验收

1. 上传参考作品后生成摘要和技巧。
2. embedding 表写入记录。
3. 用非精确关键词提问，也能召回相关知识。
4. AI 上下文快照能看到召回来源和分数。
5. prompt 不包含参考作品原文片段。

命令：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

---

## 3. 阶段 B：长篇健康监控与风险解释

### 3.1 目标

把项目健康指标从“统计面板”升级为“长篇连续性风险雷达”。

### 3.2 修改范围

```text
apps/api/src/services/health-metrics.service.ts
apps/api/src/services/consistency-guard.service.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/routes/health-metrics.ts
apps/web/src/views/ProjectHealthView.vue
packages/shared/src
```

### 3.3 指标体系

至少支持：

1. 主题偏离风险。
2. 人物 OOC 风险。
3. 伏笔遗忘风险。
4. 矛盾停滞风险。
5. 节奏下滑风险。
6. 风格漂移风险。
7. 设定冲突风险。
8. 关键角色长期缺席风险。

### 3.4 数据来源

```text
story_bibles
characters
character_relationships
conflicts
foreshadowing_items
chapter_memories
story_fact_triples
chapter_postprocess_suggestions
quality_reports
ai_context_snapshots
consistency_guard_reports
```

### 3.5 风险模型

每个风险项包含：

```ts
interface HealthRiskItem {
  id: string
  projectId: string
  riskType: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  evidence: Array<{
    type: 'chapter' | 'character' | 'conflict' | 'foreshadowing' | 'fact' | 'snapshot'
    id: string
    label: string
  }>
  suggestion: string
  status: 'open' | 'acknowledged' | 'resolved'
}
```

### 3.6 检查规则示例

#### 伏笔遗忘

规则：

```text
open/progressing 伏笔超过 N 章没有被提及
```

输出：

```text
伏笔“沈微隐瞒档案馆身份”已 6 章未被推进。
```

#### 矛盾停滞

规则：

```text
active conflict 超过 N 章没有 intensity/status 变化
```

#### 人物 OOC

规则：

```text
最近章节记忆中的行为与角色 goal/fear/secret/desire/weakness 明显冲突
```

#### 主题偏离

规则：

```text
最近章节摘要与项目 theme / story bible theme 相似度持续下降
```

### 3.7 前端要求

健康页展示：

1. 总体健康分。
2. 风险分组。
3. 每个风险的证据来源。
4. 跳转到相关章节、角色、伏笔、矛盾。
5. 标记已处理 / 暂时忽略。

### 3.8 验收

1. 完成一章写作任务后自动刷新健康指标。
2. 开放伏笔长期未推进时出现风险。
3. 风险项能跳转到相关数据。
4. 用户能标记风险已处理或忽略。

命令：

```bash
pnpm check
```

---

## 4. 阶段 C：参考作品写作人格记忆增强

### 4.1 目标

把大量网文分析结果转成可检索、可组合、可约束的写作人格记忆，而不是一次性风格描述。

### 4.2 修改范围

```text
apps/api/src/services/persona.service.ts
apps/api/src/services/knowledge.service.ts
apps/api/src/services/ai-context.service.ts
apps/api/src/routes/persona.ts
apps/web/src/views/PersonaCenterView.vue
apps/web/src/views/TrainingSetDetailView.vue
apps/web/src/views/ProjectSettingsView.vue
packages/shared/src
```

### 4.3 新增人格记忆卡

建议新增：

```text
persona_memory_cards
  id
  persona_id
  project_id nullable
  source_work_id
  memory_type
  title
  summary
  technique
  applicable_scene
  caution
  embedding_id
  confidence
  created_at
  updated_at
```

`memory_type`：

```text
opening_hook
scene_transition
conflict_escalation
character_reveal
dialogue_style
cliffhanger
emotion_turn
payoff_pattern
worldbuilding
```

### 4.4 生成流程

```text
参考作品章节分析
  ↓
作品风格报告
  ↓
训练集人格
  ↓
人格记忆卡生成
  ↓
embedding
  ↓
项目绑定人格
  ↓
AI 上下文按任务场景召回记忆卡
```

### 4.5 AI 上下文注入规则

按场景召回不同记忆卡：

- outline：结构、节拍、悬念、冲突升级。
- draft：叙事声音、对话、情绪转折、场景推进。
- polish：语言节奏、句式、氛围、细节密度。
- quality：风格漂移、爽点密度、节奏问题。

### 4.6 版权安全

人格记忆卡必须是抽象技巧，不得包含：

1. 大段原文。
2. 连续独特表达。
3. 可识别桥段复刻。
4. 角色名、地名、专有设定复用。

### 4.7 前端要求

人格中心展示：

1. 人格总览。
2. 记忆卡分类。
3. 可启用 / 禁用记忆卡。
4. 绑定项目。
5. 每个场景启用哪些人格能力。

### 4.8 验收

1. 训练集能生成多张人格记忆卡。
2. 记忆卡能按场景被 AI 上下文召回。
3. 项目设置页能控制启用范围。
4. AI 上下文快照显示使用的人格记忆卡。
5. prompt 不包含参考作品原文。

命令：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

---

## 5. 阶段 D：全链路写作验收脚本与测试样本

### 5.1 目标

将完整写作流程变成可重复验收的脚本和测试样本，避免每次只靠手动点页面判断功能是否完成。

### 5.2 修改范围

```text
apps/api/src/scripts/seed.ts
apps/api/src/scripts/smoke-writing-loop.ts
package.json
docs/testing
```

### 5.3 测试样本

固定测试项目：

```text
项目：镜中城
类型：都市奇幻 / 记忆悬疑
主题：身份、记忆与选择的代价
```

角色：

```text
林澈：主角，能读取他人记忆碎片。
沈微：盟友，档案馆调查员，隐瞒真实身份。
楚笙：反派，经营记忆交易网络。
游箴：小角色，记忆黑市跑腿人。
```

矛盾：

```text
林澈 vs 楚笙：记忆商品化与真实身份的冲突。
林澈 vs 自我怀疑：读取记忆是否会让自己变成他人。
```

伏笔：

```text
沈微随身携带的空白档案袋。
林澈每次读取记忆后都会忘记一个童年细节。
```

### 5.4 smoke-writing-loop 脚本目标

脚本自动验证：

1. 创建或加载测试项目。
2. 创建角色、关系、矛盾、伏笔。
3. 创建章节和章节元素。
4. 构建 AI 上下文。
5. 模拟或调用 AI 生成章节草稿。
6. 运行一致性检查。
7. 写回章节草稿。
8. 保存版本。
9. 运行章后分析。
10. 应用结构化建议。
11. 刷新健康指标。
12. 检查 AI 上下文快照。

### 5.5 package script

新增：

```json
{
  "scripts": {
    "smoke:writing-loop": "pnpm --filter @ai-novel/api smoke:writing-loop"
  }
}
```

API package：

```json
{
  "scripts": {
    "smoke:writing-loop": "tsx src/scripts/smoke-writing-loop.ts"
  }
}
```

### 5.6 验收

```bash
pnpm check
pnpm smoke:writing-loop
```

如果依赖真实 AI：

1. 无 AI Key 时脚本应跳过真实生成并使用 mock provider。
2. 有 AI Key 时可选择真实调用。
3. 失败时输出明确阶段和原因。

---

## 6. 最终全链路验收标准

完整项目应满足：

- [ ] 参考作品可以上传、拆解、总结、生成技巧和人格记忆。
- [ ] 项目可以绑定写作人格。
- [ ] 大纲角色、章节元素、场景计划进入 AI 上下文。
- [ ] AI 生成前能查看上下文快照。
- [ ] AI 生成结果先进入确认区。
- [ ] 一致性检查失败不会静默放行。
- [ ] 用户确认后正文才写入章节。
- [ ] 写入后保存版本。
- [ ] 章后分析自动生成结构化建议。
- [ ] 接受建议后回填角色、关系、矛盾、伏笔、事实和记忆。
- [ ] 下一章 AI 能召回上一章沉淀的数据。
- [ ] 长篇健康指标能发现风险并提供证据。
- [ ] `pnpm check` 通过。
- [ ] `pnpm smoke:writing-loop` 通过。

---

## 7. 不允许的实现方式

1. 不允许把参考作品原文直接注入 prompt。
2. 不允许 embedding 原文全文。
3. 不允许健康指标只做静态分数，没有证据来源。
4. 不允许人格记忆只是一个长文本 prompt，必须结构化、可启停、可检索。
5. 不允许 smoke 脚本依赖固定本机数据库脏状态。
6. 不允许无 AI Key 时直接失败，应提供 mock 或跳过路径。

