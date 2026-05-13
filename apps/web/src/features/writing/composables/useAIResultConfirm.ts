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
  }) {
    if (!pendingAIResult.value)
      return

    const { content, selectionStart: start, selectionEnd: end } = pendingAIResult.value

    if (action === 'insert' || action === 'replace') {
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
      return '请根据本章大纲、创作目标、关键事件及登场人物设定，为我撰写本章的正文初稿。要求：保持叙事张力，注重细节描写。字数请根据剧情张力自由发挥，或您可以在下方输入框补充具体字数要求。'
    }
    if (type === 'continue') {
      return `请根据前文剧情和已有风格，继续续写后续内容。确保语气连贯，逻辑自洽。当前正文末尾：\n"${draft.value.slice(-500)}"`
    }
    const actionMap = {
      polish: '润色并优化以下文字的文采和表达',
      expand: '扩写以下文字，增加更多的感官细节和心理描写',
      shorten: '精简并概括以下文字，保持核心意思不变',
    }
    return `请${actionMap[type]}，确保符合作品整体风格：\n"${selectedText.value}"`
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

  return {
    pendingAIResult,
    applyAIResult,
    updateConsistency,
    confirmAIResult,
    buildAIPrompt,
    initPendingResult,
  }
}
