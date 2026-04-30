# AI 与知识库流程修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 AI stream 错误协议、知识库假完成、知识库检索缺失 AI 分析内容、章节更新重复序号这 4 个流程问题，让功能从“能打开”变成“可可靠使用”。

**Architecture:** 后端 route 负责 HTTP 协议和状态码，service 负责业务状态与数据库一致性；前端 API 层负责识别结构化错误，组件只展示可操作状态。知识库分析必须在 AI 不可用时失败并显式标记，不允许写入占位摘要后显示完成。

**Tech Stack:** Hono, Drizzle ORM, PostgreSQL, Vue 3, Pinia, TypeScript, pnpm workspace.

---

## 0. 执行前必须阅读

按根目录 `AGENTS.md` 要求先读：

1. `AGENTS.md`
2. `docs/development/engineering-standards.md`
3. `docs/development/ai-collaboration-rules.md`
4. `docs/development/flow-logic-audit-fix-plan-2026-04-29.md`

本轮不改 UI 视觉、不改数据库 schema、不新增产品入口。只修流程逻辑与必要测试。

## 1. 当前问题清单

### P1-1 AI stream 错误仍会被当成普通 AI 回复

位置：

- `apps/api/src/routes/ai.ts:21-28`
- `apps/web/src/api/ai.ts:9-20`
- `apps/web/src/components/AIAssistantSidebar.vue:77-85`
- `apps/web/src/components/AIAssistantSidebar.vue:176-184`

问题：

后端在 streaming response 内写入：

```text
[Error: AI 服务未配置，请先到项目设置完成配置检测]
```

HTTP 状态仍是 200。前端 `fetch` 不会进入 `catch`，所以 AI 侧栏会把错误文本当成普通 assistant 消息，并显示“应用到编辑器”按钮。

预期：

1. AI 未配置时，后端返回结构化 `400` JSON，不进入 stream。
2. 前端 `chatStream()` 对非 2xx 响应抛出中文错误。
3. `AIAssistantSidebar` 显示“AI 服务未配置”提示和“前往项目设置”按钮。
4. 错误消息不能出现“应用到编辑器”按钮。

### P1-2 知识库 AI 未配置时仍标记分析完成

位置：

- `apps/api/src/services/knowledge.service.ts:50-99`
- `apps/api/src/services/knowledge.service.ts:101-207`

问题：

`analyzeChunkWithAI()` 在无 API Key 或 AI 调用失败时返回占位文案，外层仍插入 chunk 并将 source 更新为 `completed`。

预期：

1. AI 未配置时，分析接口返回失败。
2. source 状态更新为 `failed`。
3. 不写入“AI 未配置，无法生成摘要”这类占位 chunk。
4. AI 单块解析失败时，也应让 source 进入 `failed`，并向前端返回明确原因。

### P2-1 知识库搜索没有检索 AI 生成内容

位置：

- `apps/api/src/services/knowledge.service.ts:209-219`

问题：

搜索只匹配 `knowledgeChunks.content`，不会匹配 `title`、`summary`、`techniques`。用户真正需要召回的是 AI 总结和技巧提炼。

预期：

搜索至少匹配：

- `knowledgeChunks.title`
- `knowledgeChunks.content`
- `knowledgeChunks.summary`
- `knowledgeChunks.techniques`

### P2-2 更新章节时仍可制造重复章节序号

位置：

- `apps/api/src/routes/chapters.ts:74-104`

问题：

创建章节时检查同卷内 `chapterNumber` 唯一，但 patch 更新章节时没有检查。用户可以把两个章节改成同卷同序号，导致大纲顺序和写作流程混乱。

预期：

1. patch 时先读取当前章节。
2. 计算目标 `volumeId` 和 `chapterNumber`。
3. 若目标同卷同序号已被其他章节占用，返回 400。
4. 排除当前章节自身。

---

## 2. 修改范围

### 后端

修改：

- `apps/api/src/routes/ai.ts`
- `apps/api/src/services/ai.service.ts`
- `apps/api/src/services/knowledge.service.ts`
- `apps/api/src/routes/chapters.ts`

可选新增测试：

- `apps/api/src/services/knowledge.service.test.ts`
- `apps/api/src/routes/chapters.test.ts`
- `apps/api/src/routes/ai.test.ts`

如果当前 API 包测试环境没有 Hono route test 基建，可以先新增 service 级测试，并用 curl smoke 覆盖 route。

### 前端

修改：

- `apps/web/src/api/ai.ts`
- `apps/web/src/components/AIAssistantSidebar.vue`

可选新增测试：

- `apps/web/src/api/ai.test.ts`
- `apps/web/src/components/AIAssistantSidebar.test.ts`

---

## 3. 任务拆分

### Task 1: 修复 AI stream 错误协议

**Files:**

