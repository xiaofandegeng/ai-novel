import type { CreateVolumeInput, UpdateVolumeInput } from '@ai-novel/shared'
import type { StoryStructureCommandOptions } from './story-structure.commands'
import type { VolumeSnapshot } from './story-structure.eventing'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { volumes } from '../../db/schema'
import { generateId } from '../../shared/utils'
import { compactStoryPayload, dispatchStoryStructureCommand } from './story-structure.commands'
import {
  CHANGE_VOLUME_COMMAND,
  CREATE_VOLUME_COMMAND,
  DELETE_VOLUME_COMMAND,
} from './story-structure.eventing'

export function listVolumes(projectId: string) {
  return db.select().from(volumes).where(eq(volumes.projectId, projectId))
}

export async function getVolume(projectId: string, id: string) {
  const [row] = await db.select().from(volumes).where(
    and(eq(volumes.id, id), eq(volumes.projectId, projectId)),
  )
  return row ?? null
}

export async function createVolume(
  projectId: string,
  input: CreateVolumeInput,
  options: StoryStructureCommandOptions = {},
) {
  const result = await dispatchStoryStructureCommand<VolumeSnapshot>(
    CREATE_VOLUME_COMMAND,
    projectId,
    { id: generateId(), ...compactStoryPayload({ ...input, orderIndex: input.orderIndex ?? 0 }) },
    options,
  )
  return await getVolume(projectId, result.id) ?? result
}

export async function updateVolume(
  projectId: string,
  id: string,
  input: UpdateVolumeInput,
  options: StoryStructureCommandOptions = {},
) {
  const result = await dispatchStoryStructureCommand<VolumeSnapshot>(
    CHANGE_VOLUME_COMMAND,
    projectId,
    { id, ...compactStoryPayload(input) },
    options,
  )
  return await getVolume(projectId, result.id) ?? result
}

export function deleteVolume(
  projectId: string,
  id: string,
  options: StoryStructureCommandOptions = {},
) {
  return dispatchStoryStructureCommand<VolumeSnapshot>(
    DELETE_VOLUME_COMMAND,
    projectId,
    { id },
    options,
  )
}
