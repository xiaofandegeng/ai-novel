import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { acts } from '../../db/schema'
import { assertOptionalVolumeBelongsToProject } from '../../shared/ownership'
import { generateId, updatedFields } from '../../shared/utils'

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

export async function createAct(projectId: string, input: ActInput) {
  await assertOptionalVolumeBelongsToProject(projectId, input.volumeId)
  const [row] = await db.insert(acts).values({
    id: generateId(),
    projectId,
    title: input.title,
    volumeId: input.volumeId,
    description: input.description,
    theme: input.theme,
    keyEvents: input.keyEvents,
    targetChapterCount: input.targetChapterCount,
    orderIndex: input.orderIndex,
  }).returning()
  return row
}

export async function updateAct(projectId: string, id: string, input: UpdateActInput) {
  await assertOptionalVolumeBelongsToProject(projectId, input.volumeId)
  const [row] = await db.update(acts).set(updatedFields({
    title: input.title,
    volumeId: input.volumeId,
    description: input.description,
    theme: input.theme,
    keyEvents: input.keyEvents,
    targetChapterCount: input.targetChapterCount,
    orderIndex: input.orderIndex,
  })).where(
    and(eq(acts.id, id), eq(acts.projectId, projectId)),
  ).returning()
  return row ?? null
}

export async function deleteAct(projectId: string, id: string) {
  const [row] = await db.delete(acts).where(
    and(eq(acts.id, id), eq(acts.projectId, projectId)),
  ).returning()
  return row ?? null
}
