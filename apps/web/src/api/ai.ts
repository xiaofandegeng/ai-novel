import type { AIMessage, AIScene } from '@ai-novel/shared'

export interface ChatStreamOptions {
  projectId?: string
  context?: string
  model?: string
  scene?: AIScene
}

export interface GenerateAIOptions {
  projectId: string
  scene: AIScene
  chapterId?: string
  selectedText?: string
  userInstruction?: string
}

export async function generateAIStream(options: GenerateAIOptions): Promise<Response> {
  const response = await fetch(`/api/projects/${options.projectId}/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })

  if (!response.ok) {
    const json = await response.json().catch(() => null)
    throw new Error(json?.error || 'AI 生成失败')
  }

  return response
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

export async function readChatStream(response: Response, onChunk?: (text: string) => void): Promise<string> {
  if (!response.body)
    throw new Error('AI response body is empty')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    const chunk = decoder.decode(value)
    result += chunk
    if (onChunk)
      onChunk(result)
  }

  return result
}

export async function checkConsistency(projectId: string, input: {
  chapterId?: string
  scene: AIScene
  generatedText: string
  sourceInstruction?: string
}) {
  const response = await fetch(`/api/projects/${projectId}/consistency/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const json = await response.json()
  if (!response.ok) {
    throw new Error(json.error || '一致性检查失败')
  }

  return json.data
}

export async function triggerChapterPostprocess(projectId: string, chapterId: string, content: string) {
  const response = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/postprocess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, trigger: 'manual_save' }),
  })

  const json = await response.json()
  if (!response.ok) {
    throw new Error(json.error || '章节记忆更新失败')
  }

  return json.data
}

export async function getChapterMemory(projectId: string, chapterId: string) {
  const response = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/memory`)
  const json = await response.json()
  if (!response.ok) {
    throw new Error(json.error || '获取章节记忆失败')
  }
  return json.data
}
