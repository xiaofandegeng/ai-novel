# 写作人格与 AI 流程修复文档

日期：2026-04-30  
范围：写作人格训练中心、AI 生成接入、知识库分析、章节顺序一致性、数据库迁移。  
目标：修复当前审查发现的 P0/P1/P2 问题，让人格训练和 AI 写作从“页面存在”变成“流程可闭环、数据可迁移、生成能受人格约束”。

---

## 1. 修复优先级

### 必须先修 P0

1. `pnpm db:migrate` 失败。

数据库迁移失败时，不允许继续声称阶段完成。先把迁移恢复到可重复执行状态，再处理业务流程。

### 第二优先级 P1

1. 项目人格配置未接入 AI 写作生成。
2. 训练集无法从 UI 完成人格生成闭环。
3. 人格章节分析失败仍被前端当作完成。
4. AI stream 错误协议需要保持结构化失败。
5. 知识库 AI 失败不能伪装成功。

### 第三优先级 P2

1. 作品详情路由缺失。
2. 知识库搜索范围。
3. 章节 patch 重复序号。

---

## 2. P0：修复 persona 迁移失败

### 问题

位置：

- `apps/api/drizzle/0001_optimal_starfox.sql`
- `apps/api/drizzle/meta/_journal.json`
- PostgreSQL 本地库 `drizzle.__drizzle_migrations`

现象：

```bash
pnpm db:migrate
```

退出码为 1。当前本地数据库中 persona 表已经存在，但 `drizzle.__drizzle_migrations` 仍只记录了 0000，说明 0001 迁移半应用。

### 处理原则

不能只修改本地数据库状态来“糊过去”。要保证新环境和当前环境都能正常迁移。

### 推荐修复方案

#### 方案 A：本地修复迁移状态，保留标准 migration

适用于：确认 `0001_optimal_starfox.sql` 在干净库可以执行，失败只是当前本地半应用造成。

步骤：

1. 确认 0001 中所有表和外键已经存在：

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'chapter_analyses',
    'project_persona_configs',
    'reference_chapters',
    'reference_training_sets',
    'reference_works',
    'work_style_reports',
    'writing_personas'
  );
```

2. 确认所有外键存在。
3. 如果已完整存在，则给本地 `drizzle.__drizzle_migrations` 补 0001 记录。
4. 重新执行：

```bash
pnpm db:migrate
```

预期：成功。

注意：这只是修复当前开发库状态，不是代码修复。最终仍必须在干净 PostgreSQL 数据库验证 0000 -> 0001 可以完整迁移。

#### 方案 B：重建本地开发库验证干净迁移

适用于：当前库是开发数据，可清空。

步骤：

```bash
dropdb ai_novel
createdb ai_novel
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

预期：

1. 0000 和 0001 都成功应用。
2. persona 相关表存在。
3. seed 后主流程可打开。

### 验收

必须同时通过：

```bash
pnpm db:migrate
pnpm check
```

并记录验证环境：

```text
数据库：干净库 / 既有开发库
迁移结果：成功
```

---

## 3. P1：项目人格配置接入 AI 写作生成

### 问题

位置：

- `apps/api/src/routes/ai.ts`
- `apps/api/src/services/ai.service.ts`
- `apps/api/src/routes/persona.ts`
- `apps/api/src/db/schema.ts`

当前 `/api/ai/chat` 接收了前端传来的 `projectId`，但后端没有读取 `project_persona_configs`，也没有把人格规则注入 system prompt。

### 修复目标

启用项目人格后：

1. 写作页 AI 续写读取人格规则。
2. 大纲页 AI 灵感读取人格规则。
3. 未启用人格时保持原逻辑。
4. 人格强度影响注入内容多少。
5. `enabledForDraft`、`enabledForOutline` 要生效。

### 推荐实现

#### Step 1：抽出 persona prompt builder

新增或移动到：

