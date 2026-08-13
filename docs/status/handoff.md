# 开发交接

更新日期：2026-08-13
工作目录：`/Users/lhw/code/ai-novel`
分支：`main`（`codex/production-hardening-book-setup` 已 fast-forward 合并并删除）
最新提交：`HEAD`（包含事件加密生产加固 22 提交 + 库重建对齐）

## 当前状态

“项目内容加密与删除”计划 Task 1–8 及 Review Fix Round 1 已合并 `main` 并推送远端。`codex/production-hardening-book-setup` 分支以 fast-forward 方式合入 `main`（22 个提交，75 文件，+12,107 行），`pnpm check` 通过（334 测试全绿），已推送 `origin/main`。

事件溯源产品工作流已全量落地：migration `0000`–`0045`、每项目内容加密、命令回执保护、密码学删除、tombstone-aware Replay、安全扫描、完整 fingerprint 保护的可重复 seed、非空快照证据、脱敏测试失败输出，以及 export DTO 白名单均已落地。本地 `ai_novel` 数据库已按最新 schema 重建（drop + pgvector + migrate + seed），DB 与代码 schema 完全对齐。

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

- 本分支已合并 `main` 并推送远端，`codex/production-hardening-book-setup` worktree 与分支已清理。
- migration `0045_drop_writing_jobs_legacy_column.sql` 已创建并应用，清除 `writing_jobs.auto_approval_level` 孤儿列，DB 与 schema 完全对齐（53 表、46 迁移记录）。
- 本地 `ai_novel` 数据库已完成 destructive rebuild（drop → pgvector → migrate → seed），事件溯源写链路验证通过（21 事件、14 流、19 命令回执、1 项目、3 章节、3 人物）。
- `.env` 已补齐 `AI_CREDENTIAL_MASTER_KEY` 与 `PROJECT_CONTENT_MASTER_KEY`（两个独立 32 字节 base64 值）；重建数据库时必须先装 pgvector 扩展否则 `0012` migration 失败。
- 真实 Provider smoke 是否执行取决于环境是否提供有效凭据与网络，未配置时必须记录“未执行”，不能伪造通过。
