# 下一步生产可用性与交付加固实施文档

日期：2026-05-14
状态：待实施
前置假设：

1. `docs/development/next-step-data-flow-implementation-plan-2026-05-14.md` 已完成。
2. `docs/development/next-step-graph-writing-loop-plan-2026-05-14.md` 已完成。
3. `docs/development/next-step-rag-health-persona-plan-2026-05-14.md` 已完成。
4. 项目已经具备完整写作闭环：设定、大纲、角色、关系、矛盾、伏笔、写作任务、章后分析、RAG、健康监控、人格记忆。

目标：把当前功能完备的工作台加固到“可长期写作、可迁移、可恢复、可验收”的状态，避免后续正式写作时出现数据丢失、流程断裂、性能下降或 AI 结果不可追溯。

---

## 1. 本轮实施范围

本轮只做交付加固，不继续新增大功能：

1. 数据完整性和迁移验收。
2. 导入导出与备份恢复闭环。
3. AI 调用错误恢复与降级策略。
4. 写作长链路性能优化。
5. 前端关键流程可用性检查。
6. 自动化验收脚本与测试覆盖。
7. 发布前检查清单。

暂不做：

- 多用户权限系统。
- 在线协作。
- 商业化计费。
- 云端部署自动化。
- 移动端专用设计。

---

## 2. 阶段 A：数据完整性与迁移验收

### 2.1 目标

确认所有 schema、migration、seed、导入导出和业务代码字段一致，保证新环境能完整启动，旧数据能安全迁移。

### 2.2 修改范围

```text
apps/api/src/db/schema
apps/api/drizzle
apps/api/src/scripts/seed.ts
apps/api/src/services/export-import.service.ts
packages/shared/src
docs/testing
```

### 2.3 检查项

必须逐项检查：

1. schema 中的每张表都有对应 migration。
2. migration 在空库可以完整执行。
3. migration 在已有测试库可以重复执行而不失败。
4. shared 类型包含新增表和新增字段。
5. API 返回字段与 shared 类型一致。
6. seed 数据覆盖：
   - 项目
   - 故事设定
   - 角色
   - 人物关系
   - 矛盾
   - 伏笔
   - 分卷章节
   - 场景
   - 章节元素
   - 事实三元组
   - 章节记忆
   - 知识库摘要
   - 写作人格
   - 写作任务
   - 健康指标

### 2.4 数据完整性约束

重点确认：

1. 所有带 `projectId` 的数据都能随项目删除级联清理。
2. 跨项目 ID 不能写入：
   - chapter
   - character
   - relationship
   - conflict
   - foreshadowing
   - scene
   - writing job
   - knowledge source
3. 同一项目内不能出现重复人物关系 pair。
4. 同一章节不能出现重复章节元素。
5. 章后建议应用失败不能伪装为成功。

### 2.5 验收命令

