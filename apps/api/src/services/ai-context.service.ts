import type {
  AIContextRequest,
  BuiltAIContext,
  CharacterContextSummary,
  ConflictContextSummary,
  ForeshadowingContextSummary,
  RelationshipContextSummary,
} from '@ai-novel/shared'
import { and, asc, desc, eq, lt, or, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterElements,
  chapterMemories,
  chapters,
  chapterScenes,
  characterRelationships,
  characters,
  conflictParticipants,
  conflicts,
  foreshadowingCharacters,
  foreshadowingItems,
  novelProjects,
  projectPersonaConfigs,
  storyBibles,
  storyFactTriples,
  volumes,
  writingPersonas,
} from '../db/schema'
import { retrieveKnowledgeForAI } from './knowledge-retrieval.service'
import { buildPersonaMemoryContext } from './persona-memory.service'
import { buildPersonaPromptForProject } from './persona-prompt.service'

function buildKnowledgeSearchTerms(input: {
  userInstruction?: string
  chapterTitle?: string
  projectTheme?: string
  projectGenre?: string
  currentChapterConflicts?: string
  characterNames: string[]
  conflictTitles: string[]
}) {
  const terms = [
    input.chapterTitle,
    input.projectTheme,
    input.projectGenre,
    input.currentChapterConflicts,
    ...input.characterNames.slice(0, 5),
    ...input.conflictTitles.slice(0, 5),
    ...(input.userInstruction || '')
      .split(/[\s,，。！？、:：；;]+/)
      .filter(term => term.length >= 2 && term.length <= 12)
      .slice(0, 8),
  ]

  return Array.from(new Set(
    terms
      .map(term => term?.trim())
      .filter((term): term is string => Boolean(term)),
  )).slice(0, 12)
}

