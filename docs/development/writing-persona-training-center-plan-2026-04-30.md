# 写作人格训练中心产品与开发设计文档

日期：2026-04-30  
适用范围：AI 小说创作工作台后续功能开发  
定位：通过大量优秀网文训练可复用的“写作人格”，并在项目写作中按可调强度注入人格记忆，保证小说持续精彩、不偏离设定、不复制原文。

---

## 1. 背景与目标

当前系统已经具备项目、设定、人物、关系、冲突、大纲、正文、知识库、质量评估和 AI 配置能力。但现有知识库更接近“资料索引”，还不能把大量优秀网文沉淀成稳定的写作能力。

本阶段目标是新增 **写作人格训练中心**：

```text
上传优秀网文
-> 自动拆章
-> AI 分析章节结构、爽点、节奏、语言特征
-> 聚合成作品风格报告
-> 多作品融合成全局写作人格
-> 小说项目选择人格并设置强度
-> AI 写作时读取人格与项目设定
-> 生成后检测偏航和相似度风险
```

核心原则：

1. 学习结构，不复制文本。
2. 学习节奏，不复刻桥段。
3. 学习人格，不模仿作者。
4. AI 结果仍必须进入确认区，不能直接覆盖正文。
5. 参考作品原文只用于分析和追溯，不直接作为写作 prompt 大段注入。

---

## 2. 产品目标

### 2.1 用户价值

用户上传 5-20 本优秀网文后，系统可以形成多个可复用写作人格，例如：

- 都市高压反杀型
- 玄幻升级打脸型
- 悬疑钩子反转型
- 经营争霸爽文型
- 情绪拉扯恋爱型

后续创建新小说时，用户可以选择一个人格，并设置强度：

```text
人格：都市高压反杀型
强度：65
目标：保持当前小说设定，但增强压迫、反击、打脸和结尾钩子。
```

### 2.2 验收目标

第一版完成后，应满足：

1. 可上传多本网文 `.txt`。
2. 可按章节拆分并保存。
3. 可异步分析章节。
4. 可查看单本作品风格报告。
5. 可基于多本作品生成全局写作人格。
6. 项目可选择人格并设置强度 0-100。
7. 写作页 AI 生成前能注入人格约束。
8. AI 生成后能给出人格一致性和相似度风险提示。

---

## 3. 用户流程

### 3.1 训练人格流程

```text
进入“写作人格库”
-> 新建训练集
-> 上传 5-20 本参考网文
-> 系统拆分章节
-> 启动 AI 拆解任务
-> 查看每本作品风格报告
-> 选择作品融合
-> 生成全局写作人格
-> 用户审核并发布人格
```

### 3.2 项目使用人格流程

```text
进入项目设置
-> 选择写作人格
-> 设置人格强度 0-100
-> 设置启用范围：大纲 / 正文 / 润色 / 质量评估
-> 保存
-> 写作时 AI 自动读取人格
-> 生成结果进入确认区
-> 偏航检测报告展示风险
```

### 3.3 人格强度说明

| 强度 | 效果 |
|---|---|
| 0-30 | 轻参考，只保留当前小说自身风格 |
| 31-60 | 参考节奏、钩子、爽点结构，但不明显改变语言 |
| 61-80 | 明显采用人格的章节节奏和爽点推进方式 |
| 81-100 | 强风格驱动，适合实验，不建议长期默认 |

默认值：`65`。

---

## 4. 信息架构

新增一级模块：

```text
写作人格库
  - 训练集
  - 参考作品
  - 拆解任务
  - 作品风格报告
  - 写作人格档案
  - 项目应用记录
```

项目内新增：

```text
项目设置
  - 写作人格
    - 当前人格
    - 人格强度
    - 启用场景
    - 项目微调

写作页
  - AI 确认区
  - 人格一致性检测
  - 相似度风险提示

质量评估
  - 增加“人格契合度”
  - 增加“爽点强度”
  - 增加“主线推进度”
```

