import type { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import { renderAIContext } from '../services/ai-context-renderer'
import { createAIContextSnapshot, estimateTokens } from '../services/ai-context-snapshot.service'
import { buildProjectAIContext } from '../services/ai-context.service'
import { assertAIConfigured, streamChat } from '../services/ai.service'
import { runConsistencyGuard } from '../services/consistency-guard.service'
import { buildPersonaPromptForProject } from '../services/persona-prompt.service'
import { fail, success } from '../utils'

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

      // Write context snapshot (don't block the stream on failure)
      const requestId = crypto.randomUUID()
      createAIContextSnapshot({
        projectId,
        chapterId,
        scene,
        requestId,
        contextPayload: context,
        renderedPromptPreview: renderedPrompt,
        tokenEstimate: estimateTokens(renderedPrompt),
      }).catch(() => {})

      c.header('X-AI-Request-Id', requestId)

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

  // 一致性守卫接口
  app.post('/api/projects/:projectId/consistency/check', async (c) => {
    const projectId = c.req.param('projectId')
    const input = await c.req.json()

    try {
      const report = await runConsistencyGuard(projectId, input)
      return c.json(success(report))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
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
