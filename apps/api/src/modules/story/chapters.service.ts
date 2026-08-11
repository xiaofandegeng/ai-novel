import type { CreateChapterInput, UpdateChapterInput } from '@ai-novel/shared'
import type { ChapterCommandOptions } from './chapter.commands'
import type { ChapterSnapshot } from './chapter.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { chapters } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId } from '../../shared/utils'
import { runChapterPostprocess } from '../automation/chapter-postprocess.service'
import { compactChapterPayload, dispatchChapterCommand } from './chapter.commands'
import {
  CHANGE_CHAPTER_COMMAND,
  CREATE_CHAPTER_COMMAND,
  DELETE_CHAPTER_COMMAND,
} from './chapter.eventing'

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

export async function createChapter(
  projectId: string,
  input: CreateChapterPayload,
  options: ChapterCommandOptions = {},
) {
  const chapterId = generateId()
  try {
    const result = await dispatchChapterCommand<ChapterSnapshot>(
      CREATE_CHAPTER_COMMAND,
      projectId,
      chapterId,
      compactChapterPayload(input),
      options,
    )
    return { row: await getChapter(projectId, result.id) ?? result, error: null }
  }
  catch (error: unknown) {
    return chapterCommandFailure(error)
  }
}

export async function updateChapter(
  projectId: string,
  id: string,
  input: UpdateChapterPayload,
  options: ChapterCommandOptions = {},
) {
  const current = await getChapter(projectId, id)
  try {
    const result = await dispatchChapterCommand<ChapterSnapshot>(
      CHANGE_CHAPTER_COMMAND,
      projectId,
      id,
      compactChapterPayload(input),
      options,
    )
    const row = await getChapter(projectId, result.id) ?? result
    if (input.status === 'completed' && current?.status !== 'completed' && row.draft) {
      runChapterPostprocess({
        projectId,
        chapterId: id,
        content: row.draft,
        trigger: 'mark_completed',
      }).catch(error => console.error('Auto postprocess failed:', error))
    }
    return { row, error: null, notFound: false }
  }
  catch (error: unknown) {
    return chapterCommandFailure(error)
  }
}

export async function deleteChapter(
  projectId: string,
  id: string,
  options: ChapterCommandOptions = {},
) {
  try {
    return await dispatchChapterCommand<ChapterSnapshot>(
      DELETE_CHAPTER_COMMAND,
      projectId,
      id,
      {},
      options,
    )
  }
  catch (error: unknown) {
    if (
      error instanceof DomainCommandError
      && (error.code === 'CHAPTER_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND')
    ) {
      return null
    }
    throw error
  }
}

function chapterCommandFailure(error: unknown) {
  if (!(error instanceof DomainCommandError))
    throw error
  if (error.code === 'CHAPTER_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND') {
    return { row: null, error: 'Chapter not found', notFound: true }
  }
  if (error.code === 'VOLUME_NOT_FOUND')
    return { row: null, error: '卷不属于当前项目', notFound: false }
  return { row: null, error: error.message, notFound: false }
}
