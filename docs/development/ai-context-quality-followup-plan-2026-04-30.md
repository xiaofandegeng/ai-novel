# AI 上下文生成质量后续修复文档

日期：2026-04-30  
状态：待执行  
范围：AI prompt 渲染、角色约束、章节大纲约束、知识库召回。  
目标：在统一 AI 上下文链路已经可用的基础上，继续补齐影响生成质量的关键字段，让 AI 更稳定地遵循人物动机、章节方向和知识库技巧。

---

## 1. 背景

当前已完成的上下文修复包括：

1. 故事设定和角色查询已按 `projectId` 获取。
2. 当前章节和分卷查询已校验项目归属。
3. 人物关系、核心矛盾、前后章节、知识库片段已进入 prompt。
4. 写作人格名称不再被误当成模型名。

`pnpm check` 已通过。

但代码审查发现，仍有 3 个会影响 AI 生成质量的问题：

1. 角色深层动机字段已经查询，但没有渲染进 prompt。
2. 当前章节的关键大纲字段已经查询，但没有渲染进 prompt。
3. 知识库检索直接使用整段用户指令，命中率偏低。

这些问题不会阻塞构建，但会让 AI 在正文续写、大纲生成、角色分析和质量评估时仍然容易泛泛发挥，不能充分遵循一开始的设定。

---

## 2. 必修问题

### 2.1 将角色动机字段渲染进 prompt

文件：

```text
apps/api/src/services/ai-context.service.ts
```

当前情况：

`buildProjectAIContext` 已经收集了角色字段：

```ts
goal
fear
secret
desire
weakness
personality
arc
```

但 `renderAIContext` 的【登场人物】区块只输出：

```ts
const charList = context.characters.map(c => `- ${c.name} (${c.role || '无身份'}): ${c.personality || '无性格描述'}`).join('\n')
```

这会导致 AI 拿不到人物目标、恐惧、秘密、欲望和成长线，无法稳定判断“角色为什么这么做”。

修改要求：

将【登场人物】区块改为更完整但仍可控的摘要格式：

```ts
if (context.characters.length > 0) {
  const charList = context.characters.map((c) => {
    const details = [
      `身份: ${c.role || '无身份'}`,
      `性格: ${c.personality || '无性格描述'}`,
      c.goal ? `目标: ${c.goal}` : null,
      c.desire ? `欲望: ${c.desire}` : null,
      c.fear ? `恐惧: ${c.fear}` : null,
      c.secret ? `秘密: ${c.secret}` : null,
      c.weakness ? `弱点: ${c.weakness}` : null,
      c.arc ? `成长线: ${c.arc}` : null,
    ].filter(Boolean)

    return `- ${c.name}\n  ${details.join('\n  ')}`
  }).join('\n')

  sections.push(`【登场人物】\n${charList}`)
}
```

验收标准：

1. 生成 prompt 中能看到每个角色的目标、欲望、恐惧、秘密、弱点和成长线。
2. 空字段不输出，避免 prompt 里充满“未定义”。
3. 角色字段只来自当前项目。

---

### 2.2 将当前章节关键大纲字段渲染进 prompt

文件：

```text
apps/api/src/services/ai-context.service.ts
```

当前情况：

`currentChapter` 已经包含：

```ts
goals
conflicts
events
emotionalArc
foreshadowing
endingHook
draftExcerpt
```

但 `renderAIContext` 的【当前章节】区块只输出：

```text
标题
章节目标
核心冲突
草稿片段
```

这会丢掉关键事件、情绪曲线、伏笔和结尾钩子。正文续写和大纲生成时，AI 可能写得通顺，但不一定沿着本章既定方向推进。

修改要求：

将【当前章节】区块改为完整大纲摘要：

```ts
if (context.currentChapter) {
  const chapterLines = [
    `标题: ${context.currentChapter.title}`,
    context.currentChapter.volumeTitle ? `所属分卷: ${context.currentChapter.volumeTitle}` : null,
    `章节目标: ${context.currentChapter.goals || '未定义'}`,
    `核心冲突: ${context.currentChapter.conflicts || '未定义'}`,
    context.currentChapter.events ? `关键事件: ${context.currentChapter.events}` : null,
    context.currentChapter.emotionalArc ? `情绪曲线: ${context.currentChapter.emotionalArc}` : null,
    context.currentChapter.foreshadowing ? `伏笔: ${context.currentChapter.foreshadowing}` : null,
    context.currentChapter.endingHook ? `结尾钩子: ${context.currentChapter.endingHook}` : null,
    context.currentChapter.draftExcerpt ? `草稿片段:\n${context.currentChapter.draftExcerpt}` : '草稿片段: 暂无草稿',
  ].filter(Boolean)

  sections.push(`【当前章节】\n${chapterLines.join('\n')}`)
}
```

验收标准：

1. 大纲页生成时，prompt 包含关键事件、情绪曲线、伏笔、结尾钩子。
2. 写作页续写时，prompt 能同时看到本章方向和草稿片段。
3. 如果是 `outline` 场景，不强制输出大段草稿。

---

### 2.3 优化知识库检索关键词，不再直接使用整段用户指令

文件：

```text
apps/api/src/services/ai-context.service.ts
```

当前情况：

```ts
const keyword = userInstruction || currentChapterData?.title
```

