import type { CharacterArcSnapshot, CharacterSnapshot } from '../character/character.eventing'
import type { RelationshipSnapshot } from '../character/relationship.eventing'
import type { ConflictSnapshot, ConflictTimelineSnapshot } from '../narrative/conflict.eventing'
import type { ForeshadowingSnapshot } from '../narrative/foreshadowing.eventing'
import type { StoryFactSnapshot } from '../narrative/narrative-knowledge.eventing'
import type { ChapterElementSnapshot } from '../story/chapter-knowledge.eventing'
import type { PostprocessCommandOptions } from './postprocess.commands'
import type { PostprocessSuggestionSnapshot } from './postprocess.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import {
  chapterPostprocessRuns,
  chapterPostprocessSuggestions,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
} from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { commandBus } from '../../eventing-runtime'
import { errorMessage, generateId } from '../../shared/utils'
import { normalizeCharacterPair } from '../character/character-utils.service'
import { compactCharacterPayload, dispatchCharacterCommand } from '../character/character.commands'
import {
  CHANGE_CHARACTER_COMMAND,
  CREATE_CHARACTER_COMMAND,
  RECORD_CHARACTER_ARC_EVENT_COMMAND,
} from '../character/character.eventing'
import { compactRelationshipPayload, dispatchRelationshipCommand } from '../character/relationship.commands'
import { CHANGE_RELATIONSHIP_COMMAND, CREATE_RELATIONSHIP_COMMAND } from '../character/relationship.eventing'
import { compactConflictPayload, dispatchConflictCommand } from '../narrative/conflict.commands'
import {
  CHANGE_CONFLICT_COMMAND,
  CREATE_CONFLICT_COMMAND,
  RECORD_CONFLICT_TIMELINE_COMMAND,
} from '../narrative/conflict.eventing'
import { compactForeshadowingPayload, dispatchForeshadowingCommand } from '../narrative/foreshadowing.commands'
import { CHANGE_FORESHADOWING_COMMAND, CREATE_FORESHADOWING_COMMAND } from '../narrative/foreshadowing.eventing'
import { compactNarrativeKnowledgePayload, dispatchNarrativeKnowledgeCommand } from '../narrative/narrative-knowledge.commands'
import { RECORD_STORY_FACT_COMMAND } from '../narrative/narrative-knowledge.eventing'
import { compactChapterKnowledgePayload, dispatchChapterKnowledgeCommand } from '../story/chapter-knowledge.commands'
import { ADD_CHAPTER_ELEMENT_COMMAND } from '../story/chapter-knowledge.eventing'
import { compactPostprocessPayload, dispatchPostprocessSuggestionCommand } from './postprocess.commands'
import {
  CHANGE_POSTPROCESS_SUGGESTION_COMMAND,
  GENERATE_POSTPROCESS_SUGGESTION_COMMAND,
} from './postprocess.eventing'
import { assertWritingJobAuthorized, RunAuthorizationRevokedError } from './run-authorization.service'

type ApprovalLevel = 'conservative' | 'balanced' | 'aggressive'
type SuggestionType = typeof chapterPostprocessSuggestions.$inferInsert['suggestionType']
type CharacterRole = typeof characters.$inferInsert['role']

export interface SuggestionRunScope {
  autonomousRunId: string
  postprocessRunId: string
  writingJobId: string
}

interface ApplySuggestionOptions extends PostprocessCommandOptions {
  requireActiveRun?: boolean
}

interface SuggestionPayload extends Record<string, unknown> {
  subjectName?: string
  subjectType?: string
  predicate?: string
  objectName?: string
  objectType?: string
  sourceType?: string
  relatedChapters?: unknown
  inferenceRule?: string
  inferenceKey?: string
  sourceTripleIds?: unknown
  sourceElementIds?: unknown
  sourceFacts?: unknown
  reason?: string
  title?: string
  description?: string
  foreshadowingId?: string
  importance?: 'major' | 'normal' | 'minor'
  elementName?: string
  elementType?: 'character' | 'location' | 'item' | 'organization' | 'event'
  elementId?: string
  relationType?: 'appears' | 'mentioned' | 'scene' | 'uses' | 'involved' | 'occurs'
  name?: string
  role?: string
  goal?: string
  fear?: string
  secret?: string
  desire?: string
  weakness?: string
  personality?: string
  arc?: string
  relations?: unknown[]
  characterName?: string
  change?: string
  sceneId?: string
  conflictId?: string
  newStatus?: typeof conflicts.$inferInsert['status']
  newIntensity?: number
  type?: string
  intensity?: number
  status?: string
  participants?: string
  characterAName?: string
  characterBName?: string
  strength?: number
}

