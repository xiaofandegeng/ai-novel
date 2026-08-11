import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiDel, apiGet, apiPatch, apiPost, createCrudApi } from './client'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('web API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('unwraps successful response envelopes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { id: 'p1' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiGet<{ id: string }>('/api/projects/p1')).resolves.toEqual({ id: 'p1' })
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1', {
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('throws the server error from a failed response envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: false, error: 'Project not found' }, 404)))
    await expect(apiGet('/api/projects/missing')).rejects.toThrow('Project not found')
  })

  it('sends JSON bodies and the expected mutation methods', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ success: true, data: true })))
    vi.stubGlobal('fetch', fetchMock)

    await apiPost('/api/resource', { title: '雾港' })
    await apiPatch('/api/resource/1', { title: '新标题' })
    await apiDel('/api/resource/1')

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/resource', expect.objectContaining({ method: 'POST', body: '{"title":"雾港"}' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/resource/1', expect.objectContaining({ method: 'PATCH', body: '{"title":"新标题"}' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/resource/1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('builds project-scoped CRUD URLs consistently', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const api = createCrudApi('chapters')

    await api.fetch('project 1')
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project 1/chapters', expect.any(Object))
  })
})
