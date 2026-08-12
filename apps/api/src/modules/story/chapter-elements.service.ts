import type { ChapterKnowledgeCommandOptions } from './chapter-knowledge.commands'
import type { ChapterElementSnapshot } from './chapter-knowledge.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { chapterElements } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { generateId } from '../../shared/utils'
import { compactChapterKnowledgePayload, dispatchChapterKnowledgeCommand } from './chapter-knowledge.commands'
import {
  ADD_CHAPTER_ELEMENT_COMMAND,
  CHANGE_CHAPTER_ELEMENT_COMMAND,
  REMOVE_CHAPTER_ELEMENT_COMMAND,
  REPLACE_CHAPTER_ELEMENTS_COMMAND,
} from './chapter-knowledge.eventing'

export interface ChapterElementInput {
  elementType: string
  elementId?: string | null
  elementName: string
  relationType: string
  importance?: string | null
  appearanceOrder?: number | null
  notes?: string | null
}

export type ChapterElementUpdate = Partial<ChapterElementInput>

interface MutationResult<T> {
  row?: T
  error?: string
  notFound?: boolean
}

export function listChapterElements(projectId: string, chapterId: string) {
  return db.select().from(chapterElements).where(and(
    eq(chapterElements.projectId, projectId),
    eq(chapterElements.chapterId, chapterId),
  ))
}

export async function replaceChapterElements(
  projectId: string,
  chapterId: string,
  incoming: ChapterElementInput[],
  options: ChapterKnowledgeCommandOptions = {},
): Promise<MutationResult<Array<typeof chapterElements.$inferSelect>>> {
  try {
    const result = await dispatchChapterKnowledgeCommand<{ elements: ChapterElementSnapshot[] }>(
      REPLACE_CHAPTER_ELEMENTS_COMMAND,
      projectId,
      chapterId,
      {
        elements: incoming.map(element => ({
          id: generateId(),
          ...compactChapterKnowledgePayload(element),
        })),
      },
      options,
    )
    return { row: await listChapterElements(projectId, chapterId) || result.elements }
  }
  catch (error: unknown) {
    return mutationError(error)
  }
}

export async function createChapterElement(
  projectId: string,
  chapterId: string,
  input: ChapterElementInput,
  options: ChapterKnowledgeCommandOptions = {},
): Promise<MutationResult<typeof chapterElements.$inferSelect>> {
  try {
    const result = await dispatchChapterKnowledgeCommand<ChapterElementSnapshot>(
      ADD_CHAPTER_ELEMENT_COMMAND,
      projectId,
      chapterId,
      { id: generateId(), ...compactChapterKnowledgePayload(input) },
      options,
    )
    return { row: await getElement(projectId, chapterId, result.id) ?? result as typeof chapterElements.$inferSelect }
  }
  catch (error: unknown) {
    return mutationError(error)
  }
}

export async function updateChapterElement(
  projectId: string,
  chapterId: string,
  id: string,
  input: ChapterElementUpdate,
  options: ChapterKnowledgeCommandOptions = {},
): Promise<MutationResult<typeof chapterElements.$inferSelect>> {
  try {
    const result = await dispatchChapterKnowledgeCommand<ChapterElementSnapshot>(
      CHANGE_CHAPTER_ELEMENT_COMMAND,
      projectId,
      chapterId,
      { id, ...compactChapterKnowledgePayload(input) },
      options,
    )
    return { row: await getElement(projectId, chapterId, result.id) ?? result as typeof chapterElements.$inferSelect }
  }
  catch (error: unknown) {
    if (error instanceof DomainCommandError && error.code === 'CHAPTER_ELEMENT_NOT_FOUND')
      return { error: 'Element not found', notFound: true }
    return mutationError(error)
  }
}

export async function deleteChapterElement(
  projectId: string,
  chapterId: string,
  id: string,
  options: ChapterKnowledgeCommandOptions = {},
) {
  try {
    return await dispatchChapterKnowledgeCommand<ChapterElementSnapshot>(
      REMOVE_CHAPTER_ELEMENT_COMMAND,
      projectId,
      chapterId,
      { id },
      options,
    )
  }
  catch (error: unknown) {
    if (error instanceof DomainCommandError && error.code === 'CHAPTER_ELEMENT_NOT_FOUND')
      return null
    throw error
  }
}

async function getElement(projectId: string, chapterId: string, id: string) {
  const [row] = await db.select().from(chapterElements).where(and(
    eq(chapterElements.id, id),
    eq(chapterElements.projectId, projectId),
    eq(chapterElements.chapterId, chapterId),
  )).limit(1)
  return row ?? null
}

function mutationError<T>(error: unknown): MutationResult<T> {
  if (!(error instanceof DomainCommandError))
    throw error
  if (error.code === 'CHAPTER_ELEMENT_DUPLICATE')
    return { error: error.message }
  if (error.code === 'CHARACTER_NOT_FOUND')
    return { error: '角色不属于当前项目' }
  if (error.code === 'CHAPTER_NOT_FOUND')
    throw new Error('章节不属于当前项目')
  if (error.code === 'INVALID_CHAPTER_KNOWLEDGE') {
    if (error.message.includes('elementName'))
      return { error: '章节元素名称不能为空' }
    if (error.message.includes('elementType'))
      return { error: '章节元素类型不合法' }
    if (error.message.includes('relationType'))
      return { error: '章节元素关系类型不合法' }
    if (error.message.includes('importance'))
      return { error: '章节元素重要性不合法' }
  }
  throw error
}
