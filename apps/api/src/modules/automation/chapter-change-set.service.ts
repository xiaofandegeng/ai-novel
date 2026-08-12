import type {
  ChapterChangeSet,
  ConsistencyGuardReport,
} from '@ai-novel/shared'
import type { ChapterChangeSetCommandOptions } from './chapter-change-set.commands'
import type { ChapterChangeSetItemSnapshot, ChapterChangeSetSnapshot } from './chapter-change-set.eventing'
import type { ExtractedChapterChanges } from './chapter-postprocess.service'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import {
  chapterChangeSetItems,
  chapterChangeSets,
  chapters,
  chapterScenes,
  writingJobSteps,
} from '../../db/schema'
import { commandBus } from '../../eventing-runtime'
import { errorMessage, generateId, now } from '../../shared/utils'
import { dispatchChapterKnowledgeCommand } from '../story/chapter-knowledge.commands'
import { RECORD_CHAPTER_MEMORY_COMMAND } from '../story/chapter-knowledge.eventing'
import { dispatchChapterCommand } from '../story/chapter.commands'
import { CHANGE_CHAPTER_COMMAND, CHANGE_SCENE_COMMAND } from '../story/chapter.eventing'
import { createSnapshot } from '../story/version.service'
import { compactChapterChangeSetPayload, dispatchChapterChangeSetCommand } from './chapter-change-set.commands'
import {
  CHANGE_CHANGE_SET_COMMAND,
  CHANGE_CHANGE_SET_ITEM_COMMAND,
  DRAFT_CHANGE_SET_COMMAND,
} from './chapter-change-set.eventing'
import { applyOneSuggestion } from './postprocess-suggestion.service'
import { assertWritingJobAuthorized, RunAuthorizationRevokedError } from './run-authorization.service'
import { dispatchWritingJobCommand } from './writing-job.commands'
import { CHANGE_WRITING_JOB_STEP_COMMAND } from './writing-job.eventing'

type ChapterPostprocessResult = ExtractedChapterChanges

type ChangeSetRow = typeof chapterChangeSets.$inferSelect
type ChangeSetItemRow = typeof chapterChangeSetItems.$inferSelect
type ChangeSetWithItems = ChangeSetRow & { items: ChangeSetItemRow[] }

async function changeChangeSet(
  projectId: string,
  changeSetId: string,
  fields: Partial<Pick<ChapterChangeSetSnapshot, 'status' | 'applyReportJson' | 'beforeSnapshotId' | 'afterSnapshotId' | 'appliedAt'>>,
  commandId?: string,
) {
  return dispatchChapterChangeSetCommand<ChapterChangeSetSnapshot>(
    CHANGE_CHANGE_SET_COMMAND,
    projectId,
    changeSetId,
    compactChapterChangeSetPayload(fields),
    commandId ? { commandId, correlationId: changeSetId, causationId: changeSetId } : {},
  )
}

async function changeChangeSetItem(
  projectId: string,
  changeSetId: string,
  itemId: string,
  fields: Partial<Pick<ChapterChangeSetItemSnapshot, 'status' | 'applyError'>>,
  commandId?: string,
) {
  return dispatchChapterChangeSetCommand<ChapterChangeSetItemSnapshot>(
    CHANGE_CHANGE_SET_ITEM_COMMAND,
    projectId,
    changeSetId,
    compactChapterChangeSetPayload({ id: itemId, ...fields }),
    commandId ? { commandId, correlationId: changeSetId, causationId: itemId } : {},
  )
}

function objectPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  throw new Error('Change set item payload must be an object')
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined)
    return undefined
  if (value === null)
    return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * 创建章节变更集
 */
