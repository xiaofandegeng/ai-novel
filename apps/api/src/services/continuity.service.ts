import { eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterMemories, chapters, foreshadowingItems, storyFactTriples } from '../db/schema'
import { assertAIConfigured, createOpenAIClient } from './ai.service'

interface ContinuityIssue {
  type: string
  severity: 'low' | 'medium' | 'high'
  description: string
  evidence: string[]
  suggestion: string
}

export async function runContinuityAnalysis(projectId: string) {
  await assertAIConfigured()

  const allChapters = await db.select().from(chapters).where(eq(chapters.projectId, projectId))
  const completedChapters = allChapters.filter(c => c.status === 'completed').sort((a, b) => a.chapterNumber - b.chapterNumber)

  if (completedChapters.length < 2)
    return { issues: [], chapterCount: completedChapters.length }

  const memories = await db.select().from(chapterMemories).where(eq(chapterMemories.projectId, projectId))
  const triples = await db.select().from(storyFactTriples).where(eq(storyFactTriples.projectId, projectId))
  const foreshadowing = await db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId))

  const openForeshadowing = foreshadowing.filter(f => f.status === 'open' || f.status === 'progressing')
  const summaries = memories.map(m => `章节记忆: ${m.summary || '无摘要'}`).join('\n')
  const facts = triples.filter(t => t.status === 'confirmed').map(t => `${t.subjectName} ${t.predicate} ${t.objectName}`).join('\n')
  const openPlots = openForeshadowing.map(f => `伏笔: ${f.title} (${f.status})`).join('\n')

  const prompt = `你是一个小说连续性审查助手。请分析以下小说数据，找出连续性问题。

已完成章节数: ${completedChapters.length}
章节数据:
${summaries}

已确认事实:
${facts}

未回收伏笔:
${openPlots}

请返回JSON格式的结果，包含 issues 数组。每个 issue 包含:
- type: 问题类型（timeline|character|foreshadowing|worldview|theme|pacing）
- severity: 严重程度（low|medium|high）
- description: 问题描述（中文）
- evidence: 证据列表
- suggestion: 修复建议（中文）

如果没有问题，返回 {"issues": []}`

  const settings = await assertAIConfigured()
  const client = createOpenAIClient(settings)

  const response = await client.chat.completions.create({
    model: settings.model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  })

  const content = response.choices[0]?.message?.content || '{"issues":[]}'
  const parsed = JSON.parse(content) as { issues: ContinuityIssue[] }

  return {
    issues: parsed.issues || [],
    chapterCount: completedChapters.length,
    analyzedAt: new Date().toISOString(),
  }
}
