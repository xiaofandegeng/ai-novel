import type { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { projectPersonaConfigs } from '../db/schema'
import * as personaService from '../services/persona.service'
import { fail, generateId, now, success } from '../utils'

export function registerPersonaRoutes(app: Hono) {
  // ─── Training Sets ───

  app.get('/api/persona/training-sets', async (c) => {
    const rows = await personaService.listTrainingSets()
    return c.json(success(rows))
  })

  app.post('/api/persona/training-sets', async (c) => {
    const body = await c.req.json()
    if (!body.name)
      return c.json(fail('训练集名称不能为空'), 400)
    const row = await personaService.createTrainingSet(body)
    return c.json(success(row), 201)
  })

  app.get('/api/persona/training-sets/:id', async (c) => {
    const row = await personaService.getTrainingSet(c.req.param('id'))
    if (!row)
      return c.json(fail('训练集不存在'), 404)
    return c.json(success(row))
  })

  app.patch('/api/persona/training-sets/:id', async (c) => {
    const body = await c.req.json()
    const row = await personaService.updateTrainingSet(c.req.param('id'), body)
    if (!row)
      return c.json(fail('训练集不存在'), 404)
    return c.json(success(row))
  })

  app.delete('/api/persona/training-sets/:id', async (c) => {
    const row = await personaService.deleteTrainingSet(c.req.param('id'))
    if (!row)
      return c.json(fail('训练集不存在'), 404)
    return c.json(success(row, '训练集已删除'))
  })

  // ─── Reference Works ───

  app.get('/api/persona/training-sets/:id/works', async (c) => {
    const rows = await personaService.listWorks(c.req.param('id'))
    return c.json(success(rows))
  })

  app.post('/api/persona/training-sets/:id/works', async (c) => {
    const body = await c.req.json()
    if (!body.title)
      return c.json(fail('作品标题不能为空'), 400)
    const row = await personaService.createWork(c.req.param('id'), body)
    return c.json(success(row), 201)
  })

  app.get('/api/persona/works/:workId', async (c) => {
    const row = await personaService.getWork(c.req.param('workId'))
    if (!row)
      return c.json(fail('作品不存在'), 404)
    return c.json(success(row))
  })

  app.delete('/api/persona/works/:workId', async (c) => {
    const row = await personaService.deleteWork(c.req.param('workId'))
    if (!row)
      return c.json(fail('作品不存在'), 404)
    return c.json(success(row, '作品已删除'))
  })

  // ─── Chapter Splitting ───

  app.post('/api/persona/works/:workId/split', async (c) => {
    const body = await c.req.json()
    if (!body.content)
      return c.json(fail('内容不能为空'), 400)
    try {
      const result = await personaService.splitWorkChapters(c.req.param('workId'), body.content)
      if (typeof result === 'object' && 'error' in result && result.error)
        return c.json(fail(result.error), 404)
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
    }
  })

  // ─── Chapter Analysis ───

  app.get('/api/persona/works/:workId/chapters', async (c) => {
    const rows = await personaService.listWorkChapters(c.req.param('workId'))
    return c.json(success(rows))
  })

  app.get('/api/persona/chapters/:chapterId/analysis', async (c) => {
    const row = await personaService.getChapterAnalysis(c.req.param('chapterId'))
    if (!row)
      return c.json(fail('分析结果不存在'), 404)
    return c.json(success(row))
  })

  app.post('/api/persona/works/:workId/analyze', async (c) => {
    try {
      const result = await personaService.analyzeAllChapters(c.req.param('workId'))
      if (typeof result === 'object' && 'error' in result && result.error)
        return c.json(fail(result.error), 400)
      if (!('error' in result) && result.status === 'failed')
        return c.json(fail(`章节分析全部失败：${result.errors[0] || '未知错误'}`), 400)
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
    }
  })

  // ─── Work Style Report ───

  app.get('/api/persona/works/:workId/analysis-summary', async (c) => {
    const summary = await personaService.getWorkAnalysisSummary(c.req.param('workId'))
    if (!summary)
      return c.json(fail('作品不存在'), 404)
    return c.json(success(summary))
  })

  app.get('/api/persona/works/:workId/analysis-errors', async (c) => {
    const work = await personaService.getWork(c.req.param('workId'))
    if (!work)
      return c.json(fail('作品不存在'), 404)
    const rows = await personaService.listWorkAnalysisErrors(c.req.param('workId'))
    return c.json(success(rows))
  })

  app.post('/api/persona/works/:workId/retry-failed-analyses', async (c) => {
    try {
      const work = await personaService.getWork(c.req.param('workId'))
      if (!work)
        return c.json(fail('作品不存在'), 404)
      const result = await personaService.retryFailedChapterAnalyses(c.req.param('workId'))
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
    }
  })

  app.get('/api/persona/works/:workId/style-report', async (c) => {
    const row = await personaService.getWorkStyleReport(c.req.param('workId'))
    if (!row)
      return c.json(fail('风格报告不存在'), 404)
    return c.json(success(row))
  })

  app.post('/api/persona/works/:workId/style-report', async (c) => {
    try {
      const result = await personaService.generateWorkStyleReport(c.req.param('workId'))
      if (typeof result === 'object' && 'error' in result && result.error)
        return c.json(fail(result.error), 400)
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
    }
  })

  // ─── Writing Personas ───

  app.get('/api/personas', async (c) => {
    const rows = await personaService.listPersonas()
    return c.json(success(rows))
  })

  app.get('/api/personas/published', async (c) => {
    const rows = await personaService.listPublishedPersonas()
    return c.json(success(rows))
  })

  app.post('/api/personas', async (c) => {
    const body = await c.req.json()
    if (!body.name)
      return c.json(fail('人格名称不能为空'), 400)
    const row = await personaService.createPersona(body)
    return c.json(success(row), 201)
  })

  app.get('/api/personas/:personaId', async (c) => {
    const row = await personaService.getPersona(c.req.param('personaId'))
    if (!row)
      return c.json(fail('人格不存在'), 404)
    return c.json(success(row))
  })

  app.patch('/api/personas/:personaId', async (c) => {
    const body = await c.req.json()
    const row = await personaService.updatePersona(c.req.param('personaId'), body)
    if (!row)
      return c.json(fail('人格不存在'), 404)
    return c.json(success(row))
  })

  app.delete('/api/personas/:personaId', async (c) => {
    const row = await personaService.deletePersona(c.req.param('personaId'))
    if (!row)
      return c.json(fail('人格不存在'), 404)
    return c.json(success(row, '人格已删除'))
  })

  // ─── Generate Persona from Training Set ───

  app.post('/api/persona/training-sets/:id/generate-persona', async (c) => {
    const body = await c.req.json()
    if (!body.name)
      return c.json(fail('人格名称不能为空'), 400)
    try {
      const result = await personaService.generatePersonaFromTrainingSet(c.req.param('id'), body)
      if (typeof result === 'object' && 'error' in result && result.error)
        return c.json(fail(result.error), 400)
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
    }
  })

  // ─── Publish Persona ───

  app.post('/api/personas/:personaId/publish', async (c) => {
    try {
      const result = await personaService.publishPersona(c.req.param('personaId'))
      if (typeof result === 'object' && 'error' in result && result.error)
        return c.json(fail(result.error), 400)
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
    }
  })

  // ─── Project Persona Config ───

  app.get('/api/projects/:projectId/persona-config', async (c) => {
    const projectId = c.req.param('projectId')
    const [row] = await db.select().from(projectPersonaConfigs).where(eq(projectPersonaConfigs.projectId, projectId))
    if (!row)
      return c.json(success(null))
    return c.json(success(row))
  })

  app.put('/api/projects/:projectId/persona-config', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    if (!body.personaId)
      return c.json(fail('人格ID不能为空'), 400)

    // Verify persona exists and is published
    const persona = await personaService.getPersona(body.personaId)
    if (!persona)
      return c.json(fail('人格不存在'), 404)
    if (persona.status !== 'published')
      return c.json(fail('只能使用已发布的人格'), 400)

    // Upsert
    const [existing] = await db.select().from(projectPersonaConfigs).where(eq(projectPersonaConfigs.projectId, projectId))

    function boolToInt(value: unknown, fallback: number) {
      if (value === undefined)
        return fallback
      return value ? 1 : 0
    }

    const fields = {
      personaId: body.personaId,
      strength: typeof body.strength === 'number' ? Math.min(100, Math.max(0, body.strength)) : 65,
      enabledForOutline: boolToInt(body.enabledForOutline, existing?.enabledForOutline ?? 1),
      enabledForDraft: boolToInt(body.enabledForDraft, existing?.enabledForDraft ?? 1),
      enabledForPolish: boolToInt(body.enabledForPolish, existing?.enabledForPolish ?? 0),
      enabledForQualityReview: boolToInt(body.enabledForQualityReview, existing?.enabledForQualityReview ?? 0),
      projectOverrides: body.projectOverrides || null,
      disabledRules: body.disabledRules || null,
      updatedAt: now(),
    }

    if (existing) {
      const [row] = await db.update(projectPersonaConfigs).set(fields).where(eq(projectPersonaConfigs.id, existing.id)).returning()
      return c.json(success(row))
    }
    else {
      const row = { id: generateId(), projectId, ...fields }
      await db.insert(projectPersonaConfigs).values(row)
      return c.json(success(row))
    }
  })

  // ─── Persona Preview & Drift Check ───

  app.post('/api/projects/:projectId/persona-preview', async (c) => {
    const projectId = c.req.param('projectId')
    const [config] = await db.select().from(projectPersonaConfigs).where(eq(projectPersonaConfigs.projectId, projectId))
    if (!config)
      return c.json(success(null))

    const persona = await personaService.getPersona(config.personaId)
    if (!persona)
      return c.json(fail('关联的人格不存在'), 404)

    const strength = config.strength
    let injectionPrompt = ''

    if (strength <= 30) {
      injectionPrompt = `参考以下写作人格的高层原则，但优先保持当前小说已有风格：\n核心爽点：${persona.coreAppeal || '无'}\n禁止事项：${persona.forbiddenRules || '无'}`
    }
    else if (strength <= 60) {
      injectionPrompt = `请参考以下节奏和章节结构，但不要明显模仿语言：\n节奏规则：${persona.pacingRules || '无'}\n章节规则：${persona.chapterRules || '无'}\n结尾钩子：${persona.hookRules || '无'}`
    }
    else if (strength <= 80) {
      injectionPrompt = `本次生成应明显遵循该写作人格：\n核心爽点：${persona.coreAppeal || '无'}\n节奏规则：${persona.pacingRules || '无'}\n冲突规则：${persona.conflictRules || '无'}\n人物规则：${persona.characterRules || '无'}\n章节规则：${persona.chapterRules || '无'}\n结尾钩子：${persona.hookRules || '无'}\n禁止事项：${persona.forbiddenRules || '无'}`
    }
    else {
      injectionPrompt = `强烈采用该人格的节奏、冲突和章节结构，但不得复刻参考作品的具体桥段、专名、连续表达或标志性场景。\n核心爽点：${persona.coreAppeal || '无'}\n节奏规则：${persona.pacingRules || '无'}\n冲突规则：${persona.conflictRules || '无'}\n人物规则：${persona.characterRules || '无'}\n语言规则：${persona.languageRules || '无'}\n章节规则：${persona.chapterRules || '无'}\n结尾钩子：${persona.hookRules || '无'}\n禁止事项：${persona.forbiddenRules || '无'}\n相似度防护：${persona.similarityGuardrails || '无'}\n生成后必须自检相似度风险。`
    }

    return c.json(success({ strength, injectionPrompt, personaName: persona.name }))
  })

  app.post('/api/projects/:projectId/persona-drift-check', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    if (!body.content)
      return c.json(fail('内容不能为空'), 400)

    const [config] = await db.select().from(projectPersonaConfigs).where(eq(projectPersonaConfigs.projectId, projectId))
    if (!config)
      return c.json(success(null))

    const persona = await personaService.getPersona(config.personaId)
    if (!persona)
      return c.json(fail('关联的人格不存在'), 404)

    try {
      const { assertAIConfigured, createOpenAIClient } = await import('../services/ai.service')
      const settings = await assertAIConfigured()
      const client = createOpenAIClient(settings)

      const prompt = `你是一位写作人格一致性检测专家。请根据以下写作人格和生成内容，评估人格契合度、偏航程度和相似度风险。
返回严格 JSON，不要 markdown。

写作人格：${persona.name}
核心爽点：${persona.coreAppeal || '无'}
节奏规则：${persona.pacingRules || '无'}
冲突规则：${persona.conflictRules || '无'}
禁止事项：${persona.forbiddenRules || '无'}

生成内容：
${body.content.substring(0, 2000)}

请返回以下 JSON 格式：
{
  "personaFitScore": 82,
  "plotDriftScore": 18,
  "similarityRiskScore": 12,
  "hookStrengthScore": 76,
  "conflictDensityScore": 81,
  "issues": ["具体问题"],
  "suggestions": ["具体建议"],
  "riskLevel": "low"
}`

      const response = await client.chat.completions.create({
        model: settings.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      })

      const content = response.choices[0]?.message?.content
      if (!content)
        throw new Error('AI 返回为空')

      const parsed = JSON.parse(content)
      return c.json(success(parsed))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
    }
  })
}