- Modify: `apps/api/src/routes/ai.ts`
- Modify: `apps/api/src/services/ai.service.ts`
- Modify: `apps/web/src/api/ai.ts`
- Modify: `apps/web/src/components/AIAssistantSidebar.vue`

- [ ] **Step 1: 在 service 层暴露 AI 配置检查**

在 `apps/api/src/services/ai.service.ts` 增加小函数：

```ts
export async function assertAIConfigured() {
  const settings = await getEffectiveAISettings()
  if (!settings.apiKey) {
    throw new Error('AI 服务未配置，请先到项目设置完成配置检测')
  }
  return settings
}
```

然后 `streamChat()` 复用它，避免重复读取配置。

- [ ] **Step 2: 在 route 进入 stream 前返回结构化错误**

在 `apps/api/src/routes/ai.ts` 中，`streamText` 前先检查配置：

```ts
try {
  await assertAIConfigured()
}
catch {
  return c.json(fail(AI_NOT_CONFIGURED), 400)
}
```

之后 stream 内部 catch 只处理真正的流式中断错误，不再把未配置错误写入 `[Error: ...]` 文本。

- [ ] **Step 3: 前端 `chatStream()` 处理非 2xx**

修改 `apps/web/src/api/ai.ts`：

```ts
export async function chatStream(messages: AIMessage[], options?: ChatStreamOptions): Promise<Response> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      projectId: options?.projectId,
      context: options?.context,
      model: options?.model,
    }),
  })

  if (!response.ok) {
    const json = await response.json().catch(() => null)
    throw new Error(json?.error || 'AI 请求失败')
  }

  return response
}
```

- [ ] **Step 4: 前端错误消息禁止应用**

在 `AIAssistantSidebar.vue` 的 message 类型中加入 `error?: boolean`：

```ts
const messages = ref<{ role: 'user' | 'assistant', content: string, model?: string, error?: boolean }[]>([])
```

catch 时：

```ts
messages.value[lastIndex].content = msg || 'AI 请求失败'
messages.value[lastIndex].error = true
```

应用按钮条件改为：

```vue
<div v-if="msg.role === 'assistant' && msg.content && !msg.error && !isStreaming">
```

- [ ] **Step 5: 验证**

运行：

```bash
curl -s -X POST http://127.0.0.1:3000/api/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"测试"}]}'
```

未配置 AI 时预期：

```json
{"success":false,"error":"AI 服务未配置，请先到项目设置完成配置检测"}
```

并且 HTTP status 应为 `400`。

前端验收：

1. AI 侧栏显示“AI 服务未配置”提示。
2. 显示“前往项目设置”按钮。
3. 不显示“应用到编辑器”按钮。

### Task 2: 修复知识库分析假完成

**Files:**

- Modify: `apps/api/src/services/knowledge.service.ts`

- [ ] **Step 1: 让 AI 分析失败时抛错**

修改 `analyzeChunkWithAI()`：

```ts
if (!settings.apiKey) {
  throw new Error('AI 服务未配置，请先在项目设置中完成 AI 配置检测')
}
```

AI 返回为空、JSON 解析失败、OpenAI SDK 抛错时都应抛出中文错误，不返回占位摘要。

- [ ] **Step 2: 删除占位摘要**

删除以下返回路径：

```ts
summary: 'AI 未配置，无法生成摘要'
techniques: 'AI 未配置，无法提取技巧'
summary: 'AI 分析失败'
techniques: 'AI 分析失败'
```

这些文案可以作为接口错误返回，但不能作为成功数据入库。

- [ ] **Step 3: 分析失败时 source 标记 failed**

现有 `catch` 已将 source 改为 `failed`，保留它。需要确保 AI 未配置和 JSON 解析失败都能进入这个 catch。

建议：

```ts
catch (e: any) {
  await db
    .update(knowledgeSources)
    .set({ status: 'failed', updatedAt: now() })
    .where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.projectId, projectId)))

  throw new Error(e?.message || '知识库分析失败')
}
```

- [ ] **Step 4: 验证**

未配置 AI 时调用：

```bash
curl -s -X POST http://127.0.0.1:3000/api/projects/:projectId/knowledge/sources/:sourceId/analyze \
  -H 'Content-Type: application/json' \
  -d '{"content":"第一章 测试\n这里是一段测试文本。"}'
```

预期：

1. 返回 `success:false`。
2. error 为中文 AI 未配置提示。
3. source 状态为 `failed`。
4. 不新增带占位摘要的 chunk。

### Task 3: 扩展知识库搜索范围

**Files:**

- Modify: `apps/api/src/services/knowledge.service.ts`

- [ ] **Step 1: 引入 `or`**

```ts
import { and, eq, like, or } from 'drizzle-orm'
```

- [ ] **Step 2: 搜索 title/content/summary/techniques**

修改 `searchKnowledge()`：

