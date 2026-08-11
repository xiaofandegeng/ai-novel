import type { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import { fail, success } from '../../shared/http/responses'
import { errorMessage } from '../../shared/utils'
import { AuthoringEventService } from '../narrative/authoring-event.service'
import { renderAIContext } from './ai-context-renderer'
import { createAIContextSnapshot, estimateTokens } from './ai-context-snapshot.service'
import { buildProjectAIContext } from './ai-context.service'
import { assertAIConfigured, getEffectiveAISettings, streamChat } from './ai.service'
import { runConsistencyGuard } from './consistency-guard.service'
import { buildPersonaPromptForProject } from './persona-prompt.service'

export function registerAiRoutes(app: Hono) {
  // 统一 AI 生成接口 (基于上下文工程)
  app.post('/api/projects/:projectId/ai/generate', async (c) => {
    const projectId = c.req.param('projectId')
    const { scene, chapterId, volumeId, sceneId, selectedText, userInstruction, model } = await c.req.json()

    try {
      await assertAIConfigured(projectId)
      const context = await buildProjectAIContext({
        projectId,
        scene,
        chapterId,
        volumeId,
        sceneId,
        selectedText,
        userInstruction,
      })

      const renderedPrompt = renderAIContext(context)

      const settings = await getEffectiveAISettings(projectId)
      const effectiveModel = model || settings.model

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
      })

      // Log event
      AuthoringEventService.logEvent({
        projectId,
        chapterId,
        sceneId,
        eventType: 'ai_generation_started',
        source: 'ai',
        payload: { scene, taskType: scene, model: effectiveModel, requestId },
      }).catch(() => {})

      c.header('X-AI-Request-Id', requestId)
      c.header('X-AI-Model', effectiveModel)
      c.header('X-AI-Provider', settings.provider)

      return streamText(c, async (stream) => {
        try {
          const messages = [{ role: 'user' as const, content: renderedPrompt }]
          for await (const chunk of streamChat(messages, { projectId, model })) {
            await stream.write(chunk)
          }
        }
        catch (error: unknown) {
          console.error('AI Generate Stream Error:', error)
          await stream.write(`\n\n[Error: ${errorMessage(error)}]`)
        }
      })
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 400)
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
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 500)
    }
  })

  app.post('/api/ai/chat', async (c) => {
    const { messages, context, model, projectId, scene } = await c.req.json()

    if (!messages || !messages.length)
      return c.json(fail('Messages are required'), 400)
    if (typeof projectId !== 'string' || !projectId.trim())
      return c.json(fail('Project ID is required'), 400)

    try {
      await assertAIConfigured(projectId)
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 400)
    }

    const personaPrompt = projectId
      ? await buildPersonaPromptForProject(projectId, scene || 'chat')
      : null

    return streamText(c, async (stream) => {
      try {
        for await (const chunk of streamChat(messages, { projectId, context, model, personaPrompt })) {
          await stream.write(chunk)
        }
      }
      catch (error: unknown) {
        console.error('AI Stream Error:', error)
        await stream.write(`\n\n[Error: ${errorMessage(error)}]`)
      }
    })
  })
}
