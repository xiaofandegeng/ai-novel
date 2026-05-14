# 下一步数据流闭环实施文档

日期：2026-05-14
状态：待实施
上游文档：

1. `docs/development/data-flow-writing-loop-plan-2026-05-14.md`
2. `docs/development/module-linkage-closure-fix-plan-2026-05-13.md`

目标：把“数据自动流动与写作闭环”从总方案落到下一批可验收代码修改。  
本轮只做最关键的闭环，不继续扩展新模块。

---

## 1. 本轮实施范围

本轮只完成 4 件事：

1. 大纲角色与章节元素双向同步。
2. 章节元素 `elementId` 归属校验。
3. 章后分析生成人物关系建议，并能回填人物关系网。
4. 人物关系创建去重，避免重复关系污染 AI 上下文。

暂不做：

- 完整向量 RAG。
- 新的健康指标页面。
- 完整自动驾驶写作舱。
- 矛盾、伏笔的全量结构化关联表。
- 参考作品人格增强。

---

## 2. 阶段 A：大纲角色与章节元素双向同步

### 2.1 问题

当前大纲页中：

- “登场角色”写入 `chapters.characters`。
- “必须出场人物”写入 `chapter_elements`。

两者可能不一致，导致写作页和 AI 上下文漏掉角色硬约束。

### 2.2 修改文件

```text
apps/web/src/features/outline/composables/useOutlineWorkspace.ts
apps/web/src/features/outline/components/ChapterOutlineEditor.vue
apps/web/src/features/writing/components/WritingContextPanel.vue
```

### 2.3 实现要求

#### 2.3.1 新增工具函数

在 `useOutlineWorkspace.ts` 中新增：

```ts
function ensureCharacterElement(charId: string): void
function removeCharacterElement(charId: string, options?: { keepRequired?: boolean }): void
function normalizeOutlineCharacterElements(): void
```

要求：

1. `ensureCharacterElement` 根据角色 ID 查找角色名称，并补齐：
   - `elementType: 'character'`
   - `elementId`
   - `elementName`
   - `relationType: 'appears'`
   - `importance: 'major' | 'normal'`
2. `removeCharacterElement` 用于取消登场角色时同步移除非强制保留的章节元素。
3. `normalizeOutlineCharacterElements` 在保存前执行，保证：
   - `outlineForm.characterIds` 中的角色都有对应 `chapterElementDrafts`。
   - `chapterElementDrafts` 中的 character 元素都反向存在于 `outlineForm.characterIds`。
   - 按 `elementType + elementId/name + relationType` 去重。

#### 2.3.2 修改 toggleCharacter

逻辑：

```text
选中角色
  -> 加入 outlineForm.characterIds
  -> ensureCharacterElement(charId)

取消角色
  -> 从 outlineForm.characterIds 移除
  -> removeCharacterElement(charId)
```

#### 2.3.3 修改 addCharacterElement

逻辑：

```text
添加必须出场人物
  -> 添加 chapterElementDrafts
  -> 如果 outlineForm.characterIds 没有该角色，则补进去
```

#### 2.3.4 保存前整理

`handleSave()` 中：

```text
normalizeOutlineCharacterElements()
updateChapter()
replaceElements()
```

### 2.4 UI 要求

`ChapterOutlineEditor.vue` 中保留两个区域，但补充清晰文案：

- 登场角色：参与本章剧情。
- 必须出场人物：AI 写作时必须纳入约束。

不要用大段说明文字。可以使用短 label 或 tooltip。

### 2.5 验收

手动流程：

1. 打开大纲页。
2. 选择一个登场角色。
3. 保存大纲。
4. 刷新页面。
5. 检查该角色仍在“登场角色”和“必须出场人物”中。
6. 打开写作页，检查上下文面板显示该角色。

命令：

```bash
pnpm check
```

---

## 3. 阶段 B：章节元素 elementId 归属校验

### 3.1 问题

`chapter_elements.elementId` 在 `elementType === 'character'` 时应指向当前项目角色。  
如果不校验，外部 API 可以写入跨项目角色 ID 或失效 ID。