```ts
export async function searchKnowledge(projectId: string, query: string) {
  const keyword = `%${query}%`
  return db
    .select()
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.projectId, projectId),
        or(
          like(knowledgeChunks.title, keyword),
          like(knowledgeChunks.content, keyword),
          like(knowledgeChunks.summary, keyword),
          like(knowledgeChunks.techniques, keyword),
        ),
      ),
    )
    .limit(10)
}
```

- [ ] **Step 3: 空查询处理**

如果 `query.trim()` 为空，建议返回最近 10 条：

```ts
if (!query.trim()) {
  return db.select().from(knowledgeChunks)
    .where(eq(knowledgeChunks.projectId, projectId))
    .limit(10)
}
```

- [ ] **Step 4: 验证**

在本地插入或使用已有 chunk，分别搜索：

```bash
curl -s "http://127.0.0.1:3000/api/projects/:projectId/knowledge/search?q=技巧关键词"
curl -s "http://127.0.0.1:3000/api/projects/:projectId/knowledge/search?q=摘要关键词"
```

预期：

搜索 summary/techniques 中的词也能返回 chunk。

### Task 4: 修复章节 patch 重复序号

**Files:**

- Modify: `apps/api/src/routes/chapters.ts`

- [ ] **Step 1: patch 前读取当前章节**

在 patch route 解析 body 后先查询当前章节：

```ts
const [current] = await db.select().from(chapters).where(
  and(eq(chapters.id, id), eq(chapters.projectId, projectId)),
)
if (!current)
  return c.json(fail('Chapter not found'), 404)
```

- [ ] **Step 2: 计算目标卷和章节序号**

```ts
const targetVolumeId = body.volumeId ?? current.volumeId
const targetChapterNumber = body.chapterNumber ?? current.chapterNumber
```

- [ ] **Step 3: 检查同卷同序号是否被其他章节占用**

Drizzle 可以使用 `ne`：

```ts
import { and, eq, ne } from 'drizzle-orm'
```

```ts
if (targetVolumeId && targetChapterNumber != null) {
  const [existing] = await db.select({ id: chapters.id }).from(chapters).where(
    and(
      eq(chapters.projectId, projectId),
      eq(chapters.volumeId, targetVolumeId),
      eq(chapters.chapterNumber, targetChapterNumber),
      ne(chapters.id, id),
    ),
  )

  if (existing)
    return c.json(fail(`第 ${targetChapterNumber} 章已存在，请使用不同的章节序号`), 400)
}
```

- [ ] **Step 4: 保持卷归属校验**

如果 `body.volumeId` 存在，继续调用：

```ts
await assertVolumeBelongsToProject(projectId, body.volumeId)
```

- [ ] **Step 5: 验证**

准备同一卷两个章节，尝试把 B 章节 patch 成 A 的 `chapterNumber`：

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/projects/:projectId/chapters/:chapterBId \
  -H 'Content-Type: application/json' \
  -d '{"volumeId":":volumeId","chapterNumber":1}'
```

预期返回：

```json
{"success":false,"error":"第 1 章已存在，请使用不同的章节序号"}
```

---

## 4. 推荐测试补充

如果时间允许，补以下测试，避免下次回归：

### API route smoke

- AI 未配置时 `/api/ai/chat` 返回 400 JSON。
- 知识库 analyze 在 AI 未配置时返回失败，source 状态为 `failed`。
- 章节 patch 重复序号返回 400。

### Service tests

- `searchKnowledge()` 能匹配 `summary`。
- `searchKnowledge()` 能匹配 `techniques`。
- `analyzeSource()` 在 AI 失败时不插入占位 chunk。

---

## 5. 验收命令

必须运行：

```bash
PATH=/Users/lhw/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check
pnpm db:migrate
```

本地接口验证：

```bash
curl -s http://127.0.0.1:3000/api/health
curl -s http://127.0.0.1:3000/api/settings/ai
curl -s -X POST http://127.0.0.1:3000/api/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"测试"}]}'
```

浏览器验收：

1. 访问 `/project/:id/settings`，确认 AI 配置入口存在。
2. 未配置 AI 时，在写作页或大纲页触发 AI，显示配置提示，不显示“应用到编辑器”。
3. 知识库上传在 AI 未配置时显示失败，不显示 completed。
4. 配置可用 AI 后，知识库上传生成真实摘要和技巧。
5. 知识库搜索能搜到摘要和技巧中的关键词。
6. 大纲页不能把两个章节改成同卷同序号。

---

## 6. 不在本轮处理

以下内容不属于本轮：

- 新增向量检索或全文索引。
- 新增知识库版权检测。
- 重做 AI 侧栏 UI。
- 重做章节拖拽排序。
- 新增数据库唯一约束。

说明：如果后续要彻底保证章节序号唯一，建议另开任务增加 PostgreSQL 部分唯一约束或应用层排序模型；本轮只补齐当前 patch 逻辑漏洞，避免扩大迁移风险。
