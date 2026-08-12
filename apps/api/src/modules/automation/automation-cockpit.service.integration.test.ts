import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, sql } from '../../db'
import {
  autonomousRunExceptions,
  autonomousRunJobs,
  autonomousWritingRuns,
  chapterChangeSetItems,
  chapterChangeSets,
  chapterMemories,
  chapters,
  chapterScenes,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  novelProjects,
  projectHealthReports,
  writingJobs,
  writingJobSteps,
} from '../../db/schema'
import { resetTestDatabase } from '../../test/database'
import { AutomationCockpitService } from './automation-cockpit.service'

const cockpitMocks = vi.hoisted(() => ({
  autoPlanScenesForChapter: vi.fn(),
  createAutonomousRun: vi.fn(),
  startAutonomousRun: vi.fn(),
  buildGlobalNarrativeControl: vi.fn(),
}))

vi.mock('../ai/narrative-control.service', () => ({
  buildGlobalNarrativeControl: cockpitMocks.buildGlobalNarrativeControl,
}))

vi.mock('./auto-repair.service', () => ({
  autoPlanScenesForChapter: cockpitMocks.autoPlanScenesForChapter,
}))

vi.mock('./autonomous-writing.service', () => ({
  createAutonomousRun: cockpitMocks.createAutonomousRun,
  startAutonomousRun: cockpitMocks.startAutonomousRun,
}))

afterAll(() => sql.end())

