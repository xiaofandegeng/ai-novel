import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterAnalyses,
  referenceChapters,
  referenceTrainingSets,
  referenceWorks,
  workStyleReports,
  writingPersonas,
} from '../db/schema'
import { fail, generateId, now } from '../utils'
import { assertAIConfigured, createOpenAIClient } from './ai.service'

// ─── Training Sets ───

export async function listTrainingSets() {
  return db.select().from(referenceTrainingSets)
}

export async function getTrainingSet(id: string) {
  const [row] = await db.select().from(referenceTrainingSets).where(eq(referenceTrainingSets.id, id))
  return row || null
}

export async function createTrainingSet(input: { name: string, description?: string, genre?: string, targetPersonaType?: string }) {
  const row = {
    id: generateId(),
    name: input.name,
    description: input.description || null,
    genre: input.genre || null,
    targetPersonaType: input.targetPersonaType || null,
    status: 'draft' as const,
  }
  await db.insert(referenceTrainingSets).values(row)
  return row
}

export async function updateTrainingSet(id: string, input: Record<string, unknown>) {
  const fields: Record<string, unknown> = { updatedAt: now() }
  for (const key of ['name', 'description', 'genre', 'targetPersonaType', 'status']) {
    if (input[key] !== undefined)
      fields[key] = input[key]
  }
  const [row] = await db.update(referenceTrainingSets).set(fields).where(eq(referenceTrainingSets.id, id)).returning()
  return row
}

export async function deleteTrainingSet(id: string) {
  const [row] = await db.delete(referenceTrainingSets).where(eq(referenceTrainingSets.id, id)).returning()
  return row
}

// ─── Reference Works ───

export async function listWorks(trainingSetId: string) {
  return db.select().from(referenceWorks).where(eq(referenceWorks.trainingSetId, trainingSetId))
}

export async function getWork(workId: string) {
  const [row] = await db.select().from(referenceWorks).where(eq(referenceWorks.id, workId))
  return row || null
}

export async function createWork(trainingSetId: string, input: { title: string, author?: string, sourceType?: 'webnovel' | 'reference' | 'sample', fileName?: string, fileSize?: number }) {
  const row = {
    id: generateId(),
    trainingSetId,
    title: input.title,
    author: input.author || null,
    sourceType: input.sourceType || 'webnovel' as const,
    fileName: input.fileName || null,
    fileSize: input.fileSize || null,
    status: 'uploaded' as const,
  }
  await db.insert(referenceWorks).values(row)
  return row
}

export async function deleteWork(workId: string) {
  const [row] = await db.delete(referenceWorks).where(eq(referenceWorks.id, workId)).returning()
  return row
}

// ─── Chapter Splitting ───

export async function splitWorkChapters(workId: string, content: string) {
  const work = await getWork(workId)
  if (!work)
    return fail('Work not found')

  await db.update(referenceWorks).set({ status: 'splitting', updatedAt: now() }).where(eq(referenceWorks.id, workId))

  try {
    const chapterPattern = /(第[一二三四五六七八九十百千万\d]+[章节卷篇]).*/g
    const matches = [...content.matchAll(chapterPattern)]

    const chapters: any[] = []

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const title = matches[i][0]
        const startIndex = matches[i].index!
        const endIndex = i < matches.length - 1 ? matches[i + 1].index! : content.length
        const chapterContent = content.substring(startIndex, endIndex).trim()

        chapters.push({
          id: generateId(),
          workId,
          trainingSetId: work.trainingSetId,
          title,
          chapterNumber: i + 1,
          content: chapterContent,
          wordCount: chapterContent.length,
        })
      }
    }
    else {
      chapters.push({
        id: generateId(),
        workId,
        trainingSetId: work.trainingSetId,
        title: '全文',
        chapterNumber: 1,
        content,
        wordCount: content.length,
      })
    }

    if (chapters.length > 0)
      await db.insert(referenceChapters).values(chapters)

    await db.update(referenceWorks).set({
      status: 'completed',
      wordCount: content.length,
      chapterCount: chapters.length,
      updatedAt: now(),
    }).where(eq(referenceWorks.id, workId))

    return { chapters: chapters.length }
  }
  catch (e: any) {
    await db.update(referenceWorks).set({ status: 'failed', updatedAt: now() }).where(eq(referenceWorks.id, workId))
    throw e
  }
}

export async function listWorkChapters(workId: string) {
  return db.select().from(referenceChapters).where(eq(referenceChapters.workId, workId))
}

