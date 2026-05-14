import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, novelProjects, qualityReports } from '../db/schema'
import { generateId } from '../utils'
import { callAIJSON } from './ai.service'

export async function listReports(projectId: string) {
  return db.select().from(qualityReports).where(eq(qualityReports.projectId, projectId)).orderBy(desc(qualityReports.createdAt))
}

export async function getReport(projectId: string, id: string) {
  const [report] = await db.select().from(qualityReports).where(and(eq(qualityReports.id, id), eq(qualityReports.projectId, projectId)))
  return report || { error: '报告未找到' }
}

export async function runChapterQualityCheck(projectId: string, chapterId: string) {
  const [chapter] = await db.select().from(chapters).where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  ))
  if (!chapter)
    return { error: '章节未找到' }

  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))

  const prompt = `你是一位专业的文学编辑和逻辑审查官。请对以下章节内容进行质量审计。
返回严格 JSON 格式，不要包含任何 markdown。

作品名: ${project?.title || '未定义'}
章节标题: ${chapter.title}
章节目标: ${chapter.goals || '未定义'}
核心冲突: ${chapter.conflicts || '未定义'}

正文内容:
${chapter.draft || '（空）'}

请按以下 JSON 格式返回:
{
  "score": 0-100,
  "rhythmScore": 0-100,
  "conflictScore": 0-100,
  "logicScore": 0-100,
  "characterScore": 0-100,
  "styleScore": 0-100,
  "issues": "具体存在的问题描述，多项用分号隔开",
  "suggestions": "具体的改进建议描述，多项用分号隔开"
}`

  try {
    const analysis = await callAIJSON<any>(
      [{ role: 'user', content: prompt }],
      { temperature: 30 },
    )

    const id = generateId()
    const [newReport] = await db.insert(qualityReports).values({
      id,
      projectId,
      chapterId,
      scope: 'chapter',
      score: analysis.score || 0,
      rhythmScore: analysis.rhythmScore || 0,
      conflictScore: analysis.conflictScore || 0,
      logicScore: analysis.logicScore || 0,
      characterScore: analysis.characterScore || 0,
      styleScore: analysis.styleScore || 0,
      issues: analysis.issues || '',
      suggestions: analysis.suggestions || '',
    }).returning()

    return newReport
  }
  catch (err: any) {
    return { error: `审计失败: ${err.message}` }
  }
}
