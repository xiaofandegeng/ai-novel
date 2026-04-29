import type { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import { streamChat } from '../services/ai.service'
import { fail } from '../utils'

export function registerAiRoutes(app: Hono) {
  app.post('/api/ai/chat', async (c) => {
    const { messages, context, model } = await c.req.json()

    if (!messages || !messages.length)
      return c.json(fail('Messages are required'), 400)

    return streamText(c, async (stream) => {
      try {
        for await (const chunk of streamChat(messages, context, model)) {
          await stream.write(chunk)
        }
      }
      catch (error: any) {
        console.error('AI Stream Error:', error)
        await stream.write(`\n\n[Error: ${error.message}]`)
      }
    })
  })
}
