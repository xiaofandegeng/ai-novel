import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  acts,
  aiContextSnapshots,
  aiGenerationCandidates,
  chapterElements,
  chapterMemories,
  chapterPostprocessSuggestions,
  chapters,
  chapterScenes,
  chapterStyleFingerprints,
  characterArcEvents,
  characterRelationships,
  characters,
  conflictParticipants,
  conflicts,
  conflictTimelineEvents,
  dailyWritingStats,
  foreshadowingCharacters,
  foreshadowingItems,
  knowledgeChunks,
  knowledgeEmbeddings,
  knowledgeNotes,
  knowledgeSources,
  novelProjects,
  personaMemoryCards,
  projectHealthReports,
  projectPersonaConfigs,
  qualityReports,
  storyBibles,
  storyFactTriples,
  volumes,
  writingGoals,
  writingJobs,
  writingJobSteps,
  writingPersonas,
} from '../db/schema'
import { generateId } from '../utils'

function pick(
  input: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (input[key] !== undefined)
      result[key] = input[key]
  }
  return result
}

const PROJECT_FIELDS = ['title', 'description', 'genre', 'theme', 'targetWords', 'targetAudience', 'styleProfile', 'status']
const BIBLE_FIELDS = ['worldview', 'mainConflict', 'theme', 'rules', 'timeline']
const CHARACTER_FIELDS = ['name', 'role', 'goal', 'fear', 'secret', 'desire', 'weakness', 'personality', 'arc']
const VOLUME_FIELDS = ['title', 'summary', 'orderIndex']
const CHAPTER_FIELDS = ['title', 'chapterNumber', 'outline', 'summary', 'characters', 'goals', 'conflicts', 'events', 'emotionalArc', 'foreshadowing', 'endingHook', 'draft', 'status']
const SCENE_FIELDS = ['sceneNumber', 'title', 'location', 'timeline', 'purpose', 'summary', 'characters', 'targetWords', 'content', 'orderIndex', 'status', 'conflict']
const RELATIONSHIP_FIELDS = ['type', 'strength', 'status', 'description']
const MEMORY_FIELDS = ['summary', 'keyEvents', 'newFacts', 'characterStateChanges', 'relationshipChanges', 'conflictProgress', 'foreshadowingAdded', 'foreshadowingResolved', 'themeProgress', 'styleNotes']
const ELEMENT_FIELDS = ['elementType', 'elementId', 'elementName', 'relationType', 'importance', 'appearanceOrder', 'notes']
const FORESHADOWING_FIELDS = ['title', 'description', 'importance', 'relatedCharacters', 'relatedEvents', 'notes']
const TRIPLE_FIELDS = ['subjectType', 'subjectName', 'predicate', 'objectType', 'objectName', 'confidence', 'sourceType', 'status', 'relatedChapters', 'notes']
const ACT_FIELDS = ['title', 'description', 'theme', 'keyEvents', 'targetChapterCount', 'orderIndex']
const CONFLICT_FIELDS = ['title', 'type', 'intensity', 'status', 'participants', 'description', 'resolution']
const KNOWLEDGE_SOURCE_FIELDS = ['title', 'sourceType', 'author', 'status', 'fileName', 'fileSize']
const KNOWLEDGE_CHUNK_FIELDS = ['chunkType', 'title', 'content', 'summary', 'techniques', 'orderIndex']
const KNOWLEDGE_EMBEDDING_FIELDS = ['chunkId', 'embeddingModel', 'embeddingVector', 'contentType', 'contentHash']
const KNOWLEDGE_NOTE_FIELDS = ['title', 'content', 'tags']
const QUALITY_REPORT_FIELDS = ['scope', 'score', 'rhythmScore', 'conflictScore', 'logicScore', 'characterScore', 'styleScore', 'issues', 'suggestions']
const POSTPROCESS_SUGGESTION_FIELDS = ['suggestionType', 'payload', 'confidence', 'status', 'reason']
const WRITING_JOB_FIELDS = ['mode', 'status', 'lastError']
const WRITING_JOB_STEP_FIELDS = ['stepType', 'status', 'input', 'output', 'error', 'startedAt', 'finishedAt']
const AI_CONTEXT_SNAPSHOT_FIELDS = ['scene', 'requestId', 'modelProvider', 'modelName', 'contextPayload', 'renderedPromptPreview', 'tokenEstimate']
const PERSONA_CONFIG_FIELDS = ['strength', 'enabledForOutline', 'enabledForDraft', 'enabledForPolish', 'enabledForQualityReview', 'projectOverrides', 'disabledRules']
const PERSONA_MEMORY_CARD_FIELDS = ['cardType', 'content', 'tags']
const FORESHADOWING_CHARACTER_FIELDS = ['relationType']
const CONFLICT_PARTICIPANT_FIELDS = ['roleInConflict']
const CHARACTER_ARC_EVENT_FIELDS = ['eventType', 'beforeState', 'afterState', 'motivationChange', 'relationshipImpact', 'evidence', 'sourceType']
const CONFLICT_TIMELINE_EVENT_FIELDS = ['intensityBefore', 'intensityAfter', 'statusBefore', 'statusAfter', 'reason', 'evidence', 'sourceType']
const WRITING_GOAL_FIELDS = ['goalType', 'targetWords', 'targetChapters', 'startDate', 'endDate', 'status']
const DAILY_WRITING_STATS_FIELDS = ['date', 'wordsAdded', 'chaptersCompleted', 'aiWordsAccepted', 'manualWordsAdded']
const AI_GENERATION_CANDIDATE_FIELDS = ['provider', 'model', 'taskType', 'content', 'qualityScore', 'userSelected', 'userRating']
const CHAPTER_STYLE_FINGERPRINT_FIELDS = ['scope', 'sentenceLengthAvg', 'dialogueRatio', 'emotionDensity', 'conflictDensity', 'hookDensity', 'styleSummary']
const PROJECT_HEALTH_REPORT_FIELDS = ['scope', 'score', 'riskLevel', 'metricsJson', 'generatedAt']
const WRITING_PERSONA_FIELDS = [
  'name',
  'description',
  'genre',
  'status',
  'coreAppeal',
  'pacingRules',
  'conflictRules',
  'characterRules',
  'languageRules',
  'chapterRules',
  'hookRules',
  'forbiddenRules',
  'similarityGuardrails',
]

