import type { ChapterMemory, ChapterPostprocessResult } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterMemories, chapterPostprocessRuns, chapters, chapterScenes, conflicts, foreshadowingItems, novelProjects, storyBibles } from '../db/schema'
import { callAIJSON } from './ai.service'
import { createSuggestion } from './postprocess-suggestion.service'

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

interface StructuredFact {
  subjectType: string
  subjectName: string
  predicate: string
  objectType: string
  objectName: string
  confidence?: number
  reason?: string
}

interface StructuredForeshadowing {
  title: string
  description: string
  importance?: string
  confidence?: number
}

interface StructuredCharacterChange {
  characterName: string
  change: string
  confidence?: number
}

interface StructuredStyleNote {
  title: string
  description: string
  confidence?: number
}

interface StructuredEvent {
  title: string
  description?: string
  importance?: string
}

interface StructuredAnalysis {
  summary: string
  keyEvents: string | StructuredEvent[]
  facts: StructuredFact[]
  foreshadowingAdded: StructuredForeshadowing[]
  foreshadowingPayoffs: StructuredForeshadowing[]
  characterStateChanges: StructuredCharacterChange[]
  relationshipChanges: string
  conflictProgress: string
  themeProgress: string
  styleNotes: StructuredStyleNote[] | string
  conflictUpdates: Array<{ title: string, newStatus?: string, newIntensity?: number, reason: string }>
  // Legacy string fields for backward compatibility
  newFacts?: string
  foreshadowingResolved?: string
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

    const truncatedContent = content.length > 6000
      ? `${content.substring(0, 6000)}...(内容过长已截断)`
      : content

    const prompt = `你是一位专业的长篇小说编辑。请分析以下章节正文，提取结构化记忆和待确认建议。
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
  "keyEvents": [
    { "title": "事件名", "description": "事件说明", "importance": "major" }
  ],
  "facts": [
    {
      "subjectType": "角色/地点/物品/组织/事件",
      "subjectName": "主体名",
      "predicate": "关系谓词",
      "objectType": "角色/地点/物品/组织/事件",
      "objectName": "客体名",
      "confidence": 80,
      "reason": "正文依据"
    }
  ],
  "foreshadowingAdded": [
    {
      "title": "伏笔标题",
      "description": "伏笔说明",
      "importance": "major",
      "confidence": 75
    }
  ],
  "foreshadowingPayoffs": [
    {
      "title": "已回收伏笔标题",
      "description": "回收说明",
      "confidence": 70
    }
  ],
  "characterStateChanges": [
    {
      "characterName": "角色名",
      "change": "状态变化描述",
      "confidence": 80
    }
  ],
  "relationshipChanges": "人物关系变化描述",
  "conflictProgress": "冲突推进情况",
  "themeProgress": "主题推进情况",
  "styleNotes": [
    {
      "title": "风格特征名",
      "description": "风格描述",
      "confidence": 70
    }
  ],
  "conflictUpdates": [
    {
      "title": "矛盾标题",
      "newStatus": "active/escalated/stalemate/resolved/abandoned",
      "newIntensity": 1-10,
      "reason": "更新理由"
    }
  ]
}

要求：
- facts 中提取明确出现在正文中的事实三元组
- foreshadowingAdded 提取可能的新增伏笔
- foreshadowingPayoffs 提取本章节回收的伏笔
- characterStateChanges 提取角色的情感、立场或能力变化
- styleNotes 提取叙事风格特征
- conflictUpdates 提取本章节中涉及的已有矛盾的进展情况
- 如果某类没有相关内容，返回空数组 []
- confidence 范围 0-100`

    const parsed = await callAIJSON<StructuredAnalysis>(
      [{ role: 'user', content: prompt }],
      { temperature: 30 },
    )

    // Build memory fields (backward compatible with string fields)
    const keyEventsStr = Array.isArray(parsed.keyEvents)
      ? parsed.keyEvents.map(e => typeof e === 'string' ? e : e.title).join('；')
      : parsed.keyEvents || null

    const factsStr = parsed.facts?.length
      ? parsed.facts.map(f => `${f.subjectName} ${f.predicate} ${f.objectName}`).join('；')
      : (parsed.newFacts || null)

    const foreshadowingAddedStr = parsed.foreshadowingAdded?.length
      ? parsed.foreshadowingAdded.map(f => f.title).join('；')
      : null

    const foreshadowingResolvedStr = parsed.foreshadowingPayoffs?.length
      ? parsed.foreshadowingPayoffs.map(f => f.title).join('；')
      : (parsed.foreshadowingResolved || null)

    const charChangesStr = parsed.characterStateChanges?.length
      ? parsed.characterStateChanges.map(c => `${c.characterName}：${c.change}`).join('；')
      : (typeof parsed.characterStateChanges === 'string' ? parsed.characterStateChanges : null)