```bash
pnpm check
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

### 2.6 手动验收

1. 删除测试项目，确认相关数据被清理。
2. 新建项目，跑完整 seed。
3. 打开主要页面，确认没有缺字段报错。

---

## 3. 阶段 B：导入导出与备份恢复闭环

### 3.1 目标

作者长期写作最怕数据丢失。导入导出必须覆盖所有核心数据，并能恢复到可继续写作的状态。

### 3.2 修改范围

```text
apps/api/src/services/export-import.service.ts
apps/api/src/routes/export.ts
apps/web/src/views/ProjectSettingsView.vue
packages/shared/src
docs/testing/export-import-checklist.md
```

### 3.3 导出必须包含

```text
novel_projects
story_bibles
characters
character_relationships
conflicts
conflict_participants
foreshadowing_items
foreshadowing_characters
volumes
chapters
chapter_scenes
chapter_elements
chapter_versions
chapter_memories
chapter_postprocess_runs
chapter_postprocess_suggestions
story_fact_triples
knowledge_sources
knowledge_chunks
knowledge_notes
knowledge_embeddings metadata
quality_reports
health_metrics
health_risks
writing_personas
persona_memory_cards
project_persona_configs
writing_jobs
writing_job_steps
ai_context_snapshots
```

注意：

1. embedding 向量可以提供选项：
   - 默认导出 metadata，不导出向量。
   - 高级备份模式允许导出向量。
2. AI API Key 不允许导出。
3. provider baseUrl/model 可以导出，但 secret 必须脱敏。

### 3.4 导入要求

1. 全流程必须包在事务中。
2. 任何一步失败必须回滚，不允许半导入项目残留。
3. 所有 ID 必须 remap。
4. 关联字段必须按 remap 后 ID 写入。
5. 如果导入包包含旧版本 schema：
   - 给出明确错误。
   - 或执行兼容转换。

### 3.5 导入后重建

导入完成后自动或提示执行：

1. 重建知识库 embedding。
2. 重建健康指标。
3. 校验人物关系 pair。
4. 校验伏笔和矛盾关联。
5. 生成导入报告。

### 3.6 前端要求

项目设置页提供：

1. 导出完整项目。
2. 导入项目备份。
3. 导入前预览：
   - 项目名
   - 章节数量
   - 角色数量
   - 知识库数量
   - 是否包含人格
   - 是否包含 embedding
4. 导入结果报告。

### 3.7 验收

1. 导出一个完整测试项目。
2. 删除原项目。
3. 导入备份。
4. 打开大纲、写作、角色、关系、矛盾、伏笔、知识库、健康页。
5. 跑一次 AI 上下文构建。
6. 确认导入项目可以继续写作。

命令：

```bash
pnpm check
pnpm --filter @ai-novel/api test
```

---

## 4. 阶段 C：AI 调用错误恢复与降级策略

### 4.1 目标

AI 服务不可用、超时、返回格式错误、额度不足时，系统不能把错误文本当成可应用内容，也不能让流程静默成功。

### 4.2 修改范围

```text
apps/api/src/services/ai-provider.service.ts
apps/api/src/services/ai-json.service.ts
apps/api/src/services/writing-job.service.ts
apps/api/src/services/chapter-postprocess.service.ts
apps/api/src/services/knowledge.service.ts
apps/api/src/routes/ai.ts
apps/web/src/components/AIAssistantSidebar.vue
apps/web/src/features/writing/composables/useAIResultConfirm.ts
packages/shared/src
```

### 4.3 错误类型

统一错误码：

```ts
type AIErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_INVALID_JSON'
  | 'AI_CONTEXT_TOO_LARGE'
  | 'AI_SAFETY_BLOCKED'
  | 'AI_UNKNOWN_ERROR'
