import type {
  ChapterChangeSet,
  ConsistencyGuardReport,
} from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterChangeSetItems,
  chapterChangeSets,
  chapterMemories,
  chapters,
  chapterScenes,
  characters,
  foreshadowingItems,
  storyFactTriples,
  writingJobSteps,
} from '../db/schema'
import { generateId, now } from '../utils'
import { createSnapshot } from './version.service'

export interface ChapterPostprocessResult {
  summary: string
  keyEvents: string
  facts: any[]
  foreshadowingAdded: any[]
  foreshadowingPayoffs: any[]
  characterStateChanges: any[]
  relationshipChanges: string
  conflictProgress: string
  themeProgress: string
  styleNotes: any[]
  newCharacters: any[]
  newConflicts: any[]
  relationshipUpdates: any[]
  conflictUpdates: any[]
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

  const [changeSet] = await db.insert(chapterChangeSets).values({
    id,
    projectId,
    chapterId,
    sceneId: sceneId || null,
    writingJobId: writingJobId || null,
    sourceStepId: sourceStepId || null,
    status: 'drafted' as any,
    riskLevel: riskLevel as any,
    riskSummary,
    draftTitle: draftTitle || null,
    draftContent,
    consistencyReportJson: consistencyReport,
    extractedChangesJson: extractedChanges,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any).returning()

  // Create individual items
  await createChangeSetItems(id, projectId, chapterId, draftContent, extractedChanges)

  // Update the writing job step if provided
  if (sourceStepId) {
    await db.update(writingJobSteps)
      .set({ changeSetId: id })
      .where(eq(writingJobSteps.id, sourceStepId))
  }

  return changeSet as unknown as ChapterChangeSet
}

function calculateRiskLevel(report: ConsistencyGuardReport, changes: ChapterPostprocessResult): 'low' | 'medium' | 'high' {
  if (report.overallStatus === 'blocked')
    return 'high'

  // High risk triggers
  if (changes.newCharacters?.length > 0)
    return 'high'
  if (changes.newConflicts?.length > 0)
    return 'high'
  if (changes.relationshipUpdates?.some(r => r.strength > 7))
    return 'high'
  if (changes.foreshadowingPayoffs?.length > 0)
    return 'high'

  if (report.overallStatus === 'warning')
    return 'medium'
  if (changes.foreshadowingAdded?.length > 0)
    return 'medium'
  if (changes.foreshadowingPayoffs?.length > 0)
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

async function createChangeSetItems(
  changeSetId: string,
  projectId: string,
  chapterId: string,
  draftContent: string,
  changes: ChapterPostprocessResult,
) {
  const items: any[] = []

  // Draft item
  items.push({
    id: generateId(),
    changeSetId,
    projectId,
    chapterId,
    itemType: 'draft',
    title: '章节正文草稿',
    payloadJson: { content: draftContent },
    riskLevel: 'low' as any,
    status: 'pending' as any,
  })

  // Memory item
  items.push({
    id: generateId(),
    changeSetId,
    projectId,
    chapterId,
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
    riskLevel: 'low' as any,
    status: 'pending' as any,
  })

  // Characters
  if (changes.newCharacters?.length) {
    for (const char of changes.newCharacters) {
      items.push({
        id: generateId(),
        changeSetId,
        projectId,
        chapterId,
        itemType: 'character_create',
        title: `发现新人物：${char.name}`,
        payloadJson: char,
        riskLevel: 'high' as any,
        status: 'pending' as any,
      })
    }
  }

  // Facts
  if (changes.facts?.length) {
    for (const fact of changes.facts) {
      items.push({
        id: generateId(),
        changeSetId,
        projectId,
        chapterId,
        itemType: 'fact_create',
        title: `提取事实：${fact.subjectName} ${fact.predicate} ${fact.objectName}`,
        payloadJson: fact,
        riskLevel: fact.confidence < 70 ? 'medium' : 'low',
        status: 'pending' as any,
      })
    }
  }

  // Foreshadowing
  if (changes.foreshadowingAdded?.length) {
    for (const fs of changes.foreshadowingAdded) {
      items.push({
        id: generateId(),
        changeSetId,
        projectId,
        chapterId,
        itemType: 'foreshadowing_create',
        title: `新增伏笔：${fs.title}`,
        payloadJson: fs,
        riskLevel: 'medium' as any,
        status: 'pending' as any,
      })
    }
  }

  if (items.length > 0) {
    await db.insert(chapterChangeSetItems).values(items)
  }
}

export async function getChapterChangeSets(projectId: string, chapterId: string): Promise<ChapterChangeSet[]> {
  return db.select().from(chapterChangeSets).where(and(
    eq(chapterChangeSets.projectId, projectId),
    eq(chapterChangeSets.chapterId, chapterId),
  )) as unknown as Promise<ChapterChangeSet[]>
}

export async function getChangeSetById(projectId: string, id: string): Promise<any> {
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

export async function approveChangeSet(projectId: string, changeSetId: string): Promise<void> {
  await db.update(chapterChangeSets)
    .set({ status: 'approved' as any, updatedAt: new Date() })
    .where(and(
      eq(chapterChangeSets.id, changeSetId),
      eq(chapterChangeSets.projectId, projectId),
    ))

  await db.update(chapterChangeSetItems)
    .set({ status: 'approved' as any, updatedAt: new Date() })
    .where(and(
      eq(chapterChangeSetItems.changeSetId, changeSetId),
      eq(chapterChangeSetItems.projectId, projectId),
    ))
}

export async function approveChangeSetItem(projectId: string, changeSetId: string, itemId: string): Promise<void> {
  await db.update(chapterChangeSetItems)
    .set({ status: 'approved' as any, updatedAt: new Date() })
    .where(and(
      eq(chapterChangeSetItems.id, itemId),
      eq(chapterChangeSetItems.changeSetId, changeSetId),
      eq(chapterChangeSetItems.projectId, projectId),
    ))
}

export async function rejectChangeSetItem(projectId: string, changeSetId: string, itemId: string): Promise<void> {
  await db.update(chapterChangeSetItems)
    .set({ status: 'rejected' as any, updatedAt: new Date() })
    .where(and(
      eq(chapterChangeSetItems.id, itemId),
      eq(chapterChangeSetItems.changeSetId, changeSetId),
      eq(chapterChangeSetItems.projectId, projectId),
    ))
}

export async function applyChangeSet(projectId: string, changeSetId: string): Promise<any> {
  const fullChangeSet = await getChangeSetById(projectId, changeSetId)
  if (!fullChangeSet)
    throw new Error('Change set not found')

  // P1-5: 增加项目归属硬校验
  if (fullChangeSet.projectId !== projectId) {
    throw new Error('Project mismatch: Unauthorized change set access')
  }

  if (fullChangeSet.status === 'applied')
    return { alreadyApplied: true }

  try {
    return await db.transaction(async (tx) => {
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
      const beforeSnapshot = await createSnapshot(projectId, fullChangeSet.chapterId, beforeContent || ' ', `Unified Change Set Apply Before: ${changeSetId}`)
      if ('error' in beforeSnapshot)
        throw new Error(beforeSnapshot.error)

      // 2. Apply draft
      if (fullChangeSet.draftContent) {
        // P1-4: 场景自动写作区分写入目标
        if (fullChangeSet.sceneId) {
          await tx.update(chapterScenes)
            .set({ content: fullChangeSet.draftContent, status: 'reviewed', updatedAt: now() })
            .where(and(
              eq(chapterScenes.id, fullChangeSet.sceneId),
              eq(chapterScenes.projectId, projectId),
              eq(chapterScenes.chapterId, fullChangeSet.chapterId),
            ))
        }
        else {
          await tx.update(chapters)
            .set({ draft: fullChangeSet.draftContent, updatedAt: now() })
            .where(and(
              eq(chapters.id, fullChangeSet.chapterId),
              eq(chapters.projectId, projectId),
            ))
        }
      }

      // 3. Apply approved items
      const approvedItems = fullChangeSet.items.filter((item: any) => item.status === 'approved')
      for (const item of approvedItems) {
        // P1-3: 关键项目失败应抛错回滚
        switch (item.itemType) {
          case 'draft':
            // Already applied above
            break
          case 'character_create': {
            const { name, role, goal, fear, secret, desire, weakness, personality, arc } = item.payloadJson
            await tx.insert(characters).values({
              id: generateId(),
              projectId,
              name,
              role,
              goal,
              fear,
              secret,
              desire,
              weakness,
              personality,
              arc,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any)
            break
          }
          case 'fact_create': {
            const { subjectType, subjectName, predicate, objectType, objectName, confidence, notes } = item.payloadJson
            await tx.insert(storyFactTriples).values({
              id: generateId(),
              projectId,
              subjectType,
              subjectName,
              predicate,
              objectType,
              objectName,
              confidence: confidence || 70,
              sourceType: 'ai_extracted',
              sourceChapterId: fullChangeSet.chapterId,
              status: 'confirmed' as any,
              notes,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any)
            break
          }
          case 'foreshadowing_create': {
            const { title, description, importance, notes } = item.payloadJson
            await tx.insert(foreshadowingItems).values({
              id: generateId(),
              projectId,
              title,
              description,
              importance: (importance || 'normal') as any,
              setupChapterId: fullChangeSet.chapterId,
              status: 'open' as any,
              notes,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any)
            break
          }
          case 'chapter_memory': {
            const existing = await tx.select().from(chapterMemories).where(and(
              eq(chapterMemories.projectId, projectId),
              eq(chapterMemories.chapterId, fullChangeSet.chapterId),
            ))
            if (existing.length > 0) {
              await tx.update(chapterMemories)
                .set({ ...item.payloadJson, updatedAt: new Date() })
                .where(eq(chapterMemories.id, existing[0].id))
            }
            else {
              await tx.insert(chapterMemories).values({
                id: generateId(),
                projectId,
                chapterId: fullChangeSet.chapterId,
                ...item.payloadJson,
                createdAt: new Date(),
                updatedAt: new Date(),
              } as any)
            }
            break
          }
        }

        // Mark item as applied
        await tx.update(chapterChangeSetItems)
          .set({ status: 'applied' as any, updatedAt: new Date() })
          .where(eq(chapterChangeSetItems.id, item.id))
      }

      // 4. Mark change set as applied
      const afterSnapshot = await createSnapshot(projectId, fullChangeSet.chapterId, fullChangeSet.draftContent || beforeContent || ' ', `Unified Change Set Apply After: ${changeSetId}`)
      if ('error' in afterSnapshot)
        throw new Error(afterSnapshot.error)

      await tx.update(chapterChangeSets)
        .set({
          status: 'applied' as any,
          appliedAt: new Date(),
          updatedAt: new Date(),
          beforeSnapshotId: beforeSnapshot.id,
          afterSnapshotId: afterSnapshot.id,
        })
        .where(eq(chapterChangeSets.id, changeSetId))

      return { success: true }
    })
  }
  catch (error: any) {
    console.error(`Failed to apply change set ${changeSetId}:`, error)

    // P1-3: 失败时记录在 applyReportJson 并标记失败
    await db.update(chapterChangeSets)
      .set({
        status: 'apply_failed' as any,
        applyReportJson: {
          error: error.message || 'Unknown error during transaction',
          failedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(and(
        eq(chapterChangeSets.id, changeSetId),
        eq(chapterChangeSets.projectId, projectId),
      ))

    throw error
  }
}

export async function rejectChangeSet(projectId: string, changeSetId: string): Promise<void> {
  await db.update(chapterChangeSets)
    .set({ status: 'rejected' as any, updatedAt: new Date() })
    .where(and(
      eq(chapterChangeSets.id, changeSetId),
      eq(chapterChangeSets.projectId, projectId),
    ))

  await db.update(chapterChangeSetItems)
    .set({ status: 'rejected' as any, updatedAt: new Date() })
    .where(and(
      eq(chapterChangeSetItems.changeSetId, changeSetId),
      eq(chapterChangeSetItems.projectId, projectId),
    ))
}