```text
apps/api/src/services/persona-prompt.service.ts
```

职责：

```ts
export async function buildPersonaPromptForProject(
  projectId: string,
  scene: 'outline' | 'draft' | 'polish' | 'quality',
): Promise<string | null>
```

逻辑：

1. 查询 `projectPersonaConfigs`。
2. 未配置返回 `null`。
3. 查询 `writingPersonas`。
4. 如果人格不存在或未发布，返回 `null`。
5. 根据 scene 检查启用开关。
6. 根据 strength 生成注入 prompt。

不要在 route 里拼长 prompt，避免重复。

#### Step 2：修改 AI chat request 契约

当前 `AIChatRequest` 已有：

```ts
projectId?: string
context?: string
model?: string
```

建议增加：

```ts
scene?: 'outline' | 'draft' | 'polish' | 'quality' | 'chat'
```

前端调用：

- 写作页续写：`scene: 'draft'`
- 大纲页灵感：`scene: 'outline'`
- 普通侧栏聊天：`scene: 'chat'`

#### Step 3：修改 `routes/ai.ts`

解析：

```ts
const { messages, context, model, projectId, scene } = await c.req.json()
```

构建：

```ts
const personaPrompt = projectId
  ? await buildPersonaPromptForProject(projectId, scene || 'chat')
  : null
```

调用：

```ts
streamChat(messages, {
  context,
  model,
  personaPrompt,
})
```

#### Step 4：修改 `streamChat`

建议签名改为：

```ts
export async function* streamChat(
  messages: ChatCompletionMessageParam[],
  options?: {
    context?: string
    model?: string
    personaPrompt?: string | null
  },
)
```

system messages 顺序：

1. 基础小说助手规则。
2. 项目上下文。
3. 写作人格规则。

示例：

```ts
if (options?.personaPrompt) {
  systemMessages.push({
    role: 'system',
    content: `写作人格约束：\n${options.personaPrompt}`,
  })
}
```

### 验收

1. 未配置人格时 AI chat 行为不变。
2. 配置并发布人格后，调用 `/api/projects/:projectId/persona-preview` 能看到 prompt。
3. `/api/ai/chat` 请求带 `projectId + scene=draft` 时，后端实际 system prompt 包含人格规则。
4. `enabledForDraft = 0` 时，正文生成不注入人格。
5. `enabledForOutline = 1` 时，大纲生成注入人格。

---

## 4. P1：训练集 UI 补齐“作品报告”闭环

### 问题

位置：

- `apps/web/src/views/TrainingSetDetailView.vue`
- `apps/web/src/api/persona.ts`
- `apps/api/src/services/persona.service.ts`

当前 UI 点击“分析”只调用：

```ts
analyzeWork(workId)
```

但 `generatePersonaFromTrainingSet()` 要求已有 `work_style_reports`。用户没有入口生成作品报告，所以生成人格会失败。

### 修复方案

推荐做成两步清晰流程：

```text
分析章节 -> 生成作品报告 -> 生成人格
```

### UI 修改

在作品行增加按钮：

1. `分析章节`
2. `生成报告`
3. `查看报告`

按钮显示逻辑：

```text
未分析：显示“分析章节”
分析完成但无报告：显示“生成报告”
已有报告：显示“查看报告”
```

如果为了 MVP 更快，也可以在 `handleAnalyze()` 后自动调用：

```ts
await personaApi.generateWorkStyleReport(workId)
```

但更推荐显式按钮，因为 5-20 本书的 AI 分析成本较高，用户应该知道每一步在消耗 AI。

### 后端修改

`analyzeAllChapters()` 成功后只负责章节分析，不自动生成报告。保持职责清晰。

`generateWorkStyleReport()` 保持独立接口。

### 验收

1. 上传作品后可拆章。
2. 点击“分析章节”后生成 `chapter_analyses`。
3. 点击“生成报告”后生成 `work_style_reports`。
4. 训练集中至少一个报告存在时，可生成人格。
5. 没有报告时点击“生成人格”应给出明确提示，不显示泛化失败。

