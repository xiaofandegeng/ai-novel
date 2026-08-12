import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import {
  acts,
  autonomousRunJobs,
  autonomousWritingRuns,
  chapters,
  characters,
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

afterAll(() => sql.end())

describe('event-sourced development seed', () => {
  beforeEach(resetTestDatabase)

  it('creates product data only through events and survives a complete projection replay', async () => {
    const result = await seedDevelopmentData()
    const beforeReplay = await projectionSummary()

    expect(result.projectId).toBeTruthy()
    expect(beforeReplay.projects).toHaveLength(1)
    expect(beforeReplay.chapters).toHaveLength(3)
    expect(beforeReplay.characters).toHaveLength(3)
    expect(beforeReplay.runs).toHaveLength(1)
    expect(beforeReplay.runJobs).toHaveLength(2)
    expect(beforeReplay.events.length).toBeGreaterThan(10)

    await new ProjectionReplay(projectionRegistry, eventStore).replayAll()

    await expect(projectionSummary()).resolves.toEqual(beforeReplay)
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
    events: await db.select().from(domainEvents),
  }
}
