# 长篇小说一致性守卫开发文档

日期：2026-05-02  
状态：待执行  
范围：全文主题一致性、前后文连贯性、人物不偏离、故事设定不漂移、生成后审查。  
目标：建立一套贯穿“生成前上下文组装 -> AI 生成 -> 生成后审查 -> 用户确认 -> 记忆更新”的长篇写作约束系统，避免小说写到中后期后主题跑偏、人物崩坏、设定冲突、前后文断裂。

---

## 1. 背景

当前项目已经具备：

1. 项目设定、故事设定集、角色、人物关系、冲突矩阵、章节大纲。
2. 统一 AI 上下文服务 `apps/api/src/services/ai-context.service.ts`。
3. AI 生成结果确认区。
4. 知识库和写作人格能力。

但要支撑完整长篇写作，还需要补齐两个能力：

1. **生成前约束更明确**：AI 必须知道主题、主线、人物动机、前后文、未解决冲突、未回收伏笔。
2. **生成后自动审查**：AI 生成内容不能只靠作者肉眼判断，需要自动检查是否偏离主题、人物、设定和前后文。

---

## 2. 核心原则

### 2.1 AI 不是自由写作，而是受控写作

每次 AI 生成都必须在以下约束内完成：

1. 项目铁律。
2. 故事设定。
3. 当前章节轨道。
4. 人物档案。
5. 前后章节摘要。
6. 未解决冲突。
7. 未回收伏笔。
8. 写作人格和风格边界。

### 2.2 生成内容先审查，再进入正文

AI 输出不得直接覆盖正文或设定。标准流程：

```text
AI 生成
  ↓
一致性审查
  ↓
风险报告
  ↓
用户确认
  ↓
插入 / 替换 / 保存为备选 / 丢弃
```

### 2.3 每章完成后必须更新小说记忆

长篇不跑偏的关键不是一次 prompt 很长，而是每章结束后更新结构化记忆：

1. 本章摘要。
2. 新增事实。
3. 人物状态变化。
4. 关系变化。
5. 冲突推进。
6. 新增伏笔。
7. 已回收伏笔。
8. 主题表达进度。

---

## 3. 产品能力拆分

### 3.1 项目级铁律

新增或强化项目配置中的“作品铁律”区块。

建议字段：

```ts
interface ProjectCanonRules {
  coreTheme: string
  mainPromise: string
  protagonistLongTermGoal: string
  worldRules: string[]
  styleBoundaries: string[]
  forbiddenMoves: string[]
  mustPreserveFacts: string[]
}
```

说明：

1. `coreTheme`：这本书真正讨论的问题。
2. `mainPromise`：读者期待的核心爽点或情绪承诺。
3. `protagonistLongTermGoal`：主角长期目标。
4. `worldRules`：世界运行规则和代价。
5. `styleBoundaries`：文风、节奏、叙事口吻边界。
6. `forbiddenMoves`：禁止突然开挂、禁止强行洗白、禁止无铺垫反转等。
7. `mustPreserveFacts`：绝对不能改写的事实。

存储建议：

1. 初期可以放在 `novel_projects.styleProfile` 或新增 JSON/text 字段。
2. 如果要结构化管理，新增 `project_canon_rules` 表。

---

### 3.2 章节级写作轨道

当前章节已有：

1. `goals`
2. `conflicts`
3. `events`
4. `emotionalArc`
5. `foreshadowing`
6. `endingHook`

建议补充：

```ts
interface ChapterWritingTrack {
  chapterGoal: string
  requiredEvents: string[]
  emotionalBeat: string
  povCharacterId?: string
  mustIncludeFacts: string[]
  mustNotChangeFacts: string[]
  expectedEndingState: string
}
```

使用规则：

1. AI 写正文时必须围绕 `chapterGoal`。
2. `requiredEvents` 是本章必须发生的事件。
3. `mustNotChangeFacts` 是本章不能擅自改写的事实。
4. `expectedEndingState` 用于检查结尾是否到达预期状态。

---

### 3.3 人物一致性档案

角色已有字段：

1. `goal`
2. `fear`
3. `secret`
4. `desire`
5. `weakness`
6. `personality`
7. `arc`

建议增加“当前状态”记忆：

```ts
interface CharacterRuntimeState {
  characterId: string
  currentLocation?: string
  currentKnowledge: string[]
  currentEmotion?: string
  currentGoal?: string
  relationshipChanges: string[]
  unresolvedInternalConflict?: string
  lastAppearanceChapterId?: string
}
```

