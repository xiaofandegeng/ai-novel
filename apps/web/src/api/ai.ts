import type { AIMessage } from '@ai-novel/shared'

export interface ChatStreamOptions {
  projectId?: string
  context?: string
  model?: string
}

export function chatStream(messages: AIMessage[], options?: ChatStreamOptions): Promise<Response> {
  return fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      projectId: options?.projectId,
      context: options?.context,
      model: options?.model,
    }),
  })
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