    const styleNotesStr = Array.isArray(parsed.styleNotes)
      ? parsed.styleNotes.map(s => `${s.title}：${s.description}`).join('；')
      : (typeof parsed.styleNotes === 'string' ? parsed.styleNotes : null)

    const fields = {
      summary: parsed.summary || null,
      keyEvents: keyEventsStr,
      newFacts: factsStr,
      characterStateChanges: charChangesStr || parsed.characterStateChanges as any || null,
      relationshipChanges: parsed.relationshipChanges || null,
      conflictProgress: parsed.conflictProgress || null,
      foreshadowingAdded: foreshadowingAddedStr,
      foreshadowingResolved: foreshadowingResolvedStr,
      themeProgress: parsed.themeProgress || null,
      styleNotes: styleNotesStr,
    }

    // Generate pending suggestions from structured results
    if (parsed.facts?.length) {
      for (const fact of parsed.facts) {
        if (!fact.subjectName || !fact.predicate || !fact.objectName)
          continue
        await createSuggestion(projectId, chapterId, runId, 'fact_triple', {
          subjectType: fact.subjectType,
          subjectName: fact.subjectName,
          predicate: fact.predicate,
          objectType: fact.objectType,
          objectName: fact.objectName,
        }, fact.confidence || 70, fact.reason)
      }
    }

    if (parsed.foreshadowingAdded?.length) {
      for (const fs of parsed.foreshadowingAdded) {
        if (!fs.title)
          continue
        await createSuggestion(projectId, chapterId, runId, 'foreshadowing_add', {
          title: fs.title,
          description: fs.description || '',
          importance: fs.importance || 'normal',
        }, fs.confidence || 70)
      }
    }

    if (parsed.foreshadowingPayoffs?.length) {
      const openForeshadowing = await db.select().from(foreshadowingItems).where(and(
        eq(foreshadowingItems.projectId, projectId),
        eq(foreshadowingItems.status, 'open'),
      ))

      function matchForeshadowingByTitle(title: string) {
        const normalizedTitle = title.trim()
        return openForeshadowing.find(item =>
          item.title === normalizedTitle
          || normalizedTitle.includes(item.title)
          || item.title.includes(normalizedTitle),
        )
      }

      for (const fp of parsed.foreshadowingPayoffs) {
        if (!fp.title)
          continue
        const matched = matchForeshadowingByTitle(fp.title)
        await createSuggestion(projectId, chapterId, runId, 'foreshadowing_payoff', {
          foreshadowingId: matched?.id || null,
          title: fp.title,
          description: fp.description || '',
          matchedTitle: matched?.title || null,
        }, fp.confidence || 70)
      }
    }

    if (parsed.characterStateChanges?.length) {
      for (const cs of parsed.characterStateChanges) {
        if (!cs.characterName || !cs.change)
          continue
        await createSuggestion(projectId, chapterId, runId, 'character_state', {
          characterName: cs.characterName,
          change: cs.change,
        }, cs.confidence || 70)
      }
    }

    if (Array.isArray(parsed.keyEvents)) {
      for (const evt of parsed.keyEvents) {
        if (typeof evt === 'string' || !evt.title)
          continue
        await createSuggestion(projectId, chapterId, runId, 'chapter_element', {
          elementType: 'event',
          elementName: evt.title,
          relationType: 'occurs',
          importance: evt.importance || 'normal',
          notes: evt.description || '',
        }, 60)
      }
    }

    if (Array.isArray(parsed.styleNotes)) {
      for (const sn of parsed.styleNotes) {
        if (!sn.title)
          continue
        await createSuggestion(projectId, chapterId, runId, 'style_note', {
          title: sn.title,
          description: sn.description || '',
        }, sn.confidence || 60)
      }
    }

    const conflictUpdatesToReturn: any[] = []
    if (parsed.conflictUpdates?.length) {
      const projectConflicts = await db.select().from(conflicts).where(eq(conflicts.projectId, projectId))

      for (const update of parsed.conflictUpdates) {
        if (!update.title)
          continue

        const matched = projectConflicts.find(c =>
          c.title === update.title
          || update.title.includes(c.title)
          || c.title.includes(update.title),
        )

        await createSuggestion(projectId, chapterId, runId, 'conflict_update', {
          conflictId: matched?.id || null,
          title: update.title,
          newStatus: update.newStatus,
          newIntensity: update.newIntensity,
          reason: update.reason,
        }, matched ? 80 : 50)

        if (matched) {
          conflictUpdatesToReturn.push({
            conflictId: matched.id,
            newStatus: update.newStatus,
            newIntensity: update.newIntensity,
            progressNote: update.reason,
          })
        }
      }
    }