用途：

1. 防止角色突然知道不该知道的信息。
2. 防止角色情绪无铺垫跳变。
3. 防止关系状态突然改变。
4. 防止角色行为违背目标、恐惧、秘密、弱点。

---

### 3.4 前后文连续性记忆

每次生成正文时，AI 上下文至少应包含：

1. 当前卷摘要。
2. 上一章摘要。
3. 当前章大纲。
4. 下一章预期。
5. 最近 3-5 个关键事件。
6. 未解决冲突。
7. 未回收伏笔。
8. 登场人物当前状态。

建议新增服务：

```text
apps/api/src/services/novel-memory.service.ts
```

核心函数：

```ts
export async function buildContinuityMemory(input: {
  projectId: string
  chapterId: string
}): Promise<ContinuityMemory>
```

建议类型：

```ts
interface ContinuityMemory {
  volumeSummary?: string
  previousChapterSummary?: string
  nextChapterPlan?: string
  recentEvents: string[]
  unresolvedConflicts: string[]
  openForeshadowing: string[]
  characterStates: CharacterRuntimeState[]
}
```

---

## 4. 一致性守卫

### 4.1 新增后端服务

新增：

```text
apps/api/src/services/consistency-guard.service.ts
```

核心函数：

```ts
export async function runConsistencyGuard(input: {
  projectId: string
  chapterId?: string
  scene: 'outline' | 'draft' | 'polish' | 'quality'
  generatedText: string
  sourceInstruction?: string
}): Promise<ConsistencyGuardReport>
```

### 4.2 审查维度

```ts
interface ConsistencyGuardReport {
  overallStatus: 'pass' | 'warning' | 'blocked'
  score: number
  themeAlignment: GuardDimensionResult
  plotContinuity: GuardDimensionResult
  characterConsistency: GuardDimensionResult
  worldRuleConsistency: GuardDimensionResult
  foreshadowingConsistency: GuardDimensionResult
  styleConsistency: GuardDimensionResult
  risks: ConsistencyRisk[]
  suggestedFixes: string[]
}

interface GuardDimensionResult {
  status: 'pass' | 'warning' | 'blocked'
  score: number
  reason: string
}

interface ConsistencyRisk {
  severity: 'low' | 'medium' | 'high'
  type:
    | 'theme_drift'
    | 'plot_gap'
    | 'character_ooc'
    | 'world_rule_break'
    | 'foreshadowing_break'
    | 'style_drift'
    | 'new_unapproved_fact'
  message: string
  evidence?: string
}
```

### 4.3 审查提示词要求

一致性守卫的 AI prompt 必须包含：

1. 项目铁律。
2. 故事设定。
3. 当前章节轨道。
4. 人物档案和当前状态。
5. 前后文摘要。
6. 未解决冲突。
7. 未回收伏笔。
8. 生成文本。

输出必须是 JSON，禁止自由文本：

```json
{
  "overallStatus": "pass",
  "score": 88,
  "themeAlignment": {
    "status": "pass",
    "score": 90,
    "reason": "生成内容围绕身份选择的代价推进。"
  },
  "risks": [],
  "suggestedFixes": []
}
```

---

## 5. API 设计

### 5.1 运行一致性检查

```http
POST /api/projects/:projectId/consistency/check
```

请求：

```ts
interface RunConsistencyCheckInput {
  chapterId?: string
  scene: 'outline' | 'draft' | 'polish' | 'quality'
  generatedText: string
  sourceInstruction?: string
}
```

响应：

```ts
ApiResponse<ConsistencyGuardReport>
```

### 5.2 保存章节记忆

```http
POST /api/projects/:projectId/chapters/:chapterId/memory/update
```

请求：

```ts
interface UpdateChapterMemoryInput {
  finalContent: string
}
```

响应：

```ts
ApiResponse<ChapterMemoryUpdateResult>
```

---

## 6. 前端交互

### 6.1 AI 结果确认区增加一致性报告

AI 结果确认区需要显示：

1. 一致性状态：通过 / 需注意 / 阻断。
2. 综合分。
3. 风险列表。
4. 建议修改。
5. 操作按钮：插入、替换、保存为备选、丢弃、根据建议重写。

交互规则：

1. `pass`：允许插入和替换。
2. `warning`：允许插入，但需要展示风险。
3. `blocked`：默认禁用替换正文，只允许保存为备选或根据建议重写。