---

## 5. 数据模型设计

### 5.1 ReferenceTrainingSet

用途：一组用于训练人格的参考作品集合。

字段建议：

```ts
interface ReferenceTrainingSet {
  id: string
  name: string
  description?: string
  genre?: string
  targetPersonaType?: string
  status: 'draft' | 'analyzing' | 'ready' | 'failed'
  createdAt: string
  updatedAt: string
}
```

### 5.2 ReferenceWork

用途：用户上传的一本网文或参考作品。

```ts
interface ReferenceWork {
  id: string
  trainingSetId: string
  title: string
  author?: string
  sourceType: 'webnovel' | 'reference' | 'sample'
  fileName?: string
  fileSize?: number
  wordCount?: number
  chapterCount?: number
  status: 'uploaded' | 'splitting' | 'analyzing' | 'completed' | 'failed'
  createdAt: string
  updatedAt: string
}
```

### 5.3 ReferenceChapter

用途：拆分后的参考章节。原文可保存，但写作生成时不得直接大段注入。

```ts
interface ReferenceChapter {
  id: string
  workId: string
  trainingSetId: string
  title: string
  chapterNumber: number
  content: string
  wordCount: number
  createdAt: string
}
```

### 5.4 ChapterAnalysis

用途：每章的结构化拆解结果。

```ts
interface ChapterAnalysis {
  id: string
  chapterId: string
  workId: string
  trainingSetId: string
  openingHook: string
  conflictType: string
  pressureSource: string
  protagonistAction: string
  payoffType: string
  cliffhanger: string
  emotionCurve: string
  pacingScore: number
  dialogueRatio: number
  descriptionRatio: number
  narrativePattern: string
  tropeTags: string
  craftNotes: string
  riskNotes?: string
  createdAt: string
}
```

### 5.5 WorkStyleReport

用途：单本作品聚合报告。

```ts
interface WorkStyleReport {
  id: string
  workId: string
  trainingSetId: string
  summary: string
  coreAppeal: string
  pacingModel: string
  hookModel: string
  conflictModel: string
  characterModel: string
  languageProfile: string
  chapterTemplate: string
  strengths: string
  weaknesses: string
  avoidCopying: string
  createdAt: string
}
```

### 5.6 WritingPersona

用途：全局可复用写作人格。

```ts
interface WritingPersona {
  id: string
  name: string
  description?: string
  genre?: string
  sourceTrainingSetId?: string
  status: 'draft' | 'published' | 'archived'
  coreAppeal: string
  pacingRules: string
  conflictRules: string
  characterRules: string
  languageRules: string
  chapterRules: string
  hookRules: string
  forbiddenRules: string
  similarityGuardrails: string
  createdAt: string
  updatedAt: string
}
```

### 5.7 ProjectPersonaConfig

用途：某个小说项目对全局人格的启用和微调。

```ts
interface ProjectPersonaConfig {
  id: string
  projectId: string
  personaId: string
  strength: number // 0-100
  enabledForOutline: boolean
  enabledForDraft: boolean
  enabledForPolish: boolean
  enabledForQualityReview: boolean
  projectOverrides?: string
  disabledRules?: string
  createdAt: string
  updatedAt: string
}
```

---

## 6. 数据库表建议

新增 PostgreSQL 表：

```text
reference_training_sets
reference_works
reference_chapters
chapter_analyses
work_style_reports
writing_personas
project_persona_configs
persona_generation_logs
```

注意：

1. schema 变更必须同步 Drizzle migration。
2. 大文本字段先用 `text`，不要第一版就上向量库。
3. `reference_chapters.content` 只用于分析和追溯，不在写作生成时大段注入。
4. 后续如需向量检索，可新增 `embedding` 或独立向量服务，不阻塞第一版。

---

## 7. API 设计

### 7.1 训练集

