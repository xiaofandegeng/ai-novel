import { beforeEach, describe, expect, it, vi } from 'vitest'

import { advanceAutonomousWritingRun } from './autonomous-writing.process-manager'

const processMocks = vi.hoisted(() => ({
  rows: [] as unknown[][],
  changeAutonomousRun: vi.fn(),
  changeAutonomousRunJob: vi.fn(),
  startJob: vi.fn(),
}))

vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => query(processMocks.rows.shift() ?? []),
      }),
    }),
  },
}))

vi.mock('./autonomous-writing.service', () => ({
  changeAutonomousRun: processMocks.changeAutonomousRun,
  changeAutonomousRunJob: processMocks.changeAutonomousRunJob,
}))

vi.mock('./writing-job.service', () => ({
  startJob: processMocks.startJob,
}))

describe('autonomous writing process manager', () => {
  beforeEach(() => {
    processMocks.rows = []
    processMocks.changeAutonomousRun.mockReset().mockResolvedValue(undefined)
    processMocks.changeAutonomousRunJob.mockReset().mockResolvedValue(undefined)
    processMocks.startJob.mockReset().mockResolvedValue(undefined)
  })

  it.each([
    [[], 'missing Run'],
    [[{ id: 'run-1', projectId: 'other-project', status: 'running' }], 'foreign Run'],
    [[{ id: 'run-1', projectId: 'project-1', status: 'paused' }], 'paused Run'],
  ])('does nothing for a %s', async (runRows) => {
    processMocks.rows = [runRows as unknown[]]
    await advanceAutonomousWritingRun('project-1', 'run-1')
    expect(processMocks.changeAutonomousRun).not.toHaveBeenCalled()
    expect(processMocks.startJob).not.toHaveBeenCalled()
  })

  it('starts the first pending RunJob through aggregate commands and the WritingJob outbox path', async () => {
    processMocks.rows = [
      [{ id: 'run-1', projectId: 'project-1', status: 'running' }],
      [{ id: 'run-job-1', chapterId: 'chapter-1', writingJobId: 'job-1', status: 'pending' }],
    ]

    await advanceAutonomousWritingRun('project-1', 'run-1')

    expect(processMocks.changeAutonomousRunJob).toHaveBeenCalledWith('project-1', 'run-1', 'run-job-1', { status: 'running' })
    expect(processMocks.changeAutonomousRun).toHaveBeenCalledWith('project-1', 'run-1', { currentChapterId: 'chapter-1' })
    expect(processMocks.startJob).toHaveBeenCalledWith('project-1', 'job-1')
  })

  it('resumes the first active RunJob without changing the RunJob projection directly', async () => {
    processMocks.rows = [
      [{ id: 'run-1', projectId: 'project-1', status: 'running' }],
      [],
      [{ id: 'run-job-1', writingJobId: 'job-1', status: 'running' }],
    ]

    await advanceAutonomousWritingRun('project-1', 'run-1')

    expect(processMocks.changeAutonomousRunJob).not.toHaveBeenCalled()
    expect(processMocks.startJob).toHaveBeenCalledWith('project-1', 'job-1')
  })

  it.each([
    [[{ id: 'failed-job' }], 'failed'],
    [[], 'completed'],
  ])('finishes the Run as %s after all work is terminal', async (failedRows, expectedStatus) => {
    processMocks.rows = [
      [{ id: 'run-1', projectId: 'project-1', status: 'running' }],
      [],
      [],
      failedRows,
    ]

    await advanceAutonomousWritingRun('project-1', 'run-1')

    expect(processMocks.changeAutonomousRun).toHaveBeenCalledWith('project-1', 'run-1', {
      status: expectedStatus,
      finishedAt: expect.any(String),
    })
    expect(processMocks.startJob).not.toHaveBeenCalled()
  })
})

function query(rows: unknown[]) {
  const promise = Promise.resolve(rows)
  return {
    orderBy: () => ({ limit: () => promise }),
    limit: () => promise,
    then: promise.then.bind(promise),
  }
}
