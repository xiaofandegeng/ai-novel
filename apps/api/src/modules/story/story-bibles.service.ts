import type { CreateStoryBibleInput } from '@ai-novel/shared'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { storyBibles } from '../../db/schema'
import { generateId, now, updatedFields } from '../../shared/utils'

export async function getStoryBible(projectId: string) {
  const [row] = await db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId))
  return row ?? null
}

export async function createStoryBible(projectId: string, input: CreateStoryBibleInput) {
  const timestamp = now()
  const [row] = await db.insert(storyBibles).values({
    id: generateId(),
    projectId,
    worldview: input.worldview,
    mainConflict: input.mainConflict,
    theme: input.theme,
    rules: input.rules,
    timeline: input.timeline,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning()
  return row
}

export async function updateStoryBible(projectId: string, input: CreateStoryBibleInput) {
  const [row] = await db.update(storyBibles).set(updatedFields({
    worldview: input.worldview,
    mainConflict: input.mainConflict,
    theme: input.theme,
    rules: input.rules,
    timeline: input.timeline,
  })).where(
    eq(storyBibles.projectId, projectId),
  ).returning()
  return row ?? null
}
