import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterElements, chapterPostprocessSuggestions, characterRelationships, conflicts, foreshadowingItems, storyFactTriples } from '../db/schema'
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
  const projectConflicts = await db.select().from(conflicts).where(
    eq(conflicts.projectId, projectId),
  )
  const openForeshadowing = await db.select().from(foreshadowingItems).where(
    and(eq(foreshadowingItems.projectId, projectId), eq(foreshadowingItems.status, 'open')),
  )
  const existingSuggestions = await db.select().from(chapterPostprocessSuggestions).where(
    and(eq(chapterPostprocessSuggestions.projectId, projectId)),
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
  const chapterCharMap = new Map<string, Array<{ id: string, name: string, elementId?: string }>>()
  for (const el of elements.filter(e => e.elementType === 'character' && e.relationType === 'appears')) {
    if (!chapterCharMap.has(el.chapterId))
      chapterCharMap.set(el.chapterId, [])
    chapterCharMap.get(el.chapterId)!.push({ id: el.id, name: el.elementName, elementId: el.elementId || undefined })
  }

  const existingRelationshipIdPairs = new Set(relationships.map(r => [r.characterAId, r.characterBId].sort().join(':')))
  const existingFactNamePairs = new Set(triples
    .filter(t => t.subjectType === 'character' && t.objectType === 'character')
    .map(t => [t.subjectName, t.objectName].sort().join(':')),
  )

  for (const [chapterId, chars] of chapterCharMap) {
    // 按照 elementId 去重，如果 elementId 不存在则按名称去重
    const uniqueChars = [...new Map(chars.map(c => [c.elementId || c.name, c])).values()]
    for (let i = 0; i < uniqueChars.length; i++) {
      for (let j = i + 1; j < uniqueChars.length; j++) {
        const left = uniqueChars[i]
        const right = uniqueChars[j]

        // 优先使用 ID 对进行去重
        let pairKey: string
        let hasExistingRelationship = false

        if (left.elementId && right.elementId) {
          pairKey = [left.elementId, right.elementId].sort().join(':')
          hasExistingRelationship = existingRelationshipIdPairs.has(pairKey)
        }
        else {
          pairKey = [left.name, right.name].sort().join(':')
          hasExistingRelationship = existingFactNamePairs.has(pairKey)
        }

        const inferenceKey = `co_occurrence:${chapterId}:${pairKey}`
        if (hasExistingRelationship || existingInferenceKeys.has(inferenceKey))
          continue

        // 共场推理生成 relationship_update 建议，而非直接的事实三元组
        await createSuggestion(projectId, chapterId, null, 'relationship_update', {
          characterAId: left.elementId,
          characterBId: right.elementId,
          characterAName: left.name,
          characterBName: right.name,
          type: 'acquaintance',
          strength: 1,
          status: '本章共场',
          description: `系统通过章节共场推理发现：${left.name} 和 ${right.name} 在本章同时登场，建议建立人物关系。`,
          sourceType: 'auto_inferred',
          inferenceKey,
          inferenceRule: 'co_occurrence',
          sourceElementIds: [left.id, right.id],
        }, 50, `共场推理：${left.name} 与 ${right.name} 在同一章节出现`)

        if (left.elementId && right.elementId)
          existingRelationshipIdPairs.add(pairKey)
        else
          existingFactNamePairs.add(pairKey)

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

  // Rule 3: Conflict Escalation — aggressive facts matching existing conflicts
  const aggressivePredicates = new Set(['攻击', '威胁', '欺骗', '背叛', '冲突', '争吵', '打斗', '阻挠'])
  for (const t of triples) {
    if (!aggressivePredicates.has(t.predicate))
      continue

    // Find conflict involving these characters
    const matchedConflict = projectConflicts.find(c =>
      (c.participants?.includes(t.subjectName) && c.participants?.includes(t.objectName))
      || (c.title.includes(t.subjectName) && c.title.includes(t.objectName)),
    )

    if (matchedConflict && matchedConflict.status !== 'resolved') {
      const inferenceKey = `conflict_escalation:${t.id}:${matchedConflict.id}`
      if (existingInferenceKeys.has(inferenceKey))
        continue

      await createSuggestion(projectId, t.sourceChapterId || 'unknown', null, 'conflict_update', {
        conflictId: matchedConflict.id,
        title: matchedConflict.title,
        newIntensity: Math.min(10, matchedConflict.intensity + 1),
        reason: `系统检测到冲突升级事实：${t.subjectName} ${t.predicate} ${t.objectName}`,
        inferenceKey,
        inferenceRule: 'conflict_escalation',
        sourceTripleIds: [t.id],
      }, 60, `冲突升级推理：基于事实“${t.subjectName}${t.predicate}${t.objectName}”`)

      markCreated(inferenceKey)
    }
  }

  // Rule 4: Foreshadowing Payoff — facts matching open foreshadowing
  for (const t of triples) {
    for (const fs of openForeshadowing) {
      const isMatch = fs.title.includes(t.subjectName) || fs.title.includes(t.objectName)
        || fs.description?.includes(t.subjectName) || fs.description?.includes(t.objectName)

      if (isMatch) {
        const inferenceKey = `foreshadowing_payoff:${t.id}:${fs.id}`
        if (existingInferenceKeys.has(inferenceKey))
          continue

        await createSuggestion(projectId, t.sourceChapterId || 'unknown', null, 'foreshadowing_payoff', {
          foreshadowingId: fs.id,
          title: fs.title,
          sourceText: `事实触发：${t.subjectName} ${t.predicate} ${t.objectName}`,
          inferenceKey,
          inferenceRule: 'foreshadowing_payoff',
          sourceTripleIds: [t.id],
        }, 40, `伏笔回收推理：事实“${t.subjectName}${t.predicate}${t.objectName}”疑似对应伏笔“${fs.title}”`)

        markCreated(inferenceKey)
      }
    }
  }

  return count
}