export async function exportProjectData(projectId: string) {
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('项目不存在')

  const bibles = await db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId))
  const chars = await db.select().from(characters).where(eq(characters.projectId, projectId))
  const vols = await db.select().from(volumes).where(eq(volumes.projectId, projectId))
  const chaps = await db.select().from(chapters).where(eq(chapters.projectId, projectId))
  const scenes = await db.select().from(chapterScenes).where(eq(chapterScenes.projectId, projectId))
  const rels = await db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
  const mems = await db.select().from(chapterMemories).where(eq(chapterMemories.projectId, projectId))
  const elems = await db.select().from(chapterElements).where(eq(chapterElements.projectId, projectId))
  const foreshadowing = await db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId))
  const triples = await db.select().from(storyFactTriples).where(eq(storyFactTriples.projectId, projectId))
  const actList = await db.select().from(acts).where(eq(acts.projectId, projectId))
  const confList = await db.select().from(conflicts).where(eq(conflicts.projectId, projectId))
  const sources = await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId))
  const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.projectId, projectId))
  const embeddings = await db.select().from(knowledgeEmbeddings).where(eq(knowledgeEmbeddings.projectId, projectId))
  const notes = await db.select().from(knowledgeNotes).where(eq(knowledgeNotes.projectId, projectId))
  const quality = await db.select().from(qualityReports).where(eq(qualityReports.projectId, projectId))
  const suggestions = await db.select().from(chapterPostprocessSuggestions).where(eq(chapterPostprocessSuggestions.projectId, projectId))
  const jobs = await db.select().from(writingJobs).where(eq(writingJobs.projectId, projectId))
  const jobSteps = jobs.length > 0
    ? await db.select().from(writingJobSteps).where(inArray(writingJobSteps.jobId, jobs.map(job => job.id)))
    : []
  const contextSnapshots = await db.select().from(aiContextSnapshots).where(eq(aiContextSnapshots.projectId, projectId))
  const personaConfigs = await db.select().from(projectPersonaConfigs).where(eq(projectPersonaConfigs.projectId, projectId))
  const memoryCards = await db.select().from(personaMemoryCards).where(eq(personaMemoryCards.projectId, projectId))
  const fChars = await db.select().from(foreshadowingCharacters).where(eq(foreshadowingCharacters.projectId, projectId))
  const cParts = await db.select().from(conflictParticipants).where(eq(conflictParticipants.projectId, projectId))
  const arcEvents = await db.select().from(characterArcEvents).where(eq(characterArcEvents.projectId, projectId))
  const conflictTimeline = await db.select().from(conflictTimelineEvents).where(eq(conflictTimelineEvents.projectId, projectId))
  const goals = await db.select().from(writingGoals).where(eq(writingGoals.projectId, projectId))
  const dailyStats = await db.select().from(dailyWritingStats).where(eq(dailyWritingStats.projectId, projectId))
  const aiCandidates = await db.select().from(aiGenerationCandidates).where(eq(aiGenerationCandidates.projectId, projectId))
  const styleFingerprints = await db.select().from(chapterStyleFingerprints).where(eq(chapterStyleFingerprints.projectId, projectId))
  const healthReports = await db.select().from(projectHealthReports).where(eq(projectHealthReports.projectId, projectId))

  const personaIds = personaConfigs.map(c => c.personaId)
  const personas = personaIds.length > 0
    ? await db.select().from(writingPersonas).where(inArray(writingPersonas.id, personaIds))
    : []

  return {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    project,
    storyBibless: bibles,
    characters: chars,
    volumes: vols,
    chapters: chaps,
    chapterScenes: scenes,
    relationships: rels,
    memories: mems,
    elements: elems,
    foreshadowing,
    triples,
    acts: actList,
    conflicts: confList,
    knowledgeSources: sources,
    knowledgeChunks: chunks,
    knowledgeEmbeddings: embeddings,
    knowledgeNotes: notes,
    qualityReports: quality,
    suggestions,
    writingJobs: jobs,
    writingJobSteps: jobSteps,
    aiContextSnapshots: contextSnapshots,
    writingPersonas: personas,
    personaConfigs,
    personaMemoryCards: memoryCards,
    foreshadowingCharacters: fChars,
    conflictParticipants: cParts,
    characterArcEvents: arcEvents,
    conflictTimelineEvents: conflictTimeline,
    writingGoals: goals,
    dailyWritingStats: dailyStats,
    aiGenerationCandidates: aiCandidates,
    chapterStyleFingerprints: styleFingerprints,
    projectHealthReports: healthReports,
  }
}

