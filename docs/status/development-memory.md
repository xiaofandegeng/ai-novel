# 开发记忆

更新日期：2026-08-13
当前阶段：事件加密生产加固已合并 main、本地数据库已重建对齐，等待执行 Worker 可靠性与 Provider 协议计划

## 本轮目标与结论

第一份生产加固计划“项目内容加密与删除”Task 1–8 已完成实现、阶段验证，并已 fast-forward 合并 `main` 推送远端。本轮额外完成：

1. 将 `codex/production-hardening-book-setup` 的 22 个提交（含未提交的 seed 深度严格校验）fast-forward 合入 `main`，`pnpm check` 334 测试全绿，已推送 `origin/main`，并清理 worktree 与 4 个 `worktree-agent-*` 垃圾分支。
2. 本地 `ai_novel` 数据库 destructive rebuild：drop → 装 pgvector → `pnpm db:migrate`（45 迁移）→ `pnpm db:seed`。发现并修复 rebuild 前置依赖——必须先 `CREATE EXTENSION vector` 否则 `0012_legal_reavers` 因缺 `vector` 类型失败；`.env` 必须配置 `PROJECT_CONTENT_MASTER_KEY` + `AI_CREDENTIAL_MASTER_KEY` 两个独立 32 字节 base64 主密钥。
3. 补写 migration `0045_drop_writing_jobs_legacy_column.sql`，DROP `writing_jobs.auto_approval_level` 孤儿列（`0020` 添加，后续 schema 重构删除代码定义时漏写 DROP COLUMN）。DB 与代码 schema 100% 对齐：53 表、14 张旧表全清、46 迁移记录。

长期设计依据：[`生产加固与新书规划流程设计`](../superpowers/specs/2026-08-12-production-hardening-and-book-setup-design.md)。

## 已确认且必须保持的决策

- 不转换已有明文演示事件；允许清空的本地数据库走 `db:rebuild` → `db:seed` → `db:replay`。
- `PROJECT_CONTENT_MASTER_KEY` 和 `AI_CREDENTIAL_MASTER_KEY` 必须配置为独立 32 字节随机值；两个有效解码值相等时运行时启动失败，错误信息不得包含密钥。项目内容密钥缺失或非法时同样启动失败；credential key 保持 vault 的既有按需校验语义。
- `domain_events` 只追加；受保护事件、快照和回执的数据库 JSON 不得含用户内容明文。
- Eventing Content Protector 是存储 envelope 的唯一加解密边界；route、service、seed 和维护脚本禁止直写 Eventing 表。
- 项目删除销毁数据密钥后不可恢复；Replay 不能解密或重建已删除项目。
- 导出是领域 DTO，不是数据库 dump；禁止 envelope、wrapped key、ciphertext/auth tag 和 credential refs。
- 新书规划继续使用独立 `BookSetup` 聚合和 Process Manager；规划授权不能隐式扩大为正文写作授权。

## migration 与运行配置

- migration 链 `0000`–`0045`：`0044_real_sugar_man.sql` 创建 `project_data_keys`；`0045_drop_writing_jobs_legacy_column.sql` 清除 `writing_jobs.auto_approval_level` 孤儿列。`0042_purple_rictor.sql` 批量 DROP 了 14 张重构前旧表（`ai_settings`/`reference_*`/`writing_personas` 等）。
- 重建数据库的强制顺序：`dropdb` → `createdb` → `CREATE EXTENSION vector`（pgvector，`0012` 依赖）→ `pnpm db:migrate` → `pnpm db:seed`。缺 pgvector 或主密钥时 migrate 启动即失败。
- 本地生成主密钥：`openssl rand -base64 32`，分别配置 `PROJECT_CONTENT_MASTER_KEY` 与 `AI_CREDENTIAL_MASTER_KEY`，不得复用。
- 内容保护检查：`pnpm db:verify-encryption`，可用 `-- --project <project-id>` 限定项目。

## Task 1–8 提交证据

以下哈希均来自当前分支 `git log`；每个主 Task 后列出在进入下一 Task 前追加的相关加固提交：

| Task | 提交 |
| --- | --- |
| 1 主密钥与密码原语 | `ff29a89`；校验加固 `13de3e7` |
| 2 项目数据密钥表与 Key Store | `cf21084` |
| 3 Event Registry 与 Content Protector | `795881d`；配置/认证/AAD 加固 `187105e`、`06188ef`、`ab82513` |
| 4 Event Store 事件与快照保护 | `2b86adc`；批量解密加固 `c4c0be8` |
| 5 回执保护与原子密钥销毁 | `86c0aea`；回执 identity 加固 `0e57298` |
| 6 全领域保护分类 | `21b4f7e`；穷举分类加固 `8687a6a` |
| 7 tombstone Replay 与扫描 | `6cf41e7`；并发/架构边界加固 `563b41b`、`d231d6a`、`03adff5`、`8d3c02d`、`0dc389b` |
| 8 Seed、export、文档与交接 | `9d4aa5f` |
| 8 Review Fix Round 1 | `fix(security): harden seed verification boundaries`（本阶段 HEAD） |

## 当前验证状态

- Task 8 RED：准确选择器得到 2 failed / 23 passed；失败分别为重复 seed 的 `COMMAND_ID_CONFLICT` 与 export 整行透传敏感字段。
- Task 8 窄 GREEN：3 files / 25 tests passed。
- 阶段选择器：17 files / 167 tests passed，覆盖 `src/security`、`src/eventing`、`src/modules/project`、seed integration 和 app integration。
- 构建阻塞回归：共享架构测试 helper 移入 API `src/test` 后，2 files / 33 tests passed，API build passed。
- API typecheck passed；repo lint passed；最终 `git diff --check` passed，提交后再次确认 clean status。
- Review Fix Round 1 RED：master-key separation 1 failed / 7 passed；seed fingerprint 2 failed / 2 passed；snapshot mutation check 在无快照时准确失败。
- Review Fix Round 1 窄 GREEN：5 files / 37 tests passed。
- Review Fix Round 1 全量相关门禁：architecture 2 files / 33 tests、eventing/security 13 files / 134 tests、全部 modules 32 files / 123 tests，均通过；API typecheck/build、repo lint、keyless `db:verify-encryption` 和 `git diff --check` 通过。

这些是本阶段新鲜验证证据，不替代后续计划完成后的全仓 coverage、数据库 rebuild/seed/replay 和浏览器验收。

## 下一步与剩余计划

下一计划：[`Worker 可靠性与 Provider 协议`](../superpowers/plans/2026-08-12-workflow-runtime-and-provider.md)。生产加固已合并 `main`，本地数据库已重建对齐。总路线中的后续三份计划均未开始：

1. `2026-08-12-workflow-runtime-and-provider.md`
2. `2026-08-12-book-setup-backend.md`
3. `2026-08-12-book-setup-web-and-delivery.md`

当前风险：真实 Provider smoke 仍依赖最终环境提供有效凭据和网络；新书规划跨聚合应用、下游 revision 失效与正文独立授权仍待后续计划实现。
