# 当前开发状态

更新日期：2026-08-12  
状态：全产品事件溯源切换完成，准备进入新流程开发

## 当前结论

- 产品数据层已从直接 CRUD 切换为 Event Store + Command Bus + Projection + Outbox。
- 项目、设置、Prompt、故事结构、章节、人物、关系、冲突、伏笔、叙事知识、自动运行、写作任务、变更集、章后处理和 AI 操作均已事件溯源化。
- 不保留旧业务数据，不存在双写或旧数据转换链路；本地数据库通过 `pnpm db:rebuild` 直接重建。
- 前端产品面保持项目列表、自动写作驾驶舱和项目设置三条主路由，不恢复旧多页面 CRUD 工作台。
- 当前架构设计依据保留在 `docs/superpowers/specs/2026-08-11-full-product-event-sourcing-design.md`；已完成的分期实施计划已经删除。

## 运行链路

```text
Vue cockpit
  → domain HTTP route
  → command handler
  → Event Store transaction
  → synchronous projection + command receipt + outbox
  → Outbox worker
  → autonomous Process Manager
  → WritingJob / ChangeSet / Postprocess commands
  → approved Chapter and narrative events
  → cockpit projections
```

投影可通过 `pnpm db:replay` 从 `domain_events` 完整重建。外部 AI 调用由 Outbox 驱动，Process Manager 只发命令，不直接写投影。

## 必须保持的不变量

1. `domain_events` 只追加，不更新、不删除。
2. 所有产品写接口通过 Command Bus；route 只处理 HTTP 协议。
3. 投影不承载唯一事实，业务 service 不直接写投影。
4. 每条项目资源事件和命令都校验 `projectId`，跨项目读写必须拒绝。
5. 暂停或终止 Run 后，不启动后续步骤，迟到 AI 结果不得写回。
6. 正文和叙事写回必须来自获批 ChangeSet 或明确的低风险自动决策。
7. 章后建议必须按 AutonomousRun、WritingJob 和 PostprocessRun 隔离。
8. API Key 只存在于 AES-256-GCM credential vault，不进入事件、日志或导出。

## 当前验证基线

合并前必须重新执行，历史数字只能用于判断回退：

- API：46 个测试文件、245 条测试；覆盖率数字以本次合并前 `pnpm test:coverage` 输出为准。
- Eventing 与 Process Manager：语句、分支、函数、行均至少 90%；Process Manager 当前为 100%。
- Web：12 个测试文件、35 条测试；语句/行不低于 75%、分支不低于 65%、函数不低于 60%。
- 浏览器：1440、1024、390 三档已完成项目设置、自动运行、章内容人工保存、移动端单列与异常中心验收，无横向溢出。
- 数据库：最终验收需要 `db:generate` 无漂移、`db:rebuild`、`db:seed`、`db:replay` 全部成功。

## 已知边界与下一阶段入口

- Fake AI Provider 只用于本地和测试，生产环境强制禁用。
- `novel_projects` 是兼容外键投影；新代码不能把它当成独立事实源。
- 自动化服务已经分出 Process Manager、事件 handler/projector、章后分析和查询模块；新增流程继续按执行器、解析器、查询服务拆分，避免重新形成大服务。
- 下一阶段可以开发新的创作流程，但必须先定义 Command、Event、Aggregate 状态迁移、同步/异步投影和浏览器验收场景，再接入驾驶舱。

## 交接检查

```bash
pnpm check
pnpm test:coverage
pnpm db:generate
pnpm db:rebuild
pnpm db:seed
pnpm db:replay
```

任何一项失败都表示当前链路未完成，优先修复，不开始新功能。