export async function importProjectData(data: Record<string, unknown>) {
  if (!data.project || typeof data.project !== 'object')
    throw new Error('Invalid import data: missing project')
  if (data.version !== '1.0')
    throw new Error('Unsupported import format version')

  return await db.transaction(async (tx) => {
    const idMap = new Map<string, string>()

    function remapId(oldId: string): string {
      if (!idMap.has(oldId))
        idMap.set(oldId, generateId())
      return idMap.get(oldId)!
    }

    function safeInsert(table: any, values: Record<string, unknown>) {
      return tx.insert(table).values(values as any)
    }

    const rawProject = data.project as Record<string, unknown>
    const projectId = remapId(rawProject.id as string)
    await safeInsert(novelProjects, { id: projectId, ...pick(rawProject, PROJECT_FIELDS) })

    for (const b of data.storyBibless as Record<string, unknown>[])
      await safeInsert(storyBibles, { id: remapId(b.id as string), projectId, ...pick(b, BIBLE_FIELDS) })

    for (const c of data.characters as Record<string, unknown>[])
      await safeInsert(characters, { id: remapId(c.id as string), projectId, ...pick(c, CHARACTER_FIELDS) })

    for (const v of data.volumes as Record<string, unknown>[])
      await safeInsert(volumes, { id: remapId(v.id as string), projectId, ...pick(v, VOLUME_FIELDS) })

    for (const ch of data.chapters as Record<string, unknown>[])
      await safeInsert(chapters, { id: remapId(ch.id as string), projectId, volumeId: ch.volumeId ? remapId(ch.volumeId as string) : null, ...pick(ch, CHAPTER_FIELDS) })

    for (const sc of ((data.chapterScenes as Record<string, unknown>[] | undefined) || []))
      await safeInsert(chapterScenes, { id: remapId(sc.id as string), projectId, chapterId: remapId(sc.chapterId as string), ...pick(sc, SCENE_FIELDS) })

    for (const r of data.relationships as Record<string, unknown>[])
      await safeInsert(characterRelationships, { id: remapId(r.id as string), projectId, characterAId: remapId(r.characterAId as string), characterBId: remapId(r.characterBId as string), ...pick(r, RELATIONSHIP_FIELDS) })

    for (const m of data.memories as Record<string, unknown>[])
      await safeInsert(chapterMemories, { id: remapId(m.id as string), projectId, chapterId: remapId(m.chapterId as string), ...pick(m, MEMORY_FIELDS) })

    for (const e of data.elements as Record<string, unknown>[])
      await safeInsert(chapterElements, { id: remapId(e.id as string), projectId, chapterId: remapId(e.chapterId as string), ...pick(e, ELEMENT_FIELDS) })

    for (const f of data.foreshadowing as Record<string, unknown>[])
      await safeInsert(foreshadowingItems, { id: remapId(f.id as string), projectId, setupChapterId: f.setupChapterId ? remapId(f.setupChapterId as string) : null, expectedPayoffChapterId: f.expectedPayoffChapterId ? remapId(f.expectedPayoffChapterId as string) : null, payoffChapterId: f.payoffChapterId ? remapId(f.payoffChapterId as string) : null, ...pick(f, FORESHADOWING_FIELDS) })

    for (const t of data.triples as Record<string, unknown>[])
      await safeInsert(storyFactTriples, { id: remapId(t.id as string), projectId, sourceChapterId: t.sourceChapterId ? remapId(t.sourceChapterId as string) : null, ...pick(t, TRIPLE_FIELDS) })

    for (const a of data.acts as Record<string, unknown>[])
      await safeInsert(acts, { id: remapId(a.id as string), projectId, volumeId: a.volumeId ? remapId(a.volumeId as string) : null, ...pick(a, ACT_FIELDS) })

    for (const c of data.conflicts as Record<string, unknown>[])
      await safeInsert(conflicts, { id: remapId(c.id as string), projectId, ...pick(c, CONFLICT_FIELDS) })

    for (const s of (data.knowledgeSources as Record<string, unknown>[] || []))
      await safeInsert(knowledgeSources, { id: remapId(s.id as string), projectId, ...pick(s, KNOWLEDGE_SOURCE_FIELDS) })

    for (const k of (data.knowledgeChunks as Record<string, unknown>[] || []))
      await safeInsert(knowledgeChunks, { id: remapId(k.id as string), projectId, sourceId: remapId(k.sourceId as string), ...pick(k, KNOWLEDGE_CHUNK_FIELDS) })

    for (const emb of ((data.knowledgeEmbeddings as Record<string, unknown>[] | undefined) || [])) {
      await safeInsert(knowledgeEmbeddings, {
        id: remapId(emb.id as string),
        projectId,
        sourceId: emb.sourceId ? remapId(emb.sourceId as string) : null,
        chunkId: emb.chunkId ? remapId(emb.chunkId as string) : null,
        ...pick(emb, KNOWLEDGE_EMBEDDING_FIELDS),
      })
    }

    for (const n of (data.knowledgeNotes as Record<string, unknown>[] || []))
      await safeInsert(knowledgeNotes, { id: remapId(n.id as string), projectId, sourceId: n.sourceId ? remapId(n.sourceId as string) : null, ...pick(n, KNOWLEDGE_NOTE_FIELDS) })

    for (const q of (data.qualityReports as Record<string, unknown>[] || []))
      await safeInsert(qualityReports, { id: remapId(q.id as string), projectId, chapterId: q.chapterId ? remapId(q.chapterId as string) : null, ...pick(q, QUALITY_REPORT_FIELDS) })

    for (const sg of (data.suggestions as Record<string, unknown>[] || []))
      await safeInsert(chapterPostprocessSuggestions, { id: remapId(sg.id as string), projectId, chapterId: remapId(sg.chapterId as string), runId: null, ...pick(sg, POSTPROCESS_SUGGESTION_FIELDS) })

    for (const mc of ((data.personaMemoryCards as Record<string, unknown>[] | undefined) || []))
      await safeInsert(personaMemoryCards, { id: remapId(mc.id as string), projectId, ...pick(mc, PERSONA_MEMORY_CARD_FIELDS) })

    for (const fc of ((data.foreshadowingCharacters as Record<string, unknown>[] | undefined) || []))
      await safeInsert(foreshadowingCharacters, { id: remapId(fc.id as string), projectId, foreshadowingId: remapId(fc.foreshadowingId as string), characterId: remapId(fc.characterId as string), ...pick(fc, FORESHADOWING_CHARACTER_FIELDS) })

    for (const cp of ((data.conflictParticipants as Record<string, unknown>[] | undefined) || []))
      await safeInsert(conflictParticipants, { id: remapId(cp.id as string), projectId, conflictId: remapId(cp.conflictId as string), characterId: remapId(cp.characterId as string), ...pick(cp, CONFLICT_PARTICIPANT_FIELDS) })

    for (const event of ((data.characterArcEvents as Record<string, unknown>[] | undefined) || [])) {
      await safeInsert(characterArcEvents, {
        id: remapId(event.id as string),
        projectId,
        characterId: remapId(event.characterId as string),
        chapterId: event.chapterId ? remapId(event.chapterId as string) : null,
        sceneId: event.sceneId ? remapId(event.sceneId as string) : null,
        ...pick(event, CHARACTER_ARC_EVENT_FIELDS),
      })
    }

    for (const event of ((data.conflictTimelineEvents as Record<string, unknown>[] | undefined) || [])) {
      await safeInsert(conflictTimelineEvents, {
        id: remapId(event.id as string),
        projectId,
        conflictId: remapId(event.conflictId as string),
        chapterId: event.chapterId ? remapId(event.chapterId as string) : null,
        sceneId: event.sceneId ? remapId(event.sceneId as string) : null,
        ...pick(event, CONFLICT_TIMELINE_EVENT_FIELDS),
      })
    }

    for (const goal of ((data.writingGoals as Record<string, unknown>[] | undefined) || []))
      await safeInsert(writingGoals, { id: remapId(goal.id as string), projectId, ...pick(goal, WRITING_GOAL_FIELDS) })

    for (const stat of ((data.dailyWritingStats as Record<string, unknown>[] | undefined) || []))
      await safeInsert(dailyWritingStats, { id: remapId(stat.id as string), projectId, ...pick(stat, DAILY_WRITING_STATS_FIELDS) })

    for (const job of ((data.writingJobs as Record<string, unknown>[] | undefined) || [])) {
      await safeInsert(writingJobs, {
        id: remapId(job.id as string),
        projectId,
        currentChapterId: job.currentChapterId ? remapId(job.currentChapterId as string) : null,
        sceneId: job.sceneId ? remapId(job.sceneId as string) : null,
        ...pick(job, WRITING_JOB_FIELDS),
      })
    }

    for (const step of ((data.writingJobSteps as Record<string, unknown>[] | undefined) || []))
      await safeInsert(writingJobSteps, { id: remapId(step.id as string), jobId: remapId(step.jobId as string), ...pick(step, WRITING_JOB_STEP_FIELDS) })

    for (const snapshot of ((data.aiContextSnapshots as Record<string, unknown>[] | undefined) || [])) {
      await safeInsert(aiContextSnapshots, {
        id: remapId(snapshot.id as string),
        projectId,
        chapterId: snapshot.chapterId ? remapId(snapshot.chapterId as string) : null,
        ...pick(snapshot, AI_CONTEXT_SNAPSHOT_FIELDS),
      })
    }

    for (const candidate of ((data.aiGenerationCandidates as Record<string, unknown>[] | undefined) || [])) {
      await safeInsert(aiGenerationCandidates, {
        id: remapId(candidate.id as string),
        projectId,
        chapterId: candidate.chapterId ? remapId(candidate.chapterId as string) : null,
        contextSnapshotId: candidate.contextSnapshotId ? remapId(candidate.contextSnapshotId as string) : null,
        ...pick(candidate, AI_GENERATION_CANDIDATE_FIELDS),
      })
    }

    for (const fingerprint of ((data.chapterStyleFingerprints as Record<string, unknown>[] | undefined) || [])) {
      if (!fingerprint.chapterId)
        continue
      await safeInsert(chapterStyleFingerprints, {
        id: remapId(fingerprint.id as string),
        projectId,
        chapterId: remapId(fingerprint.chapterId as string),
        sceneId: fingerprint.sceneId ? remapId(fingerprint.sceneId as string) : null,
        embeddingId: fingerprint.embeddingId ? remapId(fingerprint.embeddingId as string) : null,
        ...pick(fingerprint, CHAPTER_STYLE_FINGERPRINT_FIELDS),
      })
    }

    for (const report of ((data.projectHealthReports as Record<string, unknown>[] | undefined) || [])) {
      await safeInsert(projectHealthReports, {
        id: remapId(report.id as string),
        projectId,
        ...pick(report, PROJECT_HEALTH_REPORT_FIELDS),
      })
    }

    // Import writing personas before configs (FK dependency)
    for (const p of ((data.writingPersonas as Record<string, unknown>[] | undefined) || [])) {
      await safeInsert(writingPersonas, {
        id: remapId(p.id as string),
        sourceTrainingSetId: null,
        ...pick(p, WRITING_PERSONA_FIELDS),
      })
    }

    // Import persona configs — skip if persona was not imported (old export files)
    let skippedPersonaConfigs = 0
    for (const pc of (data.personaConfigs as Record<string, unknown>[] || [])) {
      const oldPersonaId = pc.personaId as string | undefined
      if (!oldPersonaId) {
        skippedPersonaConfigs++
        continue
      }

      const mappedPersonaId = idMap.get(oldPersonaId)
      if (!mappedPersonaId) {
        skippedPersonaConfigs++
        continue
      }

      await safeInsert(projectPersonaConfigs, {
        id: remapId(pc.id as string),
        projectId,
        personaId: mappedPersonaId,
        ...pick(pc, PERSONA_CONFIG_FIELDS),
      })
    }

    return { projectId, importedEntities: idMap.size, skippedPersonaConfigs }
  })
}
