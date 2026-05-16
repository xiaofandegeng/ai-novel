import type { ChapterMemory, ChapterPostprocessResult } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterMemories, chapterPostprocessRuns, chapters, chapterScenes, chapterStyleFingerprints, characters, conflicts, foreshadowingItems, novelProjects } from '../db/schema'
import { callAIJSON } from './ai.service'
import { getOrCreateEmbedding } from './embedding.service'
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

interface StructuredNewCharacter {
  name: string
  role?: string
  personality?: string
  goal?: string
  desire?: string
  fear?: string
  secret?: string
  weakness?: string
  arc?: string
  confidence?: number
  reason?: string
  relations?: Array<{
    targetName: string
    type?: string
    strength?: number
    status?: string
    description?: string
  }>
}

interface StructuredStyleNote {
  title: string
  description: string
  confidence?: number
}

interface StructuredRelationshipUpdate {
  characterAName: string
  characterBName: string
  type: string
  strength: number
  status: string
  description: string
  confidence?: number
}

interface StructuredEvent {
  title: string
  description?: string
  importance?: string
}

function countMatches(content: string, words: string[]) {
  return words.reduce((sum, word) => sum + content.split(word).length - 1, 0)
}

function buildStyleFingerprint(content: string, styleNotes?: string | null) {
  const normalized = content.trim()
  const sentences = normalized
    .split(/[。！？!?；;\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
  const sentenceLengthAvg = sentences.length > 0
    ? Math.round(sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length)
    : 0

  const dialogueMarks = countMatches(normalized, ['“', '”', '"'])
  const dialogueRatio = normalized.length > 0
    ? Math.min(100, Math.round((dialogueMarks / Math.max(1, normalized.length / 80)) * 10))
    : 0

  const emotionHits = countMatches(normalized, ['恐惧', '愤怒', '痛苦', '悲伤', '惊讶', '犹豫', '渴望', '绝望', '兴奋', '冷静'])
  const conflictHits = countMatches(normalized, ['冲突', '对峙', '争执', '威胁', '背叛', '追击', '阻止', '反击', '代价', '危险'])
  const hookHits = countMatches(normalized, ['秘密', '真相', '线索', '异常', '消失', '名单', '钥匙', '门', '影子', '却'])
  const densityBase = Math.max(1, normalized.length / 1000)

  return {
    sentenceLengthAvg,
    dialogueRatio,
    emotionDensity: Math.min(100, Math.round((emotionHits / densityBase) * 20)),
    conflictDensity: Math.min(100, Math.round((conflictHits / densityBase) * 20)),
    hookDensity: Math.min(100, Math.round((hookHits / densityBase) * 20)),
    styleSummary: `平均句长 ${sentenceLengthAvg}，对话比例 ${dialogueRatio}%，情绪密度 ${emotionHits}，冲突密度 ${conflictHits}，钩子密度 ${hookHits}${styleNotes ? `；风格备注：${styleNotes}` : ''}`,
  }
}
export async function extractChapterChanges(input: {
  projectId: string
  chapterId: string
  content: string
  trigger: 'manual_save' | 'mark_completed' | 'auto_drive'
}): Promise<any> {
  const { projectId, chapterId, content, trigger } = input

  const [chapter] = await db.select().from(chapters).where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  ))
  if (!chapter)
    throw new Error('章节不存在')

  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))

  const truncatedContent = content.length > 6000
    ? `${content.substring(0, 6000)}...(内容过长已截断)`
    : content

  const prompt = `你是一位专业的长篇小说编辑。请分析以下章节正文，提取结构化记忆和待确认建议。
返回严格 JSON，不要 markdown。

作品：${project?.title}
当前章节：${chapter.title}
触发方式：${trigger}

章节正文：
${truncatedContent}

请返回以下 JSON 格式：
{
  "summary": "章节摘要",
  "keyEvents": [{ "title": "事件名", "description": "事件说明", "importance": "major" }],
  "facts": [{ "subjectType": "角色/地点/等", "subjectName": "主体名", "predicate": "关系谓词", "objectType": "角色/地点/等", "objectName": "客体名", "confidence": 80, "reason": "正文依据" }],
  "foreshadowingAdded": [{ "title": "伏笔标题", "description": "说明", "importance": "major", "confidence": 75 }],
  "foreshadowingPayoffs": [{ "title": "已回收伏笔标题", "description": "回收说明", "confidence": 70 }],
  "characterStateChanges": [{ "characterName": "角色名", "change": "变化描述", "confidence": 80 }],
  "relationshipChanges": "人物关系变化描述 (自然语言)",
  "relationshipUpdates": [
    { "characterAName": "角色A", "characterBName": "角色B", "type": "ally/enemy/lover/family/mentor/rival/acquaintance", "strength": 1, "status": "当前关系状态", "description": "关系变化依据", "confidence": 80 }
  ],
  "conflictProgress": "冲突推进情况 (自然语言)",
  "conflictUpdates": [
    { "title": "冲突标题", "newStatus": "active/escalated/stalemate/resolved/abandoned", "newIntensity": 1, "reason": "正文依据", "confidence": 80 }
  ],
  "themeProgress": "主题推进情况",
  "styleNotes": [{ "title": "风格特征", "description": "描述", "confidence": 70 }],
  "newCharacters": [{ "name": "新角色名", "role": "supporting/extra", "personality": "性格", "confidence": 70, "reason": "依据" }],
  "newConflicts": [{ "title": "新冲突标题", "type": "internal/external", "intensity": 5, "description": "描述" }],
  "presentCharacters": ["实际出场角色姓名"]
}`

  return await callAIJSON<any>(
    [{ role: 'user', content: prompt }],
    { temperature: 30 },
  )
}

