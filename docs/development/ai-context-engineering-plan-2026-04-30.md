# AI 上下文工程化改造文档

日期：2026-04-30  
范围：所有 AI 生成、分析、评估、拆书、写作人格相关功能。  
目标：让每次 AI 请求都能完整理解故事背景、当前章节状态、人物关系、冲突矛盾、写作方向和项目写作人格，避免 AI 生成内容偏离设定或只基于零散上下文发挥。

---

## 1. 当前问题

当前项目已经支持：

1. `/api/ai/chat` 接收 `projectId/context/scene`。
2. 后端会按 `projectId + scene` 注入写作人格 prompt。
3. 写作页、大纲页、故事设定页、质量评估、知识库、写作人格训练都有各自 AI 调用。

但上下文传递仍不完整：

1. 前端页面自行拼接 `context` 字符串，内容不统一。
2. 写作页当前只传世界观和章节目标，缺少项目简介、人物关系、冲突、前后章节、草稿、知识库等。
3. 大纲页只传项目名、主题、当前章节和登场人物名称，缺少卷目标、已有章节顺序、人物动机、冲突矩阵、伏笔。
4. 质量评估只评当前正文，缺少章节大纲和故事设定对照。
5. 知识库和写作人格训练已有独立 prompt，但未和项目上下文统一。
6. AI 请求没有统一的上下文预算、优先级和安全边界。

结果：

1. AI 容易跑偏。
2. 同一功能在不同页面生成风格不一致。
3. 项目设定、人物关系、冲突矩阵没有充分参与生成。
4. 后续新增 AI 功能容易继续复制零散 prompt。

---

## 2. 改造原则

### 2.1 前端只传意图，不拼完整背景

前端请求只传：

```ts
{
  projectId: string
  scene: AIScene
  chapterId?: string
  selectedText?: string
  userInstruction?: string
  extra?: Record<string, unknown>
}
```

禁止在前端大段拼故事背景。

### 2.2 后端统一组装上下文

新增：

```text
apps/api/src/services/ai-context.service.ts
```

职责：

1. 根据 `projectId` 查询项目档案。
2. 根据 `chapterId` 查询当前章节、所属卷、前后章节。
3. 查询故事设定集。
4. 查询人物、人物关系、冲突矩阵。
5. 查询项目写作人格配置。
6. 查询相关知识库片段。
7. 根据 scene 控制上下文字段和优先级。
8. 输出结构化上下文和最终 prompt 片段。

### 2.3 AI 输出必须可确认

生成正文、大纲、设定、人物、冲突等内容时：

1. AI 结果先进入确认区。
2. 用户选择插入、替换、保存为备选或丢弃。
3. AI 不直接覆盖用户正文或设定。

### 2.4 知识库只提供抽象技巧

知识库引用参考小说时：

1. 只召回摘要、技巧、结构建议。
2. 不把大段原文塞进生成 prompt。
3. 不要求 AI 模仿具体桥段、专名、连续表达。
4. 必须包含相似度和版权风险约束。

---

## 3. 标准 AI 场景

统一定义：

```ts
export type AIScene =
  | 'outline'
  | 'draft'
  | 'polish'
  | 'quality'
  | 'story_bible'
  | 'knowledge'
  | 'persona_training'
  | 'persona_drift'
  | 'chat'
```

场景含义：

```text
outline           大纲生成、章节构思、事件拆解
draft             正文续写、扩写、生成片段
polish            润色、精简、语言调整
quality           质量评估
story_bible       世界观、规则、设定构思
knowledge         经典小说拆书、技巧总结
persona_training  写作人格训练
persona_drift     人格一致性和偏航检测
chat              普通自由聊天，默认不注入写作人格
```

---

## 4. 标准上下文结构

新增 shared 类型：

```text
packages/shared/src/types/ai-context.ts
```

建议类型：

```ts
export interface AIContextRequest {
  projectId: string
  scene: AIScene
  chapterId?: string
  selectedText?: string
  userInstruction?: string
  extra?: Record<string, unknown>
}

export interface BuiltAIContext {
  scene: AIScene
  task: string
  project: {
    title: string
    description?: string
    genre?: string
    theme?: string
    targetAudience?: string
    targetWords?: number
    styleProfile?: string
  }
  storyBible?: {
    worldview?: string
    mainConflict?: string
    theme?: string
    rules?: string
    timeline?: string
  }
  currentChapter?: {
    id: string
    title: string
    chapterNumber: number
    volumeTitle?: string
    goals?: string
    conflicts?: string
    events?: string
    emotionalArc?: string
    foreshadowing?: string
    endingHook?: string
    draftExcerpt?: string
  }
  nearbyChapters?: {
    previous?: ChapterContextSummary
    next?: ChapterContextSummary
  }
  characters: CharacterContextSummary[]
  relationships: RelationshipContextSummary[]
  conflicts: ConflictContextSummary[]
  persona?: {
    name: string
    strength: number
    prompt: string
  }
  knowledgeSnippets: KnowledgeContextSnippet[]
  constraints: string[]
}
```

---

## 5. 后端 Context Builder

新增文件：

```text
apps/api/src/services/ai-context.service.ts
```

