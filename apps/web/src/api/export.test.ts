import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportManuscript, exportProject } from './export'

describe('browser export client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('downloads a project backup returned by the API', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const createObjectURL = vi.fn().mockReturnValue('blob:backup')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { project: { title: '雾港' }, chapters: [] },
    }))))

    await exportProject('project-1')
    expect(click).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup')
  })

  it('encodes manuscript options into the download endpoint', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:manuscript'), revokeObjectURL: vi.fn() })
    const fetchMock = vi.fn().mockResolvedValue(new Response('正文', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await exportManuscript('project-1', {
      format: 'txt',
      includeOutline: true,
      includeScenes: true,
      includeUnfinishedChapters: true,
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/export/manuscript?format=txt&includeOutline=true&includeScenes=true&includeUnfinishedChapters=true')
  })

  it('surfaces export errors from the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Project not found' }), { status: 404 })))
    await expect(exportManuscript('missing')).rejects.toThrow('Project not found')
  })
})
