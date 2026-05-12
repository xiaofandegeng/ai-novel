import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterElements,
  chapterMemories,
  chapters,
  chapterScenes,
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
  chaptersWithoutScenes: { chapterId: string, chapterNumber: number, title: string }[]
  scenesWithoutContent: number
  scenesWithoutPurpose: number
  scenesWithoutConflict: number
  sceneWordCountDeviation: { sceneId: string, sceneNumber: number, title: string | null, actual: number, target: number, deviation: number }[]
  sceneStatusDistribution: Record<string, number>
  risks: Array<{
    id: string
    severity: 'high' | 'medium' | 'low'
    type: 'scene' | 'foreshadowing' | 'conflict' | 'quality' | 'structure' | 'knowledge'
    title: string
    message: string
    actionLabel: string
    targetRoute?: string
  }>
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

  // Scene-level metrics
  const allScenes = await db.select().from(chapterScenes).where(eq(chapterScenes.projectId, projectId))

  // Chapters without scenes
  const scenesByChapter = new Map<string, typeof allScenes>()
  for (const s of allScenes) {
    const list = scenesByChapter.get(s.chapterId) || []
    list.push(s)
    scenesByChapter.set(s.chapterId, list)
  }
  const chaptersWithoutScenes = allChapters
    .filter(c => !scenesByChapter.has(c.id))
    .map(c => ({ chapterId: c.id, chapterNumber: c.chapterNumber, title: c.title }))

  // Scene counts
  const scenesWithoutContent = allScenes.filter(s => !s.content).length
  const scenesWithoutPurpose = allScenes.filter(s => !s.purpose).length
  const scenesWithoutConflict = allScenes.filter(s => !s.conflict).length

  // Scene word count deviation (only scenes with targetWords set)
  const sceneWordCountDeviation = allScenes
    .filter(s => s.targetWords && s.targetWords > 0)
    .map(s => ({
      sceneId: s.id,
      sceneNumber: s.sceneNumber,
      title: s.title,
      actual: (s.content || '').length,
      target: s.targetWords!,
      deviation: (s.content || '').length - s.targetWords!,
    }))

  // Scene status distribution
  const sceneStatusDistribution: Record<string, number> = {}
  for (const s of allScenes) {
    sceneStatusDistribution[s.status] = (sceneStatusDistribution[s.status] || 0) + 1
  }

  const risks: ProjectHealthMetrics['risks'] = []
  for (const chapter of chaptersWithoutScenes.slice(0, 5)) {
    risks.push({
      id: `chapter-without-scenes:${chapter.chapterId}`,
      severity: 'medium',
      type: 'scene',
      title: `第 ${chapter.chapterNumber} 章缺少场景规划`,
      message: `《${chapter.title}》还没有拆成场景，后续 AI 生成较容易偏离章节节拍。`,
      actionLabel: '去规划场景',
      targetRoute: `/project/${projectId}/outline?chapter=${chapter.chapterId}`,
    })
  }

  if (scenesWithoutConflict > 0) {
    risks.push({
      id: 'scenes-without-conflict',
      severity: scenesWithoutConflict >= 3 ? 'high' : 'medium',
      type: 'scene',
      title: '存在缺少冲突的场景',
      message: `${scenesWithoutConflict} 个场景没有填写场景冲突，可能导致正文推进乏力。`,
      actionLabel: '检查场景冲突',
      targetRoute: `/project/${projectId}/outline`,
    })
  }

  if (openForeshadowingCount >= 5) {
    risks.push({
      id: 'many-open-foreshadowing',
      severity: 'medium',
      type: 'foreshadowing',
      title: '待回收伏笔较多',
      message: `当前还有 ${openForeshadowingCount} 条伏笔未回收，建议安排兑现章节或标记放弃。`,
      actionLabel: '查看伏笔台账',
      targetRoute: `/project/${projectId}/foreshadowing`,
    })
  }

  if (activeConflicts === 0 && totalChapters > 0) {
    risks.push({
      id: 'no-active-conflicts',
      severity: 'high',
      type: 'conflict',
      title: '缺少活跃冲突',
      message: '当前没有活跃冲突，长篇推进可能缺少持续张力。',
      actionLabel: '补充冲突',
      targetRoute: `/project/${projectId}/conflicts`,
    })
  }

  const lowQuality = qualityTrend.find(item => item.score < 60)
  if (lowQuality) {
    risks.push({
      id: `low-quality:${lowQuality.chapter}`,
      severity: 'medium',
      type: 'quality',
      title: `第 ${lowQuality.chapter} 章质量评分偏低`,
      message: `该章节质量评分为 ${lowQuality.score}，建议复查节奏、冲突和人物动机。`,
      actionLabel: '打开质量评估',
      targetRoute: `/project/${projectId}/quality`,
    })
  }

  const largeDeviation = sceneWordCountDeviation.find(item => Math.abs(item.deviation) > item.target * 0.3)
  if (largeDeviation) {
    risks.push({
      id: `scene-word-deviation:${largeDeviation.sceneId}`,
      severity: 'low',
      type: 'scene',
      title: '场景字数偏离目标',
      message: `${largeDeviation.title || `场景 ${largeDeviation.sceneNumber}`} 实际 ${largeDeviation.actual} 字，目标 ${largeDeviation.target} 字。`,
      actionLabel: '调整场景正文',
      targetRoute: `/project/${projectId}/write`,
    })
  }

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
    chaptersWithoutScenes,
    scenesWithoutContent,
    scenesWithoutPurpose,
    scenesWithoutConflict,
    sceneWordCountDeviation,
    sceneStatusDistribution,
    risks,
  }
}
