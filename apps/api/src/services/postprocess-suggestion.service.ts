import type { AutoApprovalLevel } from '@ai-novel/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterElements,
  chapterPostprocessSuggestions,
  characterArcEvents,
  characterRelationships,
  characters,
  conflicts,
  conflictTimelineEvents,
  foreshadowingItems,
  storyFactTriples,
} from '../db/schema'
import { generateId, now } from '../utils'
import { normalizeCharacterPair } from './character-utils.service'
import { getOrCreateEmbedding } from './embedding.service'

const characterRoles = new Set(['protagonist', 'antagonist', 'mentor', 'ally', 'supporting', 'extra'])

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
  const payloadText = JSON.stringify(payload)
  const [existing] = await db.select().from(chapterPostprocessSuggestions).where(and(
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.chapterId, chapterId),
    eq(chapterPostprocessSuggestions.suggestionType, suggestionType as any),
    eq(chapterPostprocessSuggestions.payload, payloadText),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  ))
  if (existing)
    return existing

  const [row] = await db.insert(chapterPostprocessSuggestions).values({
    id: generateId(),
    projectId,
    chapterId,
    runId,
    suggestionType: suggestionType as any,
    payload: payloadText,
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

export async function applySuggestion(projectId: string, id: string) {
  try {
    return await db.transaction(async (tx) => {
      const [suggestion] = await tx.update(chapterPostprocessSuggestions)
        .set({
          status: 'applied',
          updatedAt: now(),
        })
        .where(and(
          eq(chapterPostprocessSuggestions.id, id),
          eq(chapterPostprocessSuggestions.projectId, projectId),
          inArray(chapterPostprocessSuggestions.status, ['pending', 'accepted']),
        ))
        .returning()

      if (!suggestion) {
        const [existing] = await tx.select().from(chapterPostprocessSuggestions).where(and(
          eq(chapterPostprocessSuggestions.id, id),
          eq(chapterPostprocessSuggestions.projectId, projectId),
        ))
        if (existing)
          throw new Error('建议已处理，不能重复应用')
        throw new Error('建议不存在')
      }

      let payload: Record<string, any>
      try {
        payload = JSON.parse(suggestion.payload)
      }
      catch {
        throw new Error('建议数据格式错误')
      }

      const resultStatus = await applyOneSuggestion(
        suggestion.suggestionType,
        payload,
        projectId,
        suggestion.chapterId,
        suggestion.confidence,
        tx as any,
      )

      if (resultStatus !== 'applied') {
        await tx.update(chapterPostprocessSuggestions)
          .set({ status: resultStatus, updatedAt: now() })
          .where(eq(chapterPostprocessSuggestions.id, id))
      }

      const [updated] = await tx.select().from(chapterPostprocessSuggestions).where(eq(chapterPostprocessSuggestions.id, id))
      return updated
    })
  }
  catch (error: any) {
    if (error.message !== '建议不存在' && error.message !== '建议已处理，不能重复应用') {
      await db.update(chapterPostprocessSuggestions)
        .set({ status: 'apply_failed', updatedAt: now() })
        .where(and(
          eq(chapterPostprocessSuggestions.id, id),
          eq(chapterPostprocessSuggestions.projectId, projectId),
          inArray(chapterPostprocessSuggestions.status, ['pending', 'accepted']),
        ))
    }
    throw error
  }
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
    try {
      const updated = await applySuggestion(projectId, suggestion.id)
      if (updated.status === 'applied')
        applied++
      else if (updated.status === 'acknowledged')
        acknowledged++
      else
        skipped++
    }
    catch (error: any) {
      console.error(`Failed to apply suggestion ${suggestion.id}:`, error)
      failed++
    }
  }

  return { applied, acknowledged, failed, skipped }
}

/**
 * 自动根据风险等级筛选并应用建议 (全自动模式使用)
 */
export async function applyAutoSuggestions(projectId: string, chapterId: string, level: AutoApprovalLevel): Promise<ApplyResult> {
  const pending = await getSuggestions(projectId, chapterId)
  const autoAcceptableIds: string[] = []

  for (const suggestion of pending) {
    if (suggestion.status !== 'pending')
      continue

    const confidence = suggestion.confidence || 0
    const type = suggestion.suggestionType

    let isAcceptable = false

    if (level === 'conservative') {
      // 保守模式：置信度 > 90 且非核心实体变更
      if (confidence >= 90 && !['character_add', 'conflict_add', 'foreshadowing_add'].includes(type)) {
        isAcceptable = true
      }
    }
    else if (level === 'balanced') {
      // 平衡模式：置信度 > 80
      if (confidence >= 80) {
        isAcceptable = true
      }
    }
    else if (level === 'aggressive') {
      // 进取模式：置信度 > 60
      if (confidence >= 60) {
        isAcceptable = true
      }
    }

    if (isAcceptable) {
      autoAcceptableIds.push(suggestion.id)
    }
  }

  if (autoAcceptableIds.length > 0) {
    await db.update(chapterPostprocessSuggestions).set({
      status: 'accepted',
      updatedAt: now(),
    }).where(and(
      eq(chapterPostprocessSuggestions.projectId, projectId),
      inArray(chapterPostprocessSuggestions.id, autoAcceptableIds),
    ))
  }

  return applyAcceptedSuggestions(projectId, chapterId)
}

/**
 * 应用单条建议 (底层业务逻辑，可复用于变更集系统)
 */
export async function applyOneSuggestion(
  suggestionType: string,
  payload: Record<string, any>,
  projectId: string,
  chapterId: string,
  confidence: number,
  tx: any = db, // 使用事务或默认数据库
): Promise<'applied' | 'acknowledged'> {
  switch (suggestionType) {
    case 'fact_triple': {
      if (!payload.subjectName || !payload.predicate || !payload.objectName)
        throw new Error('事实三元组缺少必要字段')
      const [insertedFact] = await tx.insert(storyFactTriples).values({
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
      }).onConflictDoNothing().returning()

      if (insertedFact) {
        await getOrCreateEmbedding({
          projectId,
          text: `${insertedFact.subjectName} ${insertedFact.predicate} ${insertedFact.objectName}`,
          contentType: 'fact_summary',
          sourceId: insertedFact.id,
        }).catch(err => console.error('Failed to embed fact triple:', err))
      }

      return 'applied'
    }

    case 'foreshadowing_add': {
      if (!payload.title)
        throw new Error('伏笔标题为空')
      await tx.insert(foreshadowingItems).values({
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

      const [updated] = await tx.update(foreshadowingItems).set({
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
      await tx.insert(chapterElements).values({
        id: generateId(),
        projectId,
        chapterId,
        elementType: payload.elementType || 'event',
        elementId: payload.elementId || null,
        elementName: payload.elementName,
        relationType: payload.relationType || 'appears',
        importance: payload.importance || 'normal',
      }).onConflictDoNothing()
      return 'applied'
    }

    case 'character_add': {
      if (!payload.name)
        throw new Error('角色名称为空')

      const [existing] = await tx.select().from(characters).where(and(
        eq(characters.projectId, projectId),
        eq(characters.name, payload.name),
      ))

      const role = typeof payload.role === 'string' && characterRoles.has(payload.role)
        ? payload.role
        : 'extra'

      let characterId = existing?.id
      if (existing) {
        await tx.update(characters).set({
          role: existing.role || role,
          goal: existing.goal || payload.goal || undefined,
          fear: existing.fear || payload.fear || undefined,
          secret: existing.secret || payload.secret || undefined,
          desire: existing.desire || payload.desire || undefined,
          weakness: existing.weakness || payload.weakness || undefined,
          personality: existing.personality || payload.personality || undefined,
          arc: existing.arc || payload.arc || undefined,
          updatedAt: now(),
        }).where(eq(characters.id, existing.id))
      }
      else {
        const [inserted] = await tx.insert(characters).values({
          id: generateId(),
          projectId,
          name: payload.name,
          role,
          goal: payload.goal || null,
          fear: payload.fear || null,
          secret: payload.secret || null,
          desire: payload.desire || null,
          weakness: payload.weakness || null,
          personality: payload.personality || null,
          arc: payload.arc || null,
        }).returning()
        characterId = inserted.id
      }

      if (characterId) {
        await tx.insert(chapterElements).values({
          id: generateId(),
          projectId,
          chapterId,
          elementType: 'character',
          elementId: characterId,
          elementName: payload.name,
          relationType: 'appears',
          importance: role === 'extra' ? 'minor' : 'normal',
        }).onConflictDoNothing()
      }

      const relations = Array.isArray(payload.relations) ? payload.relations : []
      for (const relation of relations) {
        if (!relation || typeof relation !== 'object')
          continue
        const targetName = typeof relation.targetName === 'string' ? relation.targetName : ''
        if (!targetName)
          continue
        await createSuggestion(projectId, chapterId, null, 'relationship_update', {
          characterAName: payload.name,
          characterBName: targetName,
          type: typeof relation.type === 'string' ? relation.type : 'acquaintance',
          strength: typeof relation.strength === 'number' ? relation.strength : 2,
          status: typeof relation.status === 'string' ? relation.status : '新角色与既有角色产生交集，等待确认。',
          description: typeof relation.description === 'string' ? relation.description : '由新增角色建议自动生成的关系候选。',
          sourceType: 'auto_inferred',
          inferenceRule: 'character_add_relation',
        }, 55, `新增角色 ${payload.name} 的关系候选`)
      }

      return 'applied'
    }

    case 'character_state': {
      if (!payload.characterName || !payload.change)
        return 'acknowledged'

      const [char] = await tx.select().from(characters).where(and(
        eq(characters.name, payload.characterName),
        eq(characters.projectId, projectId),
      ))

      if (char) {
        // Append the change to character's arc or personality (using arc as default for state change)
        const updatedArc = char.arc
          ? `${char.arc}\n- 章节 ${chapterId} 变化：${payload.change}`
          : `- 章节 ${chapterId} 变化：${payload.change}`

        await tx.update(characters).set({
          arc: updatedArc,
          updatedAt: now(),
        }).where(eq(characters.id, char.id))

        // Also create a character arc event for structured tracking
        const timestamp = now()
        const [insertedArc] = await tx.insert(characterArcEvents).values({
          id: generateId(),
          projectId,
          characterId: char.id,
          chapterId,
          sceneId: payload.sceneId || null,
          eventType: 'belief_changed',
          afterState: payload.change,
          evidence: payload.change,
          sourceType: 'ai_extracted',
          createdAt: timestamp,
          updatedAt: timestamp,
        }).onConflictDoNothing().returning()

        if (insertedArc) {
          await getOrCreateEmbedding({
            projectId,
            text: `${char.name}的变化：${payload.change}`,
            contentType: 'persona_memory',
            sourceId: insertedArc.id,
          }).catch(err => console.error('Failed to embed character state change:', err))
        }

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

      // Fetch the conflict before update to capture before-state
      const [beforeConflict] = await tx.select().from(conflicts).where(and(
        eq(conflicts.id, conflictId),
        eq(conflicts.projectId, projectId),
      ))

      const [updated] = await tx.update(conflicts).set(updateData).where(and(
        eq(conflicts.id, conflictId),
        eq(conflicts.projectId, projectId),
      )).returning()

      if (!updated)
        throw new Error('未找到对应冲突记录')

      // Create a timeline event to record this transition
      if (beforeConflict) {
        const intensityBefore = beforeConflict.intensity
        const intensityAfter = updateData.intensity !== undefined ? updateData.intensity : intensityBefore
        const statusBefore = beforeConflict.status
        const statusAfter = updateData.status || statusBefore

        if (intensityBefore !== intensityAfter || statusBefore !== statusAfter) {
          await tx.insert(conflictTimelineEvents).values({
            id: generateId(),
            projectId,
            conflictId,
            chapterId,
            sceneId: payload.sceneId || null,
            intensityBefore,
            intensityAfter,
            statusBefore,
            statusAfter,
            reason: payload.reason || null,
            evidence: null,
            sourceType: 'ai_extracted',
          })

          await getOrCreateEmbedding({
            projectId,
            text: `矛盾进展 [${updated.title}]：${payload.reason || '状态更新'}`,
            contentType: 'chapter_memory',
            sourceId: conflictId,
          }).catch(err => console.error('Failed to embed conflict update:', err))
        }
      }

      return 'applied'
    }

    case 'conflict_add': {
      if (!payload.title)
        throw new Error('冲突标题为空')
      const [insertedConflict] = await tx.insert(conflicts).values({
        id: generateId(),
        projectId,
        title: payload.title,
        type: payload.type || 'external',
        intensity: payload.intensity || 1,
        status: payload.status || 'latent',
        participants: payload.participants,
        description: payload.description,
      }).returning()

      if (insertedConflict && insertedConflict.description) {
        await getOrCreateEmbedding({
          projectId,
          text: `新矛盾 [${insertedConflict.title}]：${insertedConflict.description}`,
          contentType: 'chapter_memory',
          sourceId: insertedConflict.id,
        }).catch(err => console.error('Failed to embed new conflict:', err))
      }

      return 'applied'
    }

    case 'relationship_update': {
      const { characterAName, characterBName, type, strength, status, description } = payload
      if (!characterAName || !characterBName)
        throw new Error('角色名称缺失')

      const [charA] = await tx.select().from(characters).where(and(eq(characters.name, characterAName), eq(characters.projectId, projectId)))
      const [charB] = await tx.select().from(characters).where(and(eq(characters.name, characterBName), eq(characters.projectId, projectId)))

      if (!charA || !charB) {
        throw new Error(`匹配不到角色：${!charA ? characterAName : ''} ${!charB ? characterBName : ''}`)
      }

      // 规范化 ID 顺序，确保数据库中 A < B，符合 uniqueIndex 要求
      const [charAId, charBId] = normalizeCharacterPair(charA.id, charB.id)

      const [existing] = await tx.select().from(characterRelationships).where(and(
        eq(characterRelationships.projectId, projectId),
        eq(characterRelationships.characterAId, charAId),
        eq(characterRelationships.characterBId, charBId),
      ))

      if (existing) {
        await tx.update(characterRelationships).set({
          type: type || existing.type,
          strength: strength !== undefined ? strength : existing.strength,
          status: status || existing.status,
          description: description || existing.description,
          updatedAt: now(),
        }).where(eq(characterRelationships.id, existing.id))
      }
      else {
        await tx.insert(characterRelationships).values({
          id: generateId(),
          projectId,
          characterAId: charAId,
          characterBId: charBId,
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
