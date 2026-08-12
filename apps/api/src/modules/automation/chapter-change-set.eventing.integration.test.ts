import type { CommandEnvelope, JsonObject } from '../../eventing'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { chapterChangeSetItems, chapterChangeSets } from '../../db/schema'
import { AggregateRepository, CommandBus, EventRegistry, EventStore, ProjectionRegistry, ProjectionReplay } from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from '../story/chapter.eventing'
import {
  CHANGE_CHANGE_SET_COMMAND,
  CHANGE_CHANGE_SET_ITEM_COMMAND,
  CHANGE_SET_AGGREGATE_TYPE,
  CHANGE_SET_PROJECTION,
  DRAFT_CHANGE_SET_COMMAND,
  registerChapterChangeSetEventing,
} from './chapter-change-set.eventing'

afterAll(() => sql.end())

describe('chapter change set eventing', () => {
  const runtime = createRuntime()
  beforeEach(resetTestDatabase)

  it('drafts, reviews, and applies only explicitly approved items', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(DRAFT_CHANGE_SET_COMMAND, draftPayload()))
    await runtime.commands.dispatch(command(CHANGE_CHANGE_SET_ITEM_COMMAND, { id: 'item-draft', status: 'approved' }, 'approve-draft'))
    await runtime.commands.dispatch(command(CHANGE_CHANGE_SET_ITEM_COMMAND, { id: 'item-fact', status: 'rejected' }, 'reject-fact'))
    await runtime.commands.dispatch(command(CHANGE_CHANGE_SET_COMMAND, { status: 'approved' }, 'approve-set'))
    await runtime.commands.dispatch(command(CHANGE_CHANGE_SET_ITEM_COMMAND, { id: 'item-draft', status: 'applied' }, 'apply-draft'))
    await runtime.commands.dispatch(command(CHANGE_CHANGE_SET_COMMAND, { status: 'applied', appliedAt: '2026-08-12T00:00:00.000Z' }, 'apply-set'))

    await expect(db.select().from(chapterChangeSets)).resolves.toMatchObject([{ id: 'change-set-1', status: 'applied' }])
    await expect(db.select().from(chapterChangeSetItems)).resolves.toEqual(expect.arrayContaining([
      { id: 'item-draft', status: 'applied' },
      { id: 'item-fact', status: 'rejected' },
    ].map(expected => expect.objectContaining(expected))))
  })

  it('rejects item application unless the item was approved', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(DRAFT_CHANGE_SET_COMMAND, draftPayload()))

    await expect(runtime.commands.dispatch(command(CHANGE_CHANGE_SET_ITEM_COMMAND, {
      id: 'item-draft',
      status: 'applied',
    }, 'apply-pending'))).rejects.toMatchObject({ code: 'CHANGE_SET_ITEM_NOT_APPROVED' })
  })

  it('validates chapter ownership and replays the full projection', async () => {
    await seed(runtime.commands)
    await expect(runtime.commands.dispatch(command(DRAFT_CHANGE_SET_COMMAND, {
      ...draftPayload(),
      chapterId: 'missing',
    }, 'foreign-chapter'))).rejects.toMatchObject({ code: 'CHAPTER_NOT_FOUND' })
    await runtime.commands.dispatch(command(DRAFT_CHANGE_SET_COMMAND, draftPayload()))
    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(CHANGE_SET_PROJECTION, { projectId: 'project-1' })
    await expect(db.select().from(chapterChangeSets)).resolves.toHaveLength(1)
    await expect(db.select().from(chapterChangeSetItems)).resolves.toHaveLength(2)
  })
})

function createRuntime() {
  const store = new EventStore()
  const events = new EventRegistry()
  const projections = new ProjectionRegistry(events)
  const commands = new CommandBus(store, projections, events)
  const aggregates = new AggregateRepository(store, events)
  registerProjectEventing({ aggregates, commands, events, projections })
  registerChapterEventing({ aggregates, commands, events, projections })
  registerChapterChangeSetEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seed(commands: CommandBus) {
  await commands.dispatch({ commandId: 'project', commandType: CREATE_PROJECT_COMMAND, aggregateType: 'Project', aggregateId: 'project-1', projectId: 'project-1', correlationId: 'project', payload: { title: '项目' } })
  await commands.dispatch({ commandId: 'chapter', commandType: CREATE_CHAPTER_COMMAND, aggregateType: 'Chapter', aggregateId: 'chapter-1', projectId: 'project-1', correlationId: 'chapter', payload: { title: '归港', chapterNumber: 1 } })
}

function draftPayload(): JsonObject {
  return {
    chapterId: 'chapter-1',
    riskLevel: 'low',
    riskSummary: '低风险',
    draftContent: '新的正文',
    consistencyReportJson: { overallStatus: 'pass', issues: [] },
    extractedChangesJson: {},
    items: [
      { id: 'item-draft', itemType: 'draft', riskLevel: 'low', title: '正文', payloadJson: { content: '新的正文' } },
      { id: 'item-fact', itemType: 'fact_create', riskLevel: 'low', title: '事实', payloadJson: { subjectName: '甲' } },
    ],
  }
}

function command(commandType: string, payload: JsonObject, commandId = 'draft'): CommandEnvelope {
  return { commandId, commandType, aggregateType: CHANGE_SET_AGGREGATE_TYPE, aggregateId: 'change-set-1', projectId: 'project-1', correlationId: commandId, payload }
}