---

## 5. P1：人格章节分析失败不能被当作完成

### 问题

位置：

- `apps/api/src/services/persona.service.ts:241-278`
- `apps/api/src/routes/persona.ts`
- `apps/web/src/views/TrainingSetDetailView.vue`

`analyzeAllChapters()` 将每章错误放入 `errors` 数组，但 route 仍返回 `success:true`。前端只要接口成功，就 toast “章节分析完成”。

### 修复目标

1. 全部失败：返回 `success:false`。
2. 部分失败：返回 `success:true` 但前端显示“部分完成”，并列出失败数量。
3. 作品状态要和结果一致。

### 推荐返回结构

```ts
interface AnalyzeWorkResult {
  analyzed: number
  failed: number
  chapters: number
  errors: string[]
  status: 'completed' | 'partial_failed' | 'failed'
}
```

### service 逻辑

```ts
const failed = errors.length
const analyzed = results.length

const status =
  analyzed === 0 ? 'failed'
    : failed > 0 ? 'partial_failed'
      : 'completed'
```

由于 `referenceWorks.status` 当前没有 `partial_failed`，第一版可以：

```ts
db status = failed > 0 ? 'failed' : 'completed'
api status = 'partial_failed'
```

或者正式扩展枚举：

```ts
'uploaded' | 'splitting' | 'analyzing' | 'completed' | 'partial_failed' | 'failed'
```

如果扩展枚举，需要更新：

- `packages/shared/src/types/persona.ts`
- `apps/api/src/db/schema.ts`
- migration
- UI 状态映射

### route 逻辑

全部失败时：

```ts
if (result.analyzed === 0 && result.errors.length > 0)
  return c.json(fail(result.errors[0] || '章节分析失败'), 400)
```

部分失败时返回 success，但保留 errors。

### 前端逻辑

```ts
const result = await personaApi.analyzeWork(workId)
if (result.errors.length > 0) {
  toast.add(`章节分析部分完成：成功 ${result.analyzed} 章，失败 ${result.errors.length} 章`, 'warning')
}
else {
  toast.add('章节分析完成', 'success')
}
```

### 验收

1. 未配置 AI 时点击“分析章节”，必须显示失败，不得显示完成。
2. 部分章节失败时显示 warning。
3. 全部成功时显示 success。

---

## 6. P2：补作品详情路由

### 问题

位置：

- `apps/web/src/views/TrainingSetDetailView.vue:205`
- `apps/web/src/router/index.ts`

按钮跳转：

```ts
router.push(`/persona/work/${work.id}`)
```

但 router 没有：

```text
/persona/work/:workId
```

### 修复方案

新增页面：

```text
apps/web/src/views/ReferenceWorkDetailView.vue
```

路由：

```ts
{
  path: '/persona/work/:workId',
  name: 'reference-work-detail',
  component: () => import('@/views/ReferenceWorkDetailView.vue'),
}
```

页面展示：

1. 作品基本信息。
2. 章节列表。
3. 每章分析状态。
4. 作品风格报告。
5. 操作按钮：
   - 分析章节
   - 生成作品报告
   - 返回训练集

### 验收

1. 点击“详情”进入作品详情页。
2. 能看到章节列表。
3. 有分析结果时能查看章节拆解。
4. 有作品报告时能查看报告。

---

## 7. 旧 4 项基础流程重新验收

以下 4 项来自上一轮修复文档，需要重新验收，不要只看旧 finding。

### 7.1 AI stream 错误结构化

位置：

- `apps/api/src/routes/ai.ts`
- `apps/web/src/api/ai.ts`
- `apps/web/src/components/AIAssistantSidebar.vue`

验收：

```bash
curl -s -i -X POST http://127.0.0.1:3000/api/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"测试"}]}'
```