### 3.2 修改文件

```text
apps/api/src/routes/chapter-elements.ts
apps/api/src/services/ownership.service.ts
```

### 3.3 实现要求

#### 3.3.1 ownership service

新增或复用：

```ts
assertCharactersBelongToProject(projectId: string, characterIds: string[]): Promise<void>
```

要求：

1. 忽略空 ID。
2. 去重后查询。
3. 任一角色不存在或不属于项目时抛错。

#### 3.3.2 routes 校验

以下接口都要校验：

```http
PUT    /api/projects/:projectId/chapters/:chapterId/elements
POST   /api/projects/:projectId/chapters/:chapterId/elements
PATCH  /api/projects/:projectId/chapters/:chapterId/elements/:id
```

校验规则：

```text
如果 elementType === 'character' 且 elementId 存在
  -> assertCharactersBelongToProject(projectId, [elementId])
```

批量 PUT 时一次性收集所有 character elementId 再统一校验。

### 3.4 elementName 同步策略

如果 `elementType === 'character'` 且 `elementId` 存在：

推荐策略：

1. 后端查询角色名。
2. 写入时以数据库中的角色名覆盖 `elementName`。

这样可以避免角色改名后章节元素名称长期不一致。

### 3.5 验收

1. 跨项目 characterId 写入章节元素返回 400。
2. 同项目 characterId 正常保存。
3. 角色改名后重新保存大纲，章节元素名称使用最新角色名。

命令：

```bash
pnpm check
```

---

## 4. 阶段 C：章后分析生成人物关系建议

### 4.1 问题

章后分析当前能提取 `relationshipChanges`，但不会进入人物关系待确认建议，也不会回填人物关系网。

### 4.2 修改文件

```text
apps/api/src/services/chapter-postprocess.service.ts
apps/api/src/services/postprocess-suggestion.service.ts
apps/api/src/db/schema/postprocess.ts
packages/shared/src
apps/web/src/views/PostChapterAnalysisView.vue
```

### 4.3 schema 类型

`chapterPostprocessSuggestions.suggestionType` 增加：

```ts
'relationship_update'
```

如果 shared 中有对应枚举或联合类型，也要同步更新。

### 4.4 章后分析 prompt

将原来的文本字段：

```json
"relationshipChanges": "人物关系变化描述"
```

升级为结构化数组：

```json
"relationshipUpdates": [
  {
    "characterAName": "角色A",
    "characterBName": "角色B",
    "type": "ally/enemy/family/mentor/rival/lover/neutral",
    "strength": 1,
    "status": "当前互动状态",
    "description": "关系变化说明",
    "sourceText": "正文依据摘要",
    "confidence": 80
  }
]
```

保留 `relationshipChanges` 作为兼容字段，但新的业务回填必须使用 `relationshipUpdates`。

### 4.5 createSuggestion

对每条 `relationshipUpdates` 创建：

```ts
createSuggestion(projectId, chapterId, runId, 'relationship_update', payload, confidence, reason)
```

payload 中至少包含：

- `characterAName`
- `characterBName`
- `type`
- `strength`
- `status`
- `description`
- `sourceText`

### 4.6 应用逻辑

在 `postprocess-suggestion.service.ts` 中增加 `relationship_update` 分支：

1. 优先用 `characterAId / characterBId` 匹配角色。
2. 如果没有 ID，则用名称在当前项目内匹配。
3. 匹配不到任一角色时抛错，建议标记 `apply_failed`。
4. 如果人物关系已存在：
   - 更新 `type`
   - 更新 `strength`
   - 更新 `status`
   - 将新说明追加或合并到 `description`
5. 如果关系不存在：
   - 创建新关系。

### 4.7 前端展示

`PostChapterAnalysisView.vue` 中新增建议类型展示：

```text
人物关系变更
角色A -> 角色B
关系类型 / 强度 / 当前状态 / 依据
```

操作：

- 接受
- 拒绝
- 查看来源

### 4.8 验收

