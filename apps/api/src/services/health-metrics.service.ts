import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterElements,
  chapterMemories,
  chapters,
  chapterScenes,
  conflicts,
  foreshadowingItems,
  knowledgeSources,
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
    type: 'scene' | 'foreshadowing' | 'conflict' | 'quality' | 'structure' | 'knowledge' | 'consistency'
    title: string
    message: string
    actionLabel: string
    targetRoute?: string
    evidence?: string[] // 证据来源，如 ["第12章伏笔未回收", "角色'张三'性格偏离"]
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

  // Conflict intensity trend
  const memories = await db.select().from(chapterMemories).where(eq(chapterMemories.projectId, projectId))
  const chapterNumMap = new Map(allChapters.map(c => [c.id, c.chapterNumber]))
  const conflictIntensityTrend = memories
    .filter(m => m.conflictProgress)
    .map((m) => {
      let intensity = 5
      const match = m.conflictProgress?.match(/(\d+)/)
      if (match) intensity = Math.min(10, Math.max(1, Number.parseInt(match[1])))
      return { chapter: chapterNumMap.get(m.chapterId) || 0, avgIntensity: intensity }
    })
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
    if (existing) existing.count++
    else freqMap.set(key, { name: el.elementName, type: el.elementType, count: 1 })
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
  const scenesByChapter = new Map<string, typeof allScenes>()
  for (const s of allScenes) {
    const list = scenesByChapter.get(s.chapterId) || []
    list.push(s)
    scenesByChapter.set(s.chapterId, list)
  }
  const chaptersWithoutScenes = allChapters
    .filter(c => !scenesByChapter.has(c.id))
    .map(c => ({ chapterId: c.id, chapterNumber: c.chapterNumber, title: c.title }))

  const scenesWithoutContent = allScenes.filter(s => !s.content).length
  const scenesWithoutPurpose = allScenes.filter(s => !s.purpose).length
  const scenesWithoutConflict = allScenes.filter(s => !s.conflict).length
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

  const sceneStatusDistribution: Record<string, number> = {}
  for (const s of allScenes) {
    sceneStatusDistribution[s.status] = (sceneStatusDistribution[s.status] || 0) + 1
  }

  const risks: ProjectHealthMetrics['risks'] = []

  // 1. 场景规划风险
  for (const chapter of chaptersWithoutScenes.slice(0, 3)) {
    risks.push({
      id: `chapter-without-scenes:${chapter.chapterId}`,
      severity: 'medium',
      type: 'scene',
      title: `第 ${chapter.chapterNumber} 章缺少场景规划`,
      message: `《${chapter.title}》尚未拆分场景，建议先完成场景大纲。`,
      actionLabel: '去规划场景',
      targetRoute: `/project/${projectId}/outline?chapter=${chapter.chapterId}`,
    })
  }

  // 2. 伏笔遗忘风险 (Foreshadowing Amnesia)
  const forgottenForeshadowing = allForeshadowing.filter(f => 
    f.status === 'open' && 
    f.expectedPayoffChapterId && 
    (allChapters.find(c => c.id === f.expectedPayoffChapterId)?.chapterNumber || 0) < (completedChapters + 1)
  )
  if (forgottenForeshadowing.length > 0) {
    risks.push({
      id: 'foreshadowing-amnesia',
      severity: 'high',
      type: 'foreshadowing',
      title: '伏笔可能被遗忘',
      message: `有 ${forgottenForeshadowing.length} 个伏笔已过预定回收章节但仍未闭环。`,
      actionLabel: '检查伏笔',
      targetRoute: `/project/${projectId}/foreshadowing`,
      evidence: forgottenForeshadowing.map(f => `伏笔: ${f.title}`),
    })
  }

  // 3. 人物 OOC 风险 (Character Inconsistency)
  const oocReports = reports.filter(r => r.issues?.toLowerCase().includes('ooc') || r.issues?.includes('性格不符'))
  if (oocReports.length > 0) {
    risks.push({
      id: 'character-ooc',
      severity: 'high',
      type: 'consistency',
      title: '人物一致性异常',
      message: '质量评估中多次提到角色行为与设定不符。',
      actionLabel: '查看质量报告',
      targetRoute: `/project/${projectId}/quality`,
      evidence: oocReports.slice(0, 3).map(r => `章节 ${allChapters.find(c => c.id === r.chapterId)?.chapterNumber}: ${r.issues?.substring(0, 50)}...`),
    })
  }

  // 4. 叙事停滞风险 (Narrative Stagnation)
  const recentTrend = conflictIntensityTrend.slice(-3)
  if (recentTrend.length >= 3 && recentTrend.every(t => t.avgIntensity <= 3)) {
    risks.push({
      id: 'narrative-stagnation',
      severity: 'medium',
      type: 'conflict',
      title: '叙事张力不足',
      message: '连续 3 个章节的冲突强度偏低，长篇推进可能面临瓶颈。',
      actionLabel: '加强冲突',
      targetRoute: `/project/${projectId}/conflicts`,
    })
  }

  // 5. 知识库完整性 (Knowledge Integrity)
  const pendingSources = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.projectId, projectId), eq(knowledgeSources.status, 'pending')))
  if (pendingSources.length > 0) {
    risks.push({
      id: 'knowledge-pending',
      severity: 'low',
      type: 'knowledge',
      title: '知识库待处理',
      message: `有 ${pendingSources.length} 个知识源尚未完成 AI 分析和向量化。`,
      actionLabel: '同步知识库',
      targetRoute: `/project/${projectId}/knowledge`,
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
