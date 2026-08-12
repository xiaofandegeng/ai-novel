import type { ConsistencyGuardReport } from '@ai-novel/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attemptAutoRepair, attemptAutoRepairPlan } from './auto-repair.service'

const aiMocks = vi.hoisted(() => ({ callAIJSON: vi.fn() }))

vi.mock('../ai/ai.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../ai/ai.service')>()
  return { ...original, callAIJSON: aiMocks.callAIJSON }
})

function report(status: 'pass' | 'warning' | 'blocked'): ConsistencyGuardReport {
  const dimension = { status: 'pass' as const, score: 100, reason: '一致' }
  return {
    overallStatus: status,
    score: status === 'pass' ? 100 : 60,
    themeAlignment: status === 'pass'
      ? dimension
      : { status, score: 60, reason: '主题发生偏移', details: { expected: '信任' } } as ConsistencyGuardReport['themeAlignment'],
    plotContinuity: dimension,
    characterConsistency: dimension,
    worldRuleConsistency: dimension,
    foreshadowingConsistency: dimension,
    styleConsistency: dimension,
    risks: [],
    suggestedFixes: [],
  }
}

describe('automatic repair', () => {
  beforeEach(() => {
    aiMocks.callAIJSON.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it('does not modify blocked or already-clean drafts', async () => {
    await expect(attemptAutoRepair({
      projectId: 'project-1',
      chapterId: 'chapter-1',
      draftContent: '原正文',
      consistencyReport: report('blocked'),
      strategy: 'safe',
    })).resolves.toEqual({
      repaired: false,
      draftContent: '原正文',
      repairReport: 'Cannot auto-repair blocked issues',
    })

    await expect(attemptAutoRepair({
      projectId: 'project-1',
      chapterId: 'chapter-1',
      draftContent: '原正文',
      consistencyReport: report('pass'),
      strategy: 'balanced',
    })).resolves.toEqual({ repaired: true, draftContent: '原正文', repairReport: 'No issues to repair' })
    expect(aiMocks.callAIJSON).not.toHaveBeenCalled()
  })

  it('repairs warning drafts with scoped AI metadata and preserves the original on failure', async () => {
    aiMocks.callAIJSON.mockResolvedValueOnce({ repairedDraft: '修复后的正文' })
    const repaired = await attemptAutoRepair({
      projectId: 'project-1',
      chapterId: 'chapter-1',
      draftContent: '原正文',
      consistencyReport: report('warning'),
      strategy: 'balanced',
    })
    expect(repaired).toMatchObject({ repaired: true, draftContent: '修复后的正文' })
    expect(aiMocks.callAIJSON).toHaveBeenCalledWith(
      [expect.objectContaining({ content: expect.stringContaining('主题发生偏移') })],
      expect.objectContaining({ metadata: { projectId: 'project-1', taskType: 'auto_repair' } }),
    )

    aiMocks.callAIJSON.mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(attemptAutoRepair({
      projectId: 'project-1',
      chapterId: 'chapter-1',
      draftContent: '必须保留的原正文',
      consistencyReport: report('warning'),
      strategy: 'fast',
    })).resolves.toMatchObject({
      repaired: false,
      draftContent: '必须保留的原正文',
      repairReport: 'Auto-repair AI call failed: provider unavailable',
    })
  })

  it('handles blocked, clean, repaired, and malformed chapter plans', async () => {
    const blocked = { status: 'blocked' as const, issues: [], suggestions: '' }
    await expect(attemptAutoRepairPlan({ projectId: 'project-1', planContent: '{}', validateReport: blocked }))
      .resolves
      .toMatchObject({ repaired: false })

    const clean = { status: 'pass' as const, issues: [], suggestions: '' }
    await expect(attemptAutoRepairPlan({ projectId: 'project-1', planContent: '{}', validateReport: clean }))
      .resolves
      .toEqual({ repaired: true, planContent: '{}', repairReport: 'No issues to repair' })

    const warning = {
      status: 'warning' as const,
      issues: [{ type: 'plot_gap', severity: 'warning' as const, description: '缺少因果衔接' }],
      suggestions: '增加触发事件',
    }
    aiMocks.callAIJSON.mockResolvedValueOnce({ title: '雾港来信', outline: '修复后的计划' })
    const repaired = await attemptAutoRepairPlan({
      projectId: 'project-1',
      planContent: JSON.stringify({ title: '旧标题', outline: '旧计划' }),
      validateReport: warning,
    })
    expect(repaired).toMatchObject({ repaired: true })
    expect(JSON.parse(repaired.planContent)).toEqual({ title: '雾港来信', outline: '修复后的计划' })
    expect(aiMocks.callAIJSON).toHaveBeenLastCalledWith(
      [expect.objectContaining({ content: expect.stringContaining('增加触发事件') })],
      expect.objectContaining({ metadata: { projectId: 'project-1', taskType: 'auto_repair_plan' } }),
    )

    await expect(attemptAutoRepairPlan({
      projectId: 'project-1',
      planContent: '{bad-json',
      validateReport: warning,
    })).resolves.toMatchObject({ repaired: false, planContent: '{bad-json' })
  })
})