未配置 AI 时必须返回：

```text
HTTP/1.1 400 Bad Request
```

```json
{"success":false,"error":"AI 服务未配置，请先到项目设置完成配置检测"}
```

前端不得显示“应用到编辑器”。

注意：

stream 内部其他运行时错误目前仍可能写 `[Error: ...]` 到 200 stream。更完整的修复是定义 stream error event，或让前端识别 error message 并禁用应用按钮。若本轮只要求“AI 未配置”，则现状可接受；若要求所有 stream 错误都结构化，则需要追加协议设计。

### 7.2 知识库 AI 未配置不能标记 completed

位置：

- `apps/api/src/services/knowledge.service.ts`
- `apps/api/src/routes/knowledge.ts`

验收：

未配置 AI 时调用 analyze：

```bash
curl -s -X POST http://127.0.0.1:3000/api/projects/:projectId/knowledge/sources/:sourceId/analyze \
  -H 'Content-Type: application/json' \
  -d '{"content":"第一章 测试\n这里是一段测试文本。"}'
```

预期：

1. 返回 `success:false`。
2. source 状态为 `failed`。
3. 不写入占位摘要。

### 7.3 知识库搜索 summary/techniques

位置：

- `apps/api/src/services/knowledge.service.ts`

验收：

1. 准备一条 `summary` 或 `techniques` 中包含特定关键词的 chunk。
2. 搜索关键词。
3. 能返回该 chunk。

注意：中文 curl 查询需要 URL encode，否则 Hono/Node 可能返回 400。

### 7.4 章节 patch 重复序号

位置：

- `apps/api/src/routes/chapters.ts`

验收：

尝试把同一卷中的 B 章节 patch 成 A 章节的 `chapterNumber`：

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/projects/:projectId/chapters/:chapterBId \
  -H 'Content-Type: application/json' \
  -d '{"volumeId":":volumeId","chapterNumber":1}'
```

预期：

```json
{"success":false,"error":"第 1 章已存在，请使用不同的章节序号"}
```

---

## 8. 最终验收命令

必须运行：

```bash
pnpm check
pnpm db:migrate
```

如果本地迁移状态曾经半应用，必须额外说明：

```text
是否使用干净数据库验证：是 / 否
是否修复本地 drizzle migration 记录：是 / 否
```

接口 smoke：

```bash
curl -s http://127.0.0.1:3000/api/health
curl -s http://127.0.0.1:3000/api/persona/training-sets
curl -s http://127.0.0.1:3000/api/personas
curl -s http://127.0.0.1:3000/api/settings/ai
```

浏览器验收：

1. `/persona` 可打开。
2. 可创建训练集。
3. 可上传作品并拆章。
4. 点击详情不会进入错误路由。
5. 未配置 AI 时分析章节显示失败，不显示完成。
6. 有作品报告后才能生成人格。
7. 项目启用人格后，AI 生成请求实际注入人格规则。

---

## 9. 不要做的事

1. 不要为了通过迁移直接删除 migration 文件。
2. 不要把 persona 表合并进 0000，除非明确重置所有开发库。
3. 不要在 AI 失败时写入占位成功数据。
4. 不要让人格 prompt 直接包含参考作品原文。
5. 不要让 AI 输出绕过确认区直接写正文。
6. 不要把未发布人格用于项目生成。

---

## 10. 完成标准

只有同时满足以下条件，才算本轮修复完成：

1. `pnpm check` 通过。
2. `pnpm db:migrate` 通过。
3. AI 未配置返回结构化 400。
4. 知识库分析失败不会显示 completed。
5. 知识库搜索能检索 summary/techniques。
6. 章节 patch 不能制造同卷重复序号。
7. `/persona` 训练集 -> 作品 -> 章节分析 -> 作品报告 -> 人格生成 能形成闭环。
8. 项目人格配置会实际影响 AI 写作生成。
