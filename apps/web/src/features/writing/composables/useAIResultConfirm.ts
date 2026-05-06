import type { Ref } from 'vue'
import { ref } from 'vue'
import { T } from '@/utils/toast-message'

export interface PendingAIResult {
  content: string
  source: 'continue' | 'polish' | 'expand' | 'shorten' | 'chat'
  selectionStart: number
  selectionEnd: number
  originalText: string
}

export interface AIActionType {
  type: 'continue' | 'polish' | 'expand' | 'shorten'
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
    if (type === 'continue') {
      return `Continue writing the story from this exact point. Stay consistent with the current style and tone. Current draft ending: "${draft.value.slice(-500)}"`
    }
    return `Please ${type === 'polish' ? 'polish and improve the prose of' : type === 'expand' ? 'expand and add more sensory details to' : 'summarize and make more concise'} the following text while maintaining its core meaning: "${selectedText.value}"`
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

  return {
    pendingAIResult,
    applyAIResult,
    confirmAIResult,
    buildAIPrompt,
    initPendingResult,
  }
}
