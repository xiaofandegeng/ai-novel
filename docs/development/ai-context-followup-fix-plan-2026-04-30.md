# AI 上下文工程后续修复文档

日期：2026-04-30  
状态：待执行  
范围：AI 上下文构建、统一生成接口、人格注入、提示词渲染。  
目标：修复当前 AI 上下文链路中“查询字段错误、项目边界泄漏、上下文未真正传入、人格名称误当模型名”的问题，确保每次 AI 请求都能拿到完整、正确、可控的小说上下文。

---

## 1. 背景

当前项目已经新增了统一 AI 上下文能力：

1. `packages/shared/src/types/ai-context.ts` 定义了 AI 场景和上下文结构。
2. `apps/api/src/services/ai-context.service.ts` 负责构建和渲染上下文。
3. `apps/api/src/routes/ai.ts` 提供 `/api/projects/:projectId/ai/generate`。
4. 前端大纲、故事设定、角色分析等入口已开始调用 `generateAIStream`。

但代码审查发现上下文链路仍存在关键缺陷：部分数据查错字段，章节查询缺少项目归属校验，已收集的数据没有渲染进 prompt，启用写作人格后还可能把人格名称误传为模型名。

这些问题会导致 AI 功能表面可用，但实际无法稳定遵循故事设定、人物关系、矛盾矩阵、知识库技巧和写作人格。

---

## 2. 必修问题

### 2.1 修复故事设定和角色查询字段

文件：

```text
apps/api/src/services/ai-context.service.ts
```

当前问题：

```ts
const [bible] = await db.select().from(storyBibles).where(eq(storyBibles.id, projectId))
const allCharacters = await db.select().from(characters).where(eq(characters.id, projectId))
```

这里把 `projectId` 当成了 `story_bibles.id` 和 `characters.id`。正常数据下故事设定和角色列表都查不到。

修改要求：

```ts
const [bible] = await db
  .select()
  .from(storyBibles)
  .where(eq(storyBibles.projectId, projectId))

const allCharacters = await db
  .select()
  .from(characters)
  .where(eq(characters.projectId, projectId))
```

验收标准：

1. 大纲生成、正文写作、质量评估的 prompt 中能看到故事设定。
2. prompt 中能看到当前项目的角色名称、身份、目标、恐惧、秘密、欲望等字段。
3. 不再出现用 `id` 匹配 `projectId` 的上下文查询。

---

### 2.2 修复章节和分卷查询的项目归属校验

文件：

```text
apps/api/src/services/ai-context.service.ts
```

当前问题：

```ts
const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId))
```

只按 `chapterId` 查询，没有同时限制 `projectId`。如果前端或恶意请求传入其他项目的章节 ID，就会把其他项目的章节大纲和草稿拼进当前项目 AI 上下文。

修改要求：

```ts
const [chapter] = await db
  .select()
  .from(chapters)
  .where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))
```

分卷查询也要限制项目归属：

```ts
const [volume] = await db
  .select()
  .from(volumes)
  .where(and(eq(volumes.id, chapter.volumeId), eq(volumes.projectId, projectId)))
```

验收标准：

1. 当前章节只能来自当前项目。
2. 所属分卷只能来自当前项目。
3. 如果传入其他项目的 `chapterId`，上下文中不得包含该章节内容。

---

### 2.3 把关系、冲突、前后章节、知识库片段真正渲染进 prompt

文件：

```text
apps/api/src/services/ai-context.service.ts
```

当前问题：

`buildProjectAIContext` 已经收集了：

1. `nearbyChapters`
2. `relationships`
3. `conflicts`
4. `knowledgeSnippets`

但 `renderAIContext` 只输出：

1. 本次任务
2. 作品档案
3. 故事设定
4. 当前章节
5. 登场人物
6. 写作人格
7. 输出约束

导致关键上下文没有真正进入 AI 请求。

修改要求：

在 `renderAIContext` 中补充以下区块。

前后章节：

```ts
if (context.nearbyChapters?.previous || context.nearbyChapters?.next) {
  sections.push(`【前后章节】
上一章: ${context.nearbyChapters.previous ? `${context.nearbyChapters.previous.chapterNumber}. ${context.nearbyChapters.previous.title} - ${context.nearbyChapters.previous.summary || '无摘要'}` : '无'}
下一章: ${context.nearbyChapters.next ? `${context.nearbyChapters.next.chapterNumber}. ${context.nearbyChapters.next.title} - ${context.nearbyChapters.next.summary || '无摘要'}` : '无'}`)
}
```

人物关系：

```ts
if (context.relationships.length > 0) {
  const relList = context.relationships
    .map(r => `- ${r.characterAName} 与 ${r.characterBName}: ${r.type} / 强度 ${r.strength} / ${r.status || '未定义'}。${r.description || ''}`)
    .join('\n')
  sections.push(`【人物关系】\n${relList}`)
}
```

核心矛盾：

```ts
if (context.conflicts.length > 0) {
  const conflictList = context.conflicts
    .map(c => `- ${c.title}: ${c.type} / 强度 ${c.intensity} / 状态 ${c.status}。参与者: ${c.participants || '未定义'}。${c.description || ''}`)
    .join('\n')
  sections.push(`【核心矛盾】\n${conflictList}`)
}
```

知识库片段：

```ts
if (context.knowledgeSnippets.length > 0) {
  const knowledgeList = context.knowledgeSnippets
    .map(k => `- ${k.title}\n  摘要: ${k.summary}\n  技巧: ${k.techniques || '无'}`)
    .join('\n')
  sections.push(`【参考技巧库】\n${knowledgeList}\n\n注意：只能借鉴抽象技巧和结构经验，不得复刻参考作品桥段、专名或连续表达。`)
}
```

验收标准：

