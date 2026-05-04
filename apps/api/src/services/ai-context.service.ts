import type {
  AIContextRequest,
  BuiltAIContext,
  CharacterContextSummary,
  ConflictContextSummary,
  KnowledgeContextSnippet,
  RelationshipContextSummary,
} from '@ai-novel/shared'
import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterElements,
  chapterMemories,
  chapters,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  knowledgeChunks,
  novelProjects,
  projectPersonaConfigs,
  storyBibles,
  storyFactTriples,
  volumes,
  writingPersonas,
} from '../db/schema'
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
  const { projectId, scene, chapterId, selectedText, userInstruction } = input

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

  // 3. Fetch Characters & Relationships
  // If we have current chapter, we might want to prioritize characters mentioned there
  // For now, let's just get project characters
  const allCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))
  const characterSummaries: CharacterContextSummary[] = allCharacters.map(c => ({
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
  }))

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
  const conflictSummaries: ConflictContextSummary[] = allConflicts
    .filter(c => c.status !== 'resolved' && c.status !== 'abandoned')
    .map(c => ({
      title: c.title,
      type: c.type,
      intensity: c.intensity,
      status: c.status,
      participants: c.participants || undefined,
      description: c.description || undefined,
    }))

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

  // 6. Knowledge Snippets (Improved Keyword Search)
  let knowledgeSnippets: KnowledgeContextSnippet[] = []
  const terms = buildKnowledgeSearchTerms({
    userInstruction,
    chapterTitle: currentChapterData?.title,
    projectTheme: project.theme || undefined,
    projectGenre: project.genre || undefined,
    currentChapterConflicts: currentChapterData?.conflicts || undefined,
    characterNames: allCharacters.map(c => c.name),
    conflictTitles: conflictSummaries.map(c => c.title),
  })

  if (terms.length > 0) {
    const predicates = terms.flatMap((term) => {
      const pattern = `%${term}%`
      return [
        sql`${knowledgeChunks.title} ILIKE ${pattern}`,
        sql`${knowledgeChunks.summary} ILIKE ${pattern}`,
        sql`${knowledgeChunks.techniques} ILIKE ${pattern}`,
        sql`${knowledgeChunks.content} ILIKE ${pattern}`,
      ]
    })

    const chunks = await db
      .select()
      .from(knowledgeChunks)
      .where(and(
        eq(knowledgeChunks.projectId, projectId),
        or(...predicates),
      ))
      .limit(3)

    knowledgeSnippets = chunks
      .filter(c => c.summary)
      .map(c => ({
        title: c.title || 'Knowledge Piece',
        summary: c.summary as string,
        techniques: c.techniques || undefined,
      }))
  }

  // 7. Assemble Nearby Chapters
  // 7. Assemble Nearby Chapters (Restricted to same volume if possible)
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

  // 8. Fetch recent chapter memories for continuity
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

  // 9. Fetch chapter elements for current chapter
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
  let foreshadowingContext: string[] = []
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
    foreshadowingContext = allItems.map(i =>
      `- ${i.title} (${i.status}/${i.importance})${i.description ? `: ${i.description}` : ''}`,
    )
  }

  // 11. Fetch confirmed fact triples relevant to current chapter
  let factTripleContext: string[] = []
  if (currentChapterData) {
    const triples = await db.select().from(storyFactTriples).where(
      and(
        eq(storyFactTriples.projectId, projectId),
        eq(storyFactTriples.status, 'confirmed'),
      ),
    ).limit(20)
    factTripleContext = triples.map(t =>
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
    nearbyChapters,
    characters: characterSummaries,
    relationships: relationshipSummaries,
    conflicts: conflictSummaries,
    persona,
    knowledgeSnippets,
    chapterMemories: recentMemories,
    chapterElements: chapterElementSummaries,
    foreshadowingItems: foreshadowingContext,
    factTriples: factTripleContext,
    constraints: [
      '保持已有设定一致性',
      '不得让角色做出违背既定动机的行为',
      '不得复刻参考作品的具体桥段',
    ],
  }
}

