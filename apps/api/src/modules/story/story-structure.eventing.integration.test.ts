import type { CommandEnvelope, JsonObject } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import {
  acts,
  chapters,
  projectAppliedTemplates,
  storyBibles,
  storyStructureTemplates,
  volumes,
} from '../../db/schema'
import {
  AggregateRepository,
  CommandBus,
  EventRegistry,
  EventStore,
  ProjectionRegistry,
  ProjectionReplay,
} from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import {
  CREATE_PROJECT_COMMAND,
  registerProjectEventing,
} from '../project/project.eventing'
import {
  APPLY_STRUCTURE_TEMPLATE_COMMAND,
  CHANGE_ACT_COMMAND,
  CHANGE_STORY_BIBLE_COMMAND,
  CHANGE_VOLUME_COMMAND,
  CREATE_ACT_COMMAND,
  CREATE_STORY_BIBLE_COMMAND,
  CREATE_VOLUME_COMMAND,
  DELETE_ACT_COMMAND,
  DELETE_VOLUME_COMMAND,
  registerStoryStructureEventing,
  STORY_STRUCTURE_AGGREGATE_TYPE,
  STORY_STRUCTURE_PROJECTION,
} from './story-structure.eventing'

afterAll(() => sql.end())

describe('story structure eventing', () => {
  const runtime = createRuntime()

  beforeEach(resetTestDatabase)

  it('creates and changes a story bible through one project stream', async () => {
    await createProject(runtime.commands, 'project-1')

    await expect(runtime.commands.dispatch(structureCommand(
      CREATE_STORY_BIBLE_COMMAND,
      { id: 'bible-1', worldview: '群岛世界', theme: '选择' },
    ))).resolves.toMatchObject({ id: 'bible-1', projectId: 'project-1', worldview: '群岛世界' })
    await expect(runtime.commands.dispatch(structureCommand(
      CHANGE_STORY_BIBLE_COMMAND,
      { worldview: '雾海群岛', mainConflict: '秩序与自由' },
      'command-change-bible',
    ))).resolves.toMatchObject({
      id: 'bible-1',
      worldview: '雾海群岛',
      mainConflict: '秩序与自由',
      theme: '选择',
    })

    expect((await runtime.store.loadStream(structureStream())).map(event => event.eventType))
      .toEqual(['StoryBibleChanged', 'StoryBibleChanged'])
    await expect(readStoryBible('project-1')).resolves.toMatchObject({
      id: 'bible-1',
      worldview: '雾海群岛',
      mainConflict: '秩序与自由',
    })
  })

  it('creates, changes, and deletes volumes and acts while enforcing ownership', async () => {
    await createProject(runtime.commands, 'project-1')
    await runtime.commands.dispatch(structureCommand(CREATE_VOLUME_COMMAND, {
      id: 'volume-1',
      title: '潮汐卷',
      orderIndex: 1,
    }))
    await runtime.commands.dispatch(structureCommand(CREATE_ACT_COMMAND, {
      id: 'act-1',
      volumeId: 'volume-1',
      title: '离港',
      orderIndex: 1,
    }, 'command-create-act'))

    await expect(runtime.commands.dispatch(structureCommand(CHANGE_VOLUME_COMMAND, {
      id: 'volume-1',
      summary: '修订后的卷摘要',
    }, 'command-change-volume'))).resolves.toMatchObject({ title: '潮汐卷', summary: '修订后的卷摘要' })
    await expect(runtime.commands.dispatch(structureCommand(CHANGE_ACT_COMMAND, {
      id: 'act-1',
      theme: '告别',
    }, 'command-change-act'))).resolves.toMatchObject({ title: '离港', theme: '告别' })
    await expect(runtime.commands.dispatch(structureCommand(CREATE_ACT_COMMAND, {
      id: 'act-invalid',
      volumeId: 'volume-missing',
      title: '错误幕',
      orderIndex: 2,
    }, 'command-invalid-act'))).rejects.toMatchObject({ code: 'VOLUME_NOT_FOUND' })

    await runtime.commands.dispatch(structureCommand(
      DELETE_VOLUME_COMMAND,
      { id: 'volume-1' },
      'command-delete-volume',
    ))
    await expect(readVolume('project-1', 'volume-1')).resolves.toBeUndefined()
    await expect(readAct('project-1', 'act-1')).resolves.toMatchObject({ volumeId: null })

    await runtime.commands.dispatch(structureCommand(
      DELETE_ACT_COMMAND,
      { id: 'act-1' },
      'command-delete-act',
    ))
    await expect(readAct('project-1', 'act-1')).resolves.toBeUndefined()
  })

  it('applies a template atomically and records its provenance', async () => {
    await createProject(runtime.commands, 'project-1')
    await db.insert(storyStructureTemplates).values({
      id: 'template-1',
      name: '三幕式',
      structureType: 'three_act',
      actsJson: JSON.stringify([
        { title: '建立', description: '建立世界', theme: '日常', targetChapterCount: 5, keyEvents: ['启程'] },
        { title: '对抗', description: '矛盾升级', theme: '代价', targetChapterCount: 8, keyEvents: ['失去'] },
      ]),
    })

    const result = await runtime.commands.dispatch(structureCommand(
      APPLY_STRUCTURE_TEMPLATE_COMMAND,
      { templateId: 'template-1', volumeId: 'volume-template', actIds: ['act-template-1', 'act-template-2'] },
      'command-apply-template',
    ))

    expect(result).toEqual({ actIds: ['act-template-1', 'act-template-2'] })
    expect((await runtime.store.loadStream(structureStream())).map(event => event.eventType))
      .toEqual(['VolumeCreated', 'ActCreated', 'ActCreated', 'StructureTemplateApplied'])
    await expect(readVolume('project-1', 'volume-template')).resolves.toMatchObject({ title: '第一卷' })
    await expect(db
      .select()
      .from(acts)
      .where(eq(acts.projectId, 'project-1')))
      .resolves
      .toHaveLength(2)
    await expect(db
      .select()
      .from(projectAppliedTemplates)
      .where(eq(projectAppliedTemplates.projectId, 'project-1')))
      .resolves
      .toMatchObject([{ templateId: 'template-1', status: 'applied' }])
  })

  it('replays one project without changing another project structure', async () => {
    await createProject(runtime.commands, 'project-1')
    await createProject(runtime.commands, 'project-2')
    await runtime.commands.dispatch(structureCommand(CREATE_VOLUME_COMMAND, {
      id: 'volume-1',
      title: '项目一',
      orderIndex: 1,
    }))
    await runtime.commands.dispatch(structureCommand(CREATE_VOLUME_COMMAND, {
      id: 'volume-2',
      title: '项目二',
      orderIndex: 1,
    }, 'command-project-2', 'project-2'))
    await db.insert(chapters).values({
      id: 'chapter-1',
      projectId: 'project-1',
      volumeId: 'volume-1',
      title: '不应被结构回放删除',
      chapterNumber: 1,
    })
    const projectTwoBefore = await readVolume('project-2', 'volume-2')
    await db.delete(volumes).where(eq(volumes.projectId, 'project-1'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(STORY_STRUCTURE_PROJECTION, { projectId: 'project-1' })

    await expect(readVolume('project-1', 'volume-1')).resolves.toMatchObject({ title: '项目一' })
    await expect(readVolume('project-2', 'volume-2')).resolves.toEqual(projectTwoBefore)
    await expect(readChapter('project-1', 'chapter-1')).resolves.toMatchObject({
      title: '不应被结构回放删除',
      volumeId: null,
    })
  })
})

function createRuntime() {
  const store = new EventStore()
  const events = new EventRegistry()
  const projections = new ProjectionRegistry(events)
  const commands = new CommandBus(store, projections, events)
  const aggregates = new AggregateRepository(store, events)
  registerProjectEventing({ aggregates, commands, events, projections })
  registerStoryStructureEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function createProject(commands: CommandBus, projectId: string): Promise<void> {
  await commands.dispatch({
    commandId: `command-create-${projectId}`,
    commandType: CREATE_PROJECT_COMMAND,
    aggregateType: 'Project',
    aggregateId: projectId,
    projectId,
    correlationId: `command-create-${projectId}`,
    payload: { title: `项目 ${projectId}` },
  })
}

function structureCommand(
  commandType: string,
  payload: JsonObject,
  commandId = 'command-structure',
  projectId = 'project-1',
): CommandEnvelope {
  return {
    commandId,
    commandType,
    aggregateType: STORY_STRUCTURE_AGGREGATE_TYPE,
    aggregateId: projectId,
    projectId,
    correlationId: commandId,
    payload,
  }
}

function structureStream(projectId = 'project-1') {
  return { aggregateType: STORY_STRUCTURE_AGGREGATE_TYPE, aggregateId: projectId, projectId }
}

async function readStoryBible(projectId: string) {
  const [row] = await db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId)).limit(1)
  return row
}

async function readVolume(projectId: string, id: string) {
  const [row] = await db.select().from(volumes).where(and(eq(volumes.projectId, projectId), eq(volumes.id, id))).limit(1)
  return row
}

async function readAct(projectId: string, id: string) {
  const [row] = await db.select().from(acts).where(and(eq(acts.projectId, projectId), eq(acts.id, id))).limit(1)
  return row
}

async function readChapter(projectId: string, id: string) {
  const [row] = await db.select().from(chapters).where(and(
    eq(chapters.projectId, projectId),
    eq(chapters.id, id),
  )).limit(1)
  return row
}
