import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, personaMemoryFragments } from '../db/schema'
import { generateId } from '../utils'
import { callAIJSON } from './ai.service'

export async function getFragments(projectId: string, fragmentType?: string) {
  if (fragmentType) {
    return db.select().from(personaMemoryFragments).where(
      and(eq(personaMemoryFragments.projectId, projectId), eq(personaMemoryFragments.fragmentType, fragmentType as any)),
    )
  }
  return db.select().from(personaMemoryFragments).where(eq(personaMemoryFragments.projectId, projectId))
}

export async function extractStylePatterns(projectId: string, chapterIds?: string[]) {
  const allChapters = await db.select().from(chapters).where(eq(chapters.projectId, projectId))
  const targetChapters = chapterIds
    ? allChapters.filter(c => chapterIds.includes(c.id))
    : allChapters.filter(c => c.status === 'completed' && c.draft)

  if (targetChapters.length === 0)
    return []

  const chaptersData = targetChapters.slice(0, 10).map(c => ({
    title: c.title,
    draft: c.draft?.slice(0, 2000) || '',
  }))

  const prompt = `分析以下小说章节文本，提取写作风格特征。返回JSON，包含 fragments 数组，每项包含:
- fragmentType: style_pattern|dialogue_pattern|narrative_preference|vocabulary_tendency|pacing_preference
- content: 具体风格描述（中文，50字以内）
- confidence: 0-100

章节数据:
${JSON.stringify(chaptersData)}`

  const parsed = await callAIJSON<{ fragments: Array<{ fragmentType: string, content: string, confidence: number }> }>(
    [{ role: 'user', content: prompt }],
    { temperature: 30 },
  )

  const created = []
  for (const f of parsed.fragments || []) {
    const [row] = await db.insert(personaMemoryFragments).values({
      id: generateId(),
      projectId,
      fragmentType: f.fragmentType as any,
      content: f.content,
      confidence: f.confidence || 70,
      sourceType: 'ai_extracted',
      sourceChapterIds: JSON.stringify(targetChapters.map(c => c.id)),
    }).returning()
    created.push(row)
  }

  return created
}

export async function buildPersonaMemoryContext(projectId: string): Promise<string[]> {
  const fragments = await db.select().from(personaMemoryFragments).where(eq(personaMemoryFragments.projectId, projectId))
  if (fragments.length === 0)
    return []

  const grouped = new Map<string, string[]>()
  for (const f of fragments) {
    const typeLabel = {
      style_pattern: '风格特征',
      dialogue_pattern: '对话风格',
      narrative_preference: '叙事偏好',
      vocabulary_tendency: '词汇倾向',
      pacing_preference: '节奏偏好',
    }[f.fragmentType] || f.fragmentType

    if (!grouped.has(typeLabel))
      grouped.set(typeLabel, [])
    grouped.get(typeLabel)!.push(`${f.content}（置信度: ${f.confidence}%）`)
  }

  const lines: string[] = []
  for (const [type, items] of grouped) {
    lines.push(`【${type}】`)
    for (const item of items)
      lines.push(`- ${item}`)
  }
  return lines
}
