import type { GenerateAIOptions } from '@ai-novel/shared'
import { ref } from 'vue'
import { generateAIStream, readChatStream } from '../api/ai'
import { getErrorMessage } from '../utils/error-message'

export function useAIStream() {
  const isStreaming = ref(false)
  const streamedContent = ref('')
  const error = ref<string | null>(null)

  async function stream(options: GenerateAIOptions): Promise<string> {
    isStreaming.value = true
    streamedContent.value = ''
    error.value = null
    try {
      const response = await generateAIStream(options)
      return await readChatStream(response, (text) => {
        streamedContent.value = text
      })
    }
    catch (e: any) {
      error.value = e.message || getErrorMessage('ai_generate')
      throw e
    }
    finally {
      isStreaming.value = false
    }
  }

  return { isStreaming, streamedContent, error, stream }
}
