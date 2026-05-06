import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterAnalyses,
  referenceChapterAnalysisErrors,
  referenceChapters,
  referenceWorks,
  workStyleReports,
} from '../db/schema'
import { fail, generateId, now } from '../utils'
import { callAIJSON } from './ai.service'
import { getWork } from './persona-work.service'

// ─── Chapter AI Analysis (Phase 3) ───

export async function analyzeChapter(chapterId: string) {
  const [chapter] = await db.select().from(referenceChapters).where(eq(referenceChapters.id, chapterId))
  if (!chapter)
    return fail('Chapter not found')

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

  const parsed = await callAIJSON<Record<string, any>>(
    [{ role: 'user', content: prompt }],
    { temperature: 30 },
  )

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

async function clearChapterAnalysisError(chapterId: string) {
  await db.delete(referenceChapterAnalysisErrors).where(eq(referenceChapterAnalysisErrors.chapterId, chapterId))
}

async function recordChapterAnalysisError(chapter: typeof referenceChapters.$inferSelect, message: string) {
  await clearChapterAnalysisError(chapter.id)
  await db.insert(referenceChapterAnalysisErrors).values({
    id: generateId(),
    chapterId: chapter.id,
    workId: chapter.workId,
    trainingSetId: chapter.trainingSetId,
    message,
  })
}

async function updateWorkAnalysisStatus(workId: string) {
  const chapters = await db.select({ id: referenceChapters.id }).from(referenceChapters).where(eq(referenceChapters.workId, workId))
  const analyses = await db.select({ id: chapterAnalyses.id }).from(chapterAnalyses).where(eq(chapterAnalyses.workId, workId))
  const errors = await db.select({ id: referenceChapterAnalysisErrors.id }).from(referenceChapterAnalysisErrors).where(eq(referenceChapterAnalysisErrors.workId, workId))

  const finalStatus = errors.length > 0 && analyses.length === 0
    ? 'failed' as const
    : errors.length > 0 || analyses.length < chapters.length
      ? 'partial_failed' as const
      : 'completed' as const

  await db.update(referenceWorks).set({
    status: finalStatus,
    updatedAt: now(),
  }).where(eq(referenceWorks.id, workId))

  return {
    analyzed: analyses.length,
    failed: errors.length,
    chapters: chapters.length,
    status: finalStatus,
  }
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
          await recordChapterAnalysisError(chapter, result.error)
        }
        else {
          await clearChapterAnalysisError(chapter.id)
          results.push(result)
        }
      }
      else {
        await clearChapterAnalysisError(chapter.id)
        results.push(existing)
      }
    }
    catch (e: any) {
      const message = e.message || '未知错误'
      errors.push(`${chapter.title}: ${message}`)
      await recordChapterAnalysisError(chapter, message)
    }
  }

  const status = await updateWorkAnalysisStatus(workId)

  return {
    analyzed: status.analyzed,
    failed: status.failed,
    errors,
    chapters: status.chapters,
    status: status.status,
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

  const parsed = await callAIJSON<Record<string, any>>(
    [{ role: 'user', content: prompt }],
    { temperature: 30 },
  )

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

// ─── Work Analysis Summary ───

export async function getWorkAnalysisSummary(workId: string) {
  const work = await getWork(workId)
  if (!work)
    return null

  const chapters = await db.select({ id: referenceChapters.id }).from(referenceChapters).where(eq(referenceChapters.workId, workId))
  const analyses = await db.select({ id: chapterAnalyses.id }).from(chapterAnalyses).where(eq(chapterAnalyses.workId, workId))
  const errors = await db.select({ id: referenceChapterAnalysisErrors.id }).from(referenceChapterAnalysisErrors).where(eq(referenceChapterAnalysisErrors.workId, workId))
  const [report] = await db.select({ id: workStyleReports.id }).from(workStyleReports).where(eq(workStyleReports.workId, workId))

  const chapterCount = chapters.length
  const analyzedCount = analyses.length
  const hasReport = !!report
  const failedCount = errors.length
  const hasPartialFailure = failedCount > 0 || work.status === 'partial_failed'

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

export async function listWorkAnalysisErrors(workId: string) {
  return db
    .select({
      id: referenceChapterAnalysisErrors.id,
      chapterId: referenceChapterAnalysisErrors.chapterId,
      workId: referenceChapterAnalysisErrors.workId,
      trainingSetId: referenceChapterAnalysisErrors.trainingSetId,
      message: referenceChapterAnalysisErrors.message,
      createdAt: referenceChapterAnalysisErrors.createdAt,
      chapterTitle: referenceChapters.title,
      chapterNumber: referenceChapters.chapterNumber,
    })
    .from(referenceChapterAnalysisErrors)
    .innerJoin(referenceChapters, eq(referenceChapterAnalysisErrors.chapterId, referenceChapters.id))
    .where(eq(referenceChapterAnalysisErrors.workId, workId))
}

export async function retryFailedChapterAnalyses(workId: string) {
  const errors = await db
    .select({ chapterId: referenceChapterAnalysisErrors.chapterId })
    .from(referenceChapterAnalysisErrors)
    .where(eq(referenceChapterAnalysisErrors.workId, workId))

  if (errors.length === 0)
    return { analyzed: 0, failed: 0, errors: [], chapters: 0, status: (await getWork(workId))?.status || 'completed' }

  await db.update(referenceWorks).set({ status: 'analyzing', updatedAt: now() }).where(eq(referenceWorks.id, workId))

  const failedMessages: string[] = []
  let retried = 0

  for (const error of errors) {
    const [chapter] = await db.select().from(referenceChapters).where(
      and(eq(referenceChapters.id, error.chapterId), eq(referenceChapters.workId, workId)),
    )
    if (!chapter)
      continue

    try {
      await clearChapterAnalysisError(chapter.id)
      const existing = await getChapterAnalysis(chapter.id)
      const result = existing || await analyzeChapter(chapter.id)
      if (typeof result === 'object' && 'error' in result && result.error) {
        const message = String(result.error)
        failedMessages.push(`${chapter.title}: ${message}`)
        await recordChapterAnalysisError(chapter, message)
      }
      else {
        retried += 1
      }
    }
    catch (e: any) {
      const message = e.message || '未知错误'
      failedMessages.push(`${chapter.title}: ${message}`)
      await recordChapterAnalysisError(chapter, message)
    }
  }

  const status = await updateWorkAnalysisStatus(workId)

  return {
    analyzed: retried,
    failed: status.failed,
    errors: failedMessages,
    chapters: status.chapters,
    status: status.status,
  }
}
