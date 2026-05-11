import type { ConsistencyGuardReport } from '@ai-novel/shared'
import { ref, watch } from 'vue'
import { chatStream, checkConsistency, readChatStream } from '@/api/ai'
import { useAIStream } from '@/composables/useAIStream'
import { getErrorMessage } from '@/utils/error-message'

export type AIScene = 'outline' | 'draft' | 'polish' | 'quality' | 'chat' | 'story_bible' | 'knowledge' | 'persona_training' | 'persona_drift'

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
  model?: string
  error?: boolean
  consistencyReport?: ConsistencyGuardReport
  isCheckingConsistency?: boolean
  consistencyCheckFailed?: boolean
  consistencyCheckError?: string
}

export function useAIAssistantSession() {
  const { isStreaming, streamedContent, stream: streamAI } = useAIStream()

  const messages = ref<AIMessage[]>([])
  const selectedModel = ref('gpt-4o-mini')
  const aiNotConfigured = ref(false)

  const consistencyScenes = new Set(['draft', 'outline', 'polish', 'quality'])

  watch(streamedContent, (text) => {
    if (isStreaming.value && messages.value.length > 0) {
      const last = messages.value[messages.value.length - 1]
      if (last.role === 'assistant')
        last.content = text
    }
  })

  async function send(
    userMsg: string,
    opts: { projectId: string, scene?: AIScene, chapterId?: string, sceneId?: string, context?: string },
  ) {
    if (!userMsg.trim() || isStreaming.value)
      return

    aiNotConfigured.value = false
    messages.value.push({ role: 'user', content: userMsg.trim() })
    messages.value.push({ role: 'assistant', content: '', model: selectedModel.value })
    const lastIndex = messages.value.length - 1

    try {
      let result: string
      if (opts.scene && opts.scene !== 'chat') {
        result = await streamAI({
          projectId: opts.projectId,
          scene: opts.scene,
          chapterId: opts.chapterId,
          sceneId: opts.sceneId,
          userInstruction: userMsg,
        })
      }
      else {
        isStreaming.value = true
        const response = await chatStream(
          [{ role: 'user', content: userMsg }],
          { projectId: opts.projectId, context: opts.context, model: selectedModel.value, scene: opts.scene || 'chat' },
        )
        result = await readChatStream(response, (text) => {
          messages.value[lastIndex].content = text
        })
        isStreaming.value = false
      }

      messages.value[lastIndex].content = result

      if (opts.scene && consistencyScenes.has(opts.scene)) {
        messages.value[lastIndex].isCheckingConsistency = true
        try {
          const report = await checkConsistency(opts.projectId, {
            chapterId: opts.chapterId,
            sceneId: opts.sceneId,
            scene: opts.scene,
            generatedText: messages.value[lastIndex].content,
            sourceInstruction: userMsg,
          })
          messages.value[lastIndex].consistencyReport = report
        }
        catch (e: any) {
          messages.value[lastIndex].consistencyCheckFailed = true
          messages.value[lastIndex].consistencyCheckError = e.message || getErrorMessage('ai_consistency')
        }
        finally {
          messages.value[lastIndex].isCheckingConsistency = false
        }
      }
    }
    catch (error: any) {
      const msg = error.message || 'AI 请求失败'
      messages.value[lastIndex].content = msg
      messages.value[lastIndex].error = true
      if (msg.includes('AI 服务未配置'))
        aiNotConfigured.value = true
    }
    finally {
      if (messages.value[lastIndex].content.includes('[Error:'))
        messages.value[lastIndex].error = true
    }
  }

  function clearChat() {
    messages.value = []
  }

  return {
    isStreaming,
    messages,
    selectedModel,
    aiNotConfigured,
    send,
    clearChat,
  }
}