    // Handle legacy string fields for backward compatibility
    if (!parsed.facts?.length && parsed.newFacts) {
      await createSuggestion(projectId, chapterId, runId, 'continuity_note', {
        title: '新事实待整理',
        description: parsed.newFacts,
      }, 50, 'AI 返回了非结构化事实描述')
    }

    const warnings: string[] = []
    if (parsed.foreshadowingAdded?.length || foreshadowingAddedStr) {
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

    await db.update(chapterPostprocessRuns).set({
      status: 'completed',
      finishedAt: new Date().toISOString(),
    }).where(eq(chapterPostprocessRuns.id, runId))

    return { memory, warnings, conflictUpdates: conflictUpdatesToReturn }
  }
  catch (error: any) {
    await db.update(chapterPostprocessRuns).set({
      status: 'failed',
      errorMessage: error.message || 'Unknown error',
      finishedAt: new Date().toISOString(),
    }).where(eq(chapterPostprocessRuns.id, runId))
    throw error
  }
}

export async function runScenePostprocess(input: {
  projectId: string
  chapterId: string
  sceneId: string
  content: string
}): Promise<{ suggestionCount: number }> {
  const { projectId, chapterId, sceneId, content } = input

  const [scene] = await db.select().from(chapterScenes).where(and(
    eq(chapterScenes.id, sceneId),
    eq(chapterScenes.projectId, projectId),
    eq(chapterScenes.chapterId, chapterId),
  ))
  if (!scene)
    throw new Error('场景不存在或不属于当前章节')

  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('项目不存在')

  const truncatedContent = content.length > 4000
    ? `${content.substring(0, 4000)}...(内容过长已截断)`
    : content

  const prompt = `你是一位专业的长篇小说编辑。请分析以下单个场景正文，提取结构化信息。
场景级分析只生成待确认建议，不直接写入正式事实库。
返回严格 JSON，不要 markdown。

作品：${project.title}
章节：${chapterId}
场景 ${scene.sceneNumber}: ${scene.title || '未命名'}
场景目的: ${scene.purpose || '未定义'}
场景冲突: ${scene.conflict || '未定义'}
出场角色: ${scene.characters || '未定义'}

场景正文：
${truncatedContent}

请返回以下 JSON 格式：
{
  "facts": [
    { "subjectType": "string", "subjectName": "string", "predicate": "string", "objectType": "string", "objectName": "string", "confidence": 80, "reason": "string" }
  ],
  "foreshadowingAdded": [
    { "title": "string", "description": "string", "importance": "major", "confidence": 75 }
  ],
  "characterStateChanges": [
    { "characterName": "string", "change": "string", "confidence": 80 }
  ],
  "events": [
    { "title": "string", "description": "string", "importance": "major" }
  ]
}

要求：
- 只提取明确出现在正文中的内容
- 如果某类没有相关内容，返回空数组 []
- confidence 范围 0-100`

  const parsed = await callAIJSON<{
    facts: StructuredFact[]
    foreshadowingAdded: StructuredForeshadowing[]
    characterStateChanges: StructuredCharacterChange[]
    events: StructuredEvent[]
  }>([{ role: 'user', content: prompt }], { temperature: 30 })

  let count = 0

  if (parsed.facts?.length) {
    for (const fact of parsed.facts) {
      if (!fact.subjectName || !fact.predicate || !fact.objectName)
        continue
      await createSuggestion(projectId, chapterId, null, 'fact_triple', {
        ...fact,
        scope: 'scene',
        sceneId,
      }, fact.confidence || 70, fact.reason)
      count++
    }
  }

  if (parsed.foreshadowingAdded?.length) {
    for (const fs of parsed.foreshadowingAdded) {
      if (!fs.title)
        continue
      await createSuggestion(projectId, chapterId, null, 'foreshadowing_add', {
        ...fs,
        scope: 'scene',
        sceneId,
      }, fs.confidence || 70)
      count++
    }
  }

  if (parsed.characterStateChanges?.length) {
    for (const cs of parsed.characterStateChanges) {
      if (!cs.characterName || !cs.change)
        continue
      await createSuggestion(projectId, chapterId, null, 'character_state', {
        ...cs,
        scope: 'scene',
        sceneId,
      }, cs.confidence || 70)
      count++
    }
  }

  if (parsed.events?.length) {
    for (const evt of parsed.events) {
      if (!evt.title)
        continue
      await createSuggestion(projectId, chapterId, null, 'chapter_element', {
        elementType: 'event',
        elementName: evt.title,
        relationType: 'occurs',
        importance: evt.importance || 'normal',
        notes: evt.description || '',
        scope: 'scene',
        sceneId,
      }, 60)
      count++
    }
  }

  return { suggestionCount: count }
}
