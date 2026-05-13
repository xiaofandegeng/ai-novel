# 模块自动关联闭环修复计划

日期：2026-05-13
状态：待实施
适用范围：角色管理、人物关系、大纲规划、章节元素、章后分析、事实图谱、矛盾矩阵、伏笔台账、AI 上下文

## 1. 背景

当前项目已经具备多个结构化模块：

- 故事设定集
- 角色管理
- 人物关系
- 矛盾矩阵
- 伏笔台账
- 知识库
- 大纲规划
- 场景写作
- 章后分析
- 事实图谱
- AI 上下文组装

这些模块已经有一部分联动，例如：

- AI 上下文会读取项目设定、角色、人物关系、矛盾、章节元素、伏笔、事实图谱和章节记忆。
- AI 推荐角色创建后，会尝试自动创建人物关系。
- 章后分析可以生成事实、伏笔、角色状态、章节元素、矛盾更新等待确认建议。
- 写作页和大纲页已经开始使用章节元素、场景、记忆等结构化数据。

但仍存在一些关键断点：部分模块只是“各自可用”，没有形成完整的数据回填和自动关联闭环。后续修复目标是让作者在一个模块里产生的结构化信息，能够可靠影响其他模块和 AI 生成上下文。

## 2. 总体目标

1. 角色、人物关系、矛盾、伏笔、章节元素、事实图谱之间建立稳定关联。
2. AI 分析结果不能只停留在侧栏或文本建议中，必须进入待确认队列，用户确认后回填到对应业务模块。
3. 大纲中选择的登场角色、章节硬约束和写作页上下文必须一致。
4. 自动推理结果不能只生成松散事实，应该能转成人物关系、矛盾推进、伏笔状态等可维护数据。
5. 所有关联写入都必须校验 projectId 边界，避免跨项目污染。

## 3. 当前主要问题

### P1-1 大纲登场角色与章节硬约束人物可能脱节

位置：

- `apps/web/src/features/outline/composables/useOutlineWorkspace.ts`
- `apps/web/src/features/outline/components/ChapterOutlineEditor.vue`

现状：

- `toggleCharacter()` 只更新 `outlineForm.characterIds`。
- `addCharacterElement()` 才会单独写入 `chapterElementDrafts`。
- UI 上“登场角色”和“必须出场人物”是两套入口。
- 保存时章节 `characters` 和 `chapter_elements` 分别写入，二者可以不一致。

影响：

- 作者以为角色已在本章登场，但 AI 上下文中的章节硬约束可能没有该角色。
- 写作页展示的“必须出场人物”可能和大纲选择不同。
- 章后推理、共场推理、场景生成可能缺少关键角色约束。

修复要求：

1. 选中登场角色时，自动同步一个 `chapter_elements` 记录：
   - `elementType: 'character'`
   - `elementId: character.id`
   - `elementName: character.name`
   - `relationType: 'appears'`
   - `importance: 'major' | 'normal'`
2. 取消登场角色时，同步移除对应 character 类型章节元素，或弹出确认：
   - 如果该元素是用户手动标记的“必须出场”，需要提示是否保留硬约束。
3. `ChapterOutlineEditor.vue` 中可以保留两个区域，但必须明确语义：
   - 登场角色：参与本章。
   - 必须出场人物：AI 写作硬约束。
4. 保存前增加一致性整理：
   - `outlineForm.characterIds` 中的角色至少要存在于 `chapterElementDrafts`。
   - `chapterElementDrafts` 中 character 类型元素也应反向补进 `outlineForm.characterIds`。

验收：

- 大纲页勾选角色后，刷新页面仍能在“必须出场人物”看到对应角色。
- 写作页上下文面板能显示该角色。
- AI 上下文 prompt 中能出现该章节元素。

## 4. P1-2 章后分析的人物关系变化没有回填人物关系网

位置：

- `apps/api/src/services/chapter-postprocess.service.ts`
- `apps/api/src/services/postprocess-suggestion.service.ts`
- `apps/api/src/db/schema/postprocess.ts`
- `apps/api/src/db/schema/character.ts`

现状：

- 章后分析要求 AI 返回 `relationshipChanges`。
- 当前只把 `relationshipChanges` 写入 `chapter_memories`。
- 不会生成 `relationship_update` 待确认建议。
- 用户无法在章后分析页确认“新增关系 / 关系变化 / 关系强度变化”。

影响：

- 正文中已经发生的人物关系变化，不会自动进入人物关系网。
- 后续 AI 仍会读取旧关系，可能导致人物互动错乱。
- 关系页和正文进展脱节。