describe('automation cockpit read model', () => {
  beforeEach(async () => {
    await resetTestDatabase()
    cockpitMocks.autoPlanScenesForChapter.mockReset().mockResolvedValue({ success: true })
    cockpitMocks.createAutonomousRun.mockReset().mockResolvedValue({ id: 'repair-run' })
    cockpitMocks.startAutonomousRun.mockReset().mockResolvedValue(undefined)
    cockpitMocks.buildGlobalNarrativeControl.mockReset().mockResolvedValue({
      themeGuardrails: ['主题不得偏离记忆与选择'],
      plotDirection: ['下一章目标：找到失踪船员', '下一章关键事件：旧灯塔重新亮起'],
      characterGuardrails: ['林岚不能主动泄露秘密'],
      relationshipGuardrails: ['林岚 ↔ 周砚：互相试探'],
      conflictGuardrails: ['港口封锁继续升级'],
      foreshadowingGuardrails: ['保留旧钥匙'],
      healthWarnings: ['plot: medium 风险'],
    })
  })

  it('assembles the latest run, chapter pipeline, narrative state, health risks, events, and exceptions', async () => {
    await seedCockpitProject()

    const cockpit = await AutomationCockpitService.getCockpitData('project-1')

    expect(cockpit.project).toMatchObject({ title: '雾港', currentWordCount: 8, targetWordCount: 120000 })
    expect(cockpit.run).toMatchObject({ id: 'run-1', status: 'running', currentChapterId: 'chapter-1' })
    expect(cockpit.chapters).toEqual([
      expect.objectContaining({ id: 'chapter-1', status: 'running', wordCount: 8, steps: [expect.objectContaining({ label: '构建上下文', status: 'failed', error: '模型超时' })] }),
      expect.objectContaining({ id: 'chapter-2', status: 'pending', wordCount: 0, steps: [] }),
    ])
    expect(cockpit.characters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '林岚', emotion: '平静', confidence: 0.85 }),
    ]))
    expect(cockpit.relationships).toEqual([
      expect.objectContaining({ sourceName: '林岚', targetName: '周砚', trust: 8, conflict: 2 }),
    ])
    expect(cockpit.conflicts).toEqual([expect.objectContaining({ title: '港口封锁', intensity: 8 })])
    expect(cockpit.foreshadowing).toEqual([expect.objectContaining({ title: '旧钥匙', status: 'open' })])
    expect(cockpit.plotDirection).toMatchObject({
      themeProgress: '主人公开始质疑自己的记忆',
      nextChapterGoal: '找到失踪船员',
      nextChapterEvents: '旧灯塔重新亮起',
    })
    expect(cockpit.health).toMatchObject({ overallScore: 68, riskCount: 2 })
    expect(cockpit.health.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ chapterId: 'chapter-2', fixAction: 'auto_plan_scenes' }),
      expect.objectContaining({ chapterId: 'chapter-1', fixAction: 'autonomous_chapter_repair' }),
      expect.objectContaining({ chapterId: 'chapter-2', scope: '关系异常' }),
    ]))
    expect(cockpit.events).toHaveLength(9)
    expect(cockpit.events.map(event => event.status)).toEqual(expect.arrayContaining([
      'auto_applied',
      'approved',
      'pending_review',
      'isolated',
      'failed',
      'ignored',
    ]))
    expect(cockpit.events.map(event => event.title)).toEqual(expect.arrayContaining([
      '新增角色',
      '更新角色',
      '新增关系',
      '关系更新',
      '发现冲突',
      '冲突演变',
      '埋下伏笔',
      '回收伏笔',
      'draft',
    ]))
    expect(cockpit.events.every(event => event.sourceChapterNumber === 1)).toBe(true)
    expect(cockpit.exceptions).toEqual([expect.objectContaining({ id: 'exception-1', status: 'open' })])
  })

  it('returns chapter details with normalized scene display values and respects project scope', async () => {
    await db.insert(novelProjects).values({ id: 'project-1', title: '雾港' })
    await db.insert(chapters).values({
      id: 'chapter-1',
      projectId: 'project-1',
      chapterNumber: 1,
      title: '归港',
      draft: '正文',
      outline: '大纲',
      summary: '摘要',
    })
    await db.insert(chapterScenes).values([
      { id: 'scene-1', projectId: 'project-1', chapterId: 'chapter-1', sceneNumber: 1, orderIndex: 1, status: 'completed', purpose: '建立悬念', content: '雾中来船' },
      { id: 'scene-2', projectId: 'project-1', chapterId: 'chapter-1', sceneNumber: 2, orderIndex: 2, status: 'planned', summary: '进入旧港' },
    ])

    await expect(AutomationCockpitService.getCockpitChapterDetail('project-1', 'chapter-1')).resolves.toEqual({
      id: 'chapter-1',
      chapterNumber: 1,
      title: '归港',
      content: '正文',
      summary: '摘要',
      notes: '大纲',
      scenes: [
        expect.objectContaining({ id: 'scene-1', title: '未命名场景', summary: '建立悬念', status: 'completed' }),
        expect.objectContaining({ id: 'scene-2', title: '未命名场景', summary: '进入旧港', status: 'pending' }),
      ],
    })
    await expect(AutomationCockpitService.getCockpitChapterDetail('other-project', 'chapter-1')).resolves.toBeNull()
    await expect(AutomationCockpitService.getCockpitData('missing-project')).rejects.toThrow('Project not found')
  })

  it('routes scene risks to planning and other chapter risks to an autonomous repair run', async () => {
    await db.insert(novelProjects).values({ id: 'project-1', title: '雾港' })
    await db.insert(chapters).values({
      id: 'chapter-1',
      projectId: 'project-1',
      chapterNumber: 1,
      title: '归港',
      draft: 'x'.repeat(6000),
    })

    await expect(AutomationCockpitService.repairHealthRisk('project-1', {
      riskId: 'scene:chapter-1:missing',
      riskType: 'scene',
    })).resolves.toMatchObject({ action: 'auto_plan_scenes', chapterId: 'chapter-1' })
    expect(cockpitMocks.autoPlanScenesForChapter).toHaveBeenCalledWith('project-1', 'chapter-1')

    await expect(AutomationCockpitService.repairHealthRisk('project-1', {
      riskId: 'character-risk',
      riskType: 'character',
      chapterId: 'chapter-1',
    })).resolves.toMatchObject({ action: 'autonomous_chapter_repair', chapterId: 'chapter-1', runId: 'repair-run' })
    expect(cockpitMocks.createAutonomousRun).toHaveBeenCalledWith('project-1', expect.objectContaining({
      strategy: 'safe',
      scopeType: 'rewrite_selected',
      targetWordsPerChapter: 5000,
    }))
    expect(cockpitMocks.startAutonomousRun).toHaveBeenCalledWith('project-1', 'repair-run')

    await expect(AutomationCockpitService.repairHealthRisk('project-1', {
      riskId: 'no-chapter',
      riskType: 'plot',
    })).rejects.toThrow('缺少章节定位')
    await expect(AutomationCockpitService.repairHealthRisk('project-1', {
      riskId: 'scene:missing-chapter:anything',
      riskType: 'scene',
    })).rejects.toThrow('未找到该项目下的风险章节')
  })
})

