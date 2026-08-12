import type { AutomationCockpitPayload } from '@ai-novel/shared'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { useAutomationCockpitStore } from '../stores/automation-cockpit.store'
import { useAutomationCockpit } from './useAutomationCockpit'
import { useCockpitPolling } from './useCockpitPolling'

const payload: AutomationCockpitPayload = {
  project: { id: 'project-1', title: '雾港', currentWordCount: 0 },
  run: {
    id: 'run-1',
    status: 'running',
    strategy: 'balanced',
    targetChapterCount: 2,
    completedChapterCount: 0,
  },
  chapters: [],
  characters: [],
  relationships: [],
  conflicts: [],
  foreshadowing: [],
  plotDirection: {},
  health: { overallScore: 100, riskCount: 0 },
  events: [],
  exceptions: [],
}

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ success: true, data })))
}

describe('automation cockpit composables', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('creates, starts, and refreshes an autonomous run in order', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ ...payload.run, id: 'run-new' }))
      .mockImplementationOnce(() => response(undefined))
      .mockImplementationOnce(() => response(payload))
    vi.stubGlobal('fetch', fetchMock)
    const cockpit = useAutomationCockpit('project-1')

    await cockpit.startRun({ strategy: 'balanced', scopeType: 'continue_incomplete', targetWordsPerChapter: 3000 })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/projects/project-1/autonomous-runs',
      '/api/projects/project-1/autonomous-runs/run-new/start',
      '/api/projects/project-1/cockpit',
    ])
    expect(cockpit.run.value?.id).toBe('run-1')
  })

  it('starts an existing idle run instead of creating a conflicting second run', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response(undefined))
      .mockImplementationOnce(() => response({
        ...payload,
        run: { ...payload.run!, id: 'run-idle', status: 'running' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const store = useAutomationCockpitStore()
    store.payload = {
      ...payload,
      run: { ...payload.run!, id: 'run-idle', status: 'idle' },
    }
    const cockpit = useAutomationCockpit('project-1')

    await cockpit.startRun({ strategy: 'safe', scopeType: 'next_n_chapters', targetChapterCount: 1 })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/projects/project-1/autonomous-runs/run-idle/start',
      '/api/projects/project-1/cockpit',
    ])
    expect(cockpit.run.value?.status).toBe('running')
  })

  it('polls only while a run is active and stops after unmount', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation(() => response(payload))
    vi.stubGlobal('fetch', fetchMock)
    const store = useAutomationCockpitStore()
    store.payload = payload

    const wrapper = mount(defineComponent({
      setup() {
        useCockpitPolling('project-1', 1000)
        return () => null
      },
    }))
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    store.payload = { ...payload, run: { ...payload.run!, status: 'completed' } }
    await nextTick()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
