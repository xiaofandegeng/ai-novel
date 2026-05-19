import type { HealthMetrics, HealthRisk } from '@ai-novel/shared'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  chapterChangeSets,
  chapterElements,
  chapterMemories,
  chapterPostprocessSuggestions,
  chapters,
  chapterScenes,
  chapterStyleFingerprints,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  knowledgeSources,
  novelProjects,
  qualityReports,
  storyFactTriples,
} from '../db/schema'

export interface ProjectHealthMetrics extends HealthMetrics {}

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
      if (match)
        intensity = Math.min(10, Math.max(1, Number.parseInt(match[1])))
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
    if (existing)
      existing.count++
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

  // 2. 伏笔遗忘风险
  risks.push(...computeForeshadowingRisk(projectId, allForeshadowing, completedChapters, allChapters))

  // 3. 人物 OOC 风险
  risks.push(...computeCharacterOOC(projectId, reports, allChapters))

  // 4. 叙事停滞风险
  risks.push(...computeConflictStagnation(projectId, conflictIntensityTrend))

  // 5. 风格漂移风险
  const fingerprints = await db.select().from(chapterStyleFingerprints).where(and(eq(chapterStyleFingerprints.projectId, projectId), eq(chapterStyleFingerprints.scope, 'chapter'))).orderBy(asc(chapterStyleFingerprints.createdAt))
  const orderedFingerprints = [...fingerprints].sort((a, b) => {
    const chapterA = chapterNumMap.get(a.chapterId) || 0
    const chapterB = chapterNumMap.get(b.chapterId) || 0
    if (chapterA !== chapterB)
      return chapterA - chapterB
    return a.createdAt.localeCompare(b.createdAt)
  })
  const tensionTrend = orderedFingerprints
    .map((fingerprint) => {
      const chapterNumber = chapterNumMap.get(fingerprint.chapterId) || 0
      const tension = Math.min(100, Math.round(
        ((fingerprint.conflictDensity || 0) * 0.5)
        + ((fingerprint.hookDensity || 0) * 0.3)
        + ((fingerprint.emotionDensity || 0) * 0.2),
      ))
      return { chapter: chapterNumber, tension }
    })
    .filter(item => item.chapter > 0)
    .sort((a, b) => a.chapter - b.chapter)
  risks.push(...computeStyleDrift(projectId, orderedFingerprints))
  risks.push(...computeTensionRisk(projectId, tensionTrend))

  // 6. 知识库完整性
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

  // 7. 结构化候选待处理
  const pendingSuggestions = await db.select().from(chapterPostprocessSuggestions).where(and(
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  ))
  if (pendingSuggestions.length > 0) {
    risks.push({
      id: 'pending-postprocess-suggestions',
      severity: pendingSuggestions.length > 10 ? 'high' : 'medium',
      type: 'structure',
      title: '结构化更新待处理',
      message: `有 ${pendingSuggestions.length} 条 AI 抽取结果尚未确认，角色、关系、伏笔、事实图谱可能没有同步到上下文。`,
      actionLabel: '去确认建议',
      targetRoute: `/project/${projectId}/suggestions`,
      suggestions: ['优先处理事实、人物关系和伏笔类建议', '忽略无效建议，避免处理队列堆积'],
    })
  }

  // 8. 人物关系断裂
  const allCharacters = await db.select().from(characters).where(eq(characters.projectId, projectId))
  const allRelationships = await db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
  const connectedCharacterIds = new Set<string>()
  for (const relationship of allRelationships) {
    connectedCharacterIds.add(relationship.characterAId)
    connectedCharacterIds.add(relationship.characterBId)
  }
  const isolatedCharacters = allCharacters.filter(c =>
    c.role !== 'extra'
    && !connectedCharacterIds.has(c.id)
    && allCharacters.length > 1,
  )
  if (isolatedCharacters.length > 0) {
    risks.push({
      id: 'isolated-characters',
      severity: 'medium',
      type: 'consistency',
      title: '人物关系网断裂',
      message: `${isolatedCharacters.length} 个非路人角色尚未接入人物关系网，后续 AI 写作可能遗漏其剧情功能。`,
      actionLabel: '补全关系',
      targetRoute: `/project/${projectId}/relationships`,
      evidence: isolatedCharacters.slice(0, 5).map(c => c.name),
      suggestions: ['在角色页保存角色资料以自动生成关系候选', '在人物关系页运行关系推导并确认建议'],
    })
  }

  // 9. 主题偏离风险
  risks.push(...computeThemeDrift(projectId, reports))

  // 10. 节奏风险
  risks.push(...computePacingRisk(projectId, reports, sceneWordCountDeviation))

  // 11. 章节变更集风险
  const allChangeSets = await db.select().from(chapterChangeSets).where(eq(chapterChangeSets.projectId, projectId))
  const pendingChangeSets = allChangeSets.filter(cs => cs.status === 'drafted' || cs.status === 'reviewing')
  const failedChangeSets = allChangeSets.filter(cs => cs.status === 'apply_failed' || cs.status === 'blocked')

  if (pendingChangeSets.length > 0) {
    risks.push({
      id: 'pending-change-sets',
      severity: pendingChangeSets.length > 3 ? 'high' : 'medium',
      type: 'structure',
      title: '待审查变更集',
      message: `有 ${pendingChangeSets.length} 个章节变更集正在等待您的审查和应用。`,
      actionLabel: '查看变更集',
      targetRoute: `/project/${projectId}/writing`,
    })
  }

  if (failedChangeSets.length > 0) {
    risks.push({
      id: 'failed-change-sets',
      severity: 'high',
      type: 'consistency',
      title: '变更集应用失败',
      message: `有 ${failedChangeSets.length} 个变更集在应用时遇到错误或被系统阻断。`,
      actionLabel: '处理异常',
      targetRoute: `/project/${projectId}/writing`,
    })
  }

  const recentChangeSets = [...allChangeSets]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map(cs => ({
      id: cs.id,
      riskLevel: cs.riskLevel,
      chapterNumber: allChapters.find(c => c.id === cs.chapterId)?.chapterNumber || 0,
    }))

  return {
    totalChapters,
    completedChapters,
    totalWords,
    averageChapterWords,
    activeConflicts,
    conflictIntensityAvg,
    conflictIntensityTrend,
    tensionTrend,
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
    radarMetrics: {
      theme: 100 - (risks.filter(r => r.type === 'theme').length * 20),
      character: 100 - (risks.filter(r => r.type === 'consistency').length * 15),
      foreshadowing: 100 - (risks.filter(r => r.type === 'foreshadowing').length * 10),
      conflict: 100 - (risks.filter(r => r.type === 'conflict').length * 15),
      pacing: 100 - (risks.filter(r => r.type === 'pacing').length * 20),
      style: 100 - (risks.filter(r => r.type === 'style').length * 15),
    },
    changeSetMetrics: {
      recentRiskTrend: recentChangeSets,
      pendingCount: pendingChangeSets.length,
      failedCount: failedChangeSets.length,
    },
  }
}