手动流程：

1. 章节正文写出两名角色关系变化。
2. 运行章后分析。
3. 章后分析页出现“人物关系变更”建议。
4. 接受建议。
5. 打开人物关系页，看到新增或更新后的关系。
6. 再次 AI 生成时，上下文包含该关系。

命令：

```bash
pnpm check
```

---

## 5. 阶段 D：人物关系去重

### 5.1 问题

同一项目内同一对角色可能出现重复关系。  
这会污染人物关系页、AI 上下文和图谱推理。

### 5.2 修改文件

```text
apps/api/src/db/schema/character.ts
apps/api/src/routes/relationships.ts
apps/api/src/services/character-utils.service.ts
apps/api/drizzle
```

### 5.3 推荐实现

短期实现：

1. 在 service 中新增：

```ts
normalizeCharacterPair(aId: string, bId: string): [string, string]
findExistingRelationship(projectId: string, aId: string, bId: string)
```

2. 创建关系前：
   - 校验 A/B 都属于项目。
   - 不允许 A === B。
   - 查找 `(A, B)` 或 `(B, A)` 是否已存在。
   - 已存在则返回 409 或更新已有关系。

推荐策略：

- 手动创建：重复时返回 409。
- AI / 章后建议应用：重复时更新已有关系。

中期实现：

增加规范化字段：

```text
character_low_id
character_high_id
```

并建立唯一索引：

```text
unique(project_id, character_low_id, character_high_id)
```

### 5.4 迁移注意

迁移前先处理历史重复数据：

1. 找出同项目下同一 pair 的重复关系。
2. 保留最新或强度最高的一条。
3. 合并 description。
4. 删除多余记录。
5. 再创建唯一索引。

### 5.5 验收

1. A-B 已存在时，不能再创建 B-A。
2. AI 批量创建角色时不会重复创建关系。
3. 章后关系建议应用时，已有关系会被更新而不是新增重复记录。

命令：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

---

## 6. 阶段 E：端到端回归测试

### 6.1 测试样本

使用已有 seed 项目，或新增测试项目：

```text
项目：镜中城
主角：林澈
盟友：沈微
反派：楚笙
核心矛盾：记忆商品化与真实身份
```

### 6.2 手动测试流程

1. 打开大纲页。
2. 给第一章选择林澈、沈微为登场角色。
3. 保存大纲。
4. 检查章节元素自动出现两名角色。
5. 打开写作页。
6. 检查上下文面板出现两名角色和关键事件。
7. 写入一段正文：

```text
雨夜里，沈微替林澈挡下了记忆审计员的追问。林澈第一次意识到，她不是单纯的旁观者，而是在暗中保护自己。两人达成临时同盟，但沈微仍隐瞒着自己与镜中城档案馆的关系。
```

8. 运行章后分析。
9. 接受人物关系建议。
10. 打开人物关系页，确认林澈与沈微关系更新为同盟。
11. 再次调用 AI 辅助构思，检查上下文是否带入新关系。

### 6.3 自动验证命令

```bash
pnpm check
```

数据库变更后：

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

---

## 7. 不允许的实现方式

1. 不允许只在前端同步，后端 API 必须保证数据边界。
2. 不允许章后分析直接写入人物关系，必须先进入待确认建议。
3. 不允许关系应用失败时仍标记为 applied。
4. 不允许用自由文本替代角色 ID 关联。
5. 不允许绕过 `projectId` 校验。
6. 不允许新增 schema 后不生成 migration。

---

## 8. 完成标准

本轮完成必须同时满足：

- [ ] 大纲角色和章节元素双向同步。
- [ ] 写作页能读取同步后的章节元素。
- [ ] 章节元素写入校验 characterId 项目归属。
- [ ] 章后分析能生成人物关系建议。
- [ ] 接受建议后人物关系页更新。
- [ ] 重复人物关系不会被创建。
- [ ] AI 上下文能读取最新关系。
- [ ] `pnpm check` 通过。
- [ ] 涉及迁移时 `pnpm db:migrate` 通过。

