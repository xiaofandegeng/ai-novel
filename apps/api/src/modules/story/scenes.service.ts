import type { ChapterCommandOptions } from './chapter.commands'
import type { SceneSnapshot } from './chapter.eventing'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { chapterScenes } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { assertChapterBelongsToProject } from '../../shared/ownership'
import { generateId } from '../../shared/utils'
import { runScenePostprocess } from '../automation/chapter-postprocess.service'
import { compactChapterPayload, dispatchChapterCommand } from './chapter.commands'
import {
  CHANGE_SCENE_COMMAND,
  DELETE_SCENE_COMMAND,
  PLAN_SCENES_COMMAND,
  REORDER_SCENES_COMMAND,
} from './chapter.eventing'

export type CreateSceneInput = Omit<
  typeof chapterScenes.$inferInsert,
  'chapterId' | 'createdAt' | 'id' | 'projectId' | 'updatedAt'
>
export type SceneInput = Partial<CreateSceneInput>

export interface SceneOrderInput {
  id: string
  orderIndex: number
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
  options: ChapterCommandOptions = {},
) {
  const result = await dispatchChapterCommand<{ scenes: SceneSnapshot[] }>(
    PLAN_SCENES_COMMAND,
    projectId,
    chapterId,
    {
      mode,
      scenes: scenes.map(scene => ({ id: generateId(), ...compactChapterPayload(scene) })),
    },
    options,
  )
  return result.scenes
}

export async function createScene(
  projectId: string,
  chapterId: string,
  input: CreateSceneInput,
  options: ChapterCommandOptions = {},
) {
  const id = generateId()
  const result = await dispatchChapterCommand<{ scenes: SceneSnapshot[] }>(
    PLAN_SCENES_COMMAND,
    projectId,
    chapterId,
    { mode: 'append', scenes: [{ id, ...compactChapterPayload(input) }] },
    options,
  )
  return result.scenes.find(scene => scene.id === id)!
}

export async function reorderScenes(
  projectId: string,
  chapterId: string,
  orders: SceneOrderInput[],
  options: ChapterCommandOptions = {},
) {
  try {
    const result = await dispatchChapterCommand<{ scenes: SceneSnapshot[] }>(
      REORDER_SCENES_COMMAND,
      projectId,
      chapterId,
      { orders },
      options,
    )
    return result.scenes
  }
  catch (error: unknown) {
    if (error instanceof DomainCommandError && error.code === 'SCENE_NOT_FOUND')
      throw new Error('SCENE_NOT_FOUND')
    throw error
  }
}

export async function updateScene(
  projectId: string,
  chapterId: string,
  id: string,
  input: SceneInput,
  options: ChapterCommandOptions = {},
) {
  try {
    return await dispatchChapterCommand<SceneSnapshot>(
      CHANGE_SCENE_COMMAND,
      projectId,
      chapterId,
      { id, ...compactChapterPayload(input) },
      options,
    )
  }
  catch (error: unknown) {
    if (
      error instanceof DomainCommandError
      && (error.code === 'SCENE_NOT_FOUND' || error.code === 'CHAPTER_NOT_FOUND')
    ) {
      return null
    }
    throw error
  }
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

export async function deleteScene(
  projectId: string,
  chapterId: string,
  id: string,
  options: ChapterCommandOptions = {},
) {
  try {
    return await dispatchChapterCommand<SceneSnapshot>(
      DELETE_SCENE_COMMAND,
      projectId,
      chapterId,
      { id },
      options,
    )
  }
  catch (error: unknown) {
    if (
      error instanceof DomainCommandError
      && (error.code === 'SCENE_NOT_FOUND' || error.code === 'CHAPTER_NOT_FOUND')
    ) {
      return null
    }
    throw error
  }
}