const suggestionTypes = new Set<SuggestionType>([
  'fact_triple',
  'foreshadowing_add',
  'foreshadowing_payoff',
  'chapter_element',
  'character_add',
  'character_state',
  'conflict_add',
  'conflict_update',
  'continuity_note',
  'style_note',
  'relationship_update',
])

function parseSuggestionType(value: string): SuggestionType {
  if (suggestionTypes.has(value as SuggestionType))
    return value as SuggestionType
  throw new Error(`Unsupported suggestion type: ${value}`)
}

const characterRoles = new Set(['protagonist', 'antagonist', 'mentor', 'ally', 'supporting', 'extra'])

function normalizeChineseText(value: string) {
  return value
    .trim()
    .replace(/[《》“”"'：:，,。.!！?？\s]/g, '')
    .replace(/神秘/g, '')
    .replace(/来访者/g, '来客')
    .replace(/之谜$/, '')
    .replace(/的秘密$/, '')
}

function isSimilarTitle(a?: string | null, b?: string | null) {
  if (!a || !b)
    return false
  const left = normalizeChineseText(a)
  const right = normalizeChineseText(b)
  if (!left || !right)
    return false
  return left === right || left.includes(right) || right.includes(left)
}

function shouldPromoteRelationshipRole(type?: string, strength?: number) {
  return ['family', 'lover', 'mentor'].includes(type || '') || (strength || 0) >= 6
}

export interface ApplyResult {
  applied: number
  acknowledged: number
  failed: number
  skipped: number
}

export interface SuggestionCommandContext {
  commandId: string
  correlationId: string
  causationId: string
}

function childCommandContext(context: SuggestionCommandContext | undefined, suffix: string) {
  if (!context)
    return undefined
  return {
    commandId: `${context.commandId}:${suffix}`,
    correlationId: context.correlationId,
    causationId: context.causationId,
  }
}

export async function createSuggestion(
  projectId: string,
  chapterId: string,
  runId: string | null,
  suggestionType: string,
  payload: object,
  confidence = 70,
  reason?: string,
  options: PostprocessCommandOptions = {},
) {
  const normalizedType = parseSuggestionType(suggestionType)
  const payloadText = JSON.stringify(payload)
  const [postprocessRun] = runId
    ? await db.select({ autonomousRunId: chapterPostprocessRuns.autonomousRunId, writingJobId: chapterPostprocessRuns.writingJobId })
        .from(chapterPostprocessRuns)
        .where(and(
          eq(chapterPostprocessRuns.id, runId),
          eq(chapterPostprocessRuns.projectId, projectId),
          eq(chapterPostprocessRuns.chapterId, chapterId),
        ))
    : []
  if (runId && !postprocessRun)
    throw new Error('章后处理批次不存在')

  const conditions = [
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.chapterId, chapterId),
    eq(chapterPostprocessSuggestions.suggestionType, normalizedType),
    eq(chapterPostprocessSuggestions.payload, payloadText),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  ]
  if (runId)
    conditions.push(eq(chapterPostprocessSuggestions.runId, runId))
  const [existing] = await db.select().from(chapterPostprocessSuggestions).where(and(...conditions))
  if (existing)
    return existing

  const id = generateId()
  return dispatchPostprocessSuggestionCommand<PostprocessSuggestionSnapshot>(
    GENERATE_POSTPROCESS_SUGGESTION_COMMAND,
    projectId,
    id,
    compactPostprocessPayload({
      chapterId,
      runId,
      autonomousRunId: postprocessRun?.autonomousRunId ?? null,
      writingJobId: postprocessRun?.writingJobId ?? null,
      suggestionType: normalizedType,
      payload: payloadText,
      confidence,
      reason: reason ?? null,
    }),
    options,
  )
}

export async function getSuggestions(projectId: string, chapterId: string, runIdOrScope?: string | SuggestionRunScope) {
  const conditions = [
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.chapterId, chapterId),
  ]
  if (typeof runIdOrScope === 'string') {
    conditions.push(eq(chapterPostprocessSuggestions.runId, runIdOrScope))
  }
  else if (runIdOrScope) {
    conditions.push(
      eq(chapterPostprocessSuggestions.autonomousRunId, runIdOrScope.autonomousRunId),
      eq(chapterPostprocessSuggestions.runId, runIdOrScope.postprocessRunId),
      eq(chapterPostprocessSuggestions.writingJobId, runIdOrScope.writingJobId),
    )
  }
  return db.select().from(chapterPostprocessSuggestions).where(and(...conditions))
}

