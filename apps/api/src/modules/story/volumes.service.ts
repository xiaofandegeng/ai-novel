import type { CreateVolumeInput, UpdateVolumeInput } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { volumes } from '../../db/schema'
import { generateId, now, updatedFields } from '../../shared/utils'

export function listVolumes(projectId: string) {
  return db.select().from(volumes).where(eq(volumes.projectId, projectId))
}

export async function getVolume(projectId: string, id: string) {
  const [row] = await db.select().from(volumes).where(
    and(eq(volumes.id, id), eq(volumes.projectId, projectId)),
  )
  return row ?? null
}

export async function createVolume(projectId: string, input: CreateVolumeInput) {
  const timestamp = now()
  const [row] = await db.insert(volumes).values({
    id: generateId(),
    projectId,
    title: input.title,
    summary: input.summary,
    orderIndex: input.orderIndex ?? 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning()
  return row
}

export async function updateVolume(projectId: string, id: string, input: UpdateVolumeInput) {
  const [row] = await db.update(volumes).set(updatedFields({
    title: input.title,
    summary: input.summary,
    orderIndex: input.orderIndex,
  })).where(
    and(eq(volumes.id, id), eq(volumes.projectId, projectId)),
  ).returning()
  return row ?? null
}

export async function deleteVolume(projectId: string, id: string) {
  const [row] = await db.delete(volumes).where(
    and(eq(volumes.id, id), eq(volumes.projectId, projectId)),
  ).returning()
  return row ?? null
}