// Advanced Risk Computation Functions

export function computeForeshadowingRisk(
  projectId: string,
  allForeshadowing: any[],
  completedChapters: number,
  allChapters: any[],
): HealthRisk[] {
  const risks: HealthRisk[] = []
  const forgottenForeshadowing = allForeshadowing.filter(f =>
    f.status === 'open'
    && f.expectedPayoffChapterId
    && (allChapters.find(c => c.id === f.expectedPayoffChapterId)?.chapterNumber || 0) < (completedChapters + 1),
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
      suggestions: ['建议在下一章安排回收情节', '如该线索已失效，请标记为“弃用”'],
    })
  }
  return risks
}

export function computeConflictStagnation(
  projectId: string,
  conflictIntensityTrend: { chapter: number, avgIntensity: number }[],
): HealthRisk[] {
  const risks: HealthRisk[] = []
  const recentTrend = conflictIntensityTrend.slice(-3)
  if (recentTrend.length >= 3 && recentTrend.every(t => t.avgIntensity <= 3)) {
    risks.push({
      id: 'narrative-stagnation',
      severity: 'medium',
      type: 'conflict',
      title: '叙事张力停滞',
      message: '连续 3 个章节的冲突强度偏低，主线情节可能陷入沉闷。',
      actionLabel: '加强冲突',
      targetRoute: `/project/${projectId}/conflicts`,
      suggestions: ['增加反派阻碍', '引入突发意外事件', '提升角色情感压力'],
    })
  }
  return risks
}

export function computeCharacterOOC(
  projectId: string,
  reports: any[],
  allChapters: any[],
): HealthRisk[] {
  const risks: HealthRisk[] = []
  const oocReports = reports.filter(r => r.issues?.toLowerCase().includes('ooc') || r.issues?.includes('性格不符'))
  if (oocReports.length > 0) {
    risks.push({
      id: 'character-ooc',
      severity: 'high',
      type: 'consistency',
      title: '人物一致性异常 (OOC)',
      message: '质量评估中多次提到角色行为与设定不符。',
      actionLabel: '查看质量报告',
      targetRoute: `/project/${projectId}/quality`,
      evidence: oocReports.slice(0, 3).map(r => `章节 ${allChapters.find(c => c.id === r.chapterId)?.chapterNumber}: ${r.issues?.substring(0, 50)}...`),
      suggestions: ['重新查阅人物设定集', '在下一章通过内心独白修正动机'],
    })
  }
  return risks
}