核心函数：

```ts
export async function buildProjectAIContext(input: AIContextRequest): Promise<BuiltAIContext>
export function renderAIContext(context: BuiltAIContext): string
```

### 5.1 查询项目档案

来源：

```text
novel_projects
story_bibles
```

必须包含：

1. 书名
2. 类型
3. 简介
4. 主题
5. 目标读者
6. 写作风格说明
7. 世界观
8. 主冲突
9. 规则和禁忌
10. 时间线

### 5.2 查询章节上下文

来源：

```text
volumes
chapters
chapter_versions
```

如果传入 `chapterId`：

1. 当前章节完整大纲字段。
2. 当前草稿摘要或截断片段。
3. 上一章标题、摘要、状态。
4. 下一章标题、目标、事件。
5. 当前卷标题和卷摘要。

草稿截断规则：

```text
draft 场景：保留当前草稿后 2000-4000 字。
polish 场景：优先 selectedText，其次保留草稿相关片段。
quality 场景：可传完整章节正文，但超过预算时分段评估。
outline 场景：不传完整正文，只传摘要和章节结构。
```

### 5.3 查询人物和关系

来源：

```text
characters
character_relationships
chapters.characters
```

规则：

1. 当前章节关联人物优先。
2. 没有关联人物时，取主要角色和高强度关系。
3. 每个人物最多传：
   - 姓名
   - 身份
   - 目标
   - 恐惧
   - 秘密
   - 弱点
   - 性格
   - 人物弧光
4. 关系只传和当前人物相关或强度高的关系。

### 5.4 查询冲突矩阵

来源：

```text
conflicts
```

规则：

1. 优先传 `forming/escalating/exploding` 状态的冲突。
2. 当前章节关联人物参与的冲突优先。
3. 已解决冲突只传摘要，不占太多上下文。

### 5.5 查询写作人格

来源：

```text
project_persona_configs
writing_personas
```

规则：

1. `chat` 场景默认不注入写作人格。
2. 根据 scene 检查：
   - `enabledForOutline`
   - `enabledForDraft`
   - `enabledForPolish`
   - `enabledForQualityReview`
3. 根据 strength 控制提示强度。
4. `projectOverrides` 必须追加到人格 prompt。
5. 必须包含相似度防护和禁止复刻规则。

### 5.6 查询知识库

来源：

```text
knowledge_chunks
knowledge_notes
```

短期实现：

1. 根据用户指令、章节标题、主题、冲突关键词做 `like` 搜索。
2. 只返回 `summary` 和 `techniques`。
3. 最多 3-5 条。

长期升级：

1. 引入 embedding 或 PostgreSQL full-text search。
2. 按 scene 使用不同检索策略。

---

## 6. Prompt 模板

### 6.1 通用系统提示

```text
你是 AI 小说创作工作台中的专业写作助手。
你的任务是辅助作者完成长篇小说创作，而不是替作者接管作品。

必须遵守：
1. 不得改变已明确设定的世界观、人物关系、主线目标。
2. 不得让角色做出违背既定动机的行为。
3. 不得复刻参考作品的具体桥段、专名、连续表达。
4. 输出必须服务于当前 scene 的任务。
5. 生成内容只能作为候选结果，由作者确认后才能写入作品。
```

### 6.2 渲染后的上下文模板

```text
【本次任务】
scene:
用户指令:

【作品档案】
书名:
类型:
主题:
简介:
目标读者:
写作风格:

【故事设定】
世界观:
主冲突:
主题:
规则:
时间线:

【当前章节】
卷:
章节:
章节目标:
核心冲突:
关键事件:
情绪基调:
伏笔:
结尾钩子:
当前草稿片段:

【前后章节】
上一章:
下一章:

【登场人物】
- 姓名:
  身份:
  目标:
  恐惧:
  秘密:
  性格:
  人物弧光:

【人物关系】
- A 与 B:
  关系:
  强度:
  状态:
  描述:

【冲突矩阵】
- 标题:
  类型:
  强度:
  状态:
  参与者:
  描述:

【写作人格】
人格名称:
强度:
规则:

【知识库技巧】
只允许参考抽象技巧，不得复刻原文。
- 技巧:
  适用方式:

【输出约束】
- 字数:
- 格式:
- 禁止事项:
- 是否需要 JSON:
```

---

## 7. 各功能上下文要求

### 7.1 大纲生成 `outline`

必须传：

1. 项目主题和简介。
2. 故事设定集。
3. 当前卷目标。
4. 已有章节列表。
5. 当前章节位置。
6. 登场人物。
7. 相关冲突。
8. 写作人格。

输出要求：

```text
章节目标
核心冲突
三到五个关键事件
情绪变化
伏笔安排
结尾钩子
```

### 7.2 正文续写 `draft`

必须传：

1. 当前章节完整大纲。
2. 当前草稿后段。
3. 上一章摘要。
4. 下一章方向。
5. 登场人物口吻和动机。
6. 当前冲突。
7. 写作人格。

输出要求：

```text
只生成候选正文。
不得跳过章节目标。
不得直接总结剧情。
不得覆盖用户草稿。
```

