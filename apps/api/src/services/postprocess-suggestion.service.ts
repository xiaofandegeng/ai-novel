import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterElements, chapterPostprocessSuggestions, characterRelationships, characters, conflicts, foreshadowingItems, storyFactTriples } from '../db/schema'
import { generateId, now } from '../utils'

export interface ApplyResult {
  applied: number
  acknowledged: number
  failed: number
  skipped: number
}

export async function createSuggestion(
  projectId: string,
  chapterId: string,
  runId: string | null,
  suggestionType: string,
  payload: object,
  confidence = 70,
  reason?: string,
) {
  const [row] = await db.insert(chapterPostprocessSuggestions).values({
    id: generateId(),
    projectId,
    chapterId,
    runId,
    suggestionType: suggestionType as any,
    payload: JSON.stringify(payload),
    confidence,
    reason,
  }).returning()
  return row
}

export async function getSuggestions(projectId: string, chapterId: string, runId?: string) {
  const conditions = [
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.chapterId, chapterId),
  ]
  if (runId)
    conditions.push(eq(chapterPostprocessSuggestions.runId, runId))
  return db.select().from(chapterPostprocessSuggestions).where(and(...conditions))
}

export async function getProjectSuggestions(projectId: string, type?: string) {
  const conditions = [
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  ]
  if (type)
    conditions.push(eq(chapterPostprocessSuggestions.suggestionType, type as any))
  return db.select().from(chapterPostprocessSuggestions).where(and(...conditions))
}

export async function acceptSuggestion(projectId: string, id: string) {
  const [row] = await db.update(chapterPostprocessSuggestions).set({
    status: 'accepted',
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(chapterPostprocessSuggestions.id, id),
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  )).returning()
  return row
}

export async function rejectSuggestion(projectId: string, id: string) {
  const [row] = await db.update(chapterPostprocessSuggestions).set({
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(chapterPostprocessSuggestions.id, id),
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  )).returning()
  return row
}

export async function applyAcceptedSuggestions(projectId: string, chapterId: string): Promise<ApplyResult> {
  const accepted = await db.select().from(chapterPostprocessSuggestions).where(
    and(
      eq(chapterPostprocessSuggestions.projectId, projectId),
      eq(chapterPostprocessSuggestions.chapterId, chapterId),
      eq(chapterPostprocessSuggestions.status, 'accepted'),
    ),
  )

  let applied = 0
  let acknowledged = 0
  let failed = 0
  let skipped = 0

  for (const suggestion of accepted) {
    let payload: Record<string, any>
    try {
      payload = JSON.parse(suggestion.payload)
    }
    catch {
      skipped++
      await db.update(chapterPostprocessSuggestions).set({
        status: 'apply_failed',
        updatedAt: now(),
      }).where(eq(chapterPostprocessSuggestions.id, suggestion.id))
      continue
    }

    try {
      const resultStatus = await applyOneSuggestion(suggestion.suggestionType, payload, projectId, chapterId, suggestion.confidence)

      await db.update(chapterPostprocessSuggestions).set({
        status: resultStatus,
        updatedAt: now(),
      }).where(eq(chapterPostprocessSuggestions.id, suggestion.id))

      if (resultStatus === 'applied')
        applied++
      else if (resultStatus === 'acknowledged')
        acknowledged++
      else
        skipped++
    }
    catch {
      failed++
      await db.update(chapterPostprocessSuggestions).set({
        status: 'apply_failed',
        updatedAt: now(),
      }).where(eq(chapterPostprocessSuggestions.id, suggestion.id))
    }
  }

  return { applied, acknowledged, failed, skipped }
}

