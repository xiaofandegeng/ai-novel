import type { CreateProjectInput, UpdateProjectInput } from '@ai-novel/shared'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { novelProjects } from '../../db/schema'
import { generateId, now, updatedFields } from '../../shared/utils'

type CreateProjectPayload = CreateProjectInput & Pick<UpdateProjectInput, 'status'>

export function listProjects(limit: number, offset: number) {
  return db.select().from(novelProjects).limit(limit).offset(offset)
}

export async function getProject(id: string) {
  const [row] = await db.select().from(novelProjects).where(eq(novelProjects.id, id))
  return row ?? null
}

export async function createProject(input: CreateProjectPayload) {
  const timestamp = now()
  const [row] = await db.insert(novelProjects).values({
    id: generateId(),
    title: input.title,
    description: input.description,
    genre: input.genre,
    theme: input.theme,
    targetWords: input.targetWords,
    targetAudience: input.targetAudience,
    styleProfile: input.styleProfile,
    status: input.status ?? 'planning',
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning()
  return row
}

export async function updateProject(id: string, input: UpdateProjectInput) {
  const fields = updatedFields({
    title: input.title,
    description: input.description,
    genre: input.genre,
    theme: input.theme,
    targetWords: input.targetWords,
    targetAudience: input.targetAudience,
    styleProfile: input.styleProfile,
    status: input.status,
  })
  const [row] = await db.update(novelProjects).set(fields).where(eq(novelProjects.id, id)).returning()
  return row ?? null
}

export async function deleteProject(id: string) {
  const [row] = await db.delete(novelProjects).where(eq(novelProjects.id, id)).returning()
  return row ?? null
}
