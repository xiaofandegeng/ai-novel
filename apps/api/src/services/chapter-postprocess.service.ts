import type { ChapterMemory, ChapterPostprocessResult } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterMemories, chapterPostprocessRuns, chapters, novelProjects, storyBibles } from '../db/schema'
import { assertAIConfigured, createOpenAIClient } from './ai.service'

export async function getChapterMemory(projectId: string, chapterId: string): Promise<ChapterMemory | null> {
  const [row] = await db.select().from(chapterMemories).where(and(
    eq(chapterMemories.projectId, projectId),
    eq(chapterMemories.chapterId, chapterId),
  ))
  return row || null
}

export async function getProjectMemories(projectId: string): Promise<ChapterMemory[]> {
  return db.select().from(chapterMemories).where(eq(chapterMemories.projectId, projectId))
}

export async function getPostprocessRuns(projectId: string, chapterId: string) {
  return db.select().from(chapterPostprocessRuns).where(
    and(eq(chapterPostprocessRuns.projectId, projectId), eq(chapterPostprocessRuns.chapterId, chapterId)),
  )
}

export async function runChapterPostprocess(input: {
  projectId: string
  chapterId: string
  content: string
  trigger: 'manual_save' | 'mark_completed' | 'auto_drive'
}): Promise<ChapterPostprocessResult> {
  const { projectId, chapterId, content, trigger } = input

  const [chapter] = await db.select().from(chapters).where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  ))
  if (!chapter)
    throw new Error('章节不存在或不属于当前项目')

  // Create run record
  const runId = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.insert(chapterPostprocessRuns).values({
    id: runId,
    projectId,
    chapterId,
    status: 'running',
    trigger,
    startedAt: now,
  })

  try {
    const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
    if (!project)
      throw new Error('项目不存在')

    const [bible] = await db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId))

    const settings = await assertAIConfigured()
    const client = createOpenAIClient(settings)

    const truncatedContent = content.length > 6000
      ? `${content.substring(0, 6000)}...(内容过长已截断)`
      : content

    const prompt = `你是一位专业的长篇小说编辑。请分析以下章节正文，提取结构化记忆以便后续章节参考。
返回严格 JSON，不要 markdown。

作品：${project.title}
类型：${project.genre || '未定义'}
主题：${project.theme || '未定义'}
世界观规则：${bible?.rules || '未定义'}
当前章节：${chapter.title}
触发方式：${trigger === 'mark_completed' ? '章节完成' : trigger === 'auto_drive' ? '自动驾驶' : '手动保存'}

章节正文：
${truncatedContent}

请返回以下 JSON 格式：
{
  "summary": "章节摘要（100-200字）",
  "keyEvents": "关键事件列表",
  "newFacts": "新出现的事实信息",
  "characterStateChanges": "人物状态变化（谁发生了什么变化）",
  "relationshipChanges": "人物关系变化",
  "conflictProgress": "冲突推进情况",
  "foreshadowingAdded": "新增的伏笔",
  "foreshadowingResolved": "回收的伏笔",
  "themeProgress": "主题推进情况",
  "styleNotes": "风格备注（叙事视角、节奏、语气等）"
}

每个字段用简洁的中文描述。如果没有相关内容，返回 null。`

    const response = await client.chat.completions.create({
      model: settings.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const resultContent = response.choices[0]?.message?.content
    if (!resultContent)
      throw new Error('AI 返回内容为空')

    let parsed: any
    try {
      parsed = JSON.parse(resultContent)
    }
    catch {
      throw new Error('AI 返回的 JSON 无法解析')
    }

    const fields = {
      summary: parsed.summary || null,
      keyEvents: parsed.keyEvents || null,
      newFacts: parsed.newFacts || null,
      characterStateChanges: parsed.characterStateChanges || null,
      relationshipChanges: parsed.relationshipChanges || null,
      conflictProgress: parsed.conflictProgress || null,
      foreshadowingAdded: parsed.foreshadowingAdded || null,
      foreshadowingResolved: parsed.foreshadowingResolved || null,
      themeProgress: parsed.themeProgress || null,
      styleNotes: parsed.styleNotes || null,
    }

    const warnings: string[] = []
    if (parsed.foreshadowingAdded) {
      warnings.push('检测到新增伏笔，后续章节应注意回收。')
    }

    // Upsert memory
    const [memory] = await db
      .insert(chapterMemories)
      .values({
        id: crypto.randomUUID(),
        projectId,
        chapterId,
        ...fields,
      })
      .onConflictDoUpdate({
        target: [chapterMemories.projectId, chapterMemories.chapterId],
        set: {
          ...fields,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning()

    // Mark run as completed
    await db.update(chapterPostprocessRuns).set({
      status: 'completed',
      finishedAt: new Date().toISOString(),
    }).where(eq(chapterPostprocessRuns.id, runId))

    return { memory, warnings, conflictUpdates: [] }
  }
  catch (error: any) {
    // Mark run as failed
    await db.update(chapterPostprocessRuns).set({
      status: 'failed',
      errorMessage: error.message || 'Unknown error',
      finishedAt: new Date().toISOString(),
    }).where(eq(chapterPostprocessRuns.id, runId))
    throw error
  }
}
