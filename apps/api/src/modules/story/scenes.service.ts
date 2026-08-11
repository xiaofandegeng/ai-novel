import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { chapterScenes } from '../../db/schema'
import { assertChapterBelongsToProject } from '../../shared/ownership'
import { generateId, now, updatedFields } from '../../shared/utils'
import { runScenePostprocess } from '../automation/chapter-postprocess.service'

export type CreateSceneInput = Omit<
  typeof chapterScenes.$inferInsert,
  'chapterId' | 'createdAt' | 'id' | 'projectId' | 'updatedAt'
>
export type SceneInput = Partial<CreateSceneInput>

export interface SceneOrderInput {
  id: string
  orderIndex: number
}

function sceneFields(input: SceneInput) {
  return {
    sceneNumber: input.sceneNumber,
    title: input.title,
    location: input.location,
    timeline: input.timeline,
    purpose: input.purpose,
    summary: input.summary,
    characters: input.characters,
    targetWords: input.targetWords,
    content: input.content,
    orderIndex: input.orderIndex,
    status: input.status,
    conflict: input.conflict,
    beatType: input.beatType,
    entryHook: input.entryHook,
    turningPoint: input.turningPoint,
    exitHook: input.exitHook,
    emotionStart: input.emotionStart,
    emotionEnd: input.emotionEnd,
    conflictLevel: input.conflictLevel,
    requiredElements: input.requiredElements,
  }
}

async function selectScenes(projectId: string, chapterId: string) {
  return db.select().from(chapterScenes).where(and(
    eq(chapterScenes.projectId, projectId),
    eq(chapterScenes.chapterId, chapterId),
  )).orderBy(asc(chapterScenes.orderIndex), asc(chapterScenes.sceneNumber))
}

export async function listScenes(projectId: string, chapterId: string) {
  await assertChapterBelongsToProject(projectId, chapterId)
  return selectScenes(projectId, chapterId)
}

export async function bulkCreateScenes(
  projectId: string,
  chapterId: string,
  scenes: SceneInput[],
  mode: 'append' | 'replace' = 'append',
) {
  await assertChapterBelongsToProject(projectId, chapterId)
  return db.transaction(async (tx) => {
    if (mode === 'replace') {
      await tx.delete(chapterScenes).where(and(
        eq(chapterScenes.projectId, projectId),
        eq(chapterScenes.chapterId, chapterId),
      ))
    }
    const existingCount = mode === 'replace'
      ? 0
      : (await tx.select({ id: chapterScenes.id }).from(chapterScenes).where(and(
          eq(chapterScenes.projectId, projectId),
          eq(chapterScenes.chapterId, chapterId),
        ))).length
    await tx.insert(chapterScenes).values(scenes.map((scene, index) => ({
      id: generateId(),
      projectId,
      chapterId,
      sceneNumber: scene.sceneNumber ?? existingCount + index + 1,
      title: scene.title || null,
      location: scene.location || null,
      timeline: scene.timeline || null,
      purpose: scene.purpose || null,
      summary: scene.summary || null,
      characters: scene.characters || null,
      targetWords: scene.targetWords ?? null,
      content: scene.content || null,
      orderIndex: scene.orderIndex ?? existingCount + index + 1,
      status: scene.status || 'planned',
      conflict: scene.conflict || null,
      beatType: scene.beatType || null,
      entryHook: scene.entryHook || null,
      turningPoint: scene.turningPoint || null,
      exitHook: scene.exitHook || null,
      emotionStart: scene.emotionStart || null,
      emotionEnd: scene.emotionEnd || null,
      conflictLevel: scene.conflictLevel ?? null,
      requiredElements: scene.requiredElements || null,
      updatedAt: now(),
    })))
    return tx.select().from(chapterScenes).where(and(
      eq(chapterScenes.projectId, projectId),
      eq(chapterScenes.chapterId, chapterId),
    )).orderBy(asc(chapterScenes.orderIndex), asc(chapterScenes.sceneNumber))
  })
}

export async function createScene(projectId: string, chapterId: string, input: CreateSceneInput) {
  await assertChapterBelongsToProject(projectId, chapterId)
  const [row] = await db.insert(chapterScenes).values({
    id: generateId(),
    projectId,
    chapterId,
    ...sceneFields(input),
    sceneNumber: input.sceneNumber,
    orderIndex: input.orderIndex,
    status: input.status || 'planned',
  }).returning()
  return row
}

export async function reorderScenes(projectId: string, chapterId: string, orders: SceneOrderInput[]) {
  await assertChapterBelongsToProject(projectId, chapterId)
  await db.transaction(async (tx) => {
    for (const item of orders) {
      const [row] = await tx.update(chapterScenes).set({
        orderIndex: item.orderIndex,
        updatedAt: now(),
      }).where(and(
        eq(chapterScenes.id, item.id),
        eq(chapterScenes.projectId, projectId),
        eq(chapterScenes.chapterId, chapterId),
      )).returning()
      if (!row)
        throw new Error('SCENE_NOT_FOUND')
    }
  })
  return selectScenes(projectId, chapterId)
}

export async function updateScene(projectId: string, chapterId: string, id: string, input: SceneInput) {
  await assertChapterBelongsToProject(projectId, chapterId)
  const [row] = await db.update(chapterScenes).set(updatedFields(sceneFields(input))).where(and(
    eq(chapterScenes.id, id),
    eq(chapterScenes.projectId, projectId),
    eq(chapterScenes.chapterId, chapterId),
  )).returning()
  return row ?? null
}

export async function postprocessScene(
  projectId: string,
  chapterId: string,
  sceneId: string,
  content: string,
) {
  await assertChapterBelongsToProject(projectId, chapterId)
  return runScenePostprocess({ projectId, chapterId, sceneId, content })
}

export async function deleteScene(projectId: string, chapterId: string, id: string) {
  await assertChapterBelongsToProject(projectId, chapterId)
  const [row] = await db.delete(chapterScenes).where(and(
    eq(chapterScenes.id, id),
    eq(chapterScenes.projectId, projectId),
    eq(chapterScenes.chapterId, chapterId),
  )).returning()
  return row ?? null
}
