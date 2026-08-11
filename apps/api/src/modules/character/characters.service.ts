import type { CreateCharacterInput, UpdateCharacterInput } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { characters } from '../../db/schema'
import { generateId, now, updatedFields } from '../../shared/utils'

export function listCharacters(projectId: string) {
  return db.select().from(characters).where(eq(characters.projectId, projectId))
}

export async function getCharacter(projectId: string, id: string) {
  const [row] = await db.select().from(characters).where(and(
    eq(characters.id, id),
    eq(characters.projectId, projectId),
  ))
  return row ?? null
}

export async function createCharacter(projectId: string, input: CreateCharacterInput) {
  const timestamp = now()
  const [row] = await db.insert(characters).values({
    id: generateId(),
    projectId,
    name: input.name,
    role: input.role,
    goal: input.goal,
    fear: input.fear,
    secret: input.secret,
    desire: input.desire,
    weakness: input.weakness,
    personality: input.personality,
    arc: input.arc,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning()
  return row
}

export async function updateCharacter(projectId: string, id: string, input: UpdateCharacterInput) {
  const [row] = await db.update(characters).set(updatedFields({
    name: input.name,
    role: input.role,
    goal: input.goal,
    fear: input.fear,
    secret: input.secret,
    desire: input.desire,
    weakness: input.weakness,
    personality: input.personality,
    arc: input.arc,
  })).where(and(
    eq(characters.id, id),
    eq(characters.projectId, projectId),
  )).returning()
  return row ?? null
}

export async function deleteCharacter(projectId: string, id: string) {
  const [row] = await db.delete(characters).where(and(
    eq(characters.id, id),
    eq(characters.projectId, projectId),
  )).returning()
  return row ?? null
}
