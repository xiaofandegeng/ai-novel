import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import {
  acts,
  aggregateSnapshots,
  autonomousRunJobs,
  autonomousWritingRuns,
  chapters,
  characters,
  commandReceipts,
  conflicts,
  domainEvents,
  foreshadowingItems,
  novelProjects,
  storyBibles,
  volumes,
  writingJobs,
} from '../db/schema'
import { ProjectionReplay } from '../eventing'
import { eventStore, projectionRegistry } from '../eventing-runtime'
import { resetTestDatabase } from '../test/database'
import { seedDevelopmentData } from './seed'
import { verifyContentEncryption } from './verify-content-encryption'

const KNOWN_SEED_PLAINTEXTS = [
  '测试小说《镜中城回声》',
  '镜中城只在雨夜出现，并收藏现实中被遗忘的人与记忆。',
  '林岚收到没有文字的来信，却在雨水中看到哥哥的笔迹。',
] as const

afterAll(() => sql.end())

describe('event-sourced development seed', () => {
  beforeEach(resetTestDatabase)

  it('creates product data only through events and survives a complete projection replay', async () => {
    const result = await seedDevelopmentData()
    const beforeReplay = await projectionSummary()
    const [rawEvents, rawSnapshots, rawReceipts] = await Promise.all([
      db.select().from(domainEvents),
      db.select().from(aggregateSnapshots),
      db.select().from(commandReceipts),
    ])

    expect(result.projectId).toBeTruthy()
    expect(beforeReplay.projects).toHaveLength(1)
    expect(beforeReplay.chapters).toHaveLength(3)
    expect(beforeReplay.characters).toHaveLength(3)
    expect(beforeReplay.runs).toHaveLength(1)
    expect(beforeReplay.runJobs).toHaveLength(2)
    expect(rawEvents.length).toBeGreaterThan(10)
    expect(rawReceipts.length).toBeGreaterThan(10)
    const rawEventingJson = JSON.stringify({
      events: rawEvents.map(event => event.payload),
      snapshots: rawSnapshots.map(snapshot => snapshot.state),
      receipts: rawReceipts.map(receipt => receipt.result),
    })
    for (const plaintext of KNOWN_SEED_PLAINTEXTS)
      expect(rawEventingJson).not.toContain(plaintext)

    await expect(verifyContentEncryption(result.projectId, KNOWN_SEED_PLAINTEXTS)).resolves.toMatchObject({
      ok: true,
      scopeProjectId: result.projectId,
      findings: [],
    })

    await new ProjectionReplay(projectionRegistry, eventStore).replayAll()

    await expect(projectionSummary()).resolves.toEqual(beforeReplay)
    await expect(db.select().from(novelProjects)).resolves.toEqual([
      expect.objectContaining({
        id: result.projectId,
        title: KNOWN_SEED_PLAINTEXTS[0],
      }),
    ])
    await expect(db.select().from(chapters)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: '空白信',
        outline: KNOWN_SEED_PLAINTEXTS[2],
      }),
    ]))
  })

  it('is repeatable without creating a second project or duplicate events', async () => {
    const first = await seedDevelopmentData()
    const eventCount = (await db.select().from(domainEvents)).length

    const second = await seedDevelopmentData()

    expect(second).toEqual(first)
    await expect(db.select().from(novelProjects)).resolves.toHaveLength(1)
    await expect(db.select().from(domainEvents)).resolves.toHaveLength(eventCount)
  })
})

async function projectionSummary() {
  return {
    projects: await db.select().from(novelProjects),
    bibles: await db.select().from(storyBibles),
    volumes: await db.select().from(volumes),
    acts: await db.select().from(acts),
    chapters: await db.select().from(chapters),
    characters: await db.select().from(characters),
    conflicts: await db.select().from(conflicts),
    foreshadowing: await db.select().from(foreshadowingItems),
    runs: await db.select().from(autonomousWritingRuns),
    runJobs: await db.select().from(autonomousRunJobs),
    writingJobs: await db.select().from(writingJobs),
  }
}
