import type { ConsistencyGuardReport } from '@ai-novel/shared'
import type { Ref } from 'vue'
import { ref } from 'vue'
import { T } from '@/utils/toast-message'

export interface PendingAIResult {
  content: string
  source: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft' | 'chat'
  selectionStart: number
  selectionEnd: number
  originalText: string
  consistencyReport?: ConsistencyGuardReport
  isCheckingConsistency?: boolean
}

export interface AIActionType {
  type: 'continue' | 'polish' | 'expand' | 'shorten' | 'draft'
}

type ToastType = 'success' | 'info' | 'warning' | 'error'

export function useAIResultConfirm(
  draft: Ref<string>,
  selectedText: Ref<string>,
  selectionStart: Ref<number>,
  selectionEnd: Ref<number>,
) {
  const pendingAIResult = ref<PendingAIResult | null>(null)

  function applyAIResult(text: string) {
    if (!pendingAIResult.value || pendingAIResult.value.source === 'chat') {
      pendingAIResult.value = {
        content: text,
        source: 'chat',
        selectionStart: selectionStart.value,
        selectionEnd: selectionEnd.value,
        originalText: selectedText.value,
      }
    }
    else {
      pendingAIResult.value.content = text
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
    if (type === 'draft') {
      return `请作为一名资深的网文作家，根据我提供的详细上下文（世界观、大纲、人物设定、硬约束），为我撰写本章的正文初稿。

写作要求：
1. **侧重描写 (Show, Don't Tell)**：避免平铺直叙，通过环境渲染、感官细节、人物动作和神态来表现剧情和情绪。
2. **深度利用设定**：必须体现出文中角色的性格特征和核心动机。如果设定中有“不为人知的秘密”，请以微妙的方式在剧情或心理描写中体现。
3. **完成硬约束**：确保大纲中要求的关键事件得到落实，必须出场的人物有合理的表现。
4. **节奏把控**：保持叙事张力，为结尾的悬念做好铺垫。
5. **纯正文输出**：直接开始正文创作，绝对不要包含任何前言、分析或对创作过程的描述。
6. **标题建议**：如果为本章想好了标题，请在第一行以 "# 标题" 的格式提供。`
    }
    if (type === 'continue') {
      return `请作为我的写作助理，续写后续剧情。

续写要求：
1. **风格一致**：继承前文的文风、语调、叙事节奏和情绪基调。
2. **逻辑自洽**：确保人物行为符合其设定，剧情发展顺接前文，不出现逻辑断层。
3. **推进剧情**：参考上下文中的大纲目标，向下一个关键事件稳步推进。
4. **直接续写**：不要解释，直接开始续写正文。

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

  function initPendingResult(type: AIActionType['type']) {
    pendingAIResult.value = {
      content: '',
      source: type,
      selectionStart: selectionStart.value,
      selectionEnd: selectionEnd.value,
      originalText: selectedText.value,
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
