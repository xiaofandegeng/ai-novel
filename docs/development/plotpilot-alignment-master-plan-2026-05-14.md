# PlotPilot 后续对齐总路线图

日期：2026-05-14  
状态：待实施  
适用对象：Codex、Claude、Cursor、Copilot-style agent，以及后续所有 AI 开发代理。  

## 1. 背景

本项目之前已经参考 PlotPilot 完成了一部分长篇小说创作能力，包括章节元素、伏笔台账、故事事实三元组、章后处理建议、写作任务、AI 上下文快照、场景规划、人物弧光、矛盾时间线、健康指标和导入导出补齐。

后续对齐不再是“继续加页面”，而是把已有模块串成稳定的长篇写作引擎：

```text
设定
  -> 大纲
  -> 场景
  -> 生成
  -> 审查
  -> 作者确认
  -> 正文写入
  -> 章后分析
  -> 事实 / 伏笔 / 人物 / 矛盾 / 风格记忆沉淀
  -> 下一章上下文增强
```

## 2. 参考原则

可以借鉴 PlotPilot 的产品机制和架构思想：

1. 长篇自动驾驶写作流程。
2. 章后自动沉淀记忆。
3. 知识图谱、伏笔台账、章节节拍。
4. 文风漂移、张力曲线、健康监控。
5. 实时任务进度与失败重试。

不得复制：

1. PlotPilot 源码。
2. PlotPilot 专有提示词。
3. 参考网文原文表达。
4. 会绕开作者确认的全自动覆盖逻辑。

## 3. 当前已落地能力

| 能力 | 当前主要位置 | 状态 |
| --- | --- | --- |
| 章节元素 | `chapter_elements`、大纲页、写作页上下文 | 已落地 |
| 章节记忆 | `chapter_memories`、章后处理 | 已落地 |
| 伏笔台账 | `foreshadowing_items` | 已落地 |
| 故事事实 | `story_fact_triples` | 已落地 |
| 章后建议 | `chapter_postprocess_suggestions` | 已落地 |
| 写作任务 | `writing_jobs`、`writing_job_steps` | 已落地但需升级 |
| 场景规划 | `chapter_scenes`、场景模式 | 已落地但需深化 |
| AI 上下文快照 | `ai_context_snapshots` | 已落地 |
| 人物弧光 | `character_arc_events` | 已落地 |
| 矛盾时间线 | `conflict_timeline_events` | 已落地 |
| 知识库 | `knowledge_sources/chunks/embeddings` | 已有基础，需真实 RAG |
| 健康指标 | `health-metrics` | 已有基础，需长篇监控 |

## 4. 后续文档执行顺序

必须按以下顺序执行，不要跳阶段：

1. [半自动驾驶写作舱 v1](./plotpilot-stage-a-autodrive-writing-cockpit-2026-05-14.md)
2. [真实向量 RAG 与知识召回](./plotpilot-stage-b-real-rag-retrieval-2026-05-14.md)
3. [长篇健康监控与风格漂移](./plotpilot-stage-c-longform-health-monitoring-2026-05-14.md)
4. [提示词接点与结构模板库](./plotpilot-stage-d-prompt-and-structure-system-2026-05-14.md)
5. [实时任务状态、导入导出与最终验收](./plotpilot-stage-e-realtime-export-acceptance-2026-05-14.md)

## 5. 总体禁止事项

1. 禁止 AI 结果直接覆盖正文、大纲、角色、关系、伏笔、事实库。
2. 禁止新增 schema 字段但不生成 migration。
3. 禁止前端硬编码 `http://localhost:3000`。
4. 禁止产品 UI 使用原生 `alert/confirm/prompt`。
5. 禁止绕过 `apps/web/src/api` 直接在页面散落复杂 fetch。
6. 禁止把参考作品原文连续片段塞进生成 prompt。
7. 禁止用 mock 数据假装功能完成。

## 6. 总体验收命令

每个阶段完成后至少运行：

```bash
pnpm check
pnpm db:migrate
```

涉及 schema 时额外运行：

```bash
pnpm db:generate
pnpm --filter @ai-novel/api db:seed
```

涉及 UI 时必须人工打开对应页面检查：

```text
仪表盘
大纲规划
正文写作
写作任务
知识库
项目健康
项目设置
```

## 7. 总体验收口径

一个阶段只有同时满足以下条件才算完成：

1. UI 入口存在。
2. API 流程存在。
3. 数据能持久化。
4. loading、empty、error 状态存在。
5. AI 结果进入确认区。
6. 项目归属校验完整。
7. 导入导出不丢新数据。
8. `pnpm check` 通过。
9. 文档更新或补充使用说明。
