import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import process from 'node:process'
import OpenAI from 'openai'

export function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.AI_API_KEY || 'your-key',
    baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
  })
}

export async function* streamChat(
  messages: ChatCompletionMessageParam[],
  context?: string,
  model?: string,
) {
  if (!messages || !messages.length) {
    throw new Error('Messages are required')
  }

  const openai = createOpenAIClient()

  const systemMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: 'You are an expert novelist and creative writing assistant. Help the author expand their world, brainstorm character motivations, or draft scenes based on the provided context.',
    },
  ]
  if (context) {
    systemMessages.push({ role: 'system', content: `Context: ${context}` })
  }

  const response = await openai.chat.completions.create({
    model: model || process.env.AI_MODEL || 'gpt-4o-mini',
    messages: [...systemMessages, ...messages],
    stream: true,
  })

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content || ''
    if (content) {
      yield content
    }
  }
}