然后用整段 `keyword` 去 `ILIKE` 匹配：

```ts
title
summary
techniques
content
```

如果用户指令是：

```text
基于当前项目主题，为作品设定提供深入构思建议
```

数据库需要匹配完整长句，知识库几乎不会命中。

修改要求：

新增一个轻量关键词构建函数，优先使用结构化字段，而不是整段指令。

建议实现：

```ts
function buildKnowledgeSearchTerms(input: {
  userInstruction?: string
  chapterTitle?: string
  projectTheme?: string
  projectGenre?: string
  currentChapterConflicts?: string
  characterNames: string[]
  conflictTitles: string[]
}) {
  const terms = [
    input.chapterTitle,
    input.projectTheme,
    input.projectGenre,
    input.currentChapterConflicts,
    ...input.characterNames.slice(0, 5),
    ...input.conflictTitles.slice(0, 5),
    ...(input.userInstruction || '')
      .split(/[\s,，。！？、:：；;]+/)
      .filter(term => term.length >= 2 && term.length <= 12)
      .slice(0, 8),
  ]

  return Array.from(new Set(
    terms
      .map(term => term?.trim())
      .filter((term): term is string => Boolean(term)),
  )).slice(0, 12)
}
```

然后按多个短词 OR 查询：

```ts
const terms = buildKnowledgeSearchTerms({
  userInstruction,
  chapterTitle: currentChapterData?.title,
  projectTheme: project.theme || undefined,
  projectGenre: project.genre || undefined,
  currentChapterConflicts: currentChapterData?.conflicts || undefined,
  characterNames: allCharacters.map(c => c.name),
  conflictTitles: conflictSummaries.map(c => c.title),
})

if (terms.length > 0) {
  const predicates = terms.flatMap(term => {
    const pattern = `%${term}%`
    return [
      sql`${knowledgeChunks.title} ILIKE ${pattern}`,
      sql`${knowledgeChunks.summary} ILIKE ${pattern}`,
      sql`${knowledgeChunks.techniques} ILIKE ${pattern}`,
      sql`${knowledgeChunks.content} ILIKE ${pattern}`,
    ]
  })

  const chunks = await db
    .select()
    .from(knowledgeChunks)
    .where(and(
      eq(knowledgeChunks.projectId, projectId),
      or(...predicates),
    ))
    .limit(3)
}
```

注意：

1. 需要处理 `terms.length === 0`，避免 `or()` 空参数。
2. 不要把大段知识库原文渲染进 prompt。
3. `content` 可以参与检索，但渲染时仍优先输出 `summary` 和 `techniques`。

验收标准：

1. 知识库检索不再依赖完整用户指令命中。
2. 项目主题、章节标题、角色名、冲突名能帮助召回相关知识片段。
3. prompt 中仍只展示摘要和技巧，不展示大段参考原文。

---

## 3. 推荐实施顺序

1. 先修改【登场人物】渲染，补齐角色动机字段。
2. 再修改【当前章节】渲染，补齐关键事件、情绪曲线、伏笔、结尾钩子。
3. 最后优化知识库关键词构建和 OR 查询。
4. 运行 `pnpm check`。
5. 用一个测试项目手工触发大纲生成、正文续写和故事设定构思，观察 AI 输出是否明显更贴合人物与章节方向。

---

## 4. 验证命令

运行完整门禁：

```bash
pnpm check
```

本轮不涉及数据库结构，理论上不需要运行迁移。

如修改了 shared 类型，必须确保：

```bash
pnpm typecheck
```

通过。

---

## 5. 手工验收流程

准备一个测试项目：

1. 至少 3 个角色，每个角色填写目标、欲望、恐惧、秘密、弱点、成长线。
2. 当前章节填写章节目标、核心冲突、关键事件、情绪曲线、伏笔、结尾钩子。
3. 知识库中上传并分析至少 1 篇参考小说，确保生成了摘要和技巧。
4. 添加至少 2 条未解决矛盾。

验收步骤：

1. 在大纲页点击 AI 灵感风暴。
2. 在写作页请求 AI 续写。
3. 在故事设定页请求 AI 构思。
4. 检查输出是否：
   - 提到了角色目标或秘密。
   - 沿着当前章节关键事件推进。
   - 没有违背角色恐惧、弱点和成长线。
   - 有参考知识库中的抽象技巧，但没有复刻原文桥段。

---

## 6. 禁止事项

1. 不要为了提高命中率把整篇参考小说原文塞进 prompt。
2. 不要在前端拼接完整上下文。
3. 不要让 AI 结果直接覆盖正文或设定。
4. 不要扩大本轮范围去改 UI、迁移或人格训练流程。
5. 不要引入 `any` 绕过 shared 类型。

---

## 7. 完成标准

完成后必须满足：

1. `pnpm check` 通过。
2. `renderAIContext` 的【登场人物】区块包含角色目标、欲望、恐惧、秘密、弱点、成长线。
3. `renderAIContext` 的【当前章节】区块包含关键事件、情绪曲线、伏笔、结尾钩子。
4. 知识库检索使用多个短关键词 OR 查询，而不是完整用户指令。
5. prompt 中知识库区块只输出摘要和技巧。
6. 手工生成结果能明显体现人物动机和章节方向。