```text
GET    /api/persona/training-sets
POST   /api/persona/training-sets
GET    /api/persona/training-sets/:id
PATCH  /api/persona/training-sets/:id
DELETE /api/persona/training-sets/:id
```

### 7.2 参考作品

```text
POST   /api/persona/training-sets/:id/works
GET    /api/persona/training-sets/:id/works
GET    /api/persona/works/:workId
DELETE /api/persona/works/:workId
POST   /api/persona/works/:workId/split
POST   /api/persona/works/:workId/analyze
```

### 7.3 分析结果

```text
GET /api/persona/works/:workId/chapters
GET /api/persona/chapters/:chapterId/analysis
GET /api/persona/works/:workId/style-report
POST /api/persona/works/:workId/style-report
```

### 7.4 写作人格

```text
GET    /api/personas
POST   /api/personas
GET    /api/personas/:personaId
PATCH  /api/personas/:personaId
DELETE /api/personas/:personaId
POST   /api/persona/training-sets/:id/generate-persona
POST   /api/personas/:personaId/publish
```

### 7.5 项目人格配置

```text
GET   /api/projects/:projectId/persona-config
PUT   /api/projects/:projectId/persona-config
POST  /api/projects/:projectId/persona-preview
POST  /api/projects/:projectId/persona-drift-check
```

---

## 8. AI 分析 Prompt 设计

### 8.1 章节拆解 Prompt

目标：对单章进行结构化拆解。

必须返回 JSON：

```json
{
  "openingHook": "本章开头如何抓人",
  "conflictType": "冲突类型",
  "pressureSource": "压迫来源",
  "protagonistAction": "主角采取了什么行动",
  "payoffType": "爽点兑现方式",
  "cliffhanger": "结尾钩子",
  "emotionCurve": "情绪曲线",
  "pacingScore": 8,
  "dialogueRatio": 40,
  "descriptionRatio": 35,
  "narrativePattern": "本章叙事结构",
  "tropeTags": ["压迫", "反击", "打脸"],
  "craftNotes": "可复用技巧总结",
  "riskNotes": "需要避免直接复刻的桥段或表达"
}
```

Prompt 约束：

```text
你是网文结构分析师。请分析章节的结构、节奏、爽点和写作技巧。
不要仿写原文，不要摘录大段原文。
重点提炼抽象规律，便于训练新的写作人格。
返回严格 JSON，不要 markdown。
```

### 8.2 作品风格报告 Prompt

输入：

- 该作品多个章节分析摘要
- 章节爽点分布
- 冲突类型统计
- 结尾钩子统计

输出：

```json
{
  "summary": "作品整体风格概括",
  "coreAppeal": "核心爽点",
  "pacingModel": "节奏模型",
  "hookModel": "钩子模型",
  "conflictModel": "冲突推进模型",
  "characterModel": "人物塑造模型",
  "languageProfile": "语言节奏画像",
  "chapterTemplate": "典型章节模板",
  "strengths": "最值得学习的优点",
  "weaknesses": "不建议继承的问题",
  "avoidCopying": "禁止复刻的表达和桥段风险"
}
```

### 8.3 写作人格融合 Prompt

输入：

- 多个作品风格报告
- 用户设定的人格名称、题材、目标
- 参考作品权重

输出：

```json
{
  "name": "人格名称",
  "description": "人格说明",
  "coreAppeal": "核心爽点",
  "pacingRules": "节奏规则",
  "conflictRules": "冲突规则",
  "characterRules": "人物规则",
  "languageRules": "语言规则",
  "chapterRules": "章节结构规则",
  "hookRules": "结尾钩子规则",
  "forbiddenRules": "禁止事项",
  "similarityGuardrails": "避免过度相似的规则"
}
```

---

## 9. 人格强度注入规则

写作生成前，根据 `ProjectPersonaConfig.strength` 生成不同 prompt 强度。

### 9.1 强度 0-30

只注入人格摘要：

```text
参考以下写作人格的高层原则，但优先保持当前小说已有风格：
{persona.coreAppeal}
{persona.forbiddenRules}
```