export async function getProjectSuggestions(projectId: string, type?: string) {
  const conditions = [
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  ]
  if (type)
    conditions.push(eq(chapterPostprocessSuggestions.suggestionType, parseSuggestionType(type)))
  return db.select().from(chapterPostprocessSuggestions).where(and(...conditions))
}

export async function acceptSuggestion(projectId: string, id: string, options: PostprocessCommandOptions = {}) {
  return dispatchPostprocessSuggestionCommand<PostprocessSuggestionSnapshot>(CHANGE_POSTPROCESS_SUGGESTION_COMMAND, projectId, id, { status: 'accepted' }, options)
}

export async function applySuggestion(projectId: string, id: string, options: ApplySuggestionOptions = {}) {
  try {
    if (options.requireActiveRun) {
      const [candidate] = await db.select({ writingJobId: chapterPostprocessSuggestions.writingJobId })
        .from(chapterPostprocessSuggestions)
        .where(and(eq(chapterPostprocessSuggestions.id, id), eq(chapterPostprocessSuggestions.projectId, projectId)))
      if (!candidate?.writingJobId)
        throw new Error('自动建议缺少写作作业作用域')
      await assertWritingJobAuthorized(projectId, candidate.writingJobId)
    }

    const suggestion = await claimSuggestion(projectId, id)
    if (suggestion.status === 'applied' || suggestion.status === 'acknowledged')
      return suggestion

    const payload = parseSuggestionPayload(suggestion.payload)
    return await commandBus.runAtomically(async () => {
      if (options.requireActiveRun && suggestion.writingJobId)
        await assertWritingJobAuthorized(projectId, suggestion.writingJobId)
      const resultStatus = await applyOneSuggestion(
        suggestion.suggestionType,
        payload,
        projectId,
        suggestion.chapterId,
        suggestion.confidence,
        {
          commandId: options.commandId ? `${options.commandId}:domain` : `ApplySuggestion:${suggestion.id}`,
          correlationId: options.correlationId ?? suggestion.runId ?? suggestion.id,
          causationId: suggestion.id,
        },
      )
      return dispatchPostprocessSuggestionCommand<PostprocessSuggestionSnapshot>(
        CHANGE_POSTPROCESS_SUGGESTION_COMMAND,
        projectId,
        id,
        { status: resultStatus },
        { commandId: options.commandId ? `${options.commandId}:complete` : undefined, correlationId: options.correlationId },
      )
    })
  }
  catch (error: unknown) {
    if (error instanceof RunAuthorizationRevokedError)
      throw error
    const message = errorMessage(error)
    if (message !== '建议不存在' && message !== '建议已拒绝，不能应用') {
      await dispatchPostprocessSuggestionCommand(
        CHANGE_POSTPROCESS_SUGGESTION_COMMAND,
        projectId,
        id,
        { status: 'apply_failed' },
      )
    }
    throw error
  }
}

async function claimSuggestion(projectId: string, id: string) {
  const [current] = await db.select().from(chapterPostprocessSuggestions).where(and(
    eq(chapterPostprocessSuggestions.id, id),
    eq(chapterPostprocessSuggestions.projectId, projectId),
  ))
  if (!current)
    throw new Error('建议不存在')
  if (current.status === 'rejected')
    throw new Error('建议已拒绝，不能应用')
  if (['pending', 'accepted', 'apply_failed'].includes(current.status)) {
    return dispatchPostprocessSuggestionCommand<PostprocessSuggestionSnapshot>(
      CHANGE_POSTPROCESS_SUGGESTION_COMMAND,
      projectId,
      id,
      { status: 'applying' },
    )
  }
  return current
}

