import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { db, sql } from './db'
import {
  aiContextSnapshots,
  chapterChangeSetItems,
  chapterChangeSets,
  domainEvents,
  promptTemplates,
  storyStructureTemplates,
} from './db/schema'
import {
  changeAutonomousRun,
  createAutonomousRun,
  pauseAutonomousRun,
  recordAutonomousException,
} from './modules/automation/autonomous-writing.service'
import { resetTestDatabase } from './test/database'

async function createProject(app: ReturnType<typeof createApp>, title = '测试长篇') {
  const response = await app.request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  const body = await response.json() as { data: { id: string } }
  return body.data.id
}

async function requestJson<T>(
  app: ReturnType<typeof createApp>,
  path: string,
  method = 'GET',
  input?: unknown,
) {
  const response = await app.request(path, {
    method,
    headers: input === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: input === undefined ? undefined : JSON.stringify(input),
  })
  const body = await response.json() as { data: T, error?: string, success: boolean }
  return { body, response }
}

describe('http application boundary', () => {
  const app = createApp({ logging: false })

  beforeEach(resetTestDatabase)
  afterAll(() => sql.end())

  it('returns the unified failure envelope for unknown routes', async () => {
    const response = await app.request('/api/does-not-exist')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Not Found',
    })
  })

  it('creates, reads, updates, lists, and deletes a project through HTTP', async () => {
    const createResponse = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '测试长篇', genre: '悬疑', targetWords: 120000 }),
    })
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json() as { data: { id: string, title: string }, success: boolean }
    expect(created).toMatchObject({ success: true, data: { title: '测试长篇' } })

    const detailResponse = await app.request(`/api/projects/${created.data.id}`)
    expect(detailResponse.status).toBe(200)
    await expect(detailResponse.json()).resolves.toMatchObject({
      success: true,
      data: { id: created.data.id, genre: '悬疑' },
    })

    const updateResponse = await app.request(`/api/projects/${created.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '测试长篇·修订' }),
    })
    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toMatchObject({
      success: true,
      data: { title: '测试长篇·修订' },
    })

    const listResponse = await app.request('/api/projects?limit=10&offset=0')
    await expect(listResponse.json()).resolves.toMatchObject({
      success: true,
      data: [{ id: created.data.id }],
    })

    const deleteResponse = await app.request(`/api/projects/${created.data.id}`, { method: 'DELETE' })
    expect(deleteResponse.status).toBe(200)
    expect((await app.request(`/api/projects/${created.data.id}`)).status).toBe(404)
  })

  it('routes idempotent project writes through the event store', async () => {
    const createRequest = () => app.request('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'project-create-retry',
      },
      body: JSON.stringify({ title: '幂等项目' }),
    })
    const firstCreate = await createRequest()
    const firstBody = await firstCreate.json() as { data: { id: string } }
    const secondCreate = await createRequest()
    await expect(secondCreate.json()).resolves.toEqual(firstBody)

    const projectId = firstBody.data.id
    const updateRequest = () => app.request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'project-update-retry',
      },
      body: JSON.stringify({ title: '幂等项目·修订' }),
    })
    await updateRequest()
    await updateRequest()

    const deleteRequest = () => app.request(`/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': 'project-delete-retry' },
    })
    const firstDelete = await deleteRequest()
    const firstDeleteBody = await firstDelete.json()
    const secondDelete = await deleteRequest()
    await expect(secondDelete.json()).resolves.toEqual(firstDeleteBody)

    const events = await db.select()
      .from(domainEvents)
      .where(eq(domainEvents.aggregateId, projectId))
    expect(events.map(event => event.eventType)).toEqual([
      'ProjectCreated',
      'ProjectDetailsChanged',
      'ProjectDeletionRequested',
      'ProjectDeleted',
    ])
  })

  it('rejects project creation without a title at the HTTP boundary', async () => {
    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genre: '悬疑' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Project title is required',
    })
  })

  it('exposes provider presets without leaking API keys', async () => {
    const response = await app.request('/api/settings/ai/providers')
    const body = await response.json() as { data: Array<Record<string, unknown>>, success: boolean }

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data.every(provider => !('apiKey' in provider))).toBe(true)
  })

  it('lists snapshot summaries and returns full details from one canonical route', async () => {
    const projectId = await createProject(app)
    await db.insert(aiContextSnapshots).values({
      id: 'snapshot-1',
      projectId,
      requestId: 'request-1',
      scene: 'draft',
      contextPayload: JSON.stringify({ privateContext: 'detail-only' }),
      renderedPromptPreview: '提示词预览',
      tokenEstimate: 12,
      createdAt: '2026-08-11T00:00:00.000Z',
    })

    const listResponse = await app.request(`/api/projects/${projectId}/context-snapshots`)
    const list = await listResponse.json() as { data: Array<Record<string, unknown>> }
    expect(listResponse.status).toBe(200)
    expect(list.data).toEqual([expect.objectContaining({ id: 'snapshot-1', tokenEstimate: 12 })])
    expect(list.data[0]).not.toHaveProperty('contextPayload')

    const detailResponse = await app.request(`/api/projects/${projectId}/context-snapshots/snapshot-1`)
    await expect(detailResponse.json()).resolves.toMatchObject({
      success: true,
      data: { contextPayload: JSON.stringify({ privateContext: 'detail-only' }) },
    })
    expect((await app.request(`/api/projects/${projectId}/context-snapshots/missing`)).status).toBe(404)
  })

  it('keeps chapter reads and mutations inside the owning project', async () => {
    const ownerId = await createProject(app, '项目甲')
    const otherId = await createProject(app, '项目乙')
    const createResponse = await app.request(`/api/projects/${ownerId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterNumber: 1, title: '第一章' }),
    })
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json() as { data: { id: string } }

    expect((await app.request(`/api/projects/${otherId}/chapters/${created.data.id}`)).status).toBe(404)
    expect((await app.request(`/api/projects/${otherId}/chapters/${created.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '越权修改' }),
    })).status).toBe(404)
    expect((await app.request(`/api/projects/${otherId}/chapters/${created.data.id}`, { method: 'DELETE' })).status).toBe(404)

    const ownerResponse = await app.request(`/api/projects/${ownerId}/chapters/${created.data.id}`)
    await expect(ownerResponse.json()).resolves.toMatchObject({ data: { title: '第一章' }, success: true })
  })

  it('ignores identity and ownership fields smuggled through request JSON', async () => {
    const ownerId = await createProject(app, '归属项目')
    const otherId = await createProject(app, '其他项目')

    const created = await requestJson<{ id: string, projectId: string, name: string }>(
      app,
      `/api/projects/${ownerId}/characters`,
      'POST',
      { id: 'forged-id', projectId: otherId, name: '安全角色' },
    )
    expect(created.response.status).toBe(201)
    expect(created.body.data).toMatchObject({ projectId: ownerId, name: '安全角色' })
    expect(created.body.data.id).not.toBe('forged-id')

    const updated = await requestJson<{ id: string, projectId: string, name: string }>(
      app,
      `/api/projects/${ownerId}/characters/${created.body.data.id}`,
      'PATCH',
      { id: 'replaced-id', projectId: otherId, name: '安全角色·修订' },
    )
    expect(updated.response.status).toBe(200)
    expect(updated.body.data).toMatchObject({
      id: created.body.data.id,
      projectId: ownerId,
      name: '安全角色·修订',
    })

    const otherCharacters = await requestJson<Array<{ id: string }>>(
      app,
      `/api/projects/${otherId}/characters`,
    )
    expect(otherCharacters.body.data).toEqual([])
  })

  it('rejects incomplete chapter input instead of leaking a database error', async () => {
    const projectId = await createProject(app)
    const response = await app.request(`/api/projects/${projectId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterNumber: 1 }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Chapter title is required' })
  })

  it('persists project AI settings while returning only credential-presence flags', async () => {
    const projectId = await createProject(app)
    const updateRequest = () => app.request(`/api/projects/${projectId}/settings/ai`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'project-ai-settings-retry',
      },
      body: JSON.stringify({
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-test',
        apiKey: 'private-chat-key',
        embeddingApiKey: 'private-embedding-key',
        temperature: 120,
      }),
    })
    const updateResponse = await updateRequest()
    const updated = await updateResponse.json() as { data: Record<string, unknown> }

    expect(updateResponse.status).toBe(200)
    expect(updated.data).toMatchObject({ hasApiKey: true, hasEmbeddingApiKey: true, temperature: 100 })
    expect(updated.data).not.toHaveProperty('apiKey')

    const getResponse = await app.request(`/api/projects/${projectId}/settings/ai`)
    const current = await getResponse.json() as { data: Record<string, unknown> }
    expect(current.data).not.toHaveProperty('apiKey')
    expect(current.data).not.toHaveProperty('embeddingApiKey')

    const retryResponse = await updateRequest()
    await expect(retryResponse.json()).resolves.toEqual(updated)
    const events = await db.select()
      .from(domainEvents)
      .where(eq(domainEvents.aggregateId, projectId))
    expect(events.filter(event => event.aggregateType === 'ProjectSettings')).toHaveLength(3)
  })

  it('rejects AI execution without an explicit project scope', async () => {
    const response = await app.request('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: '继续写' }] }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Project ID is required',
    })
  })

  it('saves project prompt overrides and renders the effective template', async () => {
    const projectId = await createProject(app)
    const timestamp = '2026-08-11T00:00:00.000Z'
    await db.insert(promptTemplates).values({
      id: 'template-1',
      key: 'draft_generate',
      name: '正文生成',
      version: '1.0.0',
      systemPrompt: '系统：{{theme}}',
      userPromptTemplate: '写作 {{title}}',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const saveRequest = () => app.request(`/api/projects/${projectId}/prompt-overrides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'prompt-override-retry',
      },
      body: JSON.stringify({
        templateKey: 'draft_generate',
        overrideUserPromptTemplate: '续写 {{title}}',
        enabled: 1,
      }),
    })
    const saveResponse = await saveRequest()
    expect(saveResponse.status).toBe(201)
    expect((await saveRequest()).status).toBe(201)

    const promptEvents = (await db.select().from(domainEvents))
      .filter(event => event.aggregateType === 'ProjectPromptOverride')
    expect(promptEvents.map(event => event.eventType)).toEqual([
      'PromptTemplateSelected',
      'ProjectPromptOverrideChanged',
    ])

    const renderResponse = await app.request(`/api/projects/${projectId}/prompt-templates/draft_generate/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '雾港', theme: '信任' }),
    })
    await expect(renderResponse.json()).resolves.toEqual({
      success: true,
      data: { system: '系统：信任', user: '续写 雾港' },
    })
  })

  it('creates one autonomous run, rejects overlap, and abandons it cleanly', async () => {
    const projectId = await createProject(app)
    await app.request(`/api/projects/${projectId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterNumber: 1, title: '第一章' }),
    })
    const input = {
      strategy: 'balanced',
      scopeType: 'continue_incomplete',
      targetWordsPerChapter: 3000,
    }
    const createResponse = await app.request(`/api/projects/${projectId}/autonomous-runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const created = await createResponse.json() as { data: { id: string } }
    expect(createResponse.status).toBe(200)

    const activeResponse = await app.request(`/api/projects/${projectId}/autonomous-runs/active`)
    await expect(activeResponse.json()).resolves.toMatchObject({
      success: true,
      data: { id: created.data.id, status: 'idle', jobs: [{ orderIndex: 0 }] },
    })

    const overlapResponse = await app.request(`/api/projects/${projectId}/autonomous-runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    expect(overlapResponse.status).toBe(400)

    const startResponse = await app.request(`/api/projects/${projectId}/autonomous-runs/${created.data.id}/start`, { method: 'POST' })
    expect(startResponse.status).toBe(200)

    const abandonResponse = await app.request(`/api/projects/${projectId}/autonomous-runs/${created.data.id}/abandon`, { method: 'POST' })
    expect(abandonResponse.status).toBe(200)
    await expect((await app.request(`/api/projects/${projectId}/autonomous-runs/active`)).json()).resolves.toEqual({ success: true, data: null })
  })

  it('submits explicit exception actions and rejects invalid action payloads', async () => {
    const projectId = await createProject(app, '异常中心项目')
    const run = await createAutonomousRun(projectId, {
      strategy: 'balanced',
      scopeType: 'next_n_chapters',
      targetChapterCount: 1,
    })
    await changeAutonomousRun(projectId, run.id, { status: 'running' }, 'http-exception-start')
    await recordAutonomousException(projectId, run.id, {
      exceptionType: 'operator_override_required',
      severity: 'high',
      title: '等待作者选择',
    }, 'http-exception-open')
    await pauseAutonomousRun(projectId, run.id, '等待异常中心处置')
    const exceptionResponse = await requestJson<Array<{ id: string, status: string }>>(
      app,
      `/api/projects/${projectId}/autonomous-runs/${run.id}/exceptions`,
    )
    expect(exceptionResponse.body.data).toMatchObject([{ status: 'open' }])
    const exceptionId = exceptionResponse.body.data[0].id

    const invalid = await requestJson(
      app,
      `/api/projects/${projectId}/autonomous-runs/${run.id}/exceptions/${exceptionId}/actions`,
      'POST',
      { action: 'ignore_everything' },
    )
    expect(invalid.response.status).toBe(400)

    const stopped = await requestJson(
      app,
      `/api/projects/${projectId}/autonomous-runs/${run.id}/exceptions/${exceptionId}/actions`,
      'POST',
      { action: 'stop_run' },
    )
    expect(stopped.response.status).toBe(200)
    const current = await requestJson<{ status: string }>(app, `/api/projects/${projectId}/autonomous-runs/${run.id}`)
    expect(current.body.data.status).toBe('abandoned')
  })

  it('aggregates an empty project into a usable cockpit payload', async () => {
    const projectId = await createProject(app, '空白驾驶舱')
    const response = await app.request(`/api/projects/${projectId}/cockpit`)
    const body = await response.json() as { data: Record<string, unknown>, success: boolean }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, data: { run: null, chapters: [], events: [] } })
  })

  it('normalizes cockpit confidence, chapter labels, and legacy event payloads', async () => {
    const projectId = await createProject(app, '驾驶舱格式测试')
    const chapter = (await requestJson<{ id: string }>(app, `/api/projects/${projectId}/chapters`, 'POST', {
      chapterNumber: 3,
      title: '第三章',
    })).body.data
    await requestJson(app, `/api/projects/${projectId}/characters`, 'POST', {
      name: '林岚',
      role: '调查员',
    })
    await db.insert(chapterChangeSets).values({
      id: 'change-set-format',
      projectId,
      chapterId: chapter.id,
      status: 'applied',
      riskLevel: 'medium',
    })
    await db.insert(chapterChangeSetItems).values([
      {
        id: 'relationship-format',
        changeSetId: 'change-set-format',
        projectId,
        chapterId: chapter.id,
        itemType: 'relationship_update',
        riskLevel: 'medium',
        title: '关系更新',
        payloadJson: {
          characterAName: '林岚',
          characterBName: '周砚',
          status: '互相信任',
          strength: 4,
        },
        status: 'applied',
      },
      {
        id: 'conflict-format',
        changeSetId: 'change-set-format',
        projectId,
        chapterId: chapter.id,
        itemType: 'conflict_update',
        riskLevel: 'low',
        title: '冲突演变',
        payloadJson: {
          title: '旧航线之争',
          newStatus: 'escalating',
          newIntensity: 8,
        },
        status: 'applied',
      },
    ])

    const response = await requestJson<{
      characters: Array<{ confidence?: number }>
      events: Array<{ sourceChapterId?: string, sourceChapterNumber?: number, summary: string }>
    }>(app, `/api/projects/${projectId}/cockpit`)

    expect(response.body.data.characters[0].confidence).toBe(0.85)
    expect(response.body.data.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceChapterId: chapter.id, sourceChapterNumber: 3 }),
    ]))
    expect(response.body.data.events.map(event => event.summary).join('\n')).toContain('林岚')
    expect(response.body.data.events.map(event => event.summary).join('\n')).toContain('escalating')
    expect(response.body.data.events.map(event => event.summary).join('\n')).not.toContain('undefined')
  })

  it('exports the current project backup and manuscript through supported HTTP endpoints', async () => {
    const projectId = await createProject(app, '可导出的雾港')
    await app.request(`/api/projects/${projectId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterNumber: 1,
        title: '归港',
        outline: '调查员在雾中登船。',
        draft: '汽笛划破潮湿的夜。',
        status: 'completed',
      }),
    })

    const backupResponse = await app.request(`/api/projects/${projectId}/export`)
    expect(backupResponse.status).toBe(200)
    await expect(backupResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        project: { title: '可导出的雾港' },
        chapters: [{ title: '归港' }],
      },
    })

    const manuscriptResponse = await app.request(`/api/projects/${projectId}/export/manuscript?format=md&includeOutline=true`)
    expect(manuscriptResponse.status).toBe(200)
    expect(manuscriptResponse.headers.get('content-type')).toContain('text/markdown')
    expect(await manuscriptResponse.text()).toContain('# 可导出的雾港\n\n## 第 1 章 归港')

    for (const path of ['proposal', 'characters', 'foreshadowing-report', 'conflict-report']) {
      const response = await app.request(`/api/projects/${projectId}/export/${path}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/markdown')
      expect(await response.text()).toContain('可导出的雾港')
    }

    const missingProjectResponse = await app.request('/api/projects/missing/export/proposal')
    expect(missingProjectResponse.status).toBe(404)
    await expect(missingProjectResponse.json()).resolves.toEqual({ success: false, error: 'Project not found' })
  })

  it('maintains the story bible and character graph through their complete HTTP lifecycles', async () => {
    const projectId = await createProject(app, '关系图谱测试')
    const biblePath = `/api/projects/${projectId}/story-bible`
    expect((await requestJson(app, biblePath)).response.status).toBe(404)
    expect((await requestJson(app, biblePath, 'POST', {
      worldview: '群岛被终年浓雾包围',
      mainConflict: '寻找失踪船队',
      theme: '信任',
    })).response.status).toBe(201)
    await requestJson(app, biblePath, 'PATCH', { theme: '信任与背叛' })
    expect((await requestJson<{ theme: string }>(app, biblePath)).body.data.theme).toBe('信任与背叛')

    const characterPath = `/api/projects/${projectId}/characters`
    const firstCharacter = (await requestJson<{ id: string }>(app, characterPath, 'POST', {
      name: '林岚',
      role: '调查员',
      goal: '找到失踪船队',
    })).body.data
    const secondCharacter = (await requestJson<{ id: string }>(app, characterPath, 'POST', {
      name: '周砚',
      role: '领航员',
      goal: '隐瞒旧航线',
    })).body.data
    await requestJson(app, `${characterPath}/${firstCharacter.id}`, 'PATCH', { fear: '深海' })
    expect((await requestJson<Array<unknown>>(app, characterPath)).body.data).toHaveLength(2)

    const relationshipPath = `/api/projects/${projectId}/relationships`
    const relationshipInput = {
      characterAId: secondCharacter.id,
      characterBId: firstCharacter.id,
      type: '盟友',
      strength: 70,
      status: 'active',
    }
    const relationship = (await requestJson<{ id: string }>(app, relationshipPath, 'POST', relationshipInput)).body.data
    expect((await requestJson(app, relationshipPath, 'POST', relationshipInput)).response.status).toBe(400)
    await requestJson(app, `${relationshipPath}/${relationship.id}`, 'PATCH', { strength: 80 })
    expect((await requestJson<Array<unknown>>(app, relationshipPath)).body.data).toHaveLength(1)

    const conflictPath = `/api/projects/${projectId}/conflicts`
    const conflict = (await requestJson<{ id: string }>(app, conflictPath, 'POST', {
      title: '旧航线之争',
      type: 'interpersonal',
      intensity: 75,
      status: 'active',
      participants: '林岚、周砚',
      participantIds: [firstCharacter.id, secondCharacter.id],
    })).body.data
    await requestJson(app, `${conflictPath}/${conflict.id}`, 'PATCH', { intensity: 90 })
    const conflictParticipantsPath = `${conflictPath}/${conflict.id}/participants`
    await requestJson(app, conflictParticipantsPath, 'PUT', [
      { characterId: firstCharacter.id, roleInConflict: '追问者' },
      { characterId: secondCharacter.id, roleInConflict: '隐瞒者' },
    ])
    expect((await requestJson<Array<unknown>>(app, conflictParticipantsPath)).body.data).toHaveLength(2)

    const foreshadowingPath = `/api/projects/${projectId}/foreshadowing`
    const foreshadowing = (await requestJson<{ id: string }>(app, foreshadowingPath, 'POST', {
      title: '生锈的罗盘',
      description: '指向废弃航线',
      importance: 'major',
      characterIds: [firstCharacter.id],
    })).body.data
    await requestJson(app, `${foreshadowingPath}/${foreshadowing.id}`, 'PATCH', { status: 'resolved' })
    const foreshadowingCharactersPath = `${foreshadowingPath}/${foreshadowing.id}/characters`
    await requestJson(app, foreshadowingCharactersPath, 'PUT', [
      { characterId: firstCharacter.id, relationType: 'witness' },
    ])
    expect((await requestJson<Array<unknown>>(app, foreshadowingCharactersPath)).body.data).toHaveLength(1)

    expect((await requestJson(app, `${foreshadowingPath}/${foreshadowing.id}`, 'DELETE')).response.status).toBe(200)
    expect((await requestJson(app, `${conflictPath}/${conflict.id}`, 'DELETE')).response.status).toBe(200)
    expect((await requestJson(app, `${relationshipPath}/${relationship.id}`, 'DELETE')).response.status).toBe(200)
    expect((await requestJson(app, `${characterPath}/${firstCharacter.id}`, 'DELETE')).response.status).toBe(200)
  })

  it('keeps outline, scene, element, and version operations connected end to end', async () => {
    const projectId = await createProject(app, '章节链路测试')
    const volumePath = `/api/projects/${projectId}/volumes`
    const volume = (await requestJson<{ id: string }>(app, volumePath, 'POST', {
      title: '第一卷',
      summary: '迷雾初现',
      orderIndex: 1,
    })).body.data
    expect((await requestJson(app, `${volumePath}/${volume.id}`)).response.status).toBe(200)
    await requestJson(app, `${volumePath}/${volume.id}`, 'PATCH', { summary: '迷雾与归港' })

    const actPath = `/api/projects/${projectId}/acts`
    const act = (await requestJson<{ id: string }>(app, actPath, 'POST', {
      volumeId: volume.id,
      title: '返航',
      orderIndex: 1,
      targetChapterCount: 3,
    })).body.data
    await requestJson(app, `${actPath}/${act.id}`, 'PATCH', { theme: '疑云' })
    expect((await requestJson<Array<unknown>>(app, actPath)).body.data).toHaveLength(1)

    const chapterPath = `/api/projects/${projectId}/chapters`
    const chapter = (await requestJson<{ id: string }>(app, chapterPath, 'POST', {
      chapterNumber: 1,
      title: '归港',
      volumeId: volume.id,
      outline: '主角回到雾港',
    })).body.data
    const scenePath = `${chapterPath}/${chapter.id}/scenes`
    const scene = (await requestJson<{ id: string }>(app, scenePath, 'POST', {
      sceneNumber: 1,
      title: '码头',
      purpose: '发现异常',
      orderIndex: 1,
    })).body.data
    await requestJson(app, `${scenePath}/${scene.id}`, 'PATCH', { status: 'completed', content: '码头空无一人。' })
    expect((await requestJson(app, `${scenePath}/reorder`, 'PATCH', {
      orders: [{ id: scene.id, orderIndex: 2 }],
    })).response.status).toBe(200)
    const bulk = await requestJson<Array<{ id: string }>>(app, `${scenePath}/bulk`, 'POST', {
      mode: 'append',
      scenes: [{ sceneNumber: 2, title: '灯塔', purpose: '追踪信号', orderIndex: 1 }],
    })
    expect(bulk.body.data).toHaveLength(2)

    const elementPath = `${chapterPath}/${chapter.id}/elements`
    const element = (await requestJson<{ id: string }>(app, elementPath, 'POST', {
      elementType: 'location',
      elementName: '旧灯塔',
      relationType: 'appears',
      importance: 'major',
    })).body.data
    await requestJson(app, `${elementPath}/${element.id}`, 'PATCH', { notes: '需要回收伏笔' })
    expect((await requestJson(app, elementPath, 'PUT', {
      elements: [{
        elementType: 'item',
        elementName: '生锈罗盘',
        relationType: 'appears',
        importance: 'major',
      }],
    })).response.status).toBe(200)
    const currentElements = (await requestJson<Array<{ id: string }>>(app, elementPath)).body.data
    expect(currentElements).toHaveLength(1)

    const versionPath = `${chapterPath}/${chapter.id}/versions`
    expect((await requestJson(app, versionPath, 'POST', {})).response.status).toBe(400)
    const version = (await requestJson<{ id: string }>(app, versionPath, 'POST', {
      content: '码头空无一人。',
      note: '初稿快照',
    })).body.data
    expect((await requestJson<Array<unknown>>(app, versionPath)).body.data).toHaveLength(1)

    expect((await requestJson(app, `/api/projects/${projectId}/versions/${version.id}`, 'DELETE')).response.status).toBe(409)
    expect((await requestJson<Array<unknown>>(app, versionPath)).body.data).toHaveLength(1)
    expect((await requestJson(app, `${elementPath}/${currentElements[0].id}`, 'DELETE')).response.status).toBe(200)
    for (const row of bulk.body.data)
      expect((await requestJson(app, `${scenePath}/${row.id}`, 'DELETE')).response.status).toBe(200)
    expect((await requestJson(app, `${chapterPath}/${chapter.id}`, 'DELETE')).response.status).toBe(200)
    expect((await requestJson(app, `${actPath}/${act.id}`, 'DELETE')).response.status).toBe(200)
    expect((await requestJson(app, `${volumePath}/${volume.id}`, 'DELETE')).response.status).toBe(200)
  })

  it('records narrative timelines, authoring events, and reviewable AI candidates', async () => {
    const projectId = await createProject(app, '审阅链路测试')
    const chapter = (await requestJson<{ id: string }>(app, `/api/projects/${projectId}/chapters`, 'POST', {
      chapterNumber: 1,
      title: '暗潮',
    })).body.data
    const character = (await requestJson<{ id: string }>(app, `/api/projects/${projectId}/characters`, 'POST', {
      name: '林岚',
      role: '调查员',
    })).body.data
    const conflict = (await requestJson<{ id: string }>(app, `/api/projects/${projectId}/conflicts`, 'POST', {
      title: '是否公开航线',
      type: 'internal',
      intensity: 40,
      status: 'active',
    })).body.data

    const arcPath = `/api/projects/${projectId}/character-arc`
    const arc = (await requestJson<{ id: string }>(app, arcPath, 'POST', {
      characterId: character.id,
      chapterId: chapter.id,
      eventType: 'goal_shift',
      beforeState: '寻找船队',
      afterState: '保护幸存者',
      sourceType: 'manual',
    })).body.data
    await requestJson(app, `${arcPath}/${arc.id}`, 'PATCH', { eventType: 'belief_changed' })
    expect((await requestJson<Array<unknown>>(app, arcPath)).body.data).toHaveLength(1)
    expect((await requestJson<Array<unknown>>(app, `${arcPath}/${character.id}`)).body.data).toHaveLength(1)

    const timelinePath = `/api/projects/${projectId}/conflict-timeline`
    const timeline = (await requestJson<{ id: string }>(app, timelinePath, 'POST', {
      conflictId: conflict.id,
      chapterId: chapter.id,
      intensityBefore: 40,
      intensityAfter: 75,
      statusBefore: 'latent',
      statusAfter: 'active',
      reason: '秘密曝光',
    })).body.data
    expect((await requestJson<Array<unknown>>(app, timelinePath)).body.data).toHaveLength(1)
    expect((await requestJson<Array<unknown>>(app, `/api/projects/${projectId}/conflicts/${conflict.id}/timeline`)).body.data).toHaveLength(1)

    const authoringEventPath = '/api/authoring-events'
    expect((await requestJson(app, authoringEventPath, 'POST', {
      projectId,
      chapterId: chapter.id,
      eventType: 'manual_revision',
      source: 'manual',
      payload: { reason: '强化冲突' },
    })).response.status).toBe(200)
    expect((await requestJson<Array<unknown>>(app, `${authoringEventPath}/${projectId}`)).body.data).toHaveLength(1)

    const candidatePath = `/api/projects/${projectId}/ai-candidates`
    const candidate = (await requestJson<{ id: string }>(app, candidatePath, 'POST', {
      chapterId: chapter.id,
      provider: 'openai-compatible',
      model: 'custom-model',
      taskType: 'draft',
      content: '候选正文',
      qualityScore: 82,
    })).body.data
    expect((await requestJson<Array<unknown>>(app, `${candidatePath}?chapterId=${chapter.id}`)).body.data).toHaveLength(1)
    expect((await requestJson(app, `${candidatePath}/${candidate.id}/rate`, 'POST', { rating: 6 })).response.status).toBe(400)
    expect((await requestJson(app, `${candidatePath}/${candidate.id}/rate`, 'POST', { rating: 5 })).response.status).toBe(200)
    expect((await requestJson(app, `${candidatePath}/${candidate.id}/select`, 'POST')).response.status).toBe(200)

    expect((await requestJson(app, `${timelinePath}/${timeline.id}`, 'DELETE')).response.status).toBe(200)
    expect((await requestJson(app, `${arcPath}/${arc.id}`, 'DELETE')).response.status).toBe(200)
  })

  it('deduplicates retried story-structure HTTP commands', async () => {
    const projectId = await createProject(app, '结构幂等测试')
    const createVolume = () => app.request(`/api/projects/${projectId}/volumes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'create-first-volume',
      },
      body: JSON.stringify({ title: '第一卷', orderIndex: 1 }),
    })
    const first = await createVolume()
    const firstBody = await first.json() as { data: { id: string } }
    const second = await createVolume()

    expect(second.status).toBe(201)
    await expect(second.json()).resolves.toEqual(firstBody)
    const storyEvents = await db.select().from(domainEvents).where(and(
      eq(domainEvents.aggregateType, 'StoryStructure'),
      eq(domainEvents.projectId, projectId),
    ))
    expect(storyEvents.map(event => event.eventType)).toEqual(['VolumeCreated'])
  })

  it('lists and applies a story-structure template into project acts', async () => {
    const projectId = await createProject(app, '结构模板测试')
    await db.insert(storyStructureTemplates).values({
      id: 'three-act-test',
      name: '三幕结构',
      genre: '悬疑',
      structureType: 'three_act',
      actsJson: JSON.stringify([
        {
          title: '建立谜团',
          description: '展示失踪事件',
          theme: '疑问',
          targetChapterCount: 3,
          keyEvents: ['失踪'],
        },
        {
          title: '追查真相',
          description: '调查旧航线',
          theme: '信任',
          targetChapterCount: 6,
          keyEvents: ['背叛'],
        },
      ]),
    })

    const templates = await requestJson<Array<{ id: string }>>(app, '/api/story-structure/templates?genre=悬疑')
    expect(templates.body.data.map(template => template.id)).toContain('three-act-test')
    const applyResponse = await requestJson<string[]>(app, `/api/projects/${projectId}/story-structure/apply`, 'POST', {
      templateId: 'three-act-test',
    })
    expect(applyResponse.response.status).toBe(201)
    expect(applyResponse.body.data).toHaveLength(2)
    expect((await requestJson<Array<unknown>>(app, `/api/projects/${projectId}/acts`)).body.data).toHaveLength(2)
  })
})
