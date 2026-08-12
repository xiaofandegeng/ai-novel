import type { AutonomousStrategy, WritingJob, WritingJobStep, WritingJobStepType } from '@ai-novel/shared'
import { describe, expect, it } from 'vitest'
import { decideNextAction } from './auto-decision.service'

const job: WritingJob = {
  id: 'job-1',
  projectId: 'project-1',
  currentChapterId: 'chapter-1',
  sceneId: null,
  mode: 'outline_then_draft',
  status: 'running',
  autoStopReason: null,
  autoApprovedSteps: 0,
  targetWords: 3000,
  lastError: null,
  autonomousRunId: 'run-1',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
}

function step(stepType: WritingJobStepType, output: unknown, status: WritingJobStep['status'] = 'completed'): WritingJobStep {
  return {
    id: `step-${stepType}`,
    jobId: job.id,
    stepType,
    status,
    autoDecision: null,
    autoDecisionReason: null,
    input: null,
    output: typeof output === 'string' ? output : JSON.stringify(output),
    error: status === 'failed' ? 'provider unavailable' : null,
    changeSetId: null,
    startedAt: null,
    finishedAt: null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

async function decide(runStrategy: AutonomousStrategy, currentStep: WritingJobStep) {
  return decideNextAction({
    projectId: job.projectId,
    job,
    step: currentStep,
    previousOutputs: new Map(),
    runStrategy,
  })
}

describe('automatic risk decisions', () => {
  it('stops every strategy when a step fails', async () => {
    for (const strategy of ['safe', 'balanced', 'fast'] as const) {
      await expect(decide(strategy, step('generate_draft', null, 'failed'))).resolves.toMatchObject({
        action: 'stop_run',
        riskLevel: 'critical',
      })
    }
  })

  it('isolates high-risk output in safe and fast modes but repairs it in balanced mode', async () => {
    const blocked = step('validate_plan', { status: 'blocked', issues: ['主线冲突'] })

    await expect(decide('safe', blocked)).resolves.toMatchObject({ action: 'isolate', riskLevel: 'high' })
    await expect(decide('balanced', blocked)).resolves.toMatchObject({ action: 'repair', riskLevel: 'high' })
    await expect(decide('fast', blocked)).resolves.toMatchObject({ action: 'isolate', riskLevel: 'high' })
  })

  it('does not enter an infinite repair loop when auto repair fails', async () => {
    await expect(decide('balanced', step('auto_repair', { success: false }))).resolves.toMatchObject({
      action: 'isolate',
      riskLevel: 'high',
    })
  })

  it('continues regular and malformed-output steps with a low-risk fallback', async () => {
    await expect(decide('safe', step('generate_plan', null))).resolves.toMatchObject({ action: 'continue', riskLevel: 'low' })
    await expect(decide('safe', step('evaluate_change_set', 'not-json'))).resolves.toMatchObject({ action: 'continue', riskLevel: 'none' })
  })
})
