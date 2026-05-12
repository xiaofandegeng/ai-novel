import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterElements, chapterPostprocessSuggestions, characterRelationships, storyFactTriples } from '../db/schema'
import { createSuggestion } from './postprocess-suggestion.service'

export async function runGraphInference(projectId: string) {
  let count = 0

  const triples = await db.select().from(storyFactTriples).where(
    and(eq(storyFactTriples.projectId, projectId), eq(storyFactTriples.status, 'confirmed')),
  )
  const elements = await db.select().from(chapterElements).where(
    eq(chapterElements.projectId, projectId),
  )
  const relationships = await db.select().from(characterRelationships).where(
    eq(characterRelationships.projectId, projectId),
  )
  const existingSuggestions = await db.select().from(chapterPostprocessSuggestions).where(
    and(eq(chapterPostprocessSuggestions.projectId, projectId), eq(chapterPostprocessSuggestions.suggestionType, 'fact_triple')),
  )

  const existingInferenceKeys = new Set<string>()
  for (const suggestion of existingSuggestions) {
    try {
      const payload = JSON.parse(suggestion.payload) as { inferenceKey?: string }
      if (payload.inferenceKey)
        existingInferenceKeys.add(payload.inferenceKey)
    }
    catch {
      // Ignore malformed historical payloads.
    }
  }

  function markCreated(key: string) {
    existingInferenceKeys.add(key)
    count++
  }

  // Rule 1: Co-occurrence — characters appearing in same chapter suggest relationship
  const chapterCharMap = new Map<string, Array<{ id: string, name: string }>>()
  for (const el of elements.filter(e => e.elementType === 'character' && e.relationType === 'appears')) {
    if (!chapterCharMap.has(el.chapterId))
      chapterCharMap.set(el.chapterId, [])
    chapterCharMap.get(el.chapterId)!.push({ id: el.id, name: el.elementName })
  }

  const existingPairs = new Set([
    ...relationships.map(r => [r.characterAId, r.characterBId].sort().join(':')),
    ...triples
      .filter(t => t.subjectType === 'character' && t.objectType === 'character')
      .map(t => [t.subjectName, t.objectName].sort().join(':')),
  ])

  for (const [chapterId, chars] of chapterCharMap) {
    const uniqueChars = [...new Map(chars.map(c => [c.name, c])).values()]
    for (let i = 0; i < uniqueChars.length; i++) {
      for (let j = i + 1; j < uniqueChars.length; j++) {
        const left = uniqueChars[i]
        const right = uniqueChars[j]
        const pairKey = [left.name, right.name].sort().join(':')
        const inferenceKey = `co_occurrence:${chapterId}:${pairKey}`
        if (existingPairs.has(pairKey) || existingInferenceKeys.has(inferenceKey))
          continue

        await createSuggestion(projectId, chapterId, null, 'fact_triple', {
          subjectType: 'character',
          subjectName: left.name,
          predicate: '与...共场',
          objectType: 'character',
          objectName: right.name,
          sourceType: 'auto_inferred',
          inferenceKey,
          inferenceRule: 'co_occurrence',
          sourceElementIds: [left.id, right.id],
          sourceFacts: [
            `${left.name} 在本章出场`,
            `${right.name} 在本章出场`,
          ],
          reason: `角色 ${left.name} 和 ${right.name} 在同一章节共场，可能存在关系或剧情联系`,
        }, 50, `共场推理：${left.name} 与 ${right.name} 在同一章节出现`)
        existingPairs.add(pairKey)
        markCreated(inferenceKey)
      }
    }
  }

  // Rule 2: Transitive inference — A->B, B->C suggests A->C
  const tripleMap = new Map<string, Array<{
    id: string
    predicate: string
    objectName: string
    sourceChapterId: string | null
    subjectType: string
    subjectName: string
    objectType: string
  }>>()
  for (const t of triples) {
    if (!tripleMap.has(t.subjectName))
      tripleMap.set(t.subjectName, [])
    tripleMap.get(t.subjectName)!.push({
      id: t.id,
      predicate: t.predicate,
      objectName: t.objectName,
      sourceChapterId: t.sourceChapterId,
      subjectType: t.subjectType,
      subjectName: t.subjectName,
      objectType: t.objectType,
    })
  }

  const existingTripleKeys = new Set(triples.map(t => `${t.subjectName}:${t.predicate}:${t.objectName}`))

  for (const [subject, targets] of tripleMap) {
    for (const t1 of targets) {
      const indirectTargets = tripleMap.get(t1.objectName)
      if (!indirectTargets)
        continue
      for (const t2 of indirectTargets) {
        const predicate = `${t1.predicate}→${t2.predicate}`
        const tripleKey = `${subject}:${predicate}:${t2.objectName}`
        const inferenceKey = `transitive:${t1.id}:${t2.id}:${subject}:${t2.objectName}`
        if (existingTripleKeys.has(tripleKey) || existingInferenceKeys.has(inferenceKey))
          continue

        const sourceChapterId = t1.sourceChapterId || t2.sourceChapterId
        if (!sourceChapterId)
          continue

        await createSuggestion(projectId, sourceChapterId, null, 'fact_triple', {
          subjectType: t1.subjectType || 'inferred',
          subjectName: subject,
          predicate,
          objectType: t2.objectType || 'inferred',
          objectName: t2.objectName,
          sourceType: 'auto_inferred',
          inferenceKey,
          inferenceRule: 'transitive',
          sourceTripleIds: [t1.id, t2.id],
          sourceFacts: [
            `${subject} ${t1.predicate} ${t1.objectName}`,
            `${t1.objectName} ${t2.predicate} ${t2.objectName}`,
          ],
          reason: `传递推理：${subject} ${t1.predicate} ${t1.objectName}，${t1.objectName} ${t2.predicate} ${t2.objectName}`,
        }, 40, `传递推理：${subject} ${t1.predicate} ${t1.objectName}，${t1.objectName} ${t2.predicate} ${t2.objectName}`)
        existingTripleKeys.add(tripleKey)
        markCreated(inferenceKey)
      }
    }
  }

  return count
}
