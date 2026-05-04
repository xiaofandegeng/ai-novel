import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterElements,
  chapterMemories,
  chapters,
  conflicts,
  foreshadowingItems,
  novelProjects,
  qualityReports,
  storyFactTriples,
} from '../db/schema'

export interface ProjectHealthMetrics {
  totalChapters: number
  completedChapters: number
  totalWords: number
  averageChapterWords: number
  activeConflicts: number
  conflictIntensityAvg: number
  conflictIntensityTrend: { chapter: number, avgIntensity: number }[]
  openForeshadowingCount: number
  foreshadowingByStatus: Record<string, number>
  confirmedTriples: number
  pendingTriples: number
  elementFrequency: { name: string, type: string, count: number }[]
  qualityTrend: { chapter: number, score: number }[]
}

export async function getProjectHealthMetrics(projectId: string): Promise<ProjectHealthMetrics> {
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('Project not found')

  // Chapters
  const allChapters = await db.select().from(chapters).where(eq(chapters.projectId, projectId))
  const totalChapters = allChapters.length
  const completedChapters = allChapters.filter(c => c.status === 'completed').length
  const totalWords = allChapters.reduce((sum, c) => sum + (c.draft?.length || 0), 0)
  const averageChapterWords = totalChapters > 0 ? Math.round(totalWords / totalChapters) : 0

  // Conflicts
  const allConflicts = await db.select().from(conflicts).where(eq(conflicts.projectId, projectId))
  const activeConflicts = allConflicts.filter(c => c.status !== 'resolved' && c.status !== 'abandoned').length
  const conflictIntensityAvg = activeConflicts > 0
    ? Math.round(allConflicts.filter(c => c.status !== 'resolved' && c.status !== 'abandoned').reduce((s, c) => s + c.intensity, 0) / activeConflicts)
    : 0

  // Conflict intensity trend (by chapter — use memories that have conflictProgress)
  const memories = await db.select().from(chapterMemories).where(eq(chapterMemories.projectId, projectId))
  const chapterNumMap = new Map(allChapters.map(c => [c.id, c.chapterNumber]))
  const conflictIntensityTrend = memories
    .filter(m => m.conflictProgress)
    .map(m => ({ chapter: chapterNumMap.get(m.chapterId) || 0, avgIntensity: 5 }))
    .sort((a, b) => a.chapter - b.chapter)

  // Foreshadowing
  const allForeshadowing = await db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId))
  const openForeshadowingCount = allForeshadowing.filter(f => f.status === 'open').length
  const foreshadowingByStatus: Record<string, number> = {}
  for (const f of allForeshadowing) {
    foreshadowingByStatus[f.status] = (foreshadowingByStatus[f.status] || 0) + 1
  }

  // Triples
  const allTriples = await db.select().from(storyFactTriples).where(eq(storyFactTriples.projectId, projectId))
  const confirmedTriples = allTriples.filter(t => t.status === 'confirmed').length
  const pendingTriples = allTriples.filter(t => t.status === 'pending').length

  // Element frequency
  const allElements = await db.select().from(chapterElements).where(eq(chapterElements.projectId, projectId))
  const freqMap = new Map<string, { name: string, type: string, count: number }>()
  for (const el of allElements) {
    const key = `${el.elementType}:${el.elementName}`
    const existing = freqMap.get(key)
    if (existing) {
      existing.count++
    }
    else {
      freqMap.set(key, { name: el.elementName, type: el.elementType, count: 1 })
    }
  }
  const elementFrequency = [...freqMap.values()].sort((a, b) => b.count - a.count).slice(0, 20)

  // Quality trend
  const reports = await db.select().from(qualityReports).where(eq(qualityReports.projectId, projectId))
  const qualityTrend = reports
    .filter(r => r.chapterId)
    .map((r) => {
      const ch = allChapters.find(c => c.id === r.chapterId)
      return { chapter: ch?.chapterNumber || 0, score: r.score }
    })
    .sort((a, b) => a.chapter - b.chapter)

  return {
    totalChapters,
    completedChapters,
    totalWords,
    averageChapterWords,
    activeConflicts,
    conflictIntensityAvg,
    conflictIntensityTrend,
    openForeshadowingCount,
    foreshadowingByStatus,
    confirmedTriples,
    pendingTriples,
    elementFrequency,
    qualityTrend,
  }
}
