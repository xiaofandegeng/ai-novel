import type { ConsistencyGuardReport } from '@ai-novel/shared'
import type { Ref } from 'vue'
import { ref } from 'vue'
import { T } from '@/utils/toast-message'

export interface PendingAIResult {
  content: string
  source: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft' | 'chat' | 'quality'
  selectionStart: number
  selectionEnd: number
  originalText: string
  consistencyReport?: ConsistencyGuardReport
  isCheckingConsistency?: boolean
  modelProvider?: string
  modelName?: string
  contextSnapshotId?: string
}

export interface AIActionType {
  type: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft' | 'quality'
}

type ToastType = 'success' | 'info' | 'warning' | 'error'

export function useAIResultConfirm(
  draft: Ref<string>,
  selectedText: Ref<string>,
  selectionStart: Ref<number>,
  selectionEnd: Ref<number>,
) {
  const pendingAIResult = ref<PendingAIResult | null>(null)

  function applyAIResult(text: string, metadata?: { provider?: string, model?: string, snapshotId?: string }) {
    if (!pendingAIResult.value || pendingAIResult.value.source === 'chat') {
      pendingAIResult.value = {
        content: text,
        source: 'chat',
        selectionStart: selectionStart.value,
        selectionEnd: selectionEnd.value,
        originalText: selectedText.value,
        modelProvider: metadata?.provider,
        modelName: metadata?.model,
        contextSnapshotId: metadata?.snapshotId,
      }
    }
    else {
      pendingAIResult.value.content = text
      if (metadata) {
        pendingAIResult.value.modelProvider = metadata.provider
        pendingAIResult.value.modelName = metadata.model
        pendingAIResult.value.contextSnapshotId = metadata.snapshotId
      }
    }
  }

  function confirmAIResult(action: 'insert' | 'replace' | 'backup' | 'discard', deps: {
    projectId: string
    currentChapterId: string
    versionStore: { createSnapshot: (projectId: string, chapterId: string, content: string, note: string) => Promise<unknown> }
    toast: { add: (message: string, type?: ToastType, duration?: number) => void }
    onExtractTitle?: (title: string) => void
  }) {
    if (!pendingAIResult.value)
      return

    let { content, selectionStart: start, selectionEnd: end } = pendingAIResult.value

    if (action === 'insert' || action === 'replace') {
      // Extract title if present (e.g., # Title or 第X章 Title)
      const lines = content.split('\n')
      if (lines.length > 0) {
        const firstLine = lines[0].trim()
        if (firstLine.startsWith('#')) {
          const title = firstLine.replace(/^#+\s*/, '').trim()
          if (title && deps.onExtractTitle) {
            deps.onExtractTitle(title)
            // Remove title line and following empty lines
            lines.shift()
            while (lines.length > 0 && lines[0].trim() === '') {
              lines.shift()
            }
            content = lines.join('\n')
          }
        }
      }

      if (start !== end && action === 'replace') {
        draft.value = draft.value.substring(0, start) + content + draft.value.substring(end)
      }
      else {
        draft.value = draft.value.substring(0, start) + content + draft.value.substring(start)
      }
      deps.toast.add(T.ai_applied, 'success')
    }
    else if (action === 'backup') {
      deps.versionStore.createSnapshot(deps.projectId, deps.currentChapterId, content, `AI Suggestion (${pendingAIResult.value.source})`)
      deps.toast.add(T.ai_saved_backup, 'success')
    }

    pendingAIResult.value = null
  }

  function buildAIPrompt(type: AIActionType['type']): string {
    if (type === 'quality') {
      return `请作为一名极其严苛的文学编辑和逻辑审查官，针对当前章节的正文内容，结合我提供的全方位上下文（全局背景、叙事路径、人物深度设定、章节心理路程），进行一次全面的“质量审计”。

审计维度与要求：
1. **主题偏离度检查**：当前内容是否背离了作品的全局主题？是否有为了写而写的“注水”嫌疑？
2. **角色一致性审计**：
   - 识别文中出现的所有角色。
   - 是否出现了未在设定中提及的冗余角色？
   - 主角及关键配角的言行、心理活动是否符合其“欲望、恐惧、弧光”的设定？是否出现了 OOC（人设崩坏）？
3. **剧情走向校验**：本章内容是否精准完成了大纲预设的转折？是否因为局部描写过于发散而导致剧情走向偏离了原本的“叙事路径”？
4. **冗余与废话分析**：是否存在不必要的对话或与主线无关的支线描写？

请按以下格式给出审计报告：
### 【审计总结】
（一句话概括本章质量现状及核心风险）

### 【维度得分 (1-10)】
- 主题契合度：
- 角色一致性：
- 剧情推进度：

### 【具体风险点与修正建议】
- [风险类型] 描述：... 建议：...

### 【亮点记录】
（值得保留的精彩描写或精妙处理）`
    }
    if (type === 'draft') {
      return `请作为一名资深的文学创作者，根据我提供的全方位上下文（全局背景、叙事路径、人物深度设定、章节心理路程），为我撰写本章的正文。

核心要求：
1. **心理驱动 (Psychologically Driven)**：角色的每一个动作和对话都必须源于其深层动机（欲望与恐惧）。请重点刻画角色在当前“情感弧光”节点下的心理流变。
2. **弧光对齐**：确保角色的行为符合其长期“人物弧光”设定。如果角色正处于转变期，请体现出那种转变的挣扎感。
3. **剧情轨迹管控**：本章剧情必须顺应作品的“宏观轨迹”和“核心冲突”，确保其在整本书的剧情走向中具有实质性的推进作用。
4. **侧重描写 (Show, Don't Tell)**：通过感官细节、环境渲染、人物动作和神态来表现复杂的心理路程。
5. **完成硬约束**：落实关键事件，确保角色表现符合其性格内核。
6. **纯正文输出**：直接开始，严禁任何前言、分析或对创作过程的描述。`
    }
    if (type === 'continue') {
      return `请作为我的写作助理，续写后续剧情。

续写要求：
1. **心理连贯**：深入挖掘前文中建立的人物心理状态，确保续写的反应符合其深度设定。
2. **情感顺承**：严格遵循本章的“情感/心理弧光流向”，实现情绪的平稳过渡或爆发。
3. **轨迹自洽**：确保剧情发展顺接前文的同时，不偏离作品全局设定的走向。
4. **文风对齐**：继承前文的笔触、节奏和情绪基调。
5. **直接续写**：不要解释，直接开始续写正文。

当前正文末尾内容参考：
"${draft.value.slice(-600)}"`
    }
    const actionMap = {
      polish: '请润色以下文字，优化文采与表达，使其更有文学张力，同时保持原意不变',
      expand: '请扩写以下文字，增加更多的感官细节描写、环境渲染和细腻的人物心理活动',
      shorten: '请精简以下文字，去除冗余，保持核心冲突和信息点，使其更加干练',
    }
    return `请${actionMap[type]}，确保符合作品整体风格：\n\n"${selectedText.value}"`
  }

  function initPendingResult(type: AIActionType['type'], metadata?: { provider?: string, model?: string, snapshotId?: string }) {
    pendingAIResult.value = {
      content: '',
      source: type,
      selectionStart: selectionStart.value,
      selectionEnd: selectionEnd.value,
      originalText: selectedText.value,
      modelProvider: metadata?.provider,
      modelName: metadata?.model,
      contextSnapshotId: metadata?.snapshotId,
    }
  }

  function updateConsistency(report?: ConsistencyGuardReport, loading?: boolean) {
    if (pendingAIResult.value) {
      if (report)
        pendingAIResult.value.consistencyReport = report
      if (loading !== undefined)
        pendingAIResult.value.isCheckingConsistency = loading
    }
  }

  function clearPendingResult() {
    pendingAIResult.value = null
  }

  return {
    pendingAIResult,
    applyAIResult,
    updateConsistency,
    confirmAIResult,
    buildAIPrompt,
    initPendingResult,
    clearPendingResult,
  }
}
