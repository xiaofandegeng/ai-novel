# 开发交接

更新日期：2026-08-13
工作目录：`/Users/lhw/code/ai-novel/.worktrees/production-hardening-book-setup`
分支：`codex/production-hardening-book-setup`
进入生产加固前基线：`59c3d9f`（`main`）

## 当前状态

“项目内容加密与删除”计划 Task 1–8 及 Review Fix Round 1 已完成实现与验证，分支尚未合并 `main`。migration `0044_real_sugar_man.sql`、每项目内容加密、命令回执保护、密码学删除、tombstone-aware Replay、安全扫描、完整 fingerprint 保护的可重复 seed、非空快照证据、脱敏测试失败输出，以及 export DTO 白名单均已落地。

Task 1–7 的准确提交哈希和加固提交见 [`开发记忆`](development-memory.md#task-18-提交证据)。Task 8 基线为 `9d4aa5f`；Review Fix Round 1 提交名为 `fix(security): harden seed verification boundaries`，本轮提交完成后的当前 HEAD 即其最终哈希。

## 运行前提

严格按[本地开发指南](../guides/local-development.md#2-首次配置与初始化)先静默生成并写入两个独立主密钥，再执行 init/migration/seed；不要用会把真实值打印到终端的命令，也不要提交 `.env`。变量要求如下：

```env
PROJECT_CONTENT_MASTER_KEY=<第一个32字节随机值的Base64>
AI_CREDENTIAL_MASTER_KEY=<第二个32字节随机值的Base64>
```

项目内容主密钥缺失、Base64 非规范或解码后不是 32 字节时，API/seed/replay 会启动失败。两个主密钥的有效解码字节相同时也会启动失败；不可使用默认值或复用。

## 本阶段验证证据

```text
Task 8 RED                     2 failed, 23 passed（预期行为缺失）
Task 8 narrow GREEN            3 files, 25 tests passed
security/eventing/project      17 files, 167 tests passed
architecture regression       2 files, 33 tests passed
API typecheck                  passed
repo lint                      passed
API build                      passed
Review Fix Round 1 narrow      5 files, 37 tests passed
eventing + security            13 files, 134 tests passed
all API modules                32 files, 123 tests passed
keyless encryption scanner     passed, 0 findings
git diff --check               passed
```

最终提交门禁已重新执行阶段测试、typecheck、lint、build、无密钥 scanner 和 `git diff --check`，提交后再确认 clean status；数据库 destructive rebuild 未在 Task 8 执行。安全扫描可使用 `pnpm db:verify-encryption`，只输出记录类别与 ID，不输出 payload、明文探针或密钥材料。

## 下一步

严格按 [`Worker 可靠性与 Provider 协议`](../superpowers/plans/2026-08-12-workflow-runtime-and-provider.md) 开始 migration `0045`、OutboxRuntime 生命周期/心跳、脱敏健康查询和本地 OpenAI-compatible 协议验收。

后续三份计划仍待做：

1. Worker 可靠性与 Provider 协议
2. 新书规划后端
3. 新书规划前端、端到端与最终交付

不要跳过 Worker 计划直接实现 BookSetup，也不要删除五份临时计划；只有总路线全部完成后才归档计划并执行全仓、数据库、两条 Playwright 链路和三档浏览器最终验收。

## 恢复与检查命令

```bash
git status --short --branch
git log --oneline --decorate -25
cat docs/status/development-memory.md
cat docs/status/handoff.md
cat docs/superpowers/plans/2026-08-12-workflow-runtime-and-provider.md
pnpm db:verify-encryption
```

## 未决事项

- 本分支尚未合并 `main`。
- migration `0045`、`0046` 尚未创建。
- 本 Task 没有执行本地数据库清空；允许清空时仍使用 no-conversion reset path。
- 真实 Provider smoke 是否执行取决于环境是否提供有效凭据与网络，未配置时必须记录“未执行”，不能伪造通过。
