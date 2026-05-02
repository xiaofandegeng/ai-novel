import type { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import { buildProjectAIContext, renderAIContext } from '../services/ai-context.service'
import { assertAIConfigured, streamChat } from '../services/ai.service'
import { buildPersonaPromptForProject } from '../services/persona-prompt.service'
import { fail } from '../utils'

export function registerAiRoutes(app: Hono) {
  // 统一 AI 生成接口 (基于上下文工程)
  app.post('/api/projects/:projectId/ai/generate', async (c) => {
    const projectId = c.req.param('projectId')
    const { scene, chapterId, selectedText, userInstruction } = await c.req.json()

    try {
      await assertAIConfigured()
      const context = await buildProjectAIContext({
        projectId,
        scene,
        chapterId,
        selectedText,
        userInstruction,
      })

      const renderedPrompt = renderAIContext(context)

      return streamText(c, async (stream) => {
        try {
          const messages = [{ role: 'user' as const, content: renderedPrompt }]
          for await (const chunk of streamChat(messages)) {
            await stream.write(chunk)
          }
        }
        catch (error: any) {
          console.error('AI Generate Stream Error:', error)
          await stream.write(`\n\n[Error: ${error.message}]`)
        }
      })
    }
    catch (e: any) {
      return c.json(fail(e.message), 400)
    }
  })

  app.post('/api/ai/chat', async (c) => {
    const { messages, context, model, projectId, scene } = await c.req.json()

    if (!messages || !messages.length)
      return c.json(fail('Messages are required'), 400)

    try {
      await assertAIConfigured()
    }
    catch (e: any) {
      return c.json(fail(e.message), 400)
    }

    const personaPrompt = projectId
      ? await buildPersonaPromptForProject(projectId, scene || 'chat')
      : null

    return streamText(c, async (stream) => {
      try {
        for await (const chunk of streamChat(messages, { context, model, personaPrompt })) {
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
