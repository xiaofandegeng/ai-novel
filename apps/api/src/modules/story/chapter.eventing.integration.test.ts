import type { CommandEnvelope, JsonObject } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { chapters, chapterScenes } from '../../db/schema'
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
  CHANGE_CHAPTER_COMMAND,
  CHANGE_SCENE_COMMAND,
  CHAPTER_AGGREGATE_TYPE,
  CHAPTER_PROJECTION,
  CREATE_CHAPTER_COMMAND,
  DELETE_CHAPTER_COMMAND,
  DELETE_SCENE_COMMAND,
  PLAN_SCENES_COMMAND,
  registerChapterEventing,
  REORDER_SCENES_COMMAND,
} from './chapter.eventing'
import {
  CREATE_VOLUME_COMMAND,
  registerStoryStructureEventing,
  STORY_STRUCTURE_AGGREGATE_TYPE,
} from './story-structure.eventing'

afterAll(() => sql.end())

describe('chapter eventing', () => {
  const runtime = createRuntime()

  beforeEach(resetTestDatabase)

  it('creates a chapter and projects the current aggregate state', async () => {
    await createProject(runtime.commands, 'project-1')
    await createVolume(runtime.commands, 'project-1', 'volume-1')

    const result = await runtime.commands.dispatch(chapterCommand(CREATE_CHAPTER_COMMAND, {
      title: '归港',
      chapterNumber: 1,
      volumeId: 'volume-1',
      outline: '调查员回到雾港',
    }))

    expect(result).toMatchObject({
      id: 'chapter-1',
      projectId: 'project-1',
      title: '归港',
      status: 'not_started',
    })
    await expect(runtime.store.loadStream(chapterStream())).resolves.toMatchObject([
      { eventType: 'ChapterCreated', aggregateVersion: 1, projectId: 'project-1' },
    ])
    await expect(readChapter('project-1', 'chapter-1')).resolves.toMatchObject({
      title: '归港',
      outline: '调查员回到雾港',
    })
  })

  it('emits explicit rename, outline, content, details, and completion events', async () => {
    await createProject(runtime.commands, 'project-1')
    await runtime.commands.dispatch(chapterCommand(CREATE_CHAPTER_COMMAND, {
      title: '旧标题',
      chapterNumber: 1,
    }))

    const result = await runtime.commands.dispatch(chapterCommand(CHANGE_CHAPTER_COMMAND, {
      title: '新标题',
      outline: '新大纲',
      draft: '雾从海面漫上石阶。',
      summary: '返航后发现异样',
      status: 'completed',
    }, 'command-change-chapter'))

    expect(result).toMatchObject({
      title: '新标题',
      outline: '新大纲',
      draft: '雾从海面漫上石阶。',
      summary: '返航后发现异样',
      status: 'completed',
    })
    expect((await runtime.store.loadStream(chapterStream())).map(event => event.eventType))
      .toEqual([
        'ChapterCreated',
        'ChapterRenamed',
        'OutlineChanged',
        'ChapterDetailsChanged',
        'ChapterContentApplied',
        'ChapterCompleted',
      ])
  })

  it('rejects missing volumes and duplicate chapter numbers in one volume', async () => {
    await createProject(runtime.commands, 'project-1')
    await createVolume(runtime.commands, 'project-1', 'volume-1')
    await runtime.commands.dispatch(chapterCommand(CREATE_CHAPTER_COMMAND, {
      title: '第一章',
      chapterNumber: 1,
      volumeId: 'volume-1',
    }))

    await expect(runtime.commands.dispatch(chapterCommand(CREATE_CHAPTER_COMMAND, {
      title: '重复章节',
      chapterNumber: 1,
      volumeId: 'volume-1',
    }, 'command-duplicate', 'chapter-2'))).rejects.toMatchObject({ code: 'CHAPTER_NUMBER_CONFLICT' })
    await expect(runtime.commands.dispatch(chapterCommand(CREATE_CHAPTER_COMMAND, {
      title: '错误卷',
      chapterNumber: 2,
      volumeId: 'volume-missing',
    }, 'command-missing-volume', 'chapter-3'))).rejects.toMatchObject({ code: 'VOLUME_NOT_FOUND' })
  })

  it('deletes a chapter through an event and rejects subsequent changes', async () => {
    await createProject(runtime.commands, 'project-1')
    await runtime.commands.dispatch(chapterCommand(CREATE_CHAPTER_COMMAND, {
      title: '待删除',
      chapterNumber: 1,
    }))

    await expect(runtime.commands.dispatch(chapterCommand(
      DELETE_CHAPTER_COMMAND,
      {},
      'command-delete-chapter',
    ))).resolves.toMatchObject({ id: 'chapter-1', title: '待删除' })
    await expect(readChapter('project-1', 'chapter-1')).resolves.toBeUndefined()
    await expect(runtime.commands.dispatch(chapterCommand(
      CHANGE_CHAPTER_COMMAND,
      { title: '不能修改' },
      'command-change-deleted',
    ))).rejects.toMatchObject({ code: 'CHAPTER_NOT_FOUND' })
  })

  it('replays one project without changing another project chapter', async () => {
    await createProject(runtime.commands, 'project-1')
    await createProject(runtime.commands, 'project-2')
    await runtime.commands.dispatch(chapterCommand(CREATE_CHAPTER_COMMAND, {
      title: '项目一章节',
      chapterNumber: 1,
    }))
    await runtime.commands.dispatch(chapterCommand(CREATE_CHAPTER_COMMAND, {
      title: '项目二章节',
      chapterNumber: 1,
    }, 'command-project-2', 'chapter-2', 'project-2'))
    const otherBefore = await readChapter('project-2', 'chapter-2')
    await db.delete(chapters).where(eq(chapters.projectId, 'project-1'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(CHAPTER_PROJECTION, { projectId: 'project-1' })

    await expect(readChapter('project-1', 'chapter-1')).resolves.toMatchObject({ title: '项目一章节' })
    await expect(readChapter('project-2', 'chapter-2')).resolves.toEqual(otherBefore)
  })

  it('plans and changes scene content inside the chapter stream', async () => {
    await createProject(runtime.commands, 'project-1')
    await createChapter(runtime.commands, 'project-1', 'chapter-1')

    await expect(runtime.commands.dispatch(chapterCommand(PLAN_SCENES_COMMAND, {
      mode: 'append',
      scenes: [{
        id: 'scene-1',
        sceneNumber: 1,
        title: '码头',
        purpose: '发现异常',
        orderIndex: 1,
      }],
    }, 'command-plan-scene'))).resolves.toMatchObject({
      scenes: [{ id: 'scene-1', chapterId: 'chapter-1', status: 'planned' }],
    })
    await expect(runtime.commands.dispatch(chapterCommand(CHANGE_SCENE_COMMAND, {
      id: 'scene-1',
      content: '码头空无一人。',
      status: 'completed',
    }, 'command-change-scene'))).resolves.toMatchObject({
      id: 'scene-1',
      content: '码头空无一人。',
      status: 'completed',
    })

    expect((await runtime.store.loadStream(chapterStream())).map(event => event.eventType))
      .toEqual(['ChapterCreated', 'ScenePlanned', 'SceneChanged', 'SceneContentApplied'])
    await expect(readScene('project-1', 'chapter-1', 'scene-1')).resolves.toMatchObject({
      content: '码头空无一人。',
      status: 'completed',
    })
    const expected = await readScene('project-1', 'chapter-1', 'scene-1')
    await db.delete(chapterScenes).where(eq(chapterScenes.projectId, 'project-1'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(CHAPTER_PROJECTION, { projectId: 'project-1' })

    await expect(readScene('project-1', 'chapter-1', 'scene-1')).resolves.toEqual(expected)
  })

  it('reorders scenes and replaces the plan atomically', async () => {
    await createProject(runtime.commands, 'project-1')
    await createChapter(runtime.commands, 'project-1', 'chapter-1')
    await runtime.commands.dispatch(chapterCommand(PLAN_SCENES_COMMAND, {
      mode: 'append',
      scenes: [
        { id: 'scene-1', sceneNumber: 1, title: '码头', orderIndex: 1 },
        { id: 'scene-2', sceneNumber: 2, title: '灯塔', orderIndex: 2 },
      ],
    }, 'command-plan-scenes'))

    const reordered = await runtime.commands.dispatch(chapterCommand(REORDER_SCENES_COMMAND, {
      orders: [
        { id: 'scene-1', orderIndex: 2 },
        { id: 'scene-2', orderIndex: 1 },
      ],
    }, 'command-reorder-scenes'))
    expect(reordered).toMatchObject({
      scenes: [
        { id: 'scene-2', orderIndex: 1 },
        { id: 'scene-1', orderIndex: 2 },
      ],
    })

    const replaced = await runtime.commands.dispatch(chapterCommand(PLAN_SCENES_COMMAND, {
      mode: 'replace',
      scenes: [{ id: 'scene-3', sceneNumber: 1, title: '船舱', orderIndex: 1 }],
    }, 'command-replace-scenes'))
    expect(replaced).toMatchObject({ scenes: [{ id: 'scene-3' }] })
    await expect(listScenes('project-1', 'chapter-1')).resolves.toMatchObject([{ id: 'scene-3' }])
  })

  it('deletes a scene and rejects unknown scene mutations', async () => {
    await createProject(runtime.commands, 'project-1')
    await createChapter(runtime.commands, 'project-1', 'chapter-1')
    await runtime.commands.dispatch(chapterCommand(PLAN_SCENES_COMMAND, {
      scenes: [{ id: 'scene-1', sceneNumber: 1, title: '码头', orderIndex: 1 }],
    }, 'command-plan-scene'))

    await expect(runtime.commands.dispatch(chapterCommand(
      DELETE_SCENE_COMMAND,
      { id: 'scene-1' },
      'command-delete-scene',
    ))).resolves.toMatchObject({ id: 'scene-1' })
    await expect(readScene('project-1', 'chapter-1', 'scene-1')).resolves.toBeUndefined()
    await expect(runtime.commands.dispatch(chapterCommand(
      CHANGE_SCENE_COMMAND,
      { id: 'scene-missing', title: '不存在' },
      'command-missing-scene',
    ))).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' })
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
  registerChapterEventing({ aggregates, commands, events, projections })
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

async function createVolume(commands: CommandBus, projectId: string, volumeId: string): Promise<void> {
  await commands.dispatch({
    commandId: `command-create-${volumeId}`,
    commandType: CREATE_VOLUME_COMMAND,
    aggregateType: STORY_STRUCTURE_AGGREGATE_TYPE,
    aggregateId: projectId,
    projectId,
    correlationId: `command-create-${volumeId}`,
    payload: { id: volumeId, title: '第一卷', orderIndex: 1 },
  })
}

async function createChapter(commands: CommandBus, projectId: string, chapterId: string): Promise<void> {
  await commands.dispatch(chapterCommand(
    CREATE_CHAPTER_COMMAND,
    { title: '第一章', chapterNumber: 1 },
    `command-create-${chapterId}`,
    chapterId,
    projectId,
  ))
}

function chapterCommand(
  commandType: string,
  payload: JsonObject,
  commandId = 'command-chapter',
  chapterId = 'chapter-1',
  projectId = 'project-1',
): CommandEnvelope {
  return {
    commandId,
    commandType,
    aggregateType: CHAPTER_AGGREGATE_TYPE,
    aggregateId: chapterId,
    projectId,
    correlationId: commandId,
    payload,
  }
}

function chapterStream() {
  return {
    aggregateType: CHAPTER_AGGREGATE_TYPE,
    aggregateId: 'chapter-1',
    projectId: 'project-1',
  }
}

async function readChapter(projectId: string, id: string) {
  const [row] = await db.select().from(chapters).where(and(
    eq(chapters.projectId, projectId),
    eq(chapters.id, id),
  )).limit(1)
  return row
}

async function readScene(projectId: string, chapterId: string, id: string) {
  const [row] = await db.select().from(chapterScenes).where(and(
    eq(chapterScenes.projectId, projectId),
    eq(chapterScenes.chapterId, chapterId),
    eq(chapterScenes.id, id),
  )).limit(1)
  return row
}

function listScenes(projectId: string, chapterId: string) {
  return db.select().from(chapterScenes).where(and(
    eq(chapterScenes.projectId, projectId),
    eq(chapterScenes.chapterId, chapterId),
  )).orderBy(chapterScenes.orderIndex)
}