// ─── Chapter AI Analysis (Phase 3) ───

export async function analyzeChapter(chapterId: string) {
  const [chapter] = await db.select().from(referenceChapters).where(eq(referenceChapters.id, chapterId))
  if (!chapter)
    return fail('Chapter not found')

  const settings = await assertAIConfigured()
  const client = createOpenAIClient(settings)

  const truncatedContent = chapter.content.length > 3000
    ? `${chapter.content.substring(0, 3000)}...(内容过长已截断)`
    : chapter.content

  const prompt = `你是网文结构分析师。请分析以下章节的结构、节奏、爽点和写作技巧。
不要仿写原文，不要摘录大段原文。
重点提炼抽象规律，便于训练新的写作人格。
返回严格 JSON，不要 markdown。

章节标题：${chapter.title}
内容：
${truncatedContent}

请返回以下 JSON 格式：
{
  "openingHook": "本章开头如何抓人",
  "conflictType": "冲突类型",
  "pressureSource": "压迫来源",
  "protagonistAction": "主角采取了什么行动",
  "payoffType": "爽点兑现方式",
  "cliffhanger": "结尾钩子",
  "emotionCurve": "情绪曲线描述",
  "pacingScore": 8,
  "dialogueRatio": 40,
  "descriptionRatio": 35,
  "narrativePattern": "本章叙事结构",
  "tropeTags": ["标签1", "标签2"],
  "craftNotes": "可复用技巧总结",
  "riskNotes": "需要避免直接复刻的桥段或表达"
}`

  const response = await client.chat.completions.create({
    model: settings.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content)
    throw new Error('AI 返回内容为空')

  let parsed: any
  try {
    parsed = JSON.parse(content)
  }
  catch {
    throw new Error('AI 返回的 JSON 无法解析')
  }

  const analysis = {
    id: generateId(),
    chapterId: chapter.id,
    workId: chapter.workId,
    trainingSetId: chapter.trainingSetId,
    openingHook: parsed.openingHook || null,
    conflictType: parsed.conflictType || null,
    pressureSource: parsed.pressureSource || null,
    protagonistAction: parsed.protagonistAction || null,
    payoffType: parsed.payoffType || null,
    cliffhanger: parsed.cliffhanger || null,
    emotionCurve: parsed.emotionCurve || null,
    pacingScore: typeof parsed.pacingScore === 'number' ? parsed.pacingScore : null,
    dialogueRatio: typeof parsed.dialogueRatio === 'number' ? parsed.dialogueRatio : null,
    descriptionRatio: typeof parsed.descriptionRatio === 'number' ? parsed.descriptionRatio : null,
    narrativePattern: parsed.narrativePattern || null,
    tropeTags: JSON.stringify(Array.isArray(parsed.tropeTags) ? parsed.tropeTags : []),
    craftNotes: parsed.craftNotes || null,
    riskNotes: parsed.riskNotes || null,
  }

  await db.insert(chapterAnalyses).values(analysis)
  return analysis
}

export async function getChapterAnalysis(chapterId: string) {
  const [row] = await db.select().from(chapterAnalyses).where(eq(chapterAnalyses.chapterId, chapterId))
  return row || null
}

export async function analyzeAllChapters(workId: string) {
  const chapters = await db.select().from(referenceChapters).where(eq(referenceChapters.workId, workId))
  if (chapters.length === 0)
    return fail('该作品没有章节')

  await db.update(referenceWorks).set({ status: 'analyzing', updatedAt: now() }).where(eq(referenceWorks.id, workId))

  const results: any[] = []
  const errors: string[] = []

  for (const chapter of chapters) {
    try {
      const existing = await getChapterAnalysis(chapter.id)
      if (!existing) {
        const result = await analyzeChapter(chapter.id)
        if (typeof result === 'object' && 'error' in result && result.error) {
          errors.push(`${chapter.title}: ${result.error}`)
        }
        else {
          results.push(result)
        }
      }
      else {
        results.push(existing)
      }
    }
    catch (e: any) {
      errors.push(`${chapter.title}: ${e.message}`)
    }
  }

  const allCompleted = errors.length === 0
  const allFailed = results.length === 0 && errors.length > 0
  const finalStatus = allFailed ? 'failed' as const : allCompleted ? 'completed' as const : 'partial_failed' as const
  await db.update(referenceWorks).set({
    status: finalStatus,
    updatedAt: now(),
  }).where(eq(referenceWorks.id, workId))

  return {
    analyzed: results.length,
    failed: errors.length,
    errors,
    chapters: chapters.length,
    status: finalStatus,
  }
}

// ─── Work Style Report (Phase 4) ───

export async function getWorkStyleReport(workId: string) {
  const [row] = await db.select().from(workStyleReports).where(eq(workStyleReports.workId, workId))
  return row || null
}

export async function generateWorkStyleReport(workId: string) {
  const work = await getWork(workId)
  if (!work)
    return fail('Work not found')

  const settings = await assertAIConfigured()
  const client = createOpenAIClient(settings)

  // Get all chapter analyses for this work
  const analyses = await db.select().from(chapterAnalyses).where(eq(chapterAnalyses.workId, workId))
  if (analyses.length === 0)
    return fail('该作品尚无章节分析，请先分析章节')

  // Aggregate analyses for the prompt
  const analysesSummary = analyses.map((a, i) => `章节${i + 1}: 冲突类型=${a.conflictType || '未知'}, 爽点=${a.payoffType || '未知'}, 节奏=${a.pacingScore || '未知'}, 技巧=${a.craftNotes || '无'}`).join('\n')

  const prompt = `你是一位专业的网文风格分析师。请根据以下章节分析数据，生成该作品的整体风格报告。
返回严格 JSON，不要 markdown。

作品标题：${work.title}
章节数：${analyses.length}

章节分析摘要：
${analysesSummary}

请返回以下 JSON 格式：
{
  "summary": "作品整体风格概括",
  "coreAppeal": "核心爽点",
  "pacingModel": "节奏模型",
  "hookModel": "钩子模型",
  "conflictModel": "冲突推进模型",
  "characterModel": "人物塑造模型",
  "languageProfile": "语言节奏画像",
  "chapterTemplate": "典型章节模板",
  "strengths": "最值得学习的优点",
  "weaknesses": "不建议继承的问题",
  "avoidCopying": "禁止复刻的表达和桥段风险"
}`

  const response = await client.chat.completions.create({
    model: settings.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content)
    throw new Error('AI 返回内容为空')

  let parsed: any
  try {
    parsed = JSON.parse(content)
  }
  catch {
    throw new Error('AI 返回的 JSON 无法解析')
  }

  // Delete existing report
  await db.delete(workStyleReports).where(eq(workStyleReports.workId, workId))

  const report = {
    id: generateId(),
    workId,
    trainingSetId: work.trainingSetId,
    summary: parsed.summary || null,
    coreAppeal: parsed.coreAppeal || null,
    pacingModel: parsed.pacingModel || null,
    hookModel: parsed.hookModel || null,
    conflictModel: parsed.conflictModel || null,
    characterModel: parsed.characterModel || null,
    languageProfile: parsed.languageProfile || null,
    chapterTemplate: parsed.chapterTemplate || null,
    strengths: parsed.strengths || null,
    weaknesses: parsed.weaknesses || null,
    avoidCopying: parsed.avoidCopying || null,
  }

  await db.insert(workStyleReports).values(report)
  return report
}

// ─── Writing Persona (Phase 5) ───

export async function listPersonas() {
  return db.select().from(writingPersonas)
}

export async function getPersona(personaId: string) {
  const [row] = await db.select().from(writingPersonas).where(eq(writingPersonas.id, personaId))
  return row || null
}

export async function createPersona(input: { name: string, description?: string, genre?: string }) {
  const row = {
    id: generateId(),
    name: input.name,
    description: input.description || null,
    genre: input.genre || null,
    status: 'draft' as const,
  }
  await db.insert(writingPersonas).values(row)
  return row
}

export async function updatePersona(personaId: string, input: Record<string, unknown>) {
  const fields: Record<string, unknown> = { updatedAt: now() }
  for (const key of ['name', 'description', 'genre', 'status', 'coreAppeal', 'pacingRules', 'conflictRules', 'characterRules', 'languageRules', 'chapterRules', 'hookRules', 'forbiddenRules', 'similarityGuardrails']) {
    if (input[key] !== undefined)
      fields[key] = input[key]
  }
  const [row] = await db.update(writingPersonas).set(fields).where(eq(writingPersonas.id, personaId)).returning()
  return row
}

export async function deletePersona(personaId: string) {
  const [row] = await db.delete(writingPersonas).where(eq(writingPersonas.id, personaId)).returning()
  return row
}

export async function generatePersonaFromTrainingSet(trainingSetId: string, input: { name: string, description?: string, genre?: string }) {
  const trainingSet = await getTrainingSet(trainingSetId)
  if (!trainingSet)
    return fail('训练集不存在')

  // Get all style reports for this training set
  const reports = await db.select().from(workStyleReports).where(eq(workStyleReports.trainingSetId, trainingSetId))
  if (reports.length === 0)
    return fail('训练集尚无作品风格报告，请先分析作品')

  const settings = await assertAIConfigured()
  const client = createOpenAIClient(settings)

  const reportsSummary = reports.map((r, i) => `作品${i + 1}: 核心爽点=${r.coreAppeal || '未知'}, 节奏=${r.pacingModel || '未知'}, 冲突=${r.conflictModel || '未知'}, 优点=${r.strengths || '未知'}`).join('\n')

  const prompt = `你是一位专业的写作风格融合专家。请根据以下多本作品的风格报告，融合成一个可复用的写作人格。
人格必须学习结构、节奏和技巧，但严禁复刻原文表达或桥段。
返回严格 JSON，不要 markdown。

训练集：${trainingSet.name}
作品数：${reports.length}

风格报告摘要：
${reportsSummary}

请返回以下 JSON 格式：
{
  "coreAppeal": "核心爽点",
  "pacingRules": "节奏规则",
  "conflictRules": "冲突规则",
  "characterRules": "人物规则",
  "languageRules": "语言规则",
  "chapterRules": "章节结构规则",
  "hookRules": "结尾钩子规则",
  "forbiddenRules": "禁止事项",
  "similarityGuardrails": "避免过度相似的规则"
}`

  const response = await client.chat.completions.create({
    model: settings.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content)
    throw new Error('AI 返回内容为空')

  let parsed: any
  try {
    parsed = JSON.parse(content)
  }
  catch {
    throw new Error('AI 返回的 JSON 无法解析')
  }

  const persona = {
    id: generateId(),
    name: input.name,
    description: input.description || null,
    genre: input.genre || trainingSet.genre || null,
    sourceTrainingSetId: trainingSetId,
    status: 'draft' as const,
    coreAppeal: parsed.coreAppeal || null,
    pacingRules: parsed.pacingRules || null,
    conflictRules: parsed.conflictRules || null,
    characterRules: parsed.characterRules || null,
    languageRules: parsed.languageRules || null,
    chapterRules: parsed.chapterRules || null,
    hookRules: parsed.hookRules || null,
    forbiddenRules: parsed.forbiddenRules || null,
    similarityGuardrails: parsed.similarityGuardrails || null,
  }

  await db.insert(writingPersonas).values(persona)

  // Update training set status
  await db.update(referenceTrainingSets).set({ status: 'ready', updatedAt: now() }).where(eq(referenceTrainingSets.id, trainingSetId))

  return persona
}

export async function publishPersona(personaId: string) {
  const persona = await getPersona(personaId)
  if (!persona)
    return fail('人格不存在')
  if (!persona.coreAppeal)
    return fail('人格内容不完整，请先生成人格规则')

  const [row] = await db.update(writingPersonas).set({ status: 'published', updatedAt: now() }).where(eq(writingPersonas.id, personaId)).returning()
  return row
}

// ─── Work Analysis Summary ───

export async function getWorkAnalysisSummary(workId: string) {
  const work = await getWork(workId)
  if (!work)
    return null

  const chapters = await db.select({ id: referenceChapters.id }).from(referenceChapters).where(eq(referenceChapters.workId, workId))
  const analyses = await db.select({ id: chapterAnalyses.id }).from(chapterAnalyses).where(eq(chapterAnalyses.workId, workId))
  const [report] = await db.select({ id: workStyleReports.id }).from(workStyleReports).where(eq(workStyleReports.workId, workId))

  const chapterCount = chapters.length
  const analyzedCount = analyses.length
  const hasReport = !!report
  const hasPartialFailure = work.status === 'partial_failed'
  const failedCount = hasPartialFailure
    ? Math.max(1, chapterCount - analyzedCount)
    : 0

  return {
    chapterCount,
    analyzedCount,
    failedCount,
    hasPartialFailure,
    hasReport,
    canAnalyze: chapterCount > 0 && analyzedCount < chapterCount,
    canGenerateReport: analyzedCount > 0 && !hasReport,
  }
}

export async function listPublishedPersonas() {
  return db.select().from(writingPersonas).where(eq(writingPersonas.status, 'published'))
}
