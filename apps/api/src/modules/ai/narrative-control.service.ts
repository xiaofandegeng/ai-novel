import type { GlobalNarrativeControl } from '@ai-novel/shared'
import { and, desc, eq, not, or } from 'drizzle-orm'
import { db } from '../../db'
import {
  chapterMemories,
  chapters,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  novelProjects,
  projectHealthReports,
  storyBibles,
} from '../../db/schema'

function compactLines(values: Array<string | null | undefined>, limit: number) {
  const lines = values
    .map(v => v?.trim())
    .filter((v): v is string => Boolean(v))

  return Array.from(new Set(lines)).slice(0, limit)
}

export async function buildGlobalNarrativeControl(
  projectId: string,
  currentChapterId?: string,
): Promise<GlobalNarrativeControl> {
  const [[project], [bible], characterRows, relationshipRows, conflictRows, foreshadowingRows, recentMemoryRows, healthRows] = await Promise.all([
    db.select().from(novelProjects).where(eq(novelProjects.id, projectId)).limit(1),
    db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId)).limit(1),
    db.select().from(characters).where(eq(characters.projectId, projectId)).orderBy(desc(characters.updatedAt)).limit(12),
    db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId)).orderBy(desc(characterRelationships.updatedAt)).limit(16),
    db.select().from(conflicts).where(and(
      eq(conflicts.projectId, projectId),
      not(eq(conflicts.status, 'resolved')),
      not(eq(conflicts.status, 'abandoned')),
    )).orderBy(desc(conflicts.intensity), desc(conflicts.updatedAt)).limit(10),
    db.select().from(foreshadowingItems).where(and(
      eq(foreshadowingItems.projectId, projectId),
      or(eq(foreshadowingItems.status, 'open'), eq(foreshadowingItems.status, 'progressing')),
    )).orderBy(desc(foreshadowingItems.updatedAt)).limit(12),
    db.select().from(chapterMemories).where(eq(chapterMemories.projectId, projectId)).orderBy(desc(chapterMemories.updatedAt)).limit(5),
    db.select().from(projectHealthReports).where(eq(projectHealthReports.projectId, projectId)).orderBy(desc(projectHealthReports.generatedAt)).limit(8),
  ])

  let nextChapterGoal: string | undefined
  let nextChapterEvents: string | undefined
  if (currentChapterId) {
    const [currentChapter] = await db.select().from(chapters).where(and(
      eq(chapters.id, currentChapterId),
      eq(chapters.projectId, projectId),
    )).limit(1)

    if (currentChapter) {
      const [nextChapter] = await db.select().from(chapters).where(and(
        eq(chapters.projectId, projectId),
        eq(chapters.chapterNumber, currentChapter.chapterNumber + 1),
      )).limit(1)
      nextChapterGoal = nextChapter?.goals || undefined
      nextChapterEvents = nextChapter?.events || nextChapter?.outline || undefined
    }
  }

  const characterNameMap = new Map(characterRows.map(c => [c.id, c.name]))

  return {
    themeGuardrails: compactLines([
      project?.theme ? `全书主题必须持续围绕：${project.theme}` : undefined,
      project?.genre ? `题材承诺：${project.genre}，不得突然切换题材或叙事类型。` : undefined,
      project?.targetAudience ? `目标读者：${project.targetAudience}` : undefined,
      project?.styleProfile ? `文风基调：${project.styleProfile}` : undefined,
      bible?.theme ? `故事圣经主题：${bible.theme}` : undefined,
      bible?.mainConflict ? `主线冲突：${bible.mainConflict}` : undefined,
      bible?.worldview ? `世界观边界：${bible.worldview}` : undefined,
      bible?.rules ? `硬规则：${bible.rules}` : undefined,
    ], 10),
    plotDirection: compactLines([
      ...recentMemoryRows.map(m => m.themeProgress ? `主题推进：${m.themeProgress}` : undefined),
      ...recentMemoryRows.map(m => m.keyEvents ? `近期关键事件：${m.keyEvents}` : undefined),
      ...recentMemoryRows.map(m => m.conflictProgress ? `近期矛盾推进：${m.conflictProgress}` : undefined),
      nextChapterGoal ? `下一章目标：${nextChapterGoal}` : undefined,
      nextChapterEvents ? `下一章关键事件：${nextChapterEvents}` : undefined,
    ], 12),
    characterGuardrails: compactLines(characterRows.map((c) => {
      const details = [
        c.role ? `身份=${c.role}` : undefined,
        c.goal ? `目标=${c.goal}` : undefined,
        c.fear ? `恐惧=${c.fear}` : undefined,
        c.secret ? `秘密=${c.secret}` : undefined,
        c.weakness ? `弱点=${c.weakness}` : undefined,
        c.personality ? `性格=${c.personality}` : undefined,
        c.arc ? `成长线=${c.arc}` : undefined,
      ].filter(Boolean).join('；')
      return details ? `${c.name}: ${details}` : `${c.name}: 不得做出无铺垫的性格突变。`
    }), 12),
    relationshipGuardrails: compactLines(relationshipRows.map((r) => {
      const a = characterNameMap.get(r.characterAId) || '未知角色'
      const b = characterNameMap.get(r.characterBId) || '未知角色'
      return `${a} ↔ ${b}: ${r.type}，强度 ${r.strength}${r.status ? `，状态 ${r.status}` : ''}${r.description ? `，说明：${r.description}` : ''}`
    }), 16),
    conflictGuardrails: compactLines(conflictRows.map(c =>
      `${c.title}: ${c.type === 'internal' ? '内部矛盾' : '外部矛盾'}，强度 ${c.intensity}，状态 ${c.status}${c.participants ? `，参与者：${c.participants}` : ''}${c.description ? `，说明：${c.description}` : ''}`,
    ), 10),
    foreshadowingGuardrails: compactLines(foreshadowingRows.map(f =>
      `${f.title}: ${f.status}/${f.importance}${f.expectedPayoffChapterId ? '，已有预期回收章节' : '，尚未设定回收点'}${f.description ? `，说明：${f.description}` : ''}`,
    ), 12),
    healthWarnings: compactLines(healthRows
      .filter(r => r.riskLevel !== 'low')
      .map((r) => {
        const metrics = (r.metricsJson || {}) as { description?: string, suggestion?: string }
        return `${r.scope}: ${r.riskLevel} 风险，得分 ${r.score}${metrics.description ? `，${metrics.description}` : ''}${metrics.suggestion ? `，建议：${metrics.suggestion}` : ''}`
      }), 8),
  }
}