### 9.2 强度 31-60

注入结构规则：

```text
请参考以下节奏和章节结构，但不要明显模仿语言：
{persona.pacingRules}
{persona.chapterRules}
{persona.hookRules}
```

### 9.3 强度 61-80

注入主要规则：

```text
本次生成应明显遵循该写作人格：
核心爽点：{persona.coreAppeal}
节奏规则：{persona.pacingRules}
冲突规则：{persona.conflictRules}
人物规则：{persona.characterRules}
章节规则：{persona.chapterRules}
结尾钩子：{persona.hookRules}
禁止事项：{persona.forbiddenRules}
```

### 9.4 强度 81-100

强风格驱动，同时必须加强相似度防护：

```text
强烈采用该人格的节奏、冲突和章节结构，但不得复刻参考作品的具体桥段、专名、连续表达或标志性场景。
生成后必须自检相似度风险。
```

---

## 10. 写作接入规则

### 10.1 大纲生成

注入：

- 当前项目故事设定
- 当前卷目标
- 当前章节任务卡
- 项目人格配置
- 人格强度转换后的结构规则

输出必须进入大纲确认区。

### 10.2 正文续写

注入：

- 当前章节任务
- 已写正文结尾 500-1000 字
- 最近 3 章摘要
- 人物当前状态
- 伏笔和禁写信息
- 人格写作规则

输出必须进入 AI 确认区。

### 10.3 润色改写

注入：

- 选中文本
- 当前项目风格
- 人格语言规则
- 改写强度

禁止改变剧情事实。

### 10.4 质量评估

新增评分：

- 人格契合度
- 爽点强度
- 冲突密度
- 主线推进度
- 结尾钩子强度
- 相似度风险

---

## 11. 偏航检测规则

AI 生成后调用 `persona-drift-check`。

输入：

- 生成内容
- 当前章节任务卡
- 项目设定
- 人格档案
- 人格强度

输出：

```json
{
  "personaFitScore": 82,
  "plotDriftScore": 18,
  "similarityRiskScore": 12,
  "hookStrengthScore": 76,
  "conflictDensityScore": 81,
  "issues": [
    "本段反派压迫不足，爽点兑现偏弱"
  ],
  "suggestions": [
    "增加一个明确阻力，并让主角用已有能力完成反击"
  ],
  "riskLevel": "low"
}
```

风险分级：

| 风险 | 处理 |
|---|---|
| low | 可正常插入 |
| medium | 提示用户检查 |
| high | 默认不允许直接应用，需要用户二次确认 |

---

## 12. 页面设计

### 12.1 写作人格库首页

内容：

- 人格列表
- 训练集列表
- 新建训练集
- 新建人格
- 状态：草稿 / 训练中 / 可用 / 已归档

### 12.2 训练集详情页

内容：

- 训练集基本信息
- 已上传作品
- 上传按钮
- 拆章状态
- 分析进度
- 生成写作人格按钮

### 12.3 作品报告页

内容：

- 作品整体风格
- 爽点曲线
- 冲突类型分布
- 章节模板
- 语言节奏画像
- 禁止复刻风险

### 12.4 写作人格详情页

内容：

- 人格名称
- 题材
- 核心爽点
- 节奏规则
- 冲突规则
- 人物规则
- 语言规则
- 章节规则
- 禁止事项
- 发布 / 归档

### 12.5 项目设置中的人格配置

内容：

- 选择写作人格
- 人格强度 slider 0-100
- 启用场景 checkbox
- 项目微调文本框
- 预览本项目注入 prompt

---

## 13. 开发阶段顺序

### 阶段 1：数据模型与迁移

1. 在 `packages/shared` 增加 persona 相关类型。
2. 在 `apps/api/src/db/schema.ts` 增加新表。
3. 生成 Drizzle migration。
4. 增加基础 seed 示例。

验收：

```bash
pnpm db:generate
pnpm db:migrate
pnpm check
```