export async function runChapterPostprocess(input: {
  projectId: string
  chapterId: string
  content: string
  trigger: 'manual_save' | 'mark_completed' | 'auto_drive'
}): Promise<ChapterPostprocessResult> {
  const { projectId, chapterId, content, trigger } = input

  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId))
  if (!chapter)
    throw new Error('章节不存在')

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
    const parsed = await extractChapterChanges({ projectId, chapterId, content, trigger })

    // Handle character associations

    // Handle character associations
    if (parsed.presentCharacters && Array.isArray(parsed.presentCharacters) && parsed.presentCharacters.length > 0) {
      try {
        const allCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))
        const presentIds = new Set<string>()

        // Retain existing characters as well
        let existingIds: string[] = []
        try {
          if (chapter.characters) {
            existingIds = JSON.parse(chapter.characters)
            existingIds.forEach(id => presentIds.add(id))
          }
        }
        catch { /* ignore parse error */ }

        for (const name of parsed.presentCharacters) {
          const found = allCharacters.find(c => c.name.includes(name) || name.includes(c.name))
          if (found) {
            presentIds.add(found.id)
          }
        }

        if (presentIds.size > existingIds.length) {
          await db.update(chapters)
            .set({ characters: JSON.stringify(Array.from(presentIds)) })
            .where(eq(chapters.id, chapterId))
        }
      }
      catch (err) {
        console.error('Failed to update chapter characters:', err)
      }
    }

    // Build memory fields (backward compatible with string fields)
    const keyEventsStr = Array.isArray(parsed.keyEvents)
      ? parsed.keyEvents.map((e: any) => typeof e === 'string' ? e : e.title).join('；')
      : parsed.keyEvents || null

    const factsStr = parsed.facts?.length
      ? parsed.facts.map((f: any) => `${f.subjectName} ${f.predicate} ${f.objectName}`).join('；')
      : (parsed.newFacts || null)

    const foreshadowingAddedStr = parsed.foreshadowingAdded?.length
      ? parsed.foreshadowingAdded.map((f: any) => f.title).join('；')
      : null

    const foreshadowingResolvedStr = parsed.foreshadowingPayoffs?.length
      ? parsed.foreshadowingPayoffs.map((f: any) => f.title).join('；')
      : (parsed.foreshadowingResolved || null)

    const charChangesStr = parsed.characterStateChanges?.length
      ? parsed.characterStateChanges.map((c: any) => `${c.characterName}：${c.change}`).join('；')
      : (typeof parsed.characterStateChanges === 'string' ? parsed.characterStateChanges : null)

    const styleNotesStr = Array.isArray(parsed.styleNotes)
      ? parsed.styleNotes.map((s: any) => `${s.title}：${s.description}`).join('；')
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

    if (parsed.newCharacters?.length) {
      const existingCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))

      for (const character of parsed.newCharacters) {
        if (!character.name)
          continue
        const exists = existingCharacters.some(c =>
          c.name === character.name
          || character.name.includes(c.name)
          || c.name.includes(character.name),
        )
        if (exists)
          continue

        await createSuggestion(projectId, chapterId, runId, 'character_add', {
          name: character.name,
          role: character.role || 'extra',
          personality: character.personality || '',
          goal: character.goal || '',
          desire: character.desire || '',
          fear: character.fear || '',
          secret: character.secret || '',
          weakness: character.weakness || '',
          arc: character.arc || '',
          relations: character.relations || [],
        }, character.confidence || 65, character.reason || '正文中出现了角色库未记录的人物')
      }
    }

    if (parsed.newConflicts?.length) {
      for (const conflict of parsed.newConflicts) {
        if (!conflict.title)
          continue
        await createSuggestion(projectId, chapterId, runId, 'conflict_add', {
          title: conflict.title,
          type: conflict.type,
          intensity: conflict.intensity,
          participants: conflict.participants,
          description: conflict.description,
        }, 75, `剧情走向：${conflict.title}`)
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

    if (parsed.relationshipUpdates?.length) {
      for (const rel of parsed.relationshipUpdates) {
        if (!rel.characterAName || !rel.characterBName)
          continue
        await createSuggestion(projectId, chapterId, runId, 'relationship_update', {
          characterAName: rel.characterAName,
          characterBName: rel.characterBName,
          type: rel.type,
          strength: rel.strength,
          status: rel.status,
          description: rel.description,
        }, rel.confidence || 70)
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

    // Trigger embedding for chapter memory RAG
    if (memory && memory.summary) {
      await getOrCreateEmbedding({
        projectId,
        text: memory.summary,
        contentType: 'chapter_memory',
        chunkId: memory.id, // Using memory ID as a virtual chunk ID for retrieval mapping
      }).catch(err => console.error('Failed to embed chapter memory:', err))
    }

    const styleFingerprint = buildStyleFingerprint(content, styleNotesStr)
    await db.delete(chapterStyleFingerprints).where(and(
      eq(chapterStyleFingerprints.projectId, projectId),
      eq(chapterStyleFingerprints.chapterId, chapterId),
    ))
    const [fingerprint] = await db.insert(chapterStyleFingerprints).values({
      id: crypto.randomUUID(),
      projectId,
      chapterId,
      sceneId: null,
      scope: 'chapter',
      sentenceLengthAvg: styleFingerprint.sentenceLengthAvg,
      dialogueRatio: styleFingerprint.dialogueRatio,
      emotionDensity: styleFingerprint.emotionDensity,
      conflictDensity: styleFingerprint.conflictDensity,
      hookDensity: styleFingerprint.hookDensity,
      styleSummary: styleFingerprint.styleSummary,
    }).returning()

    if (fingerprint) {
      await getOrCreateEmbedding({
        projectId,
        text: fingerprint.styleSummary || '',
        contentType: 'style_fingerprint',
        sourceId: fingerprint.id,
      }).catch(err => console.error('Failed to embed style fingerprint:', err))
    }

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
  "relationshipUpdates": [
    { "characterAName": "string", "characterBName": "string", "type": "ally/enemy/acquaintance", "strength": 1-10, "status": "string", "description": "string", "confidence": 80 }
  ],
  "newCharacters": [
    { "name": "string", "role": "supporting/extra/ally/antagonist/mentor", "personality": "string", "goal": "string", "desire": "string", "fear": "string", "secret": "string", "weakness": "string", "arc": "string", "confidence": 70, "reason": "string", "relations": [{ "targetName": "string", "type": "acquaintance", "strength": 2, "status": "string", "description": "string" }] }
  ],
  "presentCharacters": ["string"],
  "foreshadowingPayoffs": [
    { "title": "string", "description": "string", "confidence": 70 }
  ],
  "conflictUpdates": [
    { "title": "string", "newStatus": "active/escalated/stalemate/resolved/abandoned", "newIntensity": 1-10, "reason": "string" }
  ],
  "newConflicts": [
    { "title": "string", "type": "internal/external", "intensity": 1-10, "participants": "string", "description": "string" }
  ],
  "events": [
    { "title": "string", "description": "string", "importance": "major" }
  ],
  "styleNotes": [
    { "title": "string", "description": "string", "confidence": 70 }
  ]
}

要求：
- 只提取明确出现在正文中的内容
- 新角色、关系、伏笔回收、矛盾变化都只生成待确认建议
- 如果某类没有相关内容，返回空数组 []
- confidence 范围 0-100`

  const parsed = await callAIJSON<{
    facts: StructuredFact[]
    foreshadowingAdded: StructuredForeshadowing[]
    foreshadowingPayoffs: StructuredForeshadowing[]
    characterStateChanges: StructuredCharacterChange[]
    relationshipUpdates: StructuredRelationshipUpdate[]
    newCharacters: StructuredNewCharacter[]
    presentCharacters: string[]
    conflictUpdates: Array<{ title: string, newStatus?: string, newIntensity?: number, reason: string }>
    newConflicts: Array<{ title: string, type: 'internal' | 'external', intensity: number, participants: string, description: string }>
    events: StructuredEvent[]
    styleNotes: StructuredStyleNote[]
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

  if (parsed.foreshadowingPayoffs?.length) {
    const openForeshadowing = await db.select().from(foreshadowingItems).where(and(
      eq(foreshadowingItems.projectId, projectId),
      eq(foreshadowingItems.status, 'open'),
    ))

    for (const fp of parsed.foreshadowingPayoffs) {
      if (!fp.title)
        continue
      const normalizedTitle = fp.title.trim()
      const matched = openForeshadowing.find(item =>
        item.title === normalizedTitle
        || normalizedTitle.includes(item.title)
        || item.title.includes(normalizedTitle),
      )
      await createSuggestion(projectId, chapterId, null, 'foreshadowing_payoff', {
        foreshadowingId: matched?.id || null,
        title: fp.title,
        description: fp.description || '',
        matchedTitle: matched?.title || null,
        scope: 'scene',
        sceneId,
      }, fp.confidence || 70)
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

  if (parsed.presentCharacters?.length) {
    const allCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))

    for (const name of parsed.presentCharacters) {
      const found = allCharacters.find(c => c.name === name || name.includes(c.name) || c.name.includes(name))
      if (!found)
        continue

      await createSuggestion(projectId, chapterId, null, 'chapter_element', {
        elementType: 'character',
        elementId: found.id,
        elementName: found.name,
        relationType: 'appears',
        importance: found.role === 'extra' ? 'minor' : 'normal',
        scope: 'scene',
        sceneId,
      }, 60)
      count++
    }
  }

  if (parsed.newCharacters?.length) {
    const existingCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))
    for (const character of parsed.newCharacters) {
      if (!character.name)
        continue
      const exists = existingCharacters.some(c =>
        c.name === character.name
        || character.name.includes(c.name)
        || c.name.includes(character.name),
      )
      if (exists)
        continue
      await createSuggestion(projectId, chapterId, null, 'character_add', {
        name: character.name,
        role: character.role || 'extra',
        personality: character.personality || '',
        goal: character.goal || '',
        desire: character.desire || '',
        fear: character.fear || '',
        secret: character.secret || '',
        weakness: character.weakness || '',
        arc: character.arc || '',
        relations: character.relations || [],
        scope: 'scene',
        sceneId,
      }, character.confidence || 65, character.reason || '场景正文中出现了角色库未记录的人物')
      count++
    }
  }

  if (parsed.relationshipUpdates?.length) {
    for (const rel of parsed.relationshipUpdates) {
      if (!rel.characterAName || !rel.characterBName)
        continue
      await createSuggestion(projectId, chapterId, null, 'relationship_update', {
        characterAName: rel.characterAName,
        characterBName: rel.characterBName,
        type: rel.type,
        strength: rel.strength,
        status: rel.status,
        description: rel.description,
        scope: 'scene',
        sceneId,
      }, rel.confidence || 70)
      count++
    }
  }

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
      await createSuggestion(projectId, chapterId, null, 'conflict_update', {
        conflictId: matched?.id || null,
        title: update.title,
        newStatus: update.newStatus,
        newIntensity: update.newIntensity,
        reason: update.reason,
        scope: 'scene',
        sceneId,
      }, matched ? 80 : 50)
      count++
    }
  }

  if (parsed.newConflicts?.length) {
    for (const conflict of parsed.newConflicts) {
      if (!conflict.title)
        continue
      await createSuggestion(projectId, chapterId, null, 'conflict_add', {
        title: conflict.title,
        type: conflict.type,
        intensity: conflict.intensity,
        participants: conflict.participants,
        description: conflict.description,
        scope: 'scene',
        sceneId,
      }, 75, `场景推进：${conflict.title}`)
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

  if (parsed.styleNotes?.length) {
    for (const sn of parsed.styleNotes) {
      if (!sn.title)
        continue
      await createSuggestion(projectId, chapterId, null, 'style_note', {
        title: sn.title,
        description: sn.description || '',
        scope: 'scene',
        sceneId,
      }, sn.confidence || 60)
      count++
    }
  }

  // 生成场景风格指纹
  const styleNotesStr = parsed.styleNotes?.length
    ? parsed.styleNotes.map(s => `${s.title}：${s.description}`).join('；')
    : null
  const styleFingerprint = buildStyleFingerprint(content, styleNotesStr)
  const [fingerprint] = await db.insert(chapterStyleFingerprints).values({
    id: crypto.randomUUID(),
    projectId,
    chapterId,
    sceneId,
    scope: 'scene',
    sentenceLengthAvg: styleFingerprint.sentenceLengthAvg,
    dialogueRatio: styleFingerprint.dialogueRatio,
    emotionDensity: styleFingerprint.emotionDensity,
    conflictDensity: styleFingerprint.conflictDensity,
    hookDensity: styleFingerprint.hookDensity,
    styleSummary: styleFingerprint.styleSummary,
  }).returning()

  if (fingerprint) {
    await getOrCreateEmbedding({
      projectId,
      text: `场景文风 [${scene.title || `场景 ${scene.sceneNumber}`}]：${fingerprint.styleSummary}`,
      contentType: 'style_fingerprint',
      sourceId: fingerprint.id,
    }).catch(err => console.error('Failed to embed scene style fingerprint:', err))
  }

  return { suggestionCount: count }
}
