import type { Hono } from 'hono'
import process from 'node:process'
import { streamText } from 'hono/streaming'
import OpenAI from 'openai'
import { fail } from '../utils'

// Initialize OpenAI client
// In a real app, these would come from env or user settings
const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || 'your-key',
  baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
})

export function registerAiRoutes(app: Hono) {
  app.post('/api/ai/chat', async (c) => {
    const { messages, context, model } = await c.req.json()

    if (!messages || !messages.length) {
      return c.json(fail('Messages are required'), 400)
    }

    return streamText(c, async (stream) => {
      try {
        const response = await openai.chat.completions.create({
          model: model || process.env.AI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert novelist and creative writing assistant. Help the author expand their world, brainstorm character motivations, or draft scenes based on the provided context.',
            },
            ...(context ? [{ role: 'system', content: `Context: ${context}` } as any] : []),
            ...messages,
          ],
          stream: true,
        })

        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || ''
          if (content) {
            await stream.write(content)
          }
        }
      }
      catch (error: any) {
        console.error('AI Stream Error:', error)
        await stream.write(`\n\n[Error: ${error.message}]`)
      }
    })
  })
}
