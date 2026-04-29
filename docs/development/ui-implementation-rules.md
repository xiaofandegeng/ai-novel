# UI Implementation Rules

版本：v0.1
日期：2026-04-29
用途：约束前端 UI 实现，避免产品设计、UI 设计和开发实现继续分叉。

## 1. 必读文档

实现任何 UI 前必须阅读：

1. `docs/design/ai-novel-workbench-ui-design-spec.md`
2. `packages/ui/src/tokens.ts`
3. `packages/ui/src/components/*`
4. 当前业务页面已有实现

## 2. 产品界面定位

这是长时间使用的小说创作工作台，不是营销落地页。UI 应当：

- 安静
- 专业
- 信息清晰
- 编辑器优先
- 支持高频操作
- 让 AI 建议可控、可审阅

禁止：

- 大面积渐变装饰
- 营销 hero 页面
- 过度卡片化
- 过度圆角
- emoji 功能图标
- 用裸色值绕过 token

## 3. 设计系统优先级

优先使用 `packages/ui` 中的组件：

- `NAppLayout`
- `NButton`
- `NIconButton`
- `NInput`
- `NTextArea`
- `NSelect`
- `NPanel`
- `NDrawer`
- `NModal`
- `NConfirmDialog`
- `NToast`
- `NTag`
- `NEmptyState`
- `NLoadingState`
- `NErrorState`

如果需要新增基础组件，先放入 `packages/ui/src/components`，再在业务页面使用。

## 4. 布局规则

桌面端主业务页优先采用三栏工作台：

```text
左侧导航 / 中间工作区 / 右侧上下文或 AI 辅助区
```

规则：

1. 写作页正文编辑区域必须是视觉中心。
2. 大纲、人物、关系、冲突页要支持快速扫描和编辑。
3. 右侧 AI 或上下文面板不得遮挡主编辑流程。
4. 移动端使用抽屉或单列布局，不强行压缩三栏。
5. 页面级标题不要使用 hero 级字体。

## 5. 交互规则

必须使用统一组件：

1. 危险操作：`NConfirmDialog`
2. 表单弹窗：`NModal`
3. 右侧详情：`NDrawer`
4. 状态提示：`NToast`
5. 空状态：`NEmptyState`
6. 加载状态：`NLoadingState`
7. 错误状态：`NErrorState`

禁止在产品 UI 使用：

```ts
alert()
confirm()
prompt()
```

## 6. AI 结果 UI

AI 生成、改写、扩写、总结、质量建议都必须有明确结果区。

结果区至少提供：

1. 输入依据或上下文说明
2. 生成状态
3. 结果正文
4. 操作按钮：
   - 插入
   - 替换
   - 保存为备选
   - 丢弃
5. 风险说明：替换正文、大纲、设定时必须说明会覆盖什么

AI 结果不得直接写入正文、大纲、人物设定、关系或冲突。

## 7. 图标和按钮

规则：

1. 图标优先使用 Lucide。
2. icon-only 按钮必须有 `aria-label` 和 tooltip。
3. 普通按钮文案要短，不把说明文字塞进按钮。
4. 危险按钮使用错误色，且必须二次确认。
5. loading、disabled、focus 状态必须可见。

## 8. 表单规则

1. 表单字段必须有 label。
2. 保存类操作必须有 loading 状态。
3. 后端错误必须显示到页面或 toast。
4. 长文本字段使用 `NTextArea`。
5. 枚举选择使用 `NSelect` 或明确的 segmented control。
6. 删除、恢复、覆盖都不得直接执行。

## 9. 响应式验收

UI 改动完成后至少检查：

1. 桌面宽度：1440px
2. 窄桌面或平板：1024px
3. 移动宽度：390px

重点看：

- 文本不溢出
- 按钮不挤压变形
- 面板不互相遮挡
- 主工作区仍可操作
- 抽屉和弹窗可关闭

## 10. UI Review Checklist

提交前检查：

```bash
rg -n "alert\\(|confirm\\(|prompt\\(" apps/web/src
rg -n "#[0-9a-fA-F]{3,8}" apps/web/src
pnpm check
```

人工检查：

1. 是否使用设计系统组件
2. 是否有 loading、empty、error 状态
3. 是否符合三栏工作台视觉
4. AI 建议是否进入确认区
5. 危险操作是否有统一确认

