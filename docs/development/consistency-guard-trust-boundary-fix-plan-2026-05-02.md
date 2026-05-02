# 一致性守卫信任边界修复文档

日期：2026-05-02  
状态：待执行  
范围：一致性守卫错误处理、场景上下文构建、前端应用按钮信任边界。  
目标：修复当前一致性守卫阶段 1 中的两个 P1 问题，确保 AI 生成内容在审查失败时不会被静默放行，并且一致性检查使用正确的生成场景上下文。

---

## 1. 背景

当前项目已经完成一致性守卫的基础链路：

1. 新增 `packages/shared/src/types/consistency.ts`。
2. 新增 `apps/api/src/services/consistency-guard.service.ts`。
3. 新增 `POST /api/projects/:projectId/consistency/check`。
4. `AIAssistantSidebar.vue` 在 `draft / outline / polish / quality` 场景生成后触发一致性检查。
5. 当报告返回 `blocked` 时，前端会禁用“应用到编辑器”按钮。

但代码审查发现两个信任边界问题：

1. 一致性检查失败时前端只打印错误，随后仍允许用户应用未经审查的内容。
2. 后端一致性守卫固定使用 `quality` 场景构建上下文，忽略调用方传入的 `scene`。

这两个问题会削弱“生成后审查 -> 风险报告 -> 用户确认”的核心约束。

---

## 2. 必修问题

### 2.1 审查失败时不能静默放行

文件：

```text
apps/web/src/components/AIAssistantSidebar.vue
```

当前问题位置：

```ts
try {
  const report = await checkConsistency(...)
  messages.value[lastIndex].consistencyReport = report
}
catch (e) {
  console.error('Consistency check failed', e)
}
finally {
  messages.value[lastIndex].isCheckingConsistency = false
}
```

问题说明：

1. 如果一致性服务异常、AI 返回非 JSON、网络失败或后端 500，前端只 `console.error`。
2. `isCheckingConsistency` 随后变为 `false`。
3. 模板中“应用到编辑器”按钮重新出现。
4. 这会让未经审查的 AI 内容进入正文。

修改要求：

给消息增加审查失败状态。

建议类型：

```ts
const messages = ref<{
  role: 'user' | 'assistant'
  content: string
  model?: string
  error?: boolean
  consistencyReport?: ConsistencyGuardReport
  isCheckingConsistency?: boolean
  consistencyCheckFailed?: boolean
  consistencyCheckError?: string
}[]>([])
```

失败时设置状态：

```ts
catch (e: any) {
  console.error('Consistency check failed', e)
  messages.value[lastIndex].consistencyCheckFailed = true
  messages.value[lastIndex].consistencyCheckError = e.message || '一致性审查失败'
}
```

模板展示失败提示：

```vue
<div
  v-if="msg.role === 'assistant' && msg.consistencyCheckFailed"
  class="mt-3 border border-semantic-error/20 rounded-lg bg-semantic-error/10 p-2 text-xs text-semantic-error"
>
  一致性审查失败：{{ msg.consistencyCheckError || '请稍后重试' }}。为避免内容偏离设定，当前结果不可直接应用。
</div>
```

应用按钮禁用条件：

```vue
:disabled="
  msg.consistencyReport?.overallStatus === 'blocked'
    || msg.consistencyCheckFailed
"
```

按钮文案：

```vue
{{
  msg.consistencyCheckFailed
    ? '审查失败'
    : msg.consistencyReport?.overallStatus === 'blocked'
      ? '检查未通过'
      : '应用到编辑器'
}}
```

验收标准：

1. 一致性检查失败时，用户能看到明确失败提示。
2. 一致性检查失败时，“应用到编辑器”按钮不可用。
3. 未经审查的 AI 内容不能直接进入正文。
4. 控制台错误不能成为唯一反馈。

---

### 2.2 一致性守卫必须使用调用方场景

文件：

```text
apps/api/src/services/consistency-guard.service.ts
```

当前问题位置：

```ts
const context = await buildProjectAIContext({
  projectId,
  scene: 'quality',
  chapterId,
  userInstruction: sourceInstruction,
})
```

问题说明：

`runConsistencyGuard` 收到了 `input.scene`，但构建上下文时固定传 `quality`。这会导致：

1. `draft` 生成后的审查无法使用 `draft` 场景的人格开关。
2. `outline` 生成后的审查无法使用 `outline` 场景的人格开关。
3. `polish` 生成后的审查无法使用 `polish` 场景的草稿截取策略。
4. 项目如果只启用了 draft 人格、没启用 quality 人格，正文审查时反而拿不到人格约束。

修改要求：

使用传入的 `scene`：

```ts
const { chapterId, generatedText, sourceInstruction, scene } = input

const context = await buildProjectAIContext({
  projectId,
  scene,
  chapterId,
  userInstruction: sourceInstruction,
})
```

如果需要审查专用规则，不要通过伪装成 `quality` 场景实现，而是在一致性守卫 prompt 中额外加入：

```text
【审查任务】
你正在审查 scene=${scene} 的 AI 生成结果。
请根据该场景判断是否违背主题、人物、设定、前后文和风格。
```

验收标准：

1. `draft` 场景审查使用 `draft` 上下文。
2. `outline` 场景审查使用 `outline` 上下文。
3. `polish` 场景审查使用 `polish` 上下文。
4. 写作人格场景开关在一致性检查中生效。

---

## 3. 推荐实施顺序

1. 修改 `consistency-guard.service.ts`，让 `buildProjectAIContext` 使用 `input.scene`。
2. 修改 `AIAssistantSidebar.vue` 的消息类型，增加 `consistencyCheckFailed` 和 `consistencyCheckError`。
3. 修改一致性检查 catch 分支，设置失败状态。
4. 修改模板，展示审查失败提示。
5. 修改“应用到编辑器”按钮禁用逻辑和文案。
6. 运行门禁。

---

## 4. 验证命令

运行完整门禁：

```bash
pnpm check
```

本轮不涉及数据库结构，理论上不需要迁移。

---

## 5. 手工验收流程

### 5.1 审查失败不放行

模拟方式任选一种：

1. 临时让 `/api/projects/:projectId/consistency/check` 返回 500。
2. 临时关闭 AI Key。
3. 临时让后端返回非 JSON。

验收：

1. AI 生成结果显示出来。
2. 一致性审查显示失败提示。
3. “应用到编辑器”按钮禁用。
4. 不能直接把该内容插入正文。

### 5.2 场景上下文正确

准备一个项目：

1. 绑定写作人格。
2. 只开启 `enabledForDraft`，关闭 `enabledForQualityReview`。
3. 在写作页触发续写。

验收：

1. 一致性检查仍能拿到 draft 场景的人格约束。
2. 不会因为 quality 场景关闭而丢失人格。

---

## 6. 禁止事项

1. 不要在一致性检查失败时默认放行内容。
2. 不要只靠 `console.error` 提示用户。
3. 不要继续把所有审查场景固定成 `quality`。
4. 不要让前端绕过确认区直接写入正文。
5. 不要新增数据库迁移，本轮只修阶段 1 信任边界。

---

## 7. 完成标准

完成后必须满足：

1. `pnpm check` 通过。
2. 一致性检查失败时，AI 内容不能被应用到编辑器。
3. 用户能看到一致性检查失败原因。
4. 后端一致性守卫使用 `input.scene` 构建上下文。
5. `draft / outline / polish / quality` 的人格场景开关在一致性检查中保持一致。
