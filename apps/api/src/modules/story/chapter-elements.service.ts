import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { chapterElements } from '../../db/schema'
import { assertChapterBelongsToProject, assertCharactersBelongToProject } from '../../shared/ownership'
import { errorMessage, generateId, updatedFields } from '../../shared/utils'

const ELEMENT_TYPES = ['character', 'location', 'item', 'organization', 'event'] as const
const RELATION_TYPES = ['appears', 'mentioned', 'scene', 'uses', 'involved', 'occurs'] as const
const IMPORTANCE_LEVELS = ['major', 'normal', 'minor'] as const

type ElementType = typeof ELEMENT_TYPES[number]
type RelationType = typeof RELATION_TYPES[number]
type Importance = typeof IMPORTANCE_LEVELS[number]

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

interface NormalizedElement {
  elementType: ElementType
  elementId: string | null
  elementName: string
  relationType: RelationType
  importance: Importance
  appearanceOrder: number | null
  notes: string | null
}

interface MutationResult<T> {
  row?: T
  error?: string
  notFound?: boolean
}

export async function listChapterElements(projectId: string, chapterId: string) {
  await assertChapterBelongsToProject(projectId, chapterId)
  return db.select().from(chapterElements).where(
    and(eq(chapterElements.projectId, projectId), eq(chapterElements.chapterId, chapterId)),
  )
}

export async function replaceChapterElements(
  projectId: string,
  chapterId: string,
  incoming: ChapterElementInput[],
): Promise<MutationResult<Array<typeof chapterElements.$inferSelect>>> {
  await assertChapterBelongsToProject(projectId, chapterId)

  if (incoming.some(element => !element.elementName?.trim()))
    return { error: '章节元素名称不能为空' }
  if (incoming.some(element => !ELEMENT_TYPES.includes(element.elementType as ElementType)))
    return { error: '章节元素类型不合法' }
  if (incoming.some(element => !RELATION_TYPES.includes(element.relationType as RelationType)))
    return { error: '章节元素关系类型不合法' }
  if (incoming.some(element => element.importance && !IMPORTANCE_LEVELS.includes(element.importance as Importance)))
    return { error: '章节元素重要性不合法' }

  const seen = new Set<string>()
  for (const element of incoming) {
    const key = `${element.elementType}:${element.elementName.trim()}:${element.relationType}`
    if (seen.has(key))
      return { error: `章节元素重复：${element.elementName}` }
    seen.add(key)
  }

  const characterElements = incoming.filter(element => element.elementType === 'character' && element.elementId)
  let characterNames: Record<string, string> = {}
  if (characterElements.length > 0) {
    try {
      const characters = await assertCharactersBelongToProject(
        projectId,
        characterElements.map(element => element.elementId as string),
      )
      characterNames = Object.fromEntries(characters.map(character => [character.id, character.name]))
    }
    catch (error: unknown) {
      return { error: errorMessage(error, '包含不属于当前项目的角色ID') }
    }
  }

  const normalized: NormalizedElement[] = incoming.map(element => ({
    elementType: element.elementType as ElementType,
    elementId: element.elementId || null,
    elementName: element.elementId && characterNames[element.elementId]
      ? characterNames[element.elementId]
      : element.elementName.trim(),
    relationType: element.relationType as RelationType,
    importance: (element.importance || 'normal') as Importance,
    appearanceOrder: element.appearanceOrder ?? null,
    notes: element.notes || null,
  }))

  const rows = await db.transaction(async (transaction) => {
    await transaction.delete(chapterElements).where(
      and(eq(chapterElements.projectId, projectId), eq(chapterElements.chapterId, chapterId)),
    )
    if (normalized.length === 0)
      return []
    return transaction.insert(chapterElements).values(normalized.map(element => ({
      id: generateId(),
      projectId,
      chapterId,
      ...element,
    }))).returning()
  })
  return { row: rows }
}

export async function createChapterElement(
  projectId: string,
  chapterId: string,
  input: ChapterElementInput,
): Promise<MutationResult<typeof chapterElements.$inferSelect>> {
  await assertChapterBelongsToProject(projectId, chapterId)
  const normalized = { ...input }
  if (normalized.elementType === 'character' && normalized.elementId) {
    try {
      const [character] = await assertCharactersBelongToProject(projectId, [normalized.elementId])
      normalized.elementName = character.name
    }
    catch (error: unknown) {
      return { error: errorMessage(error, '角色不属于当前项目') }
    }
  }

  const [row] = await db.insert(chapterElements).values({
    id: generateId(),
    projectId,
    chapterId,
    elementType: normalized.elementType as ElementType,
    elementId: normalized.elementId,
    elementName: normalized.elementName,
    relationType: normalized.relationType as RelationType,
    importance: (normalized.importance || 'normal') as Importance,
    appearanceOrder: normalized.appearanceOrder,
    notes: normalized.notes,
  }).returning()
  return { row }
}

export async function updateChapterElement(
  projectId: string,
  chapterId: string,
  id: string,
  input: ChapterElementUpdate,
): Promise<MutationResult<typeof chapterElements.$inferSelect>> {
  await assertChapterBelongsToProject(projectId, chapterId)
  const normalized = { ...input }
  if (normalized.elementId && (normalized.elementType === 'character' || !normalized.elementType)) {
    try {
      const [character] = await assertCharactersBelongToProject(projectId, [normalized.elementId])
      normalized.elementName = character.name
    }
    catch (error: unknown) {
      return { error: errorMessage(error, '角色不属于当前项目') }
    }
  }

  const fields = updatedFields({
    elementType: normalized.elementType as ElementType | undefined,
    elementId: normalized.elementId,
    elementName: normalized.elementName,
    relationType: normalized.relationType as RelationType | undefined,
    importance: normalized.importance as Importance | undefined,
    appearanceOrder: normalized.appearanceOrder,
    notes: normalized.notes,
  })
  const [row] = await db.update(chapterElements).set(fields).where(and(
    eq(chapterElements.id, id),
    eq(chapterElements.projectId, projectId),
    eq(chapterElements.chapterId, chapterId),
  )).returning()
  return row ? { row } : { error: 'Element not found', notFound: true }
}

export async function deleteChapterElement(projectId: string, chapterId: string, id: string) {
  await assertChapterBelongsToProject(projectId, chapterId)
  const [row] = await db.delete(chapterElements).where(and(
    eq(chapterElements.id, id),
    eq(chapterElements.projectId, projectId),
    eq(chapterElements.chapterId, chapterId),
  )).returning()
  return row ?? null
}