export async function buildProjectAIContext(input: AIContextRequest): Promise<BuiltAIContext> {
  const { projectId, scene, chapterId, volumeId, sceneId, selectedText, userInstruction } = input

  // 1. Fetch Project & Story Bible
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('Project not found')

  const [bible] = await db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId))

  // 2. Fetch Current Chapter (if any)
  let currentChapterData: any = null
  let volumeTitle: string | undefined
  if (chapterId) {
    const [chapter] = await db.select().from(chapters).where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))
    if (chapter) {
      currentChapterData = chapter
      if (chapter.volumeId) {
        const [volume] = await db.select().from(volumes).where(and(eq(volumes.id, chapter.volumeId), eq(volumes.projectId, projectId)))
        volumeTitle = volume?.title
      }
    }
  }

  // 2b. Fetch Current Scene (if sceneId provided)
  let currentSceneData: any = null
  let allChapterScenes: any[] = []
  if (sceneId) {
    const [sceneRow] = await db.select().from(chapterScenes).where(
      and(eq(chapterScenes.id, sceneId), eq(chapterScenes.projectId, projectId)),
    )
    if (sceneRow) {
      currentSceneData = sceneRow
    }
  }
  if (currentChapterData) {
    allChapterScenes = await db.select().from(chapterScenes).where(
      and(eq(chapterScenes.chapterId, currentChapterData.id), eq(chapterScenes.projectId, projectId)),
    ).orderBy(asc(chapterScenes.orderIndex), asc(chapterScenes.sceneNumber))
  }

  // 3. Fetch Characters & Relationships
  const allCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))

  // 获取本章元素中明确提到的角色 ID
  const chapterElementsRows = currentChapterData
    ? await db.select().from(chapterElements).where(
        and(eq(chapterElements.projectId, projectId), eq(chapterElements.chapterId, currentChapterData.id)),
      )
    : []
  const activeCharacterIds = new Set(
    chapterElementsRows
      .filter(e => e.elementType === 'character' && e.elementId)
      .map(e => e.elementId as string),
  )

  // 3.1 提取核心角色详情
  const characterSummaries: CharacterContextSummary[] = allCharacters.map((c) => {
    const isMajor = activeCharacterIds.has(c.id)
    return {
      id: c.id,
      name: c.name,
      role: c.role || undefined,
      goal: c.goal || undefined,
      fear: c.fear || undefined,
      secret: c.secret || undefined,
      desire: c.desire || undefined,
      weakness: c.weakness || undefined,
      personality: c.personality || undefined,
      arc: c.arc || undefined,
      isMajor, // 标记为本章核心角色
    }
  })

  // 3.2 人物关系
  const rels = await db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
  const relationshipSummaries: RelationshipContextSummary[] = rels.map((r) => {
    const charA = allCharacters.find(c => c.id === r.characterAId)
    const charB = allCharacters.find(c => c.id === r.characterBId)
    return {
      characterAName: charA?.name || 'Unknown',
      characterBName: charB?.name || 'Unknown',
      type: r.type,
      strength: r.strength,
      status: r.status || undefined,
      description: r.description || undefined,
    }
  })

  // 4. Fetch Conflicts
  const allConflicts = await db.select().from(conflicts).where(eq(conflicts.projectId, projectId))
  const conflictParticipantsRows = await db
    .select({
      conflictId: conflictParticipants.conflictId,
      characterName: characters.name,
    })
    .from(conflictParticipants)
    .innerJoin(characters, eq(conflictParticipants.characterId, characters.id))
    .where(eq(conflictParticipants.projectId, projectId))

  const conflictSummaries: ConflictContextSummary[] = allConflicts
    .filter(c => c.status !== 'resolved' && c.status !== 'abandoned')
    .map((c) => {
      const participants = conflictParticipantsRows
        .filter(p => p.conflictId === c.id)
        .map(p => p.characterName)

      return {
        title: c.title,
        type: c.type,
        intensity: c.intensity,
        status: c.status,
        participants: participants.length > 0 ? participants.join('、') : (c.participants || undefined),
        participantNames: participants.length > 0 ? participants : undefined,
        description: c.description || undefined,
      }
    })

  // 5. Persona Prompt
  let persona: BuiltAIContext['persona'] | undefined
  if (scene !== 'chat') {
    const personaPrompt = await buildPersonaPromptForProject(projectId, scene)
    if (personaPrompt) {
      // Find active persona config to get name and strength
      const [config] = await db
        .select({
          name: writingPersonas.name,
          strength: projectPersonaConfigs.strength,
        })
        .from(projectPersonaConfigs)
        .innerJoin(writingPersonas, eq(projectPersonaConfigs.personaId, writingPersonas.id))
        .where(eq(projectPersonaConfigs.projectId, projectId))
        .limit(1)

      if (config) {
        persona = {
          name: config.name,
          strength: config.strength,
          prompt: personaPrompt,
        }
      }
    }
  }

  // 6. Knowledge Snippets (Hybrid Retrieval)
  // ... (lines 208-228 skipped in this replacement for brevity, I'll match them exactly) ...
  const searchTerms = buildKnowledgeSearchTerms({
    userInstruction,
    chapterTitle: currentChapterData?.title,
    projectTheme: project.theme || undefined,
    projectGenre: project.genre || undefined,
    currentChapterConflicts: currentChapterData?.conflicts || undefined,
    characterNames: allCharacters.map(c => c.name),
    conflictTitles: conflictSummaries.map(c => c.title),
  })

  const factTripleSubjects = [...allCharacters.map(c => c.name), ...conflictSummaries.map(c => c.title)]
  const knowledgeSnippets = searchTerms.length > 0
    ? await retrieveKnowledgeForAI({
        projectId,
        terms: searchTerms,
        characterNames: allCharacters.map(c => c.name),
        conflictTitles: conflictSummaries.map(c => c.title),
        factTripleSubjects,
        limit: 5,
      })
    : []

  // 6b. Project-level accumulated writing memory (Scene-aware)
  const personaMemory = scene !== 'chat'
    ? await buildPersonaMemoryContext(projectId, scene, userInstruction)
    : []

  // 7. Assemble Nearby Chapters
  // ... (lines 235-324 skipped) ...
  let nearbyChapters: BuiltAIContext['nearbyChapters'] | undefined
  if (currentChapterData) {
    const volumeId = currentChapterData.volumeId
    const prev = await db
      .select()
      .from(chapters)
      .where(and(
        eq(chapters.projectId, projectId),
        volumeId ? eq(chapters.volumeId, volumeId) : sql`1=1`,
        eq(chapters.chapterNumber, currentChapterData.chapterNumber - 1),
      ))
      .limit(1)
    const next = await db
      .select()
      .from(chapters)
      .where(and(
        eq(chapters.projectId, projectId),
        volumeId ? eq(chapters.volumeId, volumeId) : sql`1=1`,
        eq(chapters.chapterNumber, currentChapterData.chapterNumber + 1),
      ))
      .limit(1)

    nearbyChapters = {
      previous: prev[0] ? { id: prev[0].id, title: prev[0].title, chapterNumber: prev[0].chapterNumber, summary: prev[0].summary || undefined } : undefined,
      next: next[0] ? { id: next[0].id, title: next[0].title, chapterNumber: next[0].chapterNumber, summary: next[0].summary || undefined } : undefined,
    }
  }

  const recentMemories: string[] = []
  if (currentChapterData) {
    const memoryRows = await db
      .select({
        memory: chapterMemories,
        chapterTitle: chapters.title,
        chapterNumber: chapters.chapterNumber,
      })
      .from(chapterMemories)
      .innerJoin(chapters, eq(chapterMemories.chapterId, chapters.id))
      .where(and(
        eq(chapterMemories.projectId, projectId),
        eq(chapters.projectId, projectId),
        currentChapterData.volumeId
          ? eq(chapters.volumeId, currentChapterData.volumeId)
          : sql`1=1`,
        lt(chapters.chapterNumber, currentChapterData.chapterNumber),
      ))
      .orderBy(desc(chapters.chapterNumber))
      .limit(3)

    for (const row of memoryRows.reverse()) {
      const m = row.memory
      const parts = [`章节 ${row.chapterNumber}. ${row.chapterTitle}:`]
      if (m.summary) {
        parts.push(`  摘要: ${m.summary}`)
      }
      if (m.keyEvents) {
        parts.push(`  关键事件: ${m.keyEvents}`)
      }
      if (m.characterStateChanges) {
        parts.push(`  人物变化: ${m.characterStateChanges}`)
      }
      if (m.relationshipChanges) {
        parts.push(`  关系变化: ${m.relationshipChanges}`)
      }
      if (m.foreshadowingAdded) {
        parts.push(`  新增伏笔: ${m.foreshadowingAdded}`)
      }
      if (m.foreshadowingResolved) {
        parts.push(`  回收伏笔: ${m.foreshadowingResolved}`)
      }
      recentMemories.push(parts.join('\n'))
    }
  }

  let chapterElementSummaries: string[] = []
  if (currentChapterData) {
    const elements = await db.select().from(chapterElements).where(
      and(eq(chapterElements.projectId, projectId), eq(chapterElements.chapterId, currentChapterData.id)),
    )
    if (elements.length > 0) {
      chapterElementSummaries = elements
        .sort((a, b) => (a.appearanceOrder || 0) - (b.appearanceOrder || 0))
        .map(e => `- ${e.elementName} (${e.elementType}/${e.relationType}) 重要性:${e.importance}${e.notes ? ` 备注:${e.notes}` : ''}`)
    }
  }

  // 10. Fetch foreshadowing items for current chapter + all open items
  let foreshadowingSummaries: ForeshadowingContextSummary[] = []
  if (currentChapterData) {
    const chapterItems = await db.select().from(foreshadowingItems).where(
      and(
        eq(foreshadowingItems.projectId, projectId),
        or(
          eq(foreshadowingItems.setupChapterId, currentChapterData.id),
          eq(foreshadowingItems.expectedPayoffChapterId, currentChapterData.id),
        ),
      ),
    )
    const openItems = await db.select().from(foreshadowingItems).where(
      and(eq(foreshadowingItems.projectId, projectId), eq(foreshadowingItems.status, 'open')),
    )
    const allItems = [...new Map([...chapterItems, ...openItems].map(i => [i.id, i])).values()]

    const foreshadowingCharactersRows = await db
      .select({
        foreshadowingId: foreshadowingCharacters.foreshadowingId,
        characterName: characters.name,
      })
      .from(foreshadowingCharacters)
      .innerJoin(characters, eq(foreshadowingCharacters.characterId, characters.id))
      .where(eq(foreshadowingCharacters.projectId, projectId))

    foreshadowingSummaries = allItems.map((i) => {
      const charNames = foreshadowingCharactersRows
        .filter(p => p.foreshadowingId === i.id)
        .map(p => p.characterName)

      return {
        title: i.title,
        description: i.description || undefined,
        status: i.status,
        importance: i.importance,
        characterNames: charNames.length > 0 ? charNames : undefined,
      }
    })
  }

  // 11. Fetch confirmed fact triples relevant to current chapter
  let factTripleContext: string[] = []
  if (currentChapterData) {
    // 优先获取与本章登场角色相关的事实
    const activeNames = allCharacters.filter(c => activeCharacterIds.has(c.id)).map(c => c.name)

    const triples = await db.select().from(storyFactTriples).where(
      and(
        eq(storyFactTriples.projectId, projectId),
        eq(storyFactTriples.status, 'confirmed'),
      ),
    ).orderBy(desc(storyFactTriples.updatedAt))

    // 过滤与活跃角色相关的
    const activeTriples = triples.filter(t =>
      activeNames.includes(t.subjectName) || activeNames.includes(t.objectName),
    ).slice(0, 15)

    // 补充其他最新事实，总数控制在 25 条以内
    const otherTriples = triples.filter(t => !activeTriples.includes(t)).slice(0, 25 - activeTriples.length)

    const finalTriples = [...activeTriples, ...otherTriples]

    factTripleContext = finalTriples.map(t =>
      `- ${t.subjectName}(${t.subjectType}) --[${t.predicate}]--> ${t.objectName}(${t.objectType}) [置信度:${t.confidence}%]`,
    )
  }

  // 12. Determine Draft Excerpt based on scene
  let draftExcerpt = selectedText
  if (!draftExcerpt && currentChapterData?.draft) {
    if (scene === 'polish' || scene === 'quality') {
      draftExcerpt = currentChapterData.draft.substring(0, 5000)
    }
    else if (scene === 'draft') {
      draftExcerpt = currentChapterData.draft.length > 3000
        ? `...${currentChapterData.draft.substring(currentChapterData.draft.length - 3000)}`
        : currentChapterData.draft
    }
    else if (scene !== 'outline') {
      draftExcerpt = currentChapterData.draft.substring(0, 2000)
    }
  }

  // 2c. Fetch Current Volume (if volumeId provided or via chapterId)
  let currentVolumeData: any = null
  const targetVolumeId = volumeId || currentChapterData?.volumeId
  if (targetVolumeId) {
    const [vol] = await db.select().from(volumes).where(and(eq(volumes.id, targetVolumeId), eq(volumes.projectId, projectId)))
    if (vol) {
      currentVolumeData = vol
    }
  }

  return {
    scene,
    task: userInstruction || '根据上下文完成创作任务',
    project: {
      title: project.title,
      description: project.description || undefined,
      genre: project.genre || undefined,
      theme: project.theme || undefined,
      targetAudience: project.targetAudience || undefined,
      targetWords: project.targetWords || undefined,
      styleProfile: project.styleProfile || undefined,
    },
    storyBible: bible
      ? {
          worldview: bible.worldview || undefined,
          mainConflict: bible.mainConflict || undefined,
          theme: bible.theme || undefined,
          rules: bible.rules || undefined,
          timeline: bible.timeline || undefined,
        }
      : undefined,
    currentVolume: currentVolumeData
      ? {
          id: currentVolumeData.id,
          title: currentVolumeData.title,
          summary: currentVolumeData.summary || undefined,
        }
      : undefined,
    currentChapter: currentChapterData
      ? {
          id: currentChapterData.id,
          title: currentChapterData.title,
          chapterNumber: currentChapterData.chapterNumber,
          volumeTitle,
          goals: currentChapterData.goals || undefined,
          conflicts: currentChapterData.conflicts || undefined,
          events: currentChapterData.events || undefined,
          emotionalArc: currentChapterData.emotionalArc || undefined,
          foreshadowing: currentChapterData.foreshadowing || undefined,
          endingHook: currentChapterData.endingHook || undefined,
          draftExcerpt,
        }
      : undefined,
    currentScene: currentSceneData
      ? {
          id: currentSceneData.id,
          title: currentSceneData.title,
          sceneNumber: currentSceneData.sceneNumber,
          location: currentSceneData.location,
          timeline: currentSceneData.timeline,
          purpose: currentSceneData.purpose,
          summary: currentSceneData.summary,
          characters: currentSceneData.characters,
          conflict: currentSceneData.conflict,
          targetWords: currentSceneData.targetWords,
          content: currentSceneData.content,
        }
      : undefined,
    chapterScenes: allChapterScenes.length > 0
      ? allChapterScenes.map(s => ({
          id: s.id,
          sceneNumber: s.sceneNumber,
          title: s.title,
          status: s.status,
          summary: s.summary,
        }))
      : undefined,
    nearbyChapters,
    characters: characterSummaries,
    relationships: relationshipSummaries,
    conflicts: conflictSummaries,
    persona,
    knowledgeSnippets,
    personaMemory,
    chapterMemories: recentMemories,
    chapterElements: chapterElementSummaries,
    foreshadowingItems: foreshadowingSummaries,
    factTriples: factTripleContext,
    constraints: [
      '保持已有设定一致性',
      '不得让角色做出违背既定动机的行为',
      '不得复刻参考作品的具体桥段',
    ],
  }
}