### 7.3 润色/扩写/精简 `polish`

必须传：

1. 选中文本。
2. 所在章节目标。
3. 人物语气。
4. 作品风格。
5. 禁止改变的剧情事实。

输出要求：

```text
保留剧情事实。
只调整语言、节奏、细节密度。
不要新增重大设定。
```

### 7.4 质量评估 `quality`

必须传：

1. 章节正文。
2. 章节大纲。
3. 故事设定。
4. 人物设定。
5. 冲突目标。
6. 写作人格或风格配置。

输出要求：

```json
{
  "score": 82,
  "rhythmScore": 80,
  "conflictScore": 78,
  "logicScore": 85,
  "characterScore": 82,
  "styleScore": 80,
  "issues": [],
  "suggestions": []
}
```

### 7.5 故事设定构思 `story_bible`

必须传：

1. 项目主题。
2. 已有设定。
3. 当前正在编辑的设定字段。
4. 主冲突和人物目标。

输出要求：

```text
提供可选方案，不直接覆盖设定。
必须指出方案对人物、冲突、后续剧情的影响。
```

### 7.6 知识库拆书 `knowledge`

必须传：

1. 参考作品标题。
2. 当前片段标题。
3. 片段内容。

输出要求：

```json
{
  "summary": "摘要",
  "techniques": "技巧",
  "structurePattern": "结构模型",
  "riskNotes": "禁止复刻风险"
}
```

### 7.7 写作人格训练 `persona_training`

必须传：

1. 章节分析结果。
2. 作品风格报告。
3. 训练集目标。

输出要求：

```json
{
  "coreAppeal": "",
  "pacingRules": "",
  "conflictRules": "",
  "characterRules": "",
  "languageRules": "",
  "chapterRules": "",
  "hookRules": "",
  "forbiddenRules": "",
  "similarityGuardrails": ""
}
```

---

## 8. API 改造建议

### 8.1 新增统一 AI 生成接口

```http
POST /api/projects/:projectId/ai/generate
```

请求：

```ts
interface GenerateAIRequest {
  scene: AIScene
  chapterId?: string
  selectedText?: string
  userInstruction?: string
  outputFormat?: 'text' | 'json'
  stream?: boolean
}
```

流程：

```text
route
  -> buildProjectAIContext()
  -> renderAIContext()
  -> buildPersonaPromptForProject()
  -> call model
  -> stream or JSON response
```

### 8.2 逐步替换旧接口

先保留：

```text
/api/ai/chat
```

但新增功能不要继续直接使用它。逐步迁移：

1. `OutlineView.vue` 使用新接口。
2. `WritingView.vue` 使用新接口。
3. `StoryBibleView.vue` 使用新接口。
4. `QualityReviewView.vue` 使用新 context builder。

---

## 9. 上下文预算策略

按优先级裁剪：

```text
P0 用户当前指令、选中文本、当前章节目标
P1 项目简介、故事设定、当前章节大纲
P2 相关人物、关系、冲突
P3 前后章节摘要
P4 写作人格
P5 知识库技巧
P6 历史报告和版本
```

预算建议：

```text
小模型：8k tokens 内
普通模型：16k tokens 内
长上下文模型：32k tokens 内
```

实现要求：

1. 不要无脑传整本书。
2. 草稿只传当前任务相关片段。
3. 知识库只传摘要和技巧。
4. 所有截断都要在 prompt 中说明。

---

## 10. 验收标准

代码验收：

```bash
pnpm check
```

功能验收：

1. 大纲 AI 请求包含项目档案、故事设定、当前章节、人物、冲突、人格。
2. 正文续写请求包含当前章节大纲、草稿片段、前后章节、人物关系、人格。
3. 润色请求包含选中文本和禁止改变的剧情事实。
4. 质量评估请求能对照章节大纲和故事设定。
5. 关闭某个写作人格场景后，该场景不注入人格。
6. 知识库引用只包含摘要和技巧，不包含大段原文。
7. AI 结果仍进入确认区，不直接覆盖用户内容。

---

## 11. 推荐实施顺序

### 阶段 1：类型和服务骨架

1. 新增 `AIScene`、`AIContextRequest`、`BuiltAIContext`。
2. 新增 `ai-context.service.ts`。
3. 实现项目、设定、章节、人物、冲突查询。
4. 实现 `renderAIContext()`。

### 阶段 2：大纲和写作页接入

1. 新增 `/api/projects/:projectId/ai/generate`。
2. 大纲页迁移到新接口。
3. 写作页续写、扩写、润色迁移到新接口。
4. 保持确认区流程不变。

### 阶段 3：质量评估和设定页接入

1. 质量评估使用 context builder。
2. 故事设定构思使用 context builder。
3. 统一输出格式和错误处理。

### 阶段 4：知识库召回

1. 实现基于关键词的知识库检索。
2. 只注入 summary 和 techniques。
3. 增加相似度防护提示。

### 阶段 5：上下文可视化

在 AI 面板增加「本次使用的上下文」抽屉：

```text
项目档案
故事设定
当前章节
人物关系
冲突
写作人格
知识库技巧
```

让作者知道 AI 为什么这样生成。

