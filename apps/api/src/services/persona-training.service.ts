import { eq } from 'drizzle-orm'
import { db } from '../db'
import { referenceTrainingSets } from '../db/schema'
import { generateId, now } from '../utils'

// ─── Training Sets ───

export async function listTrainingSets() {
  return db.select().from(referenceTrainingSets)
}

export async function getTrainingSet(id: string) {
  const [row] = await db.select().from(referenceTrainingSets).where(eq(referenceTrainingSets.id, id))
  return row || null
}

export async function createTrainingSet(input: { name: string, description?: string, genre?: string, targetPersonaType?: string }) {
  const row = {
    id: generateId(),
    name: input.name,
    description: input.description || null,
    genre: input.genre || null,
    targetPersonaType: input.targetPersonaType || null,
    status: 'draft' as const,
  }
  await db.insert(referenceTrainingSets).values(row)
  return row
}

export async function updateTrainingSet(id: string, input: Record<string, unknown>) {
  const fields: Record<string, unknown> = { updatedAt: now() }
  for (const key of ['name', 'description', 'genre', 'targetPersonaType', 'status']) {
    if (input[key] !== undefined)
      fields[key] = input[key]
  }
  const [row] = await db.update(referenceTrainingSets).set(fields).where(eq(referenceTrainingSets.id, id)).returning()
  return row
}

export async function deleteTrainingSet(id: string) {
  const [row] = await db.delete(referenceTrainingSets).where(eq(referenceTrainingSets.id, id)).returning()
  return row
}