export async function createChapterChangeSet(input: {
  projectId: string
  chapterId: string
  sceneId?: string
  writingJobId?: string
  sourceStepId?: string
  draftTitle?: string
  draftContent: string
  consistencyReport: ConsistencyGuardReport
  extractedChanges: ChapterPostprocessResult
}): Promise<ChapterChangeSet> {
  const {
    projectId,
    chapterId,
    sceneId,
    writingJobId,
    sourceStepId,
    draftTitle,
    draftContent,
    consistencyReport,
    extractedChanges,
  } = input

  const id = generateId()

  // P1-5: 增加归属校验
  const [chapter] = await db.select({ id: chapters.id }).from(chapters).where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  ))
  if (!chapter)
    throw new Error('Chapter not found or project mismatch')

  if (sceneId) {
    const [scene] = await db.select({ id: chapterScenes.id }).from(chapterScenes).where(and(
      eq(chapterScenes.id, sceneId),
      eq(chapterScenes.projectId, projectId),
      eq(chapterScenes.chapterId, chapterId),
    ))
    if (!scene)
      throw new Error('Scene not found or project mismatch')
  }

  // Calculate risk level based on consistency report and extracted changes
  const riskLevel = calculateRiskLevel(consistencyReport, extractedChanges)
  const riskSummary = generateRiskSummary(consistencyReport, extractedChanges)

  const items = createChangeSetItems(draftContent, extractedChanges)
  return commandBus.runAtomically(async () => {
    const changeSet = await dispatchChapterChangeSetCommand<ChapterChangeSetSnapshot>(
      DRAFT_CHANGE_SET_COMMAND,
      projectId,
      id,
      compactChapterChangeSetPayload({
        chapterId,
        sceneId: sceneId || null,
        writingJobId: writingJobId || null,
        sourceStepId: sourceStepId || null,
        riskLevel,
        riskSummary,
        draftTitle: draftTitle || null,
        draftContent,
        consistencyReportJson: consistencyReport,
        extractedChangesJson: extractedChanges,
        items,
      }),
      { commandId: `DraftChangeSet:${id}`, correlationId: id },
    )

    // Update the writing job step if provided
    if (sourceStepId) {
      const [sourceStep] = await db.select({ jobId: writingJobSteps.jobId })
        .from(writingJobSteps)
        .where(eq(writingJobSteps.id, sourceStepId))
        .limit(1)
      if (sourceStep) {
        await dispatchWritingJobCommand(
          CHANGE_WRITING_JOB_STEP_COMMAND,
          projectId,
          sourceStep.jobId,
          { id: sourceStepId, changeSetId: id },
          {
            commandId: `CreateChangeSet:${id}:link-step`,
            correlationId: id,
            causationId: id,
          },
        )
      }
    }

    return changeSet
  })
}

function calculateRiskLevel(report: ConsistencyGuardReport, changes: ChapterPostprocessResult): 'low' | 'medium' | 'high' {
  if (report.overallStatus === 'blocked')
    return 'high'

  // High risk triggers
  if ((changes.newCharacters?.length ?? 0) > 0)
    return 'high'
  if ((changes.newConflicts?.length ?? 0) > 0)
    return 'high'
  if (changes.relationshipUpdates?.some(r => r.strength > 7))
    return 'high'
  if ((changes.foreshadowingPayoffs?.length ?? 0) > 0)
    return 'high'

  if (report.overallStatus === 'warning')
    return 'medium'
  if ((changes.foreshadowingAdded?.length ?? 0) > 0)
    return 'medium'
  if ((changes.foreshadowingPayoffs?.length ?? 0) > 0)
    return 'medium'

  return 'low'
}

function generateRiskSummary(report: ConsistencyGuardReport, changes: ChapterPostprocessResult): string {
  const parts: string[] = []
  if (report.overallStatus !== 'pass') {
    parts.push(`一致性审查：${report.overallStatus === 'blocked' ? '存在严重冲突' : '存在轻微偏差'}`)
  }
  if (changes.newCharacters?.length)
    parts.push(`发现 ${changes.newCharacters.length} 个新人物`)
  if (changes.newConflicts?.length)
    parts.push(`发现 ${changes.newConflicts.length} 个新冲突`)
  if (changes.foreshadowingAdded?.length)
    parts.push(`新增 ${changes.foreshadowingAdded.length} 个伏笔`)

  return parts.join('；') || '未发现显著风险'
}

