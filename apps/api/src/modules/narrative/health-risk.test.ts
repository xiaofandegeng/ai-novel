import { describe, expect, it } from 'vitest'
import {
  computeCharacterOOC,
  computeConflictStagnation,
  computeForeshadowingRisk,
  computePacingRisk,
  computeStyleDrift,
  computeTensionRisk,
  computeThemeDrift,
} from './health-metrics.service'

describe('health risk rules', () => {
  const projectId = 'project-1'

  it('flags overdue open foreshadowing and ignores future or closed items', () => {
    const risks = computeForeshadowingRisk(projectId, [
      { title: '旧钥匙', status: 'open', expectedPayoffChapterId: 'chapter-2' },
      { title: '密信', status: 'paid_off', expectedPayoffChapterId: 'chapter-2' },
      { title: '陌生人', status: 'open', expectedPayoffChapterId: 'chapter-8' },
    ], 5, [
      { id: 'chapter-2', chapterNumber: 2 },
      { id: 'chapter-8', chapterNumber: 8 },
    ])

    expect(risks).toHaveLength(1)
    expect(risks[0]).toMatchObject({ id: 'foreshadowing-amnesia', severity: 'high' })
    expect(risks[0].evidence).toEqual(['伏笔: 旧钥匙'])
  })

  it('requires three consecutive low-conflict chapters before reporting stagnation', () => {
    expect(computeConflictStagnation(projectId, [{ chapter: 1, avgIntensity: 2 }, { chapter: 2, avgIntensity: 3 }])).toEqual([])
    expect(computeConflictStagnation(projectId, [
      { chapter: 1, avgIntensity: 8 },
      { chapter: 2, avgIntensity: 3 },
      { chapter: 3, avgIntensity: 2 },
      { chapter: 4, avgIntensity: 3 },
    ])).toMatchObject([{ id: 'narrative-stagnation', severity: 'medium' }])
  })

  it('finds character and theme consistency warnings from quality reports', () => {
    expect(computeCharacterOOC(projectId, [
      { chapterId: 'chapter-3', issues: '主角行为 OOC，动机缺失' },
    ], [{ id: 'chapter-3', chapterNumber: 3 }])).toMatchObject([{
      id: 'character-ooc',
      evidence: [expect.stringContaining('章节 3')],
    }])

    expect(computeThemeDrift(projectId, [{ suggestions: '下一章存在主线偏离风险' }])).toMatchObject([{
      id: 'theme-drift',
      severity: 'high',
    }])
  })

  it('reports low rhythm and scene length deviations independently', () => {
    const risks = computePacingRisk(projectId, [{ rhythmScore: 42 }], [{
      sceneId: 'scene-1',
      sceneNumber: 1,
      title: '追逐',
      actual: 500,
      target: 1200,
      deviation: -700,
    }])

    expect(risks.map(risk => risk.id)).toEqual(['low-rhythm-score', 'scene-word-count-deviation'])
    expect(risks[0].severity).toBe('high')
  })

  it('uses only the latest three chapters for tension and style drift', () => {
    expect(computeTensionRisk(projectId, [
      { chapter: 1, tension: 90 },
      { chapter: 2, tension: 30 },
      { chapter: 3, tension: 20 },
      { chapter: 4, tension: 25 },
    ])).toMatchObject([{ id: 'low-recent-tension', severity: 'high' }])

    expect(computeStyleDrift(projectId, [
      { sentenceLengthAvg: 10 },
      { sentenceLengthAvg: 28 },
      { sentenceLengthAvg: 30 },
      { sentenceLengthAvg: 32 },
    ])).toMatchObject([{ id: 'style-drift-sentence' }])
  })

  it('does not report risks for healthy samples', () => {
    expect(computeThemeDrift(projectId, [{ issues: '结构清晰' }])).toEqual([])
    expect(computeTensionRisk(projectId, [{ chapter: 1, tension: 80 }, { chapter: 2, tension: 70 }])).toEqual([])
    expect(computeStyleDrift(projectId, [{ sentenceLengthAvg: 10 }, { sentenceLengthAvg: 11 }])).toEqual([])
  })
})