function parseSuggestionPayload(value: string): SuggestionPayload {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('payload is not an object')
    return parsed as SuggestionPayload
  }
  catch {
    throw new Error('建议数据格式错误')
  }
}

export async function rejectSuggestion(projectId: string, id: string, options: PostprocessCommandOptions = {}) {
  return dispatchPostprocessSuggestionCommand<PostprocessSuggestionSnapshot>(CHANGE_POSTPROCESS_SUGGESTION_COMMAND, projectId, id, { status: 'rejected' }, options)
}

export async function applyAcceptedSuggestions(projectId: string, chapterId: string, scope?: SuggestionRunScope): Promise<ApplyResult> {
  const conditions = [
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.chapterId, chapterId),
    eq(chapterPostprocessSuggestions.status, 'accepted'),
  ]
  if (scope) {
    conditions.push(
      eq(chapterPostprocessSuggestions.autonomousRunId, scope.autonomousRunId),
      eq(chapterPostprocessSuggestions.runId, scope.postprocessRunId),
      eq(chapterPostprocessSuggestions.writingJobId, scope.writingJobId),
    )
  }
  const accepted = await db.select().from(chapterPostprocessSuggestions).where(and(...conditions))

  let applied = 0
  let acknowledged = 0
  let failed = 0
  let skipped = 0

  for (const suggestion of accepted) {
    try {
      const updated = await applySuggestion(projectId, suggestion.id, { requireActiveRun: Boolean(scope) })
      if (updated.status === 'applied')
        applied++
      else if (updated.status === 'acknowledged')
        acknowledged++
      else
        skipped++
    }
    catch (error: unknown) {
      console.error(`Failed to apply suggestion ${suggestion.id}:`, error)
      failed++
    }
  }

  return { applied, acknowledged, failed, skipped }
}

/**
 * 自动根据风险等级筛选并应用建议 (全自动模式使用)
 */
export async function applyAutoSuggestions(projectId: string, chapterId: string, level: ApprovalLevel, scope: SuggestionRunScope): Promise<ApplyResult> {
  await assertWritingJobAuthorized(projectId, scope.writingJobId)
  const pending = await getSuggestions(projectId, chapterId, scope)
  const autoAcceptableIds: string[] = []

  for (const suggestion of pending) {
    if (suggestion.status !== 'pending')
      continue

    const confidence = suggestion.confidence || 0
    const type = suggestion.suggestionType

    const lowRisk = ['fact_triple', 'chapter_element', 'continuity_note', 'style_note'].includes(type)
    const mediumRisk = ['character_state', 'conflict_update', 'relationship_update'].includes(type)
    let isAcceptable = false

    if (level === 'conservative') {
      if (confidence >= 90 && lowRisk) {
        isAcceptable = true
      }
    }
    else if (level === 'balanced') {
      if (confidence >= 80 && lowRisk) {
        isAcceptable = true
      }
    }
    else if (level === 'aggressive') {
      if (confidence >= 70 && (lowRisk || mediumRisk)) {
        isAcceptable = true
      }
    }

    if (isAcceptable) {
      autoAcceptableIds.push(suggestion.id)
    }
  }

  if (autoAcceptableIds.length > 0) {
    for (const id of autoAcceptableIds)
      await acceptSuggestion(projectId, id)
  }

  return applyAcceptedSuggestions(projectId, chapterId, scope)
}

/**
 * 应用单条建议 (底层业务逻辑，可复用于变更集系统)
 */