async function applyOneSuggestion(
  suggestionType: string,
  payload: Record<string, any>,
  projectId: string,
  chapterId: string,
  confidence: number,
): Promise<'applied' | 'acknowledged'> {
  switch (suggestionType) {
    case 'fact_triple': {
      if (!payload.subjectName || !payload.predicate || !payload.objectName)
        throw new Error('事实三元组缺少必要字段')
      await db.insert(storyFactTriples).values({
        id: generateId(),
        projectId,
        subjectType: payload.subjectType || 'unknown',
        subjectName: payload.subjectName,
        predicate: payload.predicate,
        objectType: payload.objectType || 'unknown',
        objectName: payload.objectName,
        confidence,
        sourceType: payload.sourceType === 'auto_inferred' ? 'auto_inferred' : 'ai_extracted',
        sourceChapterId: chapterId,
        status: 'confirmed',
        relatedChapters: payload.relatedChapters ? JSON.stringify(payload.relatedChapters) : undefined,
        notes: payload.inferenceRule || payload.reason
          ? JSON.stringify({
              inferenceRule: payload.inferenceRule,
              inferenceKey: payload.inferenceKey,
              sourceTripleIds: payload.sourceTripleIds,
              sourceElementIds: payload.sourceElementIds,
              sourceFacts: payload.sourceFacts,
              reason: payload.reason,
            })
          : undefined,
      }).onConflictDoNothing()
      return 'applied'
    }

    case 'foreshadowing_add': {
      if (!payload.title)
        throw new Error('伏笔标题为空')
      await db.insert(foreshadowingItems).values({
        id: generateId(),
        projectId,
        title: payload.title,
        description: payload.description,
        setupChapterId: chapterId,
        status: 'open',
        importance: payload.importance || 'normal',
      })
      return 'applied'
    }

    case 'foreshadowing_payoff': {
      if (!payload.foreshadowingId)
        return 'acknowledged'

      const [updated] = await db.update(foreshadowingItems).set({
        status: 'paid_off',
        payoffChapterId: chapterId,
        updatedAt: now(),
      }).where(and(
        eq(foreshadowingItems.id, payload.foreshadowingId),
        eq(foreshadowingItems.projectId, projectId),
      )).returning()

      if (!updated)
        throw new Error('未找到对应伏笔记录')

      return 'applied'
    }

    case 'chapter_element': {
      if (!payload.elementName)
        throw new Error('元素名称为空')
      await db.insert(chapterElements).values({
        id: generateId(),
        projectId,
        chapterId,
        elementType: payload.elementType || 'event',
        elementName: payload.elementName,
        relationType: payload.relationType || 'appears',
        importance: payload.importance || 'normal',
      }).onConflictDoNothing()
      return 'applied'
    }

    case 'character_state': {
      if (!payload.characterName || !payload.change)
        return 'acknowledged'

      const [char] = await db.select().from(characters).where(and(
        eq(characters.name, payload.characterName),
        eq(characters.projectId, projectId),
      ))

      if (char) {
        // Append the change to character's arc or personality (using arc as default for state change)
        const updatedArc = char.arc
          ? `${char.arc}\n- 章节 ${chapterId} 变化：${payload.change}`
          : `- 章节 ${chapterId} 变化：${payload.change}`

        await db.update(characters).set({
          arc: updatedArc,
          updatedAt: now(),
        }).where(eq(characters.id, char.id))
        return 'applied'
      }
      return 'acknowledged'
    }

    case 'conflict_update': {
      const conflictId = payload.conflictId
      if (!conflictId)
        return 'acknowledged'

      const updateData: any = { updatedAt: now() }
      if (payload.newStatus)
        updateData.status = payload.newStatus
      if (payload.newIntensity)
        updateData.intensity = payload.newIntensity

      const [updated] = await db.update(conflicts).set(updateData).where(and(
        eq(conflicts.id, conflictId),
        eq(conflicts.projectId, projectId),
      )).returning()

      if (!updated)
        throw new Error('未找到对应冲突记录')
      return 'applied'
    }

    case 'relationship_update': {
      const { characterAName, characterBName, type, strength, status, description } = payload
      if (!characterAName || !characterBName)
        throw new Error('角色名称缺失')

      const [charA] = await db.select().from(characters).where(and(eq(characters.name, characterAName), eq(characters.projectId, projectId)))
      const [charB] = await db.select().from(characters).where(and(eq(characters.name, characterBName), eq(characters.projectId, projectId)))

      if (!charA || !charB) {
        throw new Error(`匹配不到角色：${!charA ? characterAName : ''} ${!charB ? characterBName : ''}`)
      }

      // 规范化 ID 顺序，避免重复
      const [lowId, highId] = charA.id < charB.id ? [charA.id, charB.id] : [charB.id, charA.id]

      const [existing] = await db.select().from(characterRelationships).where(and(
        eq(characterRelationships.projectId, projectId),
        eq(characterRelationships.characterAId, lowId),
        eq(characterRelationships.characterBId, highId),
      ))

      if (existing) {
        await db.update(characterRelationships).set({
          type: type || existing.type,
          strength: strength !== undefined ? strength : existing.strength,
          status: status || existing.status,
          description: description || existing.description,
          updatedAt: now(),
        }).where(eq(characterRelationships.id, existing.id))
      }
      else {
        await db.insert(characterRelationships).values({
          id: generateId(),
          projectId,
          characterAId: lowId,
          characterBId: highId,
          type: type || 'acquaintance',
          strength: strength !== undefined ? strength : 1,
          status: status || '',
          description: description || '',
        })
      }
      return 'applied'
    }

    case 'continuity_note':
    case 'style_note':
      return 'acknowledged'

    default:
      return 'acknowledged'
  }
}
