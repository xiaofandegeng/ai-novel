import type { AutomationCockpitPayload, Chapter, NovelProject } from '@ai-novel/shared'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutomationCockpitStore } from '../features/automation-cockpit/stores/automation-cockpit.store'
import { useChapterStore } from './automation-cockpit/stores/chapter.store'
import { useProjectStore } from './projects/stores/project.store'

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  }))
}

const timestamp = '2026-08-11T00:00:00.000Z'
const project: NovelProject = {
  id: 'project-1',
  title: '雾港',
  status: 'planning',
  createdAt: timestamp,
  updatedAt: timestamp,
}
const chapter: Chapter = {
  id: 'chapter-1',
  projectId: project.id,
  chapterNumber: 1,
  title: '归港',
  status: 'not_started',
  createdAt: timestamp,
  updatedAt: timestamp,
}
const cockpit: AutomationCockpitPayload = {
  project: { id: project.id, title: project.title, currentWordCount: 0 },
  run: null,
  chapters: [],
  characters: [],
  relationships: [],
  conflicts: [],
  foreshadowing: [],
  plotDirection: {},
  health: { overallScore: 100, riskCount: 0 },
  events: [{
    id: 'item-1',
    type: 'character',
    status: 'pending_review',
    title: '人物变化',
    summary: '林岚决定返航',
    changeSetId: 'change-set-1',
    createdAt: timestamp,
  }],
  exceptions: [],
}

describe('pinia stores through the fetch boundary', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps project list and current project consistent across CRUD actions', async () => {
    const updated = { ...project, title: '雾港·修订' }
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response([project]))
      .mockImplementationOnce(() => response(project))
      .mockImplementationOnce(() => response(updated))
      .mockImplementationOnce(() => response(project))
    vi.stubGlobal('fetch', fetchMock)
    const store = useProjectStore()

    await store.fetchProjects()
    await store.fetchProject(project.id)
    await store.updateProject(project.id, { title: updated.title })
    await store.deleteProject(project.id)

    expect(store.projects).toEqual([])
    expect(store.currentProject).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('updates the chapter collection through real chapter API helpers', async () => {
    const updated = { ...chapter, title: '归港之后' }
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response([chapter]))
      .mockImplementationOnce(() => response(updated))
      .mockImplementationOnce(() => response(chapter))
    vi.stubGlobal('fetch', fetchMock)
    const store = useChapterStore()

    await store.fetchChapters(project.id)
    await store.updateChapter(project.id, chapter.id, { title: updated.title })
    await store.deleteChapter(project.id, chapter.id)

    expect(store.chapters).toEqual([])
  })

  it('loads cockpit data and updates an approved event without losing state', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response(cockpit))
      .mockImplementationOnce(() => response({ success: true }))
    vi.stubGlobal('fetch', fetchMock)
    const store = useAutomationCockpitStore()

    await store.fetchCockpit(project.id)
    await store.approveItem(project.id, 'change-set-1', 'item-1')

    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.payload?.events[0].status).toBe('approved')
  })

  it('exposes cockpit load failures and always clears loading state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: 'Cockpit unavailable',
    }), { status: 503 })))
    const store = useAutomationCockpitStore()

    await store.fetchCockpit(project.id)
    expect(store.loading).toBe(false)
    expect(store.error).toBe('Cockpit unavailable')
  })
})