async function seedCockpitProject() {
  await db.insert(novelProjects).values({
    id: 'project-1',
    title: '雾港',
    genre: '悬疑',
    theme: '记忆与选择',
    targetWords: 120000,
  })
  await db.insert(chapters).values([
    { id: 'chapter-1', projectId: 'project-1', chapterNumber: 1, title: '归港', draft: '八个字的正文内容', status: 'completed' },
    { id: 'chapter-2', projectId: 'project-1', chapterNumber: 2, title: '灯塔', status: 'planning' },
  ])
  await db.insert(writingJobs).values({
    id: 'job-1',
    projectId: 'project-1',
    currentChapterId: 'chapter-1',
    mode: 'outline_then_draft',
    status: 'running',
    autonomousRunId: 'run-1',
  })
  await db.insert(autonomousWritingRuns).values({
    id: 'run-1',
    projectId: 'project-1',
    status: 'running',
    strategy: 'balanced',
    scopeType: 'next_n_chapters',
    targetChapterCount: 2,
    currentChapterId: 'chapter-1',
    completedChapterCount: 1,
  })
  await db.insert(autonomousRunJobs).values({
    id: 'run-job-1',
    runId: 'run-1',
    projectId: 'project-1',
    writingJobId: 'job-1',
    chapterId: 'chapter-1',
    status: 'running',
    orderIndex: 1,
  })
  await db.insert(writingJobSteps).values({
    id: 'step-1',
    jobId: 'job-1',
    stepType: 'prepare_context',
    status: 'failed',
    error: '模型超时',
  })
  await db.insert(characters).values([
    { id: 'character-1', projectId: 'project-1', name: '林岚', role: 'protagonist', goal: '找回记忆' },
    { id: 'character-2', projectId: 'project-1', name: '周砚', role: 'ally' },
  ])
  await db.insert(characterRelationships).values({
    id: 'relationship-1',
    projectId: 'project-1',
    characterAId: 'character-1',
    characterBId: 'character-2',
    type: '盟友',
    strength: 7,
    status: 'stable',
    description: '互相试探',
  })
  await db.insert(conflicts).values({
    id: 'conflict-1',
    projectId: 'project-1',
    title: '港口封锁',
    type: 'external',
    intensity: 8,
    status: 'escalating',
    participants: '林岚,周砚',
  })
  await db.insert(foreshadowingItems).values({
    id: 'foreshadowing-1',
    projectId: 'project-1',
    title: '旧钥匙',
    status: 'open',
    importance: 'major',
    setupChapterId: 'chapter-1',
  })
  await db.insert(chapterMemories).values({
    id: 'memory-1',
    projectId: 'project-1',
    chapterId: 'chapter-1',
    themeProgress: '主人公开始质疑自己的记忆',
  })
  await db.insert(projectHealthReports).values({
    id: 'health-1',
    projectId: 'project-1',
    scope: 'overall',
    score: 68,
    riskLevel: 'medium',
    metricsJson: {
      topRisks: [
        { id: 'scene:chapter-2:empty', type: 'scene', severity: 'high', title: '场景为空' },
        { id: 'character:chapter-1:ooc', type: 'character', chapterId: 'chapter-1', severity: 'medium', title: '人物偏离' },
        { id: 'relationship-risk', type: 'relationship', severity: 'low', title: '关系证据偏少', targetRoute: '/project/project-1/cockpit?chapter=chapter-2' },
      ],
    },
  })
  await db.insert(chapterChangeSets).values({
    id: 'change-set-1',
    projectId: 'project-1',
    chapterId: 'chapter-1',
    status: 'reviewing',
    extractedChangesJson: {},
  })

  const itemInputs = [
    ['character_create', 'applied', { name: '沈渡', role: '船长' }],
    ['character_update', 'approved', { name: '林岚', emotion: '恐惧', goal: '逃离' }],
    ['relationship_create', 'pending', { characterAName: '林岚', characterBName: '周砚', type: '盟友' }],
    ['relationship_update', 'blocked', { sourceName: '林岚', targetName: '周砚', status: '决裂', strength: 2 }],
    ['conflict_create', 'apply_failed', { title: '港口封锁', type: 'external', intensity: 8 }],
    ['conflict_update', 'rejected', { title: '港口封锁', newStatus: 'exploding', newIntensity: 10 }],
    ['foreshadowing_create', 'applied', { title: '旧钥匙', description: '打不开的仓库' }],
    ['foreshadowing_payoff', 'approved', { title: '旧钥匙', notes: '打开灯塔底层' }],
    ['draft', 'pending', 'non-object-payload'],
  ] as const
  await db.insert(chapterChangeSetItems).values(itemInputs.map(([itemType, status, payloadJson], index) => ({
    id: `item-${index + 1}`,
    changeSetId: 'change-set-1',
    projectId: 'project-1',
    chapterId: 'chapter-1',
    itemType,
    riskLevel: index % 3 === 0 ? 'low' as const : index % 3 === 1 ? 'medium' as const : 'high' as const,
    title: `事件 ${index + 1}`,
    payloadJson,
    status,
  })))
  await db.insert(autonomousRunExceptions).values({
    id: 'exception-1',
    runId: 'run-1',
    projectId: 'project-1',
    chapterId: 'chapter-1',
    writingJobId: 'job-1',
    stepId: 'step-1',
    exceptionType: 'ai_failed',
    severity: 'high',
    title: '模型超时',
    status: 'open',
  })
}