export function computeThemeDrift(
  projectId: string,
  reports: any[],
): HealthRisk[] {
  const risks: HealthRisk[] = []
  const themeReports = reports.filter((r) => {
    const issues = `${r.issues || ''} ${r.suggestions || ''}`.toLowerCase()
    return issues.includes('偏题')
      || issues.includes('主题偏离')
      || issues.includes('主线偏离')
      || issues.includes('theme drift')
  })

  if (themeReports.length > 0) {
    risks.push({
      id: 'theme-drift',
      severity: 'high',
      type: 'theme',
      title: '主题或主线可能偏离',
      message: '质量评估中出现主题偏离、主线偏离或偏题提示。',
      actionLabel: '查看质量评估',
      targetRoute: `/project/${projectId}/quality`,
      suggestions: ['回到故事设定集检查主题与核心矛盾', '下一章生成前先补充章节目标和关键事件'],
    })
  }

  return risks
}

export function computePacingRisk(
  projectId: string,
  reports: any[],
  sceneWordCountDeviation: Array<{ sceneId: string, sceneNumber: number, title: string | null, actual: number, target: number, deviation: number }>,
): HealthRisk[] {
  const risks: HealthRisk[] = []
  const weakRhythmReports = reports.filter(r => typeof r.rhythmScore === 'number' && r.rhythmScore > 0 && r.rhythmScore < 60)
  if (weakRhythmReports.length > 0) {
    risks.push({
      id: 'low-rhythm-score',
      severity: weakRhythmReports.some(r => r.rhythmScore < 45) ? 'high' : 'medium',
      type: 'pacing',
      title: '章节节奏评分偏低',
      message: `有 ${weakRhythmReports.length} 份质量报告提示节奏不足，可能存在拖沓、跳跃或高潮间隔过长。`,
      actionLabel: '查看质量评估',
      targetRoute: `/project/${projectId}/quality`,
      suggestions: ['优先检查低分章节的场景目标与转折点', '用场景拆分确认每一场都有冲突、变化和出口钩子'],
    })
  }

  const severeDeviations = sceneWordCountDeviation.filter((scene) => {
    if (!scene.target)
      return false
    return Math.abs(scene.deviation) / scene.target >= 0.5
  })
  if (severeDeviations.length > 0) {
    risks.push({
      id: 'scene-word-count-deviation',
      severity: severeDeviations.length > 5 ? 'high' : 'medium',
      type: 'pacing',
      title: '场景篇幅偏离目标',
      message: `${severeDeviations.length} 个场景实际篇幅与目标相差超过 50%，可能影响阅读节奏。`,
      actionLabel: '调整场景',
      targetRoute: `/project/${projectId}/outline`,
      evidence: severeDeviations.slice(0, 5).map(s => `场景 ${s.sceneNumber}${s.title ? `《${s.title}》` : ''}: ${s.actual}/${s.target} 字`),
      suggestions: ['过长场景拆成行动、反应和转折三段', '过短场景补足目标、阻碍、选择和后果'],
    })
  }

  return risks
}

export function computeTensionRisk(
  projectId: string,
  tensionTrend: Array<{ chapter: number, tension: number }>,
): HealthRisk[] {
  const risks: HealthRisk[] = []
  if (tensionTrend.length < 3)
    return risks

  const recent = tensionTrend.slice(-3)
  const recentAvg = recent.reduce((sum, item) => sum + item.tension, 0) / recent.length
  const allLow = recent.every(item => item.tension < 35)
  if (recentAvg < 40 || allLow) {
    risks.push({
      id: 'low-recent-tension',
      severity: allLow ? 'high' : 'medium',
      type: 'pacing',
      title: '近期章节张力不足',
      message: '最近三章的冲突、钩子和情绪密度偏低，长篇阅读推进感可能下降。',
      actionLabel: '调整大纲节拍',
      targetRoute: `/project/${projectId}/outline`,
      evidence: recent.map(item => `第 ${item.chapter} 章张力 ${item.tension}/100`),
      suggestions: ['给下一章补一个明确阻碍或反转', '检查场景节拍是否连续过渡，避免多场低冲突铺垫连在一起'],
    })
  }

  return risks
}

export function computeStyleDrift(
  projectId: string,
  fingerprints: any[],
): HealthRisk[] {
  const risks: HealthRisk[] = []
  if (fingerprints.length < 3)
    return risks

  const recent = fingerprints.slice(-3)
  const avgSentenceLen = recent.reduce((sum, f) => sum + (f.sentenceLengthAvg || 0), 0) / 3
  const first = fingerprints[0]

  if (first.sentenceLengthAvg && Math.abs(avgSentenceLen - first.sentenceLengthAvg) > 15) {
    risks.push({
      id: 'style-drift-sentence',
      severity: 'medium',
      type: 'style',
      title: '文风显著漂移',
      message: '近期章节的平均句长与开篇风格差异较大，可能影响阅读连贯性。',
      actionLabel: '查看文风分析',
      targetRoute: `/project/${projectId}/quality`,
      suggestions: ['查阅写作人格设定', '使用“文风对齐”功能校准'],
    })
  }
  return risks
}
