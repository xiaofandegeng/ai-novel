import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterElements, characterRelationships, storyFactTriples } from '../db/schema'
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

  // Rule 1: Co-occurrence — characters appearing in same chapter suggest relationship
  const chapterCharMap = new Map<string, Set<string>>()
  for (const el of elements.filter(e => e.elementType === 'character' && e.relationType === 'appears')) {
    if (!chapterCharMap.has(el.chapterId))
      chapterCharMap.set(el.chapterId, new Set())
    chapterCharMap.get(el.chapterId)!.add(el.elementName)
  }

  const existingPairs = new Set(relationships.map(r => [r.characterAId, r.characterBId].sort().join(':')))

  for (const [chapterId, chars] of chapterCharMap) {
    const names = [...chars]
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const key = [names[i], names[j]].sort().join(':')
        if (!existingPairs.has(key)) {
          await createSuggestion(projectId, chapterId, null, 'fact_triple', {
            subjectType: 'character',
            subjectName: names[i],
            predicate: '与...共场',
            objectType: 'character',
            objectName: names[j],
          }, 50, `角色 ${names[i]} 和 ${names[j]} 在同一章节共场`)
          count++
          existingPairs.add(key)
        }
      }
    }
  }

  // Rule 2: Transitive inference — A->B, B->C suggests A->C
  const tripleMap = new Map<string, Array<{
    predicate: string
    objectName: string
    sourceChapterId: string | null
  }>>()
  for (const t of triples) {
    if (!tripleMap.has(t.subjectName))
      tripleMap.set(t.subjectName, [])
    tripleMap.get(t.subjectName)!.push({
      predicate: t.predicate,
      objectName: t.objectName,
      sourceChapterId: t.sourceChapterId,
    })
  }

  const existingTripleKeys = new Set(triples.map(t => `${t.subjectName}:${t.predicate}:${t.objectName}`))

  for (const [subject, targets] of tripleMap) {
    for (const t1 of targets) {
      const indirectTargets = tripleMap.get(t1.objectName)
      if (!indirectTargets)
        continue
      for (const t2 of indirectTargets) {
        const key = `${subject}:${t1.predicate}→${t2.predicate}:${t2.objectName}`
        if (!existingTripleKeys.has(key)) {
          const sourceChapterId = t1.sourceChapterId || t2.sourceChapterId
          if (!sourceChapterId)
            continue

          await createSuggestion(projectId, sourceChapterId, null, 'fact_triple', {
            subjectType: 'inferred',
            subjectName: subject,
            predicate: `${t1.predicate}→${t2.predicate}`,
            objectType: 'inferred',
            objectName: t2.objectName,
          }, 40, `传递推理：${subject} ${t1.predicate} ${t1.objectName}，${t1.objectName} ${t2.predicate} ${t2.objectName}`)
          count++
          existingTripleKeys.add(key)
        }
      }
    }
  }

  return count
}
