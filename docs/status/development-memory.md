# 开发记忆

更新日期：2026-08-12  
当前阶段：生产加固与新书规划规格及实施计划已确认，等待选择执行方式

## 本轮目标

在现有全产品事件溯源与自动写作驾驶舱基础上：

1. 补齐项目内容信封加密、密钥销毁删除、Worker 健康与真实 Provider 协议验收。
2. 建立创意、世界观、人物、结构、章节规划五阶段的新书规划流程。
3. 同时支持逐阶段确认和全自动推进，并将正文启动保持为独立授权。

长期设计依据：[`生产加固与新书规划流程设计`](../superpowers/specs/2026-08-12-production-hardening-and-book-setup-design.md)。

## 已确认决策

- 允许再次清空本地开发数据库，不转换当前明文演示事件。
- 项目内容事件使用每项目 AES-256-GCM 数据密钥，数据密钥由独立主密钥包装。
- 删除项目时销毁数据密钥，已删除项目在 replay 时整体跳过。
- 新书规划使用独立 `BookSetup` 聚合和 Process Manager。
- 模式为 `guided` 与 `automatic`；自动模式遇到高风险或校验失败必须停下。
- “规划完成后自动开始正文”是默认关闭的独立勾选项。
- 前端采用专注式规划工作区，不新增旧式 CRUD 页面。
- 默认自动测试使用本地 OpenAI-compatible 服务；真实请求只由显式 `pnpm smoke:ai` 触发。

## 必须保持的不变量

1. `domain_events` 只追加。
2. 受保护事件的数据库 payload 不含用户内容明文。
3. 领域写入只通过 Command Bus，投影不是事实来源。
4. 规划阶段的跨领域应用必须原子提交。
5. 暂停、终止和过期修订后的 AI 结果不得写回。
6. 规划授权不能隐式扩大为正文写作授权。
7. 所有项目资源读写必须校验 `projectId`。
8. API Key 与内容主密钥不得进入事件、日志、导出或 HTTP 响应。

## 阶段记录

| 阶段 | 状态 | 证据 |
| --- | --- | --- |
| 范围澄清 | 完成 | 用户确认生产加固、新书规划、可清库与 Provider 验收边界 |
| 总体架构 | 完成 | 用户确认独立 BookSetup + Process Manager |
| 安全设计 | 完成 | 用户确认信封加密与密钥销毁方案 |
| 领域与 UI | 完成 | 用户选择 A：专注式规划工作区 |
| 可靠性与验收 | 完成 | 用户确认 Worker、最终门禁和文档策略 |
| 书面规格复核 | 完成 | 用户已明确确认长期设计规格 |
| 实施计划 | 完成 | 四份依赖有序、测试先行的执行计划及总路线 |
| 代码实施 | 未开始 | 按 TDD 分阶段执行 |
| 最终验收 | 未开始 | 所有开发完成后统一执行 |

## 已批准执行路线

1. [`项目内容加密与删除`](../superpowers/plans/2026-08-12-project-content-encryption.md)：migration `0044`、Event/快照/回执保护、密钥销毁、Replay 与扫描。
2. [`Worker 可靠性与 Provider 协议`](../superpowers/plans/2026-08-12-workflow-runtime-and-provider.md)：migration `0045`、心跳/租约、脱敏健康、OpenAI-compatible 本地协议与 opt-in smoke。
3. [`新书规划后端`](../superpowers/plans/2026-08-12-book-setup-backend.md)：migration `0046`、BookSetup 聚合、Outbox/Process Manager、五阶段原子应用与重放。
4. [`新书规划前端、端到端与最终交付`](../superpowers/plans/2026-08-12-book-setup-web-and-delivery.md)：专注式工作区、两条完整 Playwright 链路、最终数据库/全仓/浏览器验收与文档归档。

总入口：[`生产加固与新书规划实施路线`](../superpowers/plans/2026-08-12-production-hardening-book-setup-roadmap.md)。计划执行完成后删除五份临时计划，将长期结论保留在架构、产品、规范、记忆与交接文档。

## 当前风险

- 项目密钥销毁后，Replay 必须先识别删除 tombstone，否则无法解密早期事件。
- BookSetup 阶段应用横跨多个聚合，必须使用现有原子 Command Bus 能力。
- 修改已应用但尚未完成的阶段会使下游修订失效；必须保留历史、显式生成 delta，并且只能删除该 setup 的稳定 ID 所拥有的实体。
- 全自动规划不能把高风险删除或结构覆盖当作低风险更新。
- 真实 Provider smoke 依赖用户环境是否配置有效凭据和网络。
