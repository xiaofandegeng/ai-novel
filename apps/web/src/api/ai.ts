import type { AIMessage, AIScene, ChatStreamOptions, ConsistencyGuardReport, GenerateAIOptions } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export type { ChatStreamOptions, GenerateAIOptions }

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
    throw new Error('AI 响应为空')

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

export function checkConsistency(projectId: string, input: {
  chapterId?: string
  sceneId?: string
  scene: AIScene
  generatedText: string
  sourceInstruction?: string
}) {
  return apiPost<ConsistencyGuardReport>(`/api/projects/${projectId}/consistency/check`, input)
}

export function triggerChapterPostprocess(projectId: string, chapterId: string, content: string) {
  return apiPost(`/api/projects/${projectId}/chapters/${chapterId}/postprocess`, { content, trigger: 'manual_save' })
}

export function getChapterMemory(projectId: string, chapterId: string) {
  return apiGet(`/api/projects/${projectId}/chapters/${chapterId}/memory`)
}

export { fetchAISettings } from './settings'
