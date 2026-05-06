import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, qualityReports } from '../db/schema'
import { fail, generateId } from '../utils'
import { callAIJSON, getEffectiveAISettings } from './ai.service'

export async function listReports(projectId: string) {
  return db
    .select()
    .from(qualityReports)
    .where(eq(qualityReports.projectId, projectId))
    .orderBy(desc(qualityReports.createdAt))
}

export async function runChapterQualityCheck(projectId: string, chapterId: string) {
  const [chapter] = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))

  if (!chapter) {
    return fail('Chapter not found')
  }

  if (!chapter.draft) {
    return fail('Chapter has no draft')
  }

  const settings = await getEffectiveAISettings()

  if (!settings.apiKey) {
    return fail('AI 服务未配置，请先在项目设置中完成 AI 配置检测')
  }

  const { buildProjectAIContext } = await import('./ai-context.service')
  const { renderAIContext } = await import('./ai-context-renderer')
  const context = await buildProjectAIContext({
    projectId,
    scene: 'quality',
    chapterId,
  })
  const contextPrompt = renderAIContext(context)

  const fullPrompt = `${contextPrompt}\n\n你是一位专业的中文小说编辑。请对以上章节进行质量评估，返回严格的 JSON 格式。\n\n章节正文：\n${chapter.draft}\n\n请返回以下 JSON 格式（不要包含 markdown 代码块标记）：\n{
  "score": 0-100的综合评分,
  "rhythmScore": 0-10的节奏密度评分,
  "conflictScore": 0-10的冲突强度评分,
  "logicScore": 0-10的逻辑连续性评分,
  "characterScore": 0-10的人物一致性评分,
  "styleScore": 0-10的文风评分,
  "issues": ["具体问题1", "具体问题2"],
  "suggestions": ["具体建议1", "具体建议2"]
}\n\n注意：\n- issues 和 suggestions 必须是中文\n- issues 列出 2-4 个具体问题\n- suggestions 列出 2-4 个可落地的修改建议\n- 评分应基于章节内容的具体质量，不是随机分值`

  try {
    const parsed = await callAIJSON<Record<string, any>>(
      [{ role: 'user', content: fullPrompt }],
      { temperature: 30 },
    )

    const report = {
      id: generateId(),
      projectId,
      chapterId,
      scope: 'chapter' as const,
      score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
      rhythmScore: Math.min(10, Math.max(0, Number(parsed.rhythmScore) || 0)),
      conflictScore: Math.min(10, Math.max(0, Number(parsed.conflictScore) || 0)),
      logicScore: Math.min(10, Math.max(0, Number(parsed.logicScore) || 0)),
      characterScore: Math.min(10, Math.max(0, Number(parsed.characterScore) || 0)),
      styleScore: Math.min(10, Math.max(0, Number(parsed.styleScore) || 0)),
      issues: JSON.stringify(Array.isArray(parsed.issues) ? parsed.issues : []),
      suggestions: JSON.stringify(Array.isArray(parsed.suggestions) ? parsed.suggestions : []),
    }

    await db.insert(qualityReports).values(report)
    return report
  }
  catch (e: any) {
    return fail(`质量评估失败: ${e.message || '未知错误'}`)
  }
}

export async function getReport(projectId: string, reportId: string) {
  const [report] = await db
    .select()
    .from(qualityReports)
    .where(and(eq(qualityReports.id, reportId), eq(qualityReports.projectId, projectId)))

  if (!report) {
    return fail('Report not found')
  }

  return report
}
