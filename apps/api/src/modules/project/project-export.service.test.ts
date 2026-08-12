import { beforeEach, describe, expect, it, vi } from 'vitest'

const select = vi.fn()

vi.mock('../../db', () => ({
  db: { select },
}))

describe('project export DTO boundary', () => {
  beforeEach(() => {
    select.mockReset()
  })

  it('recursively excludes storage envelopes, data keys, and credential references', async () => {
    const timestamp = '2026-08-13T00:00:00.000Z'
    const rows = [
      [{
        id: 'project-export',
        title: '可导出的雾港',
        description: '业务简介',
        genre: '悬疑',
        theme: '归途',
        targetWords: 120000,
        targetAudience: '成年读者',
        styleProfile: '冷静克制',
        status: 'writing',
        createdAt: timestamp,
        updatedAt: timestamp,
        wrappedKey: 'wrapped-secret',
        envelope: {
          encrypted: true,
          ciphertext: 'encrypted-secret',
          authTag: 'auth-secret',
        },
        settings: {
          credentialRef: 'credential-chat-secret',
          embeddingCredentialRef: 'credential-embedding-secret',
        },
      }],
      [],
      [{
        id: 'chapter-export',
        projectId: 'project-export',
        volumeId: null,
        title: '归港',
        chapterNumber: 1,
        outline: '调查员在雾中登船。',
        summary: null,
        characters: null,
        goals: null,
        conflicts: null,
        events: null,
        emotionalArc: null,
        foreshadowing: null,
        endingHook: null,
        draft: '汽笛划破潮湿的夜。',
        status: 'completed',
        createdAt: timestamp,
        updatedAt: timestamp,
        ciphertext: 'nested-leak',
      }],
      [],
      [],
      [],
      [],
      [],
    ]
    select.mockImplementation(() => queryReturning(rows.shift() ?? []))
    const { getProjectExportData } = await import('./project-export.service')

    const exported = await getProjectExportData('project-export')

    expect(exported.project.title).toBe('可导出的雾港')
    expect(exported.chapters[0]).toMatchObject({
      title: '归港',
      outline: '调查员在雾中登船。',
      draft: '汽笛划破潮湿的夜。',
    })
    expect(collectKeys(exported)).not.toEqual(expect.arrayContaining([
      'authTag',
      'ciphertext',
      'credentialRef',
      'embeddingCredentialRef',
      'envelope',
      'wrappedKey',
    ]))
  })
})

function queryReturning(rows: unknown[]) {
  const query = {
    from: () => query,
    orderBy: () => query,
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    where: () => query,
  }
  return query
}

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value))
    return value.flatMap(collectKeys)
  if (typeof value !== 'object' || value === null)
    return []
  return Object.entries(value).flatMap(([key, child]) => [key, ...collectKeys(child)])
}
