import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  acts,
  chapterElements,
  chapterMemories,
  chapterPostprocessSuggestions,
  chapters,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  knowledgeChunks,
  knowledgeNotes,
  knowledgeSources,
  novelProjects,
  projectPersonaConfigs,
  qualityReports,
  storyBibles,
  storyFactTriples,
  volumes,
} from '../db/schema'
import { generateId } from '../utils'

export async function exportProjectData(projectId: string) {
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('项目不存在')

  const bibles = await db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId))
  const chars = await db.select().from(characters).where(eq(characters.projectId, projectId))
  const vols = await db.select().from(volumes).where(eq(volumes.projectId, projectId))
  const chaps = await db.select().from(chapters).where(eq(chapters.projectId, projectId))
  const rels = await db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
  const mems = await db.select().from(chapterMemories).where(eq(chapterMemories.projectId, projectId))
  const elems = await db.select().from(chapterElements).where(eq(chapterElements.projectId, projectId))
  const foreshadowing = await db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId))
  const triples = await db.select().from(storyFactTriples).where(eq(storyFactTriples.projectId, projectId))
  const actList = await db.select().from(acts).where(eq(acts.projectId, projectId))
  const confList = await db.select().from(conflicts).where(eq(conflicts.projectId, projectId))
  const sources = await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId))
  const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.projectId, projectId))
  const notes = await db.select().from(knowledgeNotes).where(eq(knowledgeNotes.projectId, projectId))
  const quality = await db.select().from(qualityReports).where(eq(qualityReports.projectId, projectId))
  const suggestions = await db.select().from(chapterPostprocessSuggestions).where(eq(chapterPostprocessSuggestions.projectId, projectId))
  const personaConfigs = await db.select().from(projectPersonaConfigs).where(eq(projectPersonaConfigs.projectId, projectId))

  return {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    project,
    storyBibles: bibles,
    characters: chars,
    volumes: vols,
    chapters: chaps,
    relationships: rels,
    memories: mems,
    elements: elems,
    foreshadowing,
    triples,
    acts: actList,
    conflicts: confList,
    knowledgeSources: sources,
    knowledgeChunks: chunks,
    knowledgeNotes: notes,
    qualityReports: quality,
    suggestions,
    personaConfigs,
  }
}

export async function importProjectData(data: any) {
  const idMap = new Map<string, string>()

  function remapId(oldId: string): string {
    if (!idMap.has(oldId))
      idMap.set(oldId, generateId())
    return idMap.get(oldId)!
  }

  // Create project
  const projectId = remapId(data.project.id)
  await db.insert(novelProjects).values({ ...data.project, id: projectId })

  // Story bibles
  for (const b of data.storyBibles || [])
    await db.insert(storyBibles).values({ ...b, id: remapId(b.id), projectId })

  // Characters
  for (const c of data.characters || [])
    await db.insert(characters).values({ ...c, id: remapId(c.id), projectId })

  // Volumes
  for (const v of data.volumes || [])
    await db.insert(volumes).values({ ...v, id: remapId(v.id), projectId })

  // Chapters
  for (const ch of data.chapters || [])
    await db.insert(chapters).values({ ...ch, id: remapId(ch.id), projectId, volumeId: ch.volumeId ? remapId(ch.volumeId) : null })

  // Relationships
  for (const r of data.relationships || [])
    await db.insert(characterRelationships).values({ ...r, id: remapId(r.id), projectId, characterAId: remapId(r.characterAId), characterBId: remapId(r.characterBId) })

  // Memories
  for (const m of data.memories || [])
    await db.insert(chapterMemories).values({ ...m, id: remapId(m.id), projectId, chapterId: remapId(m.chapterId) })

  // Elements
  for (const e of data.elements || [])
    await db.insert(chapterElements).values({ ...e, id: remapId(e.id), projectId, chapterId: remapId(e.chapterId) })

  // Foreshadowing
  for (const f of data.foreshadowing || [])
    await db.insert(foreshadowingItems).values({ ...f, id: remapId(f.id), projectId, setupChapterId: f.setupChapterId ? remapId(f.setupChapterId) : null })

  // Triples
  for (const t of data.triples || [])
    await db.insert(storyFactTriples).values({ ...t, id: remapId(t.id), projectId })

  // Acts
  for (const a of data.acts || [])
    await db.insert(acts).values({ ...a, id: remapId(a.id), projectId })

  // Conflicts
  for (const c of data.conflicts || [])
    await db.insert(conflicts).values({ ...c, id: remapId(c.id), projectId })

  return { projectId, importedEntities: idMap.size }
}