function createChangeSetItems(
  draftContent: string,
  changes: ChapterPostprocessResult,
) {
  const items: Array<Pick<typeof chapterChangeSetItems.$inferInsert, 'id' | 'itemType' | 'title' | 'payloadJson' | 'riskLevel'>> = []

  // Draft item
  items.push({
    id: generateId(),
    itemType: 'draft',
    title: '章节正文草稿',
    payloadJson: { content: draftContent },
    riskLevel: 'low',
  })

  // Memory item
  items.push({
    id: generateId(),
    itemType: 'chapter_memory',
    title: '章节记忆摘要',
    payloadJson: {
      summary: changes.summary,
      keyEvents: changes.keyEvents,
      characterStateChanges: changes.characterStateChanges,
      relationshipChanges: changes.relationshipChanges,
      conflictProgress: changes.conflictProgress,
      themeProgress: changes.themeProgress,
    },
    riskLevel: 'low',
  })

  // Characters
  if (changes.newCharacters?.length) {
    for (const char of changes.newCharacters) {
      items.push({
        id: generateId(),
        itemType: 'character_create',
        title: `发现新人物：${char.name}`,
        payloadJson: char,
        riskLevel: 'high',
      })
    }
  }

  // Facts
  if (changes.facts?.length) {
    for (const fact of changes.facts) {
      items.push({
        id: generateId(),
        itemType: 'fact_create',
        title: `提取事实：${fact.subjectName} ${fact.predicate} ${fact.objectName}`,
        payloadJson: fact,
        riskLevel: (fact.confidence ?? 70) < 70 ? 'medium' : 'low',
      })
    }
  }

  // Foreshadowing
  if (changes.foreshadowingAdded?.length) {
    for (const fs of changes.foreshadowingAdded) {
      items.push({
        id: generateId(),
        itemType: 'foreshadowing_create',
        title: `新增伏笔：${fs.title}`,
        payloadJson: fs,
        riskLevel: 'medium',
      })
    }
  }

  // Foreshadowing Payoffs
  if (changes.foreshadowingPayoffs?.length) {
    for (const payoff of changes.foreshadowingPayoffs) {
      items.push({
        id: generateId(),
        itemType: 'foreshadowing_payoff',
        title: `回收伏笔：${payoff.title}`,
        payloadJson: payoff,
        riskLevel: 'medium',
      })
    }
  }

  // Relationship Updates
  if (changes.relationshipUpdates?.length) {
    for (const rel of changes.relationshipUpdates) {
      items.push({
        id: generateId(),
        itemType: 'relationship_update',
        title: `关系变化：${rel.characterAName} & ${rel.characterBName}`,
        payloadJson: rel,
        riskLevel: rel.strength > 7 ? 'high' : 'medium',
      })
    }
  }

  // Conflicts
  if (changes.newConflicts?.length) {
    for (const conflict of changes.newConflicts) {
      items.push({
        id: generateId(),
        itemType: 'conflict_create',
        title: `发现新矛盾：${conflict.title}`,
        payloadJson: conflict,
        riskLevel: 'high',
      })
    }
  }

  if (changes.conflictUpdates?.length) {
    for (const update of changes.conflictUpdates) {
      items.push({
        id: generateId(),
        itemType: 'conflict_update',
        title: `矛盾推进：${update.title}`,
        payloadJson: update,
        riskLevel: 'medium',
      })
    }
  }

  // Notes
  if (Array.isArray(changes.styleNotes) && changes.styleNotes.length) {
    for (const note of changes.styleNotes) {
      items.push({
        id: generateId(),
        itemType: 'style_note',
        title: `风格笔记：${note.title || '新风格建议'}`,
        payloadJson: note,
        riskLevel: 'low',
      })
    }
  }

  return items
}

export async function getChapterChangeSets(projectId: string, chapterId: string): Promise<ChapterChangeSet[]> {
  return db.select().from(chapterChangeSets).where(and(
    eq(chapterChangeSets.projectId, projectId),
    eq(chapterChangeSets.chapterId, chapterId),
  ))
}

export async function getChangeSetById(projectId: string, id: string): Promise<ChangeSetWithItems | null> {
  const [changeSet] = await db.select().from(chapterChangeSets).where(and(
    eq(chapterChangeSets.id, id),
    eq(chapterChangeSets.projectId, projectId),
  ))
  if (!changeSet)
    return null

  const items = await db.select().from(chapterChangeSetItems).where(and(
    eq(chapterChangeSetItems.changeSetId, id),
    eq(chapterChangeSetItems.projectId, projectId),
  ))

  return { ...changeSet, items }
}