1. 调用统一 AI 生成接口时，最终 prompt 中包含人物关系。
2. prompt 中包含未解决或推进中的矛盾。
3. 有知识库命中时，prompt 中包含摘要和技巧，而不是大段原文。
4. 有当前章节时，prompt 中包含上一章和下一章摘要。

---

### 2.4 修复写作人格名称误当模型名

文件：

```text
apps/api/src/routes/ai.ts
```

当前问题：

```ts
for await (const chunk of streamChat(messages, {
  model: context.persona?.name,
})) {
  await stream.write(chunk)
}
```

`context.persona.name` 是写作人格名称，不是 AI 模型 ID。启用人格后，可能请求一个不存在的模型，导致生成失败。

修改要求：

1. 不要把人格名称传给 `model`。
2. 让 `streamChat` 使用当前 AI 设置里的默认模型。
3. 如后续需要支持前端选择模型，应在 `GenerateAIOptions` / `AIContextRequest` 中增加 `model?: string`，并校验该模型来自可用模型列表。

建议改为：

```ts
for await (const chunk of streamChat(messages)) {
  await stream.write(chunk)
}
```

或显式传入请求中的合法模型：

```ts
for await (const chunk of streamChat(messages, { model })) {
  await stream.write(chunk)
}
```

验收标准：

1. 项目启用写作人格后，AI 生成不会因为人格名称而报模型不存在。
2. 人格内容只出现在 prompt 的人格区块中。
3. 模型选择和人格选择是两个独立概念。

---

## 3. 建议顺手修复

### 3.1 前后章节应限制同一分卷

当前前后章节只按 `projectId + chapterNumber` 查询。如果多个分卷都有第 1、2、3 章，可能取到其他分卷的章节。

建议：

1. 如果当前章节有 `volumeId`，前后章节查询应增加 `eq(chapters.volumeId, currentChapterData.volumeId)`。
2. 如果没有 `volumeId`，再退化为项目级章节序号查询。

### 3.2 知识库检索应覆盖 AI 总结和技巧字段

当前知识库检索只查 `knowledgeChunks.content`。应同时查：

1. `title`
2. `summary`
3. `techniques`
4. `content`

建议：

```ts
where(and(
  eq(knowledgeChunks.projectId, projectId),
  or(
    sql`${knowledgeChunks.title} ILIKE ${keyword}`,
    sql`${knowledgeChunks.summary} ILIKE ${keyword}`,
    sql`${knowledgeChunks.techniques} ILIKE ${keyword}`,
    sql`${knowledgeChunks.content} ILIKE ${keyword}`,
  ),
))
```

注意：

1. 需要从 `drizzle-orm` 导入 `or`。
2. `keyword` 不建议直接使用整段 `userInstruction`，可先用章节标题、项目主题、当前冲突关键词做短查询。

### 3.3 草稿片段截取策略按场景区分

当前：

```ts
draftExcerpt: selectedText || currentChapterData.draft?.substring(0, 2000)
```

建议：

1. `polish`：优先使用 `selectedText`。
2. `draft`：使用草稿末尾 2000-4000 字，方便续写。
3. `quality`：可以保留更完整章节正文，但要控制 token 预算。
4. `outline`：只需要章节大纲字段，不必塞大段正文。

---

## 4. 推荐实施顺序

1. 修复 `storyBibles.projectId` 和 `characters.projectId` 查询。
2. 修复 `chapterId + projectId`、`volumeId + projectId` 归属校验。
3. 修复 `routes/ai.ts` 中人格名称误当模型名的问题。
4. 补齐 `renderAIContext` 中关系、冲突、前后章节、知识库片段的渲染。
5. 顺手优化前后章节同卷查询和知识库检索字段。
6. 运行门禁和最小人工测试。

---

## 5. 验证命令

运行完整门禁：

```bash
pnpm check
```

如果修改了数据库字段或迁移，额外运行：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

本轮理论上不需要新增迁移。

---

## 6. 手工验收流程

准备一个项目，至少包含：

1. 项目简介、类型、主题。
2. 故事设定集：世界观、主冲突、规则、时间线。
3. 3 个角色：目标、恐惧、秘密、欲望、性格。
4. 至少 2 条人物关系。
5. 至少 2 条未解决矛盾。
6. 至少 1 个知识库来源，且包含摘要和技巧。
7. 至少 3 章，当前章节有上一章和下一章。
8. 可选：绑定已发布写作人格。

验收路径：

1. 在大纲页点击“AI 灵感风暴”。
2. 在写作页使用 AI 续写或润色。
3. 在质量评估页运行章节评估。
4. 如果启用人格，确认生成不报模型不存在。
5. 检查 AI 输出是否明显引用了故事设定、人物动机、关系、矛盾和章节方向。

---

## 7. 禁止事项

1. 不要在前端重新拼完整故事背景。
2. 不要把写作人格名称当成模型名称。
3. 不要只按资源 id 查询项目内资源，必须校验 `projectId`。
4. 不要把知识库原文大段塞入生成 prompt。
5. 不要让 AI 结果直接覆盖用户正文或设定。
6. 不要为了修复上下文问题改动无关 UI 或数据库结构。

---

## 8. 完成标准

完成后必须满足：

1. `pnpm check` 通过。
2. `apps/api/src/services/ai-context.service.ts` 不再用 `storyBibles.id` 或 `characters.id` 匹配 `projectId`。
3. 当前章节查询同时约束 `chapterId` 和 `projectId`。
4. `renderAIContext` 输出人物关系、核心矛盾、前后章节、知识库技巧。
5. `/api/projects/:projectId/ai/generate` 不再把人格名称传给 `model`。
6. 手工测试中，AI 输出能体现项目设定和写作方向，而不是泛泛生成。
