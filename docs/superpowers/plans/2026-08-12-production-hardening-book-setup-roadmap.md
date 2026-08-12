# 生产加固与新书规划实施路线

日期：2026-08-12  
依据：[`2026-08-12-production-hardening-and-book-setup-design.md`](../specs/2026-08-12-production-hardening-and-book-setup-design.md)

## 执行顺序

1. [`项目内容加密与删除`](2026-08-12-project-content-encryption.md)
2. [`Worker 可靠性与 Provider 协议`](2026-08-12-workflow-runtime-and-provider.md)
3. [`新书规划后端`](2026-08-12-book-setup-backend.md)
4. [`新书规划前端、端到端与最终交付`](2026-08-12-book-setup-web-and-delivery.md)

四份计划按顺序执行。每个任务使用测试先行并独立提交；阶段内只运行窄测试与必要的迁移命令。第 4 份计划最后统一执行全仓、覆盖率、数据库重建、重放、安全扫描、浏览器和可选真实 Provider 验收。

## 共同完成定义

- 不恢复旧式独立 CRUD 页面。
- 不产生业务表直写入口。
- 敏感事件、快照和命令回执没有明文副本。
- guided 与 automatic 共用 BookSetup 状态机。
- 正文自动启动保持独立且默认关闭的授权。
- 开发记忆和交接文档随每个阶段更新。
- 全部实现完成后删除本目录内这五份临时执行文档，把长期结论合并到当前规范。