```

### 4.4 后端要求

1. 非流式 AI JSON 失败必须返回结构化错误。
2. 流式 AI 失败必须使用明确 error event，不能把 `[Error: ...]` 写成普通 assistant 内容。
3. 写作任务中 AI 步骤失败：
   - step 标记 failed。
   - 保存 error code 和 message。
   - 允许 retry。
4. 知识库分析失败：
   - source 标记 failed。
   - 不得标记 completed。
5. 章后分析失败：
   - run 标记 failed。
   - 不生成空建议。

### 4.5 前端要求

1. AI 错误结果不能出现“应用到编辑器”按钮。
2. 错误面板必须提供：
   - 错误原因
   - 前往 AI 设置
   - 重试
   - 复制诊断信息
3. 一致性检查失败或异常时，不得默认放行。
4. AI JSON 解析失败时，允许用户查看原始返回，但不能直接应用为结构化数据。

### 4.6 验收

1. 清空 AI Key，触发 AI 生成，前端显示配置错误，不生成可应用内容。
2. 模拟 JSON 错误，结构化建议不应用。
3. 模拟超时，写作任务停在 failed，可重试。
4. 知识库分析失败不会显示 completed。

命令：

```bash
pnpm check
pnpm test
```

---

## 5. 阶段 D：长链路性能优化

### 5.1 目标

长篇项目数据会越来越多。页面和 AI 上下文构建必须避免一次性拉取过量数据。

### 5.2 修改范围

```text
apps/api/src/services/ai-context.service.ts
apps/api/src/services/knowledge-retrieval.service.ts
apps/api/src/services/health-metrics.service.ts
apps/api/src/routes
apps/web/src/stores
apps/web/src/views
```

### 5.3 后端优化

1. 列表接口分页：
   - knowledge chunks
   - context snapshots
   - chapter versions
   - postprocess suggestions
   - writing jobs
2. AI 上下文限制：
   - 当前章完整读取。
   - 前 3 章摘要。
   - 后 1 章计划。
   - 开放伏笔 Top N。
   - 相关角色 Top N。
   - RAG 召回 Top K。
3. 增加 token 估算和截断日志。
4. 大型查询增加必要索引。

### 5.4 前端优化

1. 主要列表使用分页或虚拟滚动。
2. 大纲页不要一次性渲染所有章节详情。
3. 知识库搜索防抖。
4. 健康页按风险类型懒加载详情。
5. AI 上下文调试器默认只显示摘要，展开后加载 payload。

### 5.5 验收

测试数据：

```text
100 章
300 场景
80 角色
200 人物关系
200 伏笔
1000 知识库 chunk
5000 事实三元组
```

验收：

1. 项目首页 2 秒内可交互。
2. 大纲页不卡死。
3. 写作页切章 1 秒内完成主要数据加载。
4. AI 上下文构建不会超过配置 token 上限。

---

## 6. 阶段 E：关键前端流程可用性检查

### 6.1 目标

确保用户不是“能看到功能”，而是真的能顺畅完成写作流程。

### 6.2 必查页面

```text
/projects
/project/:id
/project/:id/bible
/project/:id/characters
/project/:id/relationships
/project/:id/conflicts
/project/:id/foreshadowing
/project/:id/knowledge
/project/:id/outline
/project/:id/write
/project/:id/post-chapter-analysis
/project/:id/health
/project/:id/settings
/persona
```

### 6.3 UI 检查项

1. 中文文案一致。
2. 关键按钮不依赖 hover 才可见。
3. 危险操作使用设计系统确认弹窗。
4. AI 结果有确认区。
5. loading、empty、error 状态完整。
6. 表单保存后有明确反馈。
7. 键盘焦点可见。
8. 移动宽度不重叠。

### 6.4 验收方式

使用浏览器手动走完整流程：

1. 新建项目。
2. 配置 AI。
3. 填写故事设定。
4. AI 辅助生成角色。
5. AI 推荐关系。
6. 配置矛盾和伏笔。
7. 规划大纲。
8. 启动写作任务。
9. 完成章后分析。
10. 查看健康风险。
11. 导出项目。

---

## 7. 阶段 F：自动化验收与测试覆盖

### 7.1 目标

把核心闭环变成可重复测试，避免后续修改破坏流程。

### 7.2 测试类型

1. Service unit tests：
   - relationship 去重。
   - postprocess suggestion 应用。
   - ai context 构建。
   - export/import remap。
2. API integration tests：
   - 项目归属校验。
   - 章节元素写入。
   - 写作任务推进。
3. Smoke script：
   - `pnpm smoke:writing-loop`
4. UI smoke：
   - 使用 Playwright 或浏览器测试关键页面。

### 7.3 最低覆盖清单

必须覆盖：

- [ ] 章后关系建议应用成功。
- [ ] 章后建议应用失败不会伪成功。
- [ ] 同一对人物关系不能重复创建。
- [ ] 跨项目 ID 写入失败。
- [ ] 导出导入后数据数量一致。
- [ ] AI 未配置时不会生成可应用内容。
- [ ] 写作任务确认后正文写入。
- [ ] 一致性检查异常不放行。

### 7.4 命令

```bash
pnpm check
pnpm test
pnpm smoke:writing-loop
```

---

## 8. 发布前检查清单

发布或正式开始长期写作前，必须通过：

- [ ] `pnpm install` 成功。
- [ ] `pnpm check` 成功。
- [ ] `pnpm db:migrate` 成功。
- [ ] `pnpm --filter @ai-novel/api db:seed` 成功。
- [ ] `pnpm smoke:writing-loop` 成功。
- [ ] 新建项目流程可用。
- [ ] AI 配置检测可用。
- [ ] 导入导出可用。
- [ ] 写作任务完整跑通。
- [ ] 章后分析能回填业务模块。
- [ ] 健康指标能刷新。
- [ ] 没有原生 `alert/confirm/prompt`。
- [ ] 前端没有硬编码 `http://localhost:3000`。
- [ ] AI 错误不会变成可应用正文。
- [ ] 参考作品原文不会进入 prompt。

---

## 9. 完成标准

本阶段完成后，项目应达到：

1. 可以放心开始正式长篇写作。
2. 数据可以导出、导入、恢复。
3. AI 出错时不会污染正文和结构化数据。
4. 长篇数据量增长后主要页面仍可用。
5. 关键写作闭环有自动化验收。
6. 后续新增功能有稳定回归基线。

