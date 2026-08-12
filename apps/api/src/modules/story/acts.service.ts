import type { StoryStructureCommandOptions } from './story-structure.commands'
import type { ActSnapshot } from './story-structure.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { acts } from '../../db/schema'
import { generateId } from '../../shared/utils'
import { compactStoryPayload, dispatchStoryStructureCommand } from './story-structure.commands'
import {
  CHANGE_ACT_COMMAND,
  CREATE_ACT_COMMAND,
  DELETE_ACT_COMMAND,
} from './story-structure.eventing'

export interface ActInput {
  title: string
  volumeId?: string | null
  description?: string
  theme?: string
  keyEvents?: string
  targetChapterCount?: number
  orderIndex: number
}

export type UpdateActInput = Partial<ActInput>

export function listActs(projectId: string) {
  return db.select().from(acts).where(eq(acts.projectId, projectId))
}

export async function createAct(
  projectId: string,
  input: ActInput,
  options: StoryStructureCommandOptions = {},
) {
  const result = await dispatchStoryStructureCommand<ActSnapshot>(
    CREATE_ACT_COMMAND,
    projectId,
    { id: generateId(), ...compactStoryPayload(input) },
    options,
  )
  return await getAct(projectId, result.id) ?? result
}

export async function updateAct(
  projectId: string,
  id: string,
  input: UpdateActInput,
  options: StoryStructureCommandOptions = {},
) {
  const result = await dispatchStoryStructureCommand<ActSnapshot>(
    CHANGE_ACT_COMMAND,
    projectId,
    { id, ...compactStoryPayload(input) },
    options,
  )
  return await getAct(projectId, result.id) ?? result
}

export function deleteAct(
  projectId: string,
  id: string,
  options: StoryStructureCommandOptions = {},
) {
  return dispatchStoryStructureCommand<ActSnapshot>(
    DELETE_ACT_COMMAND,
    projectId,
    { id },
    options,
  )
}

async function getAct(projectId: string, id: string) {
  const [row] = await db.select().from(acts).where(and(
    eq(acts.projectId, projectId),
    eq(acts.id, id),
  )).limit(1)
  return row ?? null
}