export async function applyOneSuggestion(
  suggestionType: string,
  payload: SuggestionPayload,
  projectId: string,
  chapterId: string,
  confidence: number,
  commandContext?: SuggestionCommandContext,
): Promise<'applied' | 'acknowledged'> {
  switch (suggestionType) {
    case 'fact_triple': {
      if (!payload.subjectName || !payload.predicate || !payload.objectName)
        throw new Error('事实三元组缺少必要字段')
      try {
        await dispatchNarrativeKnowledgeCommand<StoryFactSnapshot>(
          RECORD_STORY_FACT_COMMAND,
          projectId,
          compactNarrativeKnowledgePayload({
            id: generateId(),
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
          }),
          commandContext,
        )
      }
      catch (error: unknown) {
        if (error instanceof DomainCommandError && error.code === 'STORY_FACT_ALREADY_EXISTS')
          return 'acknowledged'
        throw error
      }

      return 'applied'
    }

    case 'foreshadowing_add': {
      if (!payload.title)
        throw new Error('伏笔标题为空')
      const existingForeshadowing = await db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId))
      const matched = existingForeshadowing.find((item: typeof foreshadowingItems.$inferSelect) => isSimilarTitle(item.title, payload.title))
      if (matched) {
        if (payload.description && !matched.description?.includes(payload.description)) {
          await dispatchForeshadowingCommand<ForeshadowingSnapshot>(
            CHANGE_FORESHADOWING_COMMAND,
            projectId,
            matched.id,
            { description: [matched.description, payload.description].filter(Boolean).join('\n') },
            childCommandContext(commandContext, 'foreshadowing:change'),
          )
        }
        return 'acknowledged'
      }
      await dispatchForeshadowingCommand<ForeshadowingSnapshot>(
        CREATE_FORESHADOWING_COMMAND,
        projectId,
        generateId(),
        compactForeshadowingPayload({
          title: payload.title,
          description: payload.description,
          setupChapterId: chapterId,
          status: 'open',
          importance: payload.importance || 'normal',
        }),
        childCommandContext(commandContext, 'foreshadowing:create'),
      )
      return 'applied'
    }

    case 'foreshadowing_payoff': {
      if (!payload.foreshadowingId)
        return 'acknowledged'

      try {
        await dispatchForeshadowingCommand<ForeshadowingSnapshot>(
          CHANGE_FORESHADOWING_COMMAND,
          projectId,
          payload.foreshadowingId,
          { status: 'paid_off', payoffChapterId: chapterId },
          childCommandContext(commandContext, 'foreshadowing:payoff'),
        )
      }
      catch (error: unknown) {
        if (error instanceof DomainCommandError && error.code === 'FORESHADOWING_NOT_FOUND')
          throw new Error('未找到对应伏笔记录')
        throw error
      }

      return 'applied'
    }

    case 'chapter_element': {
      if (!payload.elementName)
        throw new Error('元素名称为空')
      try {
        await dispatchChapterKnowledgeCommand<ChapterElementSnapshot>(
          ADD_CHAPTER_ELEMENT_COMMAND,
          projectId,
          chapterId,
          compactChapterKnowledgePayload({
            id: generateId(),
            elementType: payload.elementType || 'event',
            elementId: payload.elementId || null,
            elementName: payload.elementName,
            relationType: payload.relationType || 'appears',
            importance: payload.importance || 'normal',
          }),
          childCommandContext(commandContext, 'chapter-element'),
        )
      }
      catch (error: unknown) {
        if (error instanceof DomainCommandError && error.code === 'CHAPTER_ELEMENT_DUPLICATE')
          return 'acknowledged'
        throw error
      }
      return 'applied'
    }

    case 'character_add': {
      if (!payload.name)
        throw new Error('角色名称为空')

      const [existing] = await db.select().from(characters).where(and(
        eq(characters.projectId, projectId),
        eq(characters.name, payload.name),
      ))

      const role: CharacterRole = typeof payload.role === 'string' && characterRoles.has(payload.role)
        ? payload.role as CharacterRole
        : 'extra'

      let characterId = existing?.id
      if (existing) {
        const nextRole = existing.role === 'extra' && role !== 'extra'
          ? role
          : existing.role || role
        await dispatchCharacterCommand<CharacterSnapshot>(
          CHANGE_CHARACTER_COMMAND,
          projectId,
          existing.id,
          compactCharacterPayload({
            role: nextRole,
            goal: existing.goal || payload.goal || undefined,
            fear: existing.fear || payload.fear || undefined,
            secret: existing.secret || payload.secret || undefined,
            desire: existing.desire || payload.desire || undefined,
            weakness: existing.weakness || payload.weakness || undefined,
            personality: existing.personality || payload.personality || undefined,
            arc: existing.arc || payload.arc || undefined,
          }),
          childCommandContext(commandContext, 'character:change'),
        )
      }
      else {
        const inserted = await dispatchCharacterCommand<CharacterSnapshot>(
          CREATE_CHARACTER_COMMAND,
          projectId,
          generateId(),
          compactCharacterPayload({
            name: payload.name,
            role,
            goal: payload.goal || null,
            fear: payload.fear || null,
            secret: payload.secret || null,
            desire: payload.desire || null,
            weakness: payload.weakness || null,
            personality: payload.personality || null,
            arc: payload.arc || null,
          }),
          childCommandContext(commandContext, 'character:create'),
        )
        characterId = inserted.id
      }

      if (characterId) {
        try {
          await dispatchChapterKnowledgeCommand<ChapterElementSnapshot>(
            ADD_CHAPTER_ELEMENT_COMMAND,
            projectId,
            chapterId,
            {
              id: generateId(),
              elementType: 'character',
              elementId: characterId,
              elementName: payload.name,
              relationType: 'appears',
              importance: role === 'extra' ? 'minor' : 'normal',
            },
            childCommandContext(commandContext, 'character:chapter-element'),
          )
        }
        catch (error: unknown) {
          if (!(error instanceof DomainCommandError && error.code === 'CHAPTER_ELEMENT_DUPLICATE'))
            throw error
        }
      }

      const relations = Array.isArray(payload.relations) ? payload.relations : []
      for (const relation of relations) {
        if (!relation || typeof relation !== 'object')
          continue
        const relationPayload = relation as Record<string, unknown>
        const targetName = typeof relationPayload.targetName === 'string' ? relationPayload.targetName : ''
        if (!targetName)
          continue
        await createSuggestion(projectId, chapterId, null, 'relationship_update', {
          characterAName: payload.name,
          characterBName: targetName,
          type: typeof relationPayload.type === 'string' ? relationPayload.type : 'acquaintance',
          strength: typeof relationPayload.strength === 'number' ? relationPayload.strength : 2,
          status: typeof relationPayload.status === 'string' ? relationPayload.status : '新角色与既有角色产生交集，等待自动处理。',
          description: typeof relationPayload.description === 'string' ? relationPayload.description : '由新增角色建议自动生成的关系候选。',
          sourceType: 'auto_inferred',
          inferenceRule: 'character_add_relation',
        }, 55, `新增角色 ${payload.name} 的关系候选`)
      }

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

        await dispatchCharacterCommand<CharacterSnapshot>(
          CHANGE_CHARACTER_COMMAND,
          projectId,
          char.id,
          { arc: updatedArc },
          childCommandContext(commandContext, 'character-state:change'),
        )

        // Also create a character arc event for structured tracking
        await dispatchCharacterCommand<CharacterArcSnapshot>(
          RECORD_CHARACTER_ARC_EVENT_COMMAND,
          projectId,
          char.id,
          {
            id: generateId(),
            chapterId,
            sceneId: payload.sceneId || null,
            eventType: 'belief_changed',
            afterState: payload.change,
            evidence: payload.change,
            sourceType: 'ai_extracted',
          },
          childCommandContext(commandContext, 'character-state:arc'),
        )

        return 'applied'
      }
      return 'acknowledged'
    }

    case 'conflict_update': {
      const conflictId = payload.conflictId
      if (!conflictId)
        return 'acknowledged'

      const updateData: Partial<typeof conflicts.$inferInsert> = {}
      if (payload.newStatus)
        updateData.status = payload.newStatus
      if (payload.newIntensity)
        updateData.intensity = payload.newIntensity

      // Fetch the conflict before update to capture before-state
      const [beforeConflict] = await db.select().from(conflicts).where(and(
        eq(conflicts.id, conflictId),
        eq(conflicts.projectId, projectId),
      ))

      if (!beforeConflict)
        throw new Error('未找到对应冲突记录')
      await dispatchConflictCommand<ConflictSnapshot>(
        CHANGE_CONFLICT_COMMAND,
        projectId,
        conflictId,
        compactConflictPayload(updateData),
        childCommandContext(commandContext, 'conflict:change'),
      )

      // Create a timeline event to record this transition
      if (beforeConflict) {
        const intensityBefore = beforeConflict.intensity
        const intensityAfter = updateData.intensity !== undefined ? updateData.intensity : intensityBefore
        const statusBefore = beforeConflict.status
        const statusAfter = updateData.status || statusBefore

        if (intensityBefore !== intensityAfter || statusBefore !== statusAfter) {
          await dispatchConflictCommand<ConflictTimelineSnapshot>(
            RECORD_CONFLICT_TIMELINE_COMMAND,
            projectId,
            conflictId,
            {
              id: generateId(),
              chapterId,
              sceneId: payload.sceneId || null,
              intensityBefore,
              intensityAfter,
              statusBefore,
              statusAfter,
              reason: payload.reason || null,
              evidence: null,
              sourceType: 'ai_extracted',
            },
            childCommandContext(commandContext, 'conflict:timeline'),
          )
        }
      }

      return 'applied'
    }

    case 'conflict_add': {
      if (!payload.title)
        throw new Error('冲突标题为空')
      const conflictType = payload.type === 'internal' ? 'internal' : 'external'
      const conflictStatuses = new Set<typeof conflicts.$inferInsert['status']>([
        'latent',
        'forming',
        'escalating',
        'exploding',
        'resolved',
        'abandoned',
      ])
      const conflictStatus = conflictStatuses.has(payload.status as typeof conflicts.$inferInsert['status'])
        ? payload.status as typeof conflicts.$inferInsert['status']
        : 'latent'
      await dispatchConflictCommand<ConflictSnapshot>(
        CREATE_CONFLICT_COMMAND,
        projectId,
        generateId(),
        compactConflictPayload({
          title: payload.title,
          type: conflictType,
          intensity: payload.intensity || 1,
          status: conflictStatus,
          participants: payload.participants,
          description: payload.description,
        }),
        childCommandContext(commandContext, 'conflict:create'),
      )

      return 'applied'
    }

    case 'relationship_update': {
      const { characterAName, characterBName, type, strength, status, description } = payload
      if (!characterAName || !characterBName)
        throw new Error('角色名称缺失')

      const [charA] = await db.select().from(characters).where(and(eq(characters.name, characterAName), eq(characters.projectId, projectId)))
      const [charB] = await db.select().from(characters).where(and(eq(characters.name, characterBName), eq(characters.projectId, projectId)))

      let finalCharA = charA
      if (!finalCharA) {
        const inserted = await dispatchCharacterCommand<CharacterSnapshot>(
          CREATE_CHARACTER_COMMAND,
          projectId,
          generateId(),
          { name: characterAName, role: 'extra' },
          childCommandContext(commandContext, 'relationship:character-a'),
        )
        finalCharA = inserted
      }

      let finalCharB = charB
      if (!finalCharB) {
        const inserted = await dispatchCharacterCommand<CharacterSnapshot>(
          CREATE_CHARACTER_COMMAND,
          projectId,
          generateId(),
          { name: characterBName, role: 'extra' },
          childCommandContext(commandContext, 'relationship:character-b'),
        )
        finalCharB = inserted
      }

      if (shouldPromoteRelationshipRole(type, strength)) {
        for (const character of [finalCharA, finalCharB]) {
          if (character.role === 'extra') {
            await dispatchCharacterCommand<CharacterSnapshot>(
              CHANGE_CHARACTER_COMMAND,
              projectId,
              character.id,
              { role: 'supporting' },
              childCommandContext(commandContext, `relationship:promote:${character.id}`),
            )
          }
        }
      }

      // 规范化 ID 顺序，确保数据库中 A < B，符合 uniqueIndex 要求
      const [charAId, charBId] = normalizeCharacterPair(finalCharA.id, finalCharB.id)

      const [existing] = await db.select().from(characterRelationships).where(and(
        eq(characterRelationships.projectId, projectId),
        eq(characterRelationships.characterAId, charAId),
        eq(characterRelationships.characterBId, charBId),
      ))

      if (existing) {
        await dispatchRelationshipCommand<RelationshipSnapshot>(
          CHANGE_RELATIONSHIP_COMMAND,
          projectId,
          existing.id,
          compactRelationshipPayload({
            type: type || existing.type,
            strength: strength !== undefined ? strength : existing.strength,
            status: status || existing.status,
            description: description || existing.description,
          }),
          childCommandContext(commandContext, 'relationship:change'),
        )
      }
      else {
        await dispatchRelationshipCommand<RelationshipSnapshot>(
          CREATE_RELATIONSHIP_COMMAND,
          projectId,
          generateId(),
          compactRelationshipPayload({
            characterAId: charAId,
            characterBId: charBId,
            type: type || 'acquaintance',
            strength: strength !== undefined ? strength : 1,
            status: status || '',
            description: description || '',
          }),
          childCommandContext(commandContext, 'relationship:create'),
        )
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