### 阶段 2：参考作品上传与拆章

1. 新增训练集 CRUD。
2. 新增参考作品 CRUD。
3. 支持 `.txt` 上传文本。
4. 实现章节拆分。
5. 保存 reference chapters。

验收：

1. 上传一本 `.txt` 后可看到章节列表。
2. 章节标题和字数正确。
3. 刷新后数据仍存在。

### 阶段 3：章节 AI 拆解

1. 新增 `persona-analysis.service.ts`。
2. 每章调用 AI 生成结构化 JSON。
3. 保存 `chapter_analyses`。
4. 失败时记录状态，不写占位成功数据。

验收：

1. 未配置 AI 时明确失败。
2. 配置 AI 后可生成章节拆解。
3. JSON 解析失败不会伪装成功。

### 阶段 4：作品风格报告

1. 聚合章节分析。
2. 生成作品风格报告。
3. 支持报告重新生成。

验收：

1. 一本书能看到完整风格报告。
2. 报告不包含大段原文。
3. 报告能明确指出可学习技巧和禁止复刻风险。

### 阶段 5：写作人格生成

1. 从多个作品报告融合人格。
2. 支持人格草稿编辑。
3. 支持发布人格。

验收：

1. 选择多本作品能生成一个人格。
2. 人格字段完整。
3. 未发布人格不能被项目启用。

### 阶段 6：项目人格配置

1. 项目设置接入人格选择。
2. 支持强度 slider。
3. 支持启用场景。
4. 支持项目微调。

验收：

1. 项目可保存人格配置。
2. 刷新后配置仍存在。
3. 不同项目可使用不同人格和强度。

### 阶段 7：写作生成接入

1. 大纲生成读取人格配置。
2. 正文续写读取人格配置。
3. 润色改写读取人格配置。
4. 所有 AI 输出仍进入确认区。

验收：

1. 不启用人格时维持原生成逻辑。
2. 启用人格后 prompt 包含人格规则。
3. 人格强度影响注入内容多少。

### 阶段 8：偏航检测与相似度风险

1. 新增 `persona-drift-check` API。
2. 生成后显示人格契合度。
3. 高相似度风险时阻止一键应用。

验收：

1. AI 生成后可看到偏航报告。
2. 高风险内容需要二次确认。
3. 报告给出具体修改建议。

---

## 14. 给其他 AI 的执行要求

执行本功能前必须：

1. 先读 `AGENTS.md`。
2. 先跑 `pnpm check`，确认当前基线。
3. 不得绕过设计系统。
4. 不得把 AI 生成内容直接写入正文。
5. 不得把参考作品原文大段注入写作 prompt。
6. 不得在 AI 失败时写入占位成功数据。
7. 所有 schema 变更必须生成 migration。

推荐每阶段结束运行：

```bash
pnpm check
pnpm db:migrate
```

涉及 AI 的阶段还要手动验证：

```bash
curl -s http://127.0.0.1:3000/api/settings/ai
```

---

## 15. 第一版不做的内容

为了控制范围，第一版暂不做：

1. 向量数据库。
2. 多用户权限。
3. 云端文件存储。
4. PDF/EPUB 解析。
5. 自动版权判断。
6. 直接模仿某个作者。
7. 按作者名生成“某某风格”。

这些可以作为后续阶段：

- 第二版：向量检索和相似片段召回。
- 第三版：PDF/EPUB 导入。
- 第四版：多用户和训练集权限。
- 第五版：版权风险与相似表达检测增强。

---

## 16. 最小可用版本定义

MVP 不追求一次完成所有页面，但必须打通闭环：

```text
上传 1-3 本 txt
-> 拆章
-> 分析 10-30 个章节样本
-> 生成人格草稿
-> 项目启用人格
-> 写作页生成时使用人格
-> 生成后显示人格契合度
```

只有同时满足以上闭环，才可以宣称“写作人格训练中心第一版完成”。
