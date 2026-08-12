# 开发交接

更新日期：2026-08-12  
工作目录：`/Users/lhw/code/ai-novel`  
分支：`main`  
进入本轮前基线：`69f5a5c`

## 当前状态

生产加固与新书规划的四部分设计已经由用户确认：总体架构、项目内容加密、新书规划领域/UI、运行可靠性与验收。长期设计规格已经写入，当前停在“用户复核书面规格”门禁，尚未开始业务代码实施。

## 已完成

- 阅读当前全部必读项目文档。
- 盘点现有事件溯源、自动写作、数据库与 UI 边界。
- 确认可再次清空本地开发数据库。
- 确认 guided 与 automatic 两种规划模式。
- 确认正文自动启动为独立且默认关闭的授权。
- 确认真实 Provider 使用本地协议测试和显式低成本 smoke。
- 用户在可视化线框图中选择 A：专注式规划工作区。
- 写入长期设计、开发记忆和本交接文档。

## 下一步

1. 用户复核 `docs/superpowers/specs/2026-08-12-production-hardening-and-book-setup-design.md`。
2. 用户确认后，使用 `writing-plans` 生成详细实施计划。
3. 选择执行方式后按 TDD 实施，不跳过测试先行。
4. 每个阶段更新 `development-memory.md` 与本文件。

## 恢复命令

```bash
git status --short --branch
git log -5 --oneline --decorate
cat docs/status/development-memory.md
cat docs/status/handoff.md
cat docs/superpowers/specs/2026-08-12-production-hardening-and-book-setup-design.md
```

## 当前阻塞

只有书面规格复核门禁；没有代码、数据库或环境阻塞。

## 最终验证约定

开发期间运行窄测试完成 TDD。所有实现完成后统一执行 `pnpm check`、`pnpm test:coverage`、数据库重建、seed、replay、安全检查、两条端到端流程和三档浏览器验收。真实 Provider 未配置时，`pnpm smoke:ai` 记录为未执行而不是伪造通过。