export function renderAIContext(context: BuiltAIContext): string {
  const sections: string[] = []

  sections.push(`【本次任务】\n场景: ${context.scene}\n指令: ${context.task}`)

  sections.push(`【作品档案】\n书名: ${context.project.title}\n类型: ${context.project.genre || '未定义'}\n主题: ${context.project.theme || '未定义'}\n简介: ${context.project.description || '未定义'}`)

  if (context.storyBible) {
    sections.push(`【故事设定】\n世界观: ${context.storyBible.worldview || '未定义'}\n主冲突: ${context.storyBible.mainConflict || '未定义'}\n规则: ${context.storyBible.rules || '未定义'}`)
  }

  if (context.currentChapter) {
    const chapterLines = [
      `标题: ${context.currentChapter.title}`,
      context.currentChapter.volumeTitle ? `所属分卷: ${context.currentChapter.volumeTitle}` : null,
      `章节目标: ${context.currentChapter.goals || '未定义'}`,
      `核心冲突: ${context.currentChapter.conflicts || '未定义'}`,
      context.currentChapter.events ? `关键事件: ${context.currentChapter.events}` : null,
      context.currentChapter.emotionalArc ? `情绪曲线: ${context.currentChapter.emotionalArc}` : null,
      context.currentChapter.foreshadowing ? `伏笔: ${context.currentChapter.foreshadowing}` : null,
      context.currentChapter.endingHook ? `结尾钩子: ${context.currentChapter.endingHook}` : null,
      context.currentChapter.draftExcerpt ? `草稿片段:\n${context.currentChapter.draftExcerpt}` : '草稿片段: 暂无草稿',
    ].filter(Boolean)

    sections.push(`【当前章节】\n${chapterLines.join('\n')}`)
  }

  if (context.nearbyChapters?.previous || context.nearbyChapters?.next) {
    sections.push(`【前后章节】\n上一章: ${context.nearbyChapters.previous ? `${context.nearbyChapters.previous.chapterNumber}. ${context.nearbyChapters.previous.title} - ${context.nearbyChapters.previous.summary || '无摘要'}` : '无'}\n下一章: ${context.nearbyChapters.next ? `${context.nearbyChapters.next.chapterNumber}. ${context.nearbyChapters.next.title} - ${context.nearbyChapters.next.summary || '无摘要'}` : '无'}`)
  }

  if (context.characters.length > 0) {
    const charList = context.characters.map((c) => {
      const details = [
        `身份: ${c.role || '无身份'}`,
        `性格: ${c.personality || '无性格描述'}`,
        c.goal ? `目标: ${c.goal}` : null,
        c.desire ? `欲望: ${c.desire}` : null,
        c.fear ? `恐惧: ${c.fear}` : null,
        c.secret ? `秘密: ${c.secret}` : null,
        c.weakness ? `弱点: ${c.weakness}` : null,
        c.arc ? `成长线: ${c.arc}` : null,
      ].filter(Boolean)

      return `- ${c.name}\n  ${details.join('\n  ')}`
    }).join('\n')

    sections.push(`【登场人物】\n${charList}`)
  }

  if (context.relationships.length > 0) {
    const relList = context.relationships
      .map(r => `- ${r.characterAName} 与 ${r.characterBName}: ${r.type} / 强度 ${r.strength} / ${r.status || '未定义'}。${r.description || ''}`)
      .join('\n')
    sections.push(`【人物关系】\n${relList}`)
  }

  if (context.conflicts.length > 0) {
    const conflictList = context.conflicts
      .map(c => `- ${c.title}: ${c.type} / 强度 ${c.intensity} / 状态 ${c.status}。参与者: ${c.participants || '未定义'}。${c.description || ''}`)
      .join('\n')
    sections.push(`【核心矛盾】\n${conflictList}`)
  }

  if (context.knowledgeSnippets.length > 0) {
    const knowledgeList = context.knowledgeSnippets
      .map(k => `- ${k.title}\n  摘要: ${k.summary}\n  技巧: ${k.techniques || '无'}`)
      .join('\n')
    sections.push(`【参考技巧库】\n${knowledgeList}\n\n注意：只能借鉴抽象技巧和结构经验，不得复刻参考作品桥段、专名或连续表达。`)
  }

  if (context.chapterMemories.length > 0) {
    sections.push(`【前序章节记忆】\n以下是最近章节的结构化记忆，请确保连贯性：\n${context.chapterMemories.join('\n\n')}`)
  }

  if (context.chapterElements.length > 0) {
    sections.push(`【本章元素】\n${context.chapterElements.join('\n')}\n注意：必须让标记为 appears 的角色实际出场，必须让 scene 地点成为本章场景。`)
  }

  if (context.foreshadowingItems.length > 0) {
    sections.push(`【伏笔台账】\n${context.foreshadowingItems.join('\n')}\n约束：不得无故回收未到时机的伏笔。如果新增重大伏笔，必须在章后管线登记。`)
  }

  if (context.factTriples.length > 0) {
    sections.push(`【事实图谱】\n${context.factTriples.join('\n')}\n注意：必须遵守已确认的事实，不得与既有设定矛盾。`)
  }

  if (context.persona) {
    sections.push(`【写作人格: ${context.persona.name} (强度: ${context.persona.strength})】\n${context.persona.prompt}`)
  }

  if (context.constraints.length > 0) {
    sections.push(`【输出约束】\n${context.constraints.map(c => `- ${c}`).join('\n')}`)
  }

  return sections.join('\n\n---\n\n')
}
