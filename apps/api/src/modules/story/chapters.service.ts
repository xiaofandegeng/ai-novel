import type { CreateChapterInput, UpdateChapterInput } from '@ai-novel/shared'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '../../db'
import { chapters } from '../../db/schema'
import { assertVolumeBelongsToProject } from '../../shared/ownership'
import { generateId, now, updatedFields } from '../../shared/utils'
import { runChapterPostprocess } from '../automation/chapter-postprocess.service'

type CreateChapterPayload = CreateChapterInput & UpdateChapterInput
type UpdateChapterPayload = Omit<UpdateChapterInput, 'volumeId'> & { volumeId?: string | null }

export function listChapters(projectId: string) {
  return db.select().from(chapters).where(eq(chapters.projectId, projectId))
}

export async function getChapter(projectId: string, id: string) {
  const [row] = await db.select().from(chapters).where(and(
    eq(chapters.id, id),
    eq(chapters.projectId, projectId),
  ))
  return row ?? null
}

async function chapterNumberExists(projectId: string, volumeId: string, chapterNumber: number, excludeId?: string) {
  const conditions = [
    eq(chapters.projectId, projectId),
    eq(chapters.volumeId, volumeId),
    eq(chapters.chapterNumber, chapterNumber),
  ]
  if (excludeId)
    conditions.push(ne(chapters.id, excludeId))
  const [existing] = await db.select({ id: chapters.id }).from(chapters).where(and(...conditions))
  return Boolean(existing)
}

export async function createChapter(projectId: string, input: CreateChapterPayload) {
  if (input.volumeId) {
    try {
      await assertVolumeBelongsToProject(projectId, input.volumeId)
    }
    catch {
      return { row: null, error: '卷不属于当前项目' }
    }
    if (await chapterNumberExists(projectId, input.volumeId, input.chapterNumber))
      return { row: null, error: `第 ${input.chapterNumber} 章已存在，请使用不同的章节序号` }
  }

  const timestamp = now()
  const [row] = await db.insert(chapters).values({
    id: generateId(),
    projectId,
    volumeId: input.volumeId,
    chapterNumber: input.chapterNumber,
    title: input.title,
    outline: input.outline,
    draft: input.draft,
    summary: input.summary,
    characters: input.characters,
    goals: input.goals,
    conflicts: input.conflicts,
    events: input.events,
    emotionalArc: input.emotionalArc,
    foreshadowing: input.foreshadowing,
    endingHook: input.endingHook,
    status: input.status ?? 'not_started',
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning()
  return { row, error: null }
}

export async function updateChapter(projectId: string, id: string, input: UpdateChapterPayload) {
  const current = await getChapter(projectId, id)
  if (!current)
    return { row: null, error: 'Chapter not found', notFound: true }

  const targetVolumeId = input.volumeId ?? current.volumeId
  const targetChapterNumber = input.chapterNumber ?? current.chapterNumber
  if (input.volumeId) {
    try {
      await assertVolumeBelongsToProject(projectId, input.volumeId)
    }
    catch {
      return { row: null, error: '卷不属于当前项目', notFound: false }
    }
  }
  if (targetVolumeId && await chapterNumberExists(projectId, targetVolumeId, targetChapterNumber, id)) {
    return {
      row: null,
      error: `第 ${targetChapterNumber} 章已存在，请使用不同的章节序号`,
      notFound: false,
    }
  }

  const [row] = await db.update(chapters).set(updatedFields({
    title: input.title,
    chapterNumber: input.chapterNumber,
    volumeId: input.volumeId,
    outline: input.outline,
    draft: input.draft,
    summary: input.summary,
    characters: input.characters,
    goals: input.goals,
    conflicts: input.conflicts,
    events: input.events,
    emotionalArc: input.emotionalArc,
    foreshadowing: input.foreshadowing,
    endingHook: input.endingHook,
    status: input.status,
  })).where(and(
    eq(chapters.id, id),
    eq(chapters.projectId, projectId),
  )).returning()
  if (input.status === 'completed' && current.status !== 'completed' && row?.draft) {
    runChapterPostprocess({
      projectId,
      chapterId: id,
      content: row.draft,
      trigger: 'mark_completed',
    }).catch(error => console.error('Auto postprocess failed:', error))
  }
  return { row: row ?? null, error: row ? null : 'Chapter not found', notFound: !row }
}

export async function deleteChapter(projectId: string, id: string) {
  const [row] = await db.delete(chapters).where(and(
    eq(chapters.id, id),
    eq(chapters.projectId, projectId),
  )).returning()
  return row ?? null
}