export async function approveChangeSet(projectId: string, changeSetId: string, options: ChapterChangeSetCommandOptions = {}): Promise<void> {
  const fullChangeSet = await getChangeSetById(projectId, changeSetId)
  if (!fullChangeSet)
    throw new Error('Change set not found')
  await commandBus.runAtomically(async () => {
    for (const item of fullChangeSet.items.filter(item => ['pending', 'blocked', 'apply_failed'].includes(item.status)))
      await changeChangeSetItem(projectId, changeSetId, item.id, { status: 'approved' }, options.commandId ? `${options.commandId}:item:${item.id}` : undefined)
    await changeChangeSet(projectId, changeSetId, { status: 'approved' }, options.commandId)
  })
}

export async function approveChangeSetItem(projectId: string, changeSetId: string, itemId: string, options: ChapterChangeSetCommandOptions = {}): Promise<void> {
  await changeChangeSetItem(projectId, changeSetId, itemId, { status: 'approved' }, options.commandId)
}

export async function rejectChangeSetItem(projectId: string, changeSetId: string, itemId: string, options: ChapterChangeSetCommandOptions = {}): Promise<void> {
  await changeChangeSetItem(projectId, changeSetId, itemId, { status: 'rejected' }, options.commandId)
}

export async function applyChangeSet(
  projectId: string,
  changeSetId: string,
  options: ChapterChangeSetCommandOptions = {},
): Promise<{ alreadyApplied: true } | { success: true }> {
  const fullChangeSet = await getChangeSetById(projectId, changeSetId)
  if (!fullChangeSet)
    throw new Error('Change set not found')

  // P1-5: 增加项目归属硬校验
  if (fullChangeSet.projectId !== projectId) {
    throw new Error('Project mismatch: Unauthorized change set access')
  }

  if (fullChangeSet.status === 'applied')
    return { alreadyApplied: true }
  if (fullChangeSet.status !== 'approved')
    throw new Error('Change set must be approved before it can be applied')

  const approvedItems = fullChangeSet.items.filter(item => item.status === 'approved')
  const approvedDraft = approvedItems.find(item => item.itemType === 'draft')

  try {
    return await commandBus.runAtomically(async (tx) => {
      if (fullChangeSet.writingJobId)
        await assertWritingJobAuthorized(projectId, fullChangeSet.writingJobId)

      // 1. Get current content for before snapshot
      // P1-5: 章节查询增加 projectId 限制
      const [chapter] = await tx.select({ draft: chapters.draft })
        .from(chapters)
        .where(and(
          eq(chapters.id, fullChangeSet.chapterId),
          eq(chapters.projectId, projectId),
        ))

      if (!chapter) {
        throw new Error('Chapter not found or project mismatch')
      }

      const beforeContent = chapter.draft || ''
      let beforeSnapshotId: string | null = null
      if (approvedDraft && beforeContent) {
        const beforeSnapshot = await createSnapshot(
          projectId,
          fullChangeSet.chapterId,
          beforeContent,
          `Unified Change Set Apply Before: ${changeSetId}`,
          {
            commandId: `ApplyChangeSet:${changeSetId}:before`,
            correlationId: changeSetId,
            causationId: changeSetId,
          },
        )
        if ('error' in beforeSnapshot)
          throw new Error(beforeSnapshot.error)
        beforeSnapshotId = beforeSnapshot.id
      }

      // 2. Apply draft
      if (approvedDraft && fullChangeSet.draftContent) {
        // P1-4: 场景自动写作区分写入目标
        if (fullChangeSet.sceneId) {
          await dispatchChapterCommand(
            CHANGE_SCENE_COMMAND,
            projectId,
            fullChangeSet.chapterId,
            {
              id: fullChangeSet.sceneId,
              content: fullChangeSet.draftContent,
              status: 'reviewed',
            },
            {
              commandId: `ApplyChangeSet:${changeSetId}:scene`,
              correlationId: changeSetId,
              causationId: changeSetId,
            },
          )
        }
        else {
          await dispatchChapterCommand(
            CHANGE_CHAPTER_COMMAND,
            projectId,
            fullChangeSet.chapterId,
            {
              draft: fullChangeSet.draftContent,
              note: `Unified Change Set Apply: ${changeSetId}`,
            },
            {
              commandId: `ApplyChangeSet:${changeSetId}:chapter`,
              correlationId: changeSetId,
              causationId: changeSetId,
            },
          )
        }
      }

      // 3. Apply approved items
      for (const item of approvedItems) {
        // P1-3: 关键项目失败应抛错回滚
        switch (item.itemType) {
          case 'draft':
            // Already applied above
            break
          case 'chapter_memory': {
            const payload = objectPayload(item.payloadJson)
            const memoryFields = Object.fromEntries(Object.entries({
              summary: optionalText(payload.summary),
              keyEvents: optionalText(payload.keyEvents),
              characterStateChanges: optionalText(payload.characterStateChanges),
              relationshipChanges: optionalText(payload.relationshipChanges),
              conflictProgress: optionalText(payload.conflictProgress),
              themeProgress: optionalText(payload.themeProgress),
            }).filter(([, value]) => value !== undefined))
            await dispatchChapterKnowledgeCommand(
              RECORD_CHAPTER_MEMORY_COMMAND,
              projectId,
              fullChangeSet.chapterId,
              { id: generateId(), ...memoryFields },
              {
                commandId: `ApplyChangeSet:${changeSetId}:memory:${item.id}`,
                correlationId: changeSetId,
                causationId: item.id,
              },
            )
            break
          }
          default: {
            // Map item types to suggestion types for reuse
            const typeMapping: Record<string, string> = {
              character_create: 'character_add',
              fact_create: 'fact_triple',
              foreshadowing_create: 'foreshadowing_add',
              foreshadowing_payoff: 'foreshadowing_payoff',
              relationship_update: 'relationship_update',
              conflict_create: 'conflict_add',
              conflict_update: 'conflict_update',
              style_note: 'style_note',
              continuity_note: 'continuity_note',
            }

            const suggestionType = typeMapping[item.itemType]
            if (!suggestionType)
              throw new Error(`Unsupported change set item type: ${item.itemType}`)
            await applyOneSuggestion(
              suggestionType,
              objectPayload(item.payloadJson),
              projectId,
              fullChangeSet.chapterId,
              70, // Default confidence for change sets
              {
                commandId: `ApplyChangeSet:${changeSetId}:item:${item.id}`,
                correlationId: changeSetId,
                causationId: item.id,
              },
            )
            break
          }
        }

        // Mark item as applied
        await changeChangeSetItem(projectId, changeSetId, item.id, { status: 'applied' }, options.commandId ? `${options.commandId}:item:${item.id}` : undefined)
      }

      // 4. Mark change set as applied
      const afterContent = approvedDraft ? (fullChangeSet.draftContent || beforeContent) : ''
      let afterSnapshotId: string | null = null
      if (afterContent) {
        const afterSnapshot = await createSnapshot(
          projectId,
          fullChangeSet.chapterId,
          afterContent,
          `Unified Change Set Apply After: ${changeSetId}`,
          {
            commandId: `ApplyChangeSet:${changeSetId}:after`,
            correlationId: changeSetId,
            causationId: changeSetId,
          },
        )
        if ('error' in afterSnapshot)
          throw new Error(afterSnapshot.error)
        afterSnapshotId = afterSnapshot.id
      }

      await changeChangeSet(projectId, changeSetId, {
        status: 'applied',
        appliedAt: now(),
        beforeSnapshotId,
        afterSnapshotId,
      }, options.commandId ? `${options.commandId}:complete` : undefined)

      return { success: true }
    })
  }
  catch (error: unknown) {
    if (error instanceof RunAuthorizationRevokedError)
      throw error

    console.error(`Failed to apply change set ${changeSetId}:`, error)

    // P1-3: 失败时记录在 applyReportJson 并标记失败
    await changeChangeSet(projectId, changeSetId, {
      status: 'apply_failed',
      applyReportJson: {
        error: errorMessage(error, 'Unknown error during transaction'),
        failedAt: now(),
      },
    })

    throw error
  }
}

export async function rejectChangeSet(projectId: string, changeSetId: string, options: ChapterChangeSetCommandOptions = {}): Promise<void> {
  const fullChangeSet = await getChangeSetById(projectId, changeSetId)
  if (!fullChangeSet)
    throw new Error('Change set not found')
  await commandBus.runAtomically(async () => {
    for (const item of fullChangeSet.items.filter(item => !['applied', 'rejected'].includes(item.status)))
      await changeChangeSetItem(projectId, changeSetId, item.id, { status: 'rejected' }, options.commandId ? `${options.commandId}:item:${item.id}` : undefined)
    await changeChangeSet(projectId, changeSetId, { status: 'rejected' }, options.commandId)
  })
}