修复要求：

1. 扩展章后分析 JSON：

```json
{
  "relationshipUpdates": [
    {
      "characterAName": "林澈",
      "characterBName": "沈微",
      "type": "ally",
      "strength": 7,
      "status": "互相信任但仍有隐瞒",
      "description": "两人共同经历雨夜事件后形成临时同盟",
      "confidence": 80
    }
  ]
}
```

2. `chapter_postprocess_suggestions.suggestionType` 增加：

```ts
'relationship_update'
```

3. `chapter-postprocess.service.ts` 将 `relationshipUpdates` 拆成待确认建议。
4. `postprocess-suggestion.service.ts` 应用建议时：
   - 根据角色名匹配当前项目角色。
   - 若关系已存在，更新 type、strength、status、description。
   - 若关系不存在，创建新关系。
   - 匹配不到角色时标记 `apply_failed`，不要假装 applied。

验收：

- 写完章节后运行章后分析，能看到人物关系建议。
- 接受建议后，人物关系页面出现新关系或关系变化。
- AI 上下文中的人物关系区块读取到最新关系。

## 5. P1-3 图谱推理没有真正更新人物关系，且存在 ID/名称去重不一致

位置：

- `apps/api/src/services/story-graph-inference.service.ts`

现状：

- 已有人物关系去重使用 `characterAId/characterBId`。
- 共场推理生成 pair 时使用角色名称。
- ID pair 和 name pair 混在同一个 `existingPairs` 中，可能导致已有关系识别失败。
- 推理结果只生成 `fact_triple`，不会进入人物关系待确认队列。

影响：

- 已存在的人物关系仍可能被重复推理。
- 共场关系只进入事实图谱，人物关系页没有变化。
- 作者需要手动补关系，模块联动不完整。

修复要求：

1. 构建章节角色映射时，`chapter_elements.elementId` 存在时必须使用角色 ID。
2. `existingPairs` 分成两类：
   - `existingRelationshipIdPairs`
   - `existingFactNamePairs`
3. 共场推理优先用 ID pair 去重。
4. 共场推理不要直接创建正式关系，应生成 `relationship_update` 或 `relationship_candidate` 待确认建议。
5. 建议 payload 应包含：
   - `characterAId`
   - `characterBId`
   - `characterAName`
   - `characterBName`
   - `reason`
   - `sourceChapterId`
   - `sourceElementIds`

验收：

- 同一对已有关系角色不会重复生成共场关系建议。
- 两个新共场角色会出现在章后建议中，用户确认后进入人物关系网。

## 6. P2-1 人物关系缺少后端唯一约束

位置：

- `apps/api/src/db/schema/character.ts`
- `apps/api/src/routes/relationships.ts`
- Drizzle migration

现状：

- `character_relationships` 没有唯一约束。
- 前端 AI 创建角色时会查重，但手动创建或直接调用 API 仍可能制造重复关系。

影响：

- 人物关系页出现重复记录。
- AI 上下文重复渲染同一组关系。
- 后续图谱推理更难判断是否已有关联。

修复要求：

1. 后端创建关系前做重复检查：
   - 同项目下 `(A, B)` 和 `(B, A)` 视为同一对关系。
2. 数据库层建议增加规范化字段或唯一索引：
   - 方案 A：新增 `character_low_id`、`character_high_id`，建立唯一索引。
   - 方案 B：保留现有字段，先在 service 层查重，后续迁移规范化。
3. 批量创建 AI 关系时复用同一 service，避免前后端重复实现。

验收：

- 同一项目内同一对角色不能创建重复关系。
- A-B 和 B-A 不会同时存在两条同义关系。

## 7. P2-2 矛盾和伏笔仍是文本关联人物，不能自动跟随角色变化

位置：

- `apps/api/src/routes/conflicts.ts`
- `apps/api/src/db/schema/postprocess.ts`
- `apps/api/src/services/ai-context-renderer.ts`

现状：

- `conflicts.participants` 是自由文本。
- `foreshadowing_items.related_characters` 是自由文本。
- 角色改名、删除、新增后，矛盾和伏笔不会自动同步。

影响：

- AI 上下文只能读到文本，无法稳定知道关联的是哪个角色。
- 角色重名或改名时，矛盾、伏笔、关系会断链。
- 自动推荐角色后，不会自动进入相关矛盾或伏笔。

修复要求：

第一阶段先做轻量修复：