### 6.2 写作页保存后更新记忆

当用户确认某段 AI 结果进入正文，并保存章节后：

1. 后端生成章节摘要。
2. 更新人物状态。
3. 更新冲突推进。
4. 更新伏笔状态。
5. 保存版本历史。

---

## 7. 数据模型建议

### 7.1 章节记忆表

```ts
chapter_memories {
  id: text primary key
  project_id: text not null
  chapter_id: text not null
  summary: text
  key_events: text
  new_facts: text
  character_state_changes: text
  conflict_progress: text
  foreshadowing_added: text
  foreshadowing_resolved: text
  theme_progress: text
  created_at: text
  updated_at: text
}
```

### 7.2 人物运行状态表

```ts
character_runtime_states {
  id: text primary key
  project_id: text not null
  character_id: text not null
  current_location: text
  current_knowledge: text
  current_emotion: text
  current_goal: text
  relationship_changes: text
  unresolved_internal_conflict: text
  last_appearance_chapter_id: text
  updated_at: text
}
```

### 7.3 一致性检查报告表

```ts
consistency_reports {
  id: text primary key
  project_id: text not null
  chapter_id: text
  scene: text not null
  generated_text_hash: text
  overall_status: text not null
  score: integer not null
  report_json: text not null
  created_at: text
}
```

---

## 8. 开发顺序

### 阶段 1：只做无迁移版本

目标：先把一致性检查跑通。

1. 新增 shared 类型。
2. 新增 `consistency-guard.service.ts`。
3. 新增 `/consistency/check` API。
4. 前端 AI 确认区接入一致性报告。
5. 不新增数据库表，报告只在前端临时展示。

验收：

```bash
pnpm check
```

手工验证：

1. AI 生成一段明显违背人物动机的内容。
2. 一致性守卫能给出 `warning` 或 `blocked`。
3. `blocked` 状态不能直接替换正文。

### 阶段 2：章节记忆持久化

目标：每章完成后能更新小说记忆。

1. 新增 `chapter_memories` 表和迁移。
2. 新增 `novel-memory.service.ts`。
3. 写作页保存章节后触发记忆更新。
4. `ai-context.service.ts` 读取章节记忆参与上下文。

验收：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

### 阶段 3：人物运行状态

目标：防止人物知识、情绪、目标和关系状态跳变。

1. 新增 `character_runtime_states` 表。
2. 章节记忆更新时同步人物状态。
3. 一致性守卫检查人物状态冲突。
4. 角色页展示当前状态历史。

### 阶段 4：一致性报告持久化

目标：让每次 AI 生成的风险可追踪。

1. 新增 `consistency_reports` 表。
2. AI 确认区保存报告。
3. 质量评估页增加一致性历史。
4. 项目首页展示“最近偏航风险”。

---

## 9. 验证标准

### 9.1 自动验证

必须通过：

```bash
pnpm check
```

如果涉及数据库：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

### 9.2 手工验证

准备一个测试项目：

1. 主题明确。
2. 世界规则明确。
3. 至少 3 个角色。
4. 每个角色有目标、恐惧、秘密、弱点。
5. 至少 3 章。
6. 至少 2 个未解决冲突。
7. 至少 2 个伏笔。

测试场景：

1. 让 AI 写一段违背角色恐惧的内容。
2. 让 AI 写一段突然解决主冲突的内容。
3. 让 AI 写一段引入无来源新设定的内容。
4. 让 AI 写一段和上一章情绪断裂的内容。

预期：

1. 一致性守卫能识别风险。
2. 风险描述具体，不是泛泛而谈。
3. `blocked` 状态不能直接覆盖正文。
4. 用户可以根据建议重写。

---

## 10. 禁止事项

1. 不要让一致性检查变成普通聊天。
2. 不要让 AI 结果直接覆盖用户正文。
3. 不要在前端拼完整上下文。
4. 不要把参考小说原文塞进生成 prompt。
5. 不要只检查文风，不检查人物和剧情。
6. 不要新增数据库字段却不生成迁移。

---

## 11. 完成标准

完成后应满足：

1. AI 生成前能获得完整写作轨道和前后文记忆。
2. AI 生成后能自动输出一致性报告。
3. 偏离主题、人物崩坏、设定冲突、前后文断裂能被标记。
4. 高风险内容不能直接替换正文。
5. 每章完成后能更新小说记忆。
6. 后续章节生成能读取这些记忆，形成长篇连续性。
