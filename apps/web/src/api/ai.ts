import type { AIMessage } from '@ai-novel/shared'

export interface ChatStreamOptions {
  projectId?: string
  context?: string
  model?: string
  scene?: 'outline' | 'draft' | 'polish' | 'quality' | 'chat'
}

export async function chatStream(messages: AIMessage[], options?: ChatStreamOptions): Promise<Response> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      projectId: options?.projectId,
      context: options?.context,
      model: options?.model,
      scene: options?.scene,
    }),
  })

  if (!response.ok) {
    const json = await response.json().catch(() => null)
    throw new Error(json?.error || 'AI 请求失败')
  }

  return response
}

export async function readChatStream(response: Response): Promise<string> {
  if (!response.body)
    throw new Error('AI response body is empty')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    result += decoder.decode(value)
  }

  return result
}