1. 前端保存矛盾时，允许选择角色 ID，同时继续保留展示文本。
2. 后端新增解析层，把 `participants` 中能匹配到的角色名保存到结构化字段或关联表。
3. AI 上下文渲染优先使用结构化角色 ID，再回退到文本。

第二阶段做结构化表：

```text
conflict_participants
  id
  project_id
  conflict_id
  character_id
  role_in_conflict

foreshadowing_characters
  id
  project_id
  foreshadowing_id
  character_id
  relation_type
```

验收：

- 角色改名后，矛盾和伏笔仍能显示正确关联角色。
- AI 上下文里的矛盾参与者和伏笔相关人物来自结构化关联。

## 8. P2-3 章节元素 API 需要校验 elementId 的业务归属

位置：

- `apps/api/src/routes/chapter-elements.ts`

现状：

- 已经校验 chapter 属于 project。
- 但 `elementType === 'character'` 时，没有校验 `elementId` 是否是当前项目角色。

影响：

- 外部调用可以写入错误角色 ID。
- AI 上下文可能读取到失效或跨项目 elementId。

修复要求：

1. PUT / POST / PATCH 写入元素时：
   - 如果 `elementType === 'character'` 且 `elementId` 存在，必须校验角色属于当前项目。
2. 其他类型暂时允许无 `elementId`。
3. 如果 elementId 和 elementName 不一致，以数据库角色名为准，或返回 400 要求前端修正。

验收：

- 跨项目角色 ID 不能写入章节元素。
- 角色名改动后，章节元素能在保存或刷新时同步最新角色名。

## 9. 推荐实施顺序

### 阶段 1：大纲角色与章节元素同步

目标：先解决用户最容易感知的“我选了角色，但写作约束没跟上”。

改动：

1. 修改 `useOutlineWorkspace.ts`。
2. 调整 `ChapterOutlineEditor.vue` 文案和交互。
3. 补充保存前一致性整理。

验证：

```bash
pnpm check
```

手动验证：

1. 进入大纲页。
2. 选择一个登场角色。
3. 保存并刷新。
4. 检查“必须出场人物”和写作页上下文是否同步。

### 阶段 2：章后分析生成人物关系建议

目标：正文中的关系变化能进入人物关系网。

改动：

1. 扩展 postprocess suggestion 类型。
2. 修改章后分析 prompt 和解析。
3. 修改建议应用逻辑。
4. 增加角色名匹配失败处理。

验证：

```bash
pnpm check
```

手动验证：

1. 写一章包含两名角色关系变化的正文。
2. 运行章后分析。
3. 接受人物关系建议。
4. 检查人物关系页是否新增或更新。

### 阶段 3：图谱推理接入人物关系候选

目标：共场、传递推理不只进入事实图谱，也能转成可确认关系。

改动：

1. 修复 ID/name pair 去重。
2. 共场推理生成 relationship suggestion。
3. 避免已有关系重复建议。

验证：

```bash
pnpm check
```

手动验证：

1. 在同一章节设置两个必须出场人物。
2. 运行图谱推理。
3. 检查是否生成关系候选。
4. 已有关系不重复生成。

### 阶段 4：关系唯一性与结构化关联

目标：减少重复关系和文本断链。

改动：

1. 人物关系创建 API 增加查重。
2. 设计关系唯一索引迁移。
3. 规划 `conflict_participants` 和 `foreshadowing_characters`。

验证：

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
```

## 10. 不允许的实现方式

1. 不允许 AI 分析后直接修改人物关系、矛盾、伏笔，必须先进入待确认队列。
2. 不允许只在前端做自动关联，后端 API 必须同样保证一致性。
3. 不允许用自由文本替代本应结构化的角色关联。
4. 不允许绕过 `projectId` 归属校验。
5. 不允许为了通过类型检查扩大使用 `any`。

## 11. 最终验收清单

完成后至少验证：

- [ ] 大纲登场角色和章节元素一致。
- [ ] 写作页能看到本章硬约束人物。
- [ ] AI 上下文 prompt 包含最新角色、关系、矛盾、伏笔、章节元素。
- [ ] 章后分析能生成关系建议。
- [ ] 接受关系建议后，人物关系页自动更新。
- [ ] 共场推理不会重复已有关系。
- [ ] 人物关系 API 不允许重复 pair。
- [ ] 跨项目角色 ID 不能写入章节元素。
- [ ] `pnpm check` 通过。
- [ ] 涉及 schema 时 `pnpm db:generate` 和 `pnpm db:migrate` 通过。

