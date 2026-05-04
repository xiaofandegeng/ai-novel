import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterElements, chapterPostprocessSuggestions, foreshadowingItems, storyFactTriples } from '../db/schema'
import { generateId } from '../utils'

export async function createSuggestion(
  projectId: string,
  chapterId: string,
  runId: string | null,
  suggestionType: string,
  payload: object,
  confidence = 70,
  reason?: string,
) {
  const [row] = await db.insert(chapterPostprocessSuggestions).values({
    id: generateId(),
    projectId,
    chapterId,
    runId,
    suggestionType: suggestionType as any,
    payload: JSON.stringify(payload),
    confidence,
    reason,
  }).returning()
  return row
}

export async function getSuggestions(projectId: string, chapterId: string, runId?: string) {
  const conditions = [
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.chapterId, chapterId),
  ]
  if (runId)
    conditions.push(eq(chapterPostprocessSuggestions.runId, runId))
  return db.select().from(chapterPostprocessSuggestions).where(and(...conditions))
}

export async function acceptSuggestion(projectId: string, id: string) {
  const [row] = await db.update(chapterPostprocessSuggestions).set({
    status: 'accepted',
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(chapterPostprocessSuggestions.id, id),
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  )).returning()
  return row
}

export async function rejectSuggestion(projectId: string, id: string) {
  const [row] = await db.update(chapterPostprocessSuggestions).set({
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  }).where(and(
    eq(chapterPostprocessSuggestions.id, id),
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  )).returning()
  return row
}

export async function applyAcceptedSuggestions(projectId: string, chapterId: string) {
  const accepted = await db.select().from(chapterPostprocessSuggestions).where(
    and(
      eq(chapterPostprocessSuggestions.projectId, projectId),
      eq(chapterPostprocessSuggestions.chapterId, chapterId),
      eq(chapterPostprocessSuggestions.status, 'accepted'),
    ),
  )

  for (const suggestion of accepted) {
    const payload = JSON.parse(suggestion.payload)
    try {
      if (suggestion.suggestionType === 'fact_triple') {
        await db.insert(storyFactTriples).values({
          id: generateId(),
          projectId,
          subjectType: payload.subjectType,
          subjectName: payload.subjectName,
          predicate: payload.predicate,
          objectType: payload.objectType,
          objectName: payload.objectName,
          confidence: suggestion.confidence,
          sourceType: 'ai_extracted',
          sourceChapterId: chapterId,
          status: 'confirmed',
        }).onConflictDoNothing()
      }
      else if (suggestion.suggestionType === 'foreshadowing_add') {
        await db.insert(foreshadowingItems).values({
          id: generateId(),
          projectId,
          title: payload.title,
          description: payload.description,
          setupChapterId: chapterId,
          status: 'open',
          importance: payload.importance || 'normal',
        })
      }
      else if (suggestion.suggestionType === 'foreshadowing_payoff') {
        if (payload.foreshadowingId) {
          await db.update(foreshadowingItems).set({
            status: 'paid_off',
            payoffChapterId: chapterId,
            updatedAt: new Date().toISOString(),
          }).where(and(
            eq(foreshadowingItems.id, payload.foreshadowingId),
            eq(foreshadowingItems.projectId, projectId),
          ))
        }
      }
      else if (suggestion.suggestionType === 'chapter_element') {
        await db.insert(chapterElements).values({
          id: generateId(),
          projectId,
          chapterId,
          elementType: payload.elementType,
          elementName: payload.elementName,
          relationType: payload.relationType || 'appears',
          importance: payload.importance || 'normal',
        })
      }

      await db.update(chapterPostprocessSuggestions).set({
        status: 'applied',
        updatedAt: new Date().toISOString(),
      }).where(eq(chapterPostprocessSuggestions.id, suggestion.id))
    }
    catch {
      // Skip failed applications, leave as accepted for retry
    }
  }

  return accepted.length
}
