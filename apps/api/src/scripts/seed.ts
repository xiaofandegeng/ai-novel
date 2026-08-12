import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { eq } from 'drizzle-orm'
import { db, sql } from '../db'
import {
  acts,
  autonomousRunJobs,
  autonomousWritingRuns,
  chapters,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  novelProjects,
  projectReadModels,
  promptTemplates,
  storyBibles,
  storyStructureTemplates,
  volumes,
  writingJobs,
} from '../db/schema'
import { createAutonomousRun } from '../modules/automation/autonomous-writing.service'
import { createCharacter } from '../modules/character/characters.service'
import { createRelationship } from '../modules/character/relationships.service'
import { createConflict } from '../modules/narrative/conflicts.service'
import { createForeshadowing } from '../modules/narrative/foreshadowing.service'
import { createProject, updateProject } from '../modules/project/projects.service'
import { createAct } from '../modules/story/acts.service'
import { createChapter } from '../modules/story/chapters.service'
import { createStoryBible } from '../modules/story/story-bibles.service'
import { createVolume } from '../modules/story/volumes.service'
import { now } from '../shared/utils'

const SEED_CORRELATION_ID = 'development-seed-v1'
const SEED_PROJECT_ID = 'development-seed-project-v1'
const INCOMPLETE_SEED_MESSAGE = 'Development seed is incomplete; run pnpm db:rebuild before reseeding'

export async function seedDevelopmentData() {
  const existingSeed = await readCompleteDevelopmentSeed()
  if (existingSeed) {
    await seedStaticCatalogs()
    return existingSeed
  }

  const project = await createProject({
    title: '测试小说《镜中城回声》',
    description: '用于验证事件溯源创作全链路的悬疑奇幻样例。',
    genre: '悬疑奇幻',
    theme: '记忆、身份与选择的代价',
    targetWords: 200000,
    targetAudience: '喜欢都市悬疑和长线伏笔的成年读者',
    styleProfile: '冷静克制，节奏偏快；每章以未解问题收束。',
  }, { ...command('project'), projectId: SEED_PROJECT_ID })
  const projectId = project.id

  await createStoryBible(projectId, {
    worldview: '镜中城只在雨夜出现，并收藏现实中被遗忘的人与记忆。',
    mainConflict: '林岚必须找回失踪哥哥，但每接近真相都会失去一段身份证明。',
    theme: '人是否必须记得一切，才算真实地活过。',
    rules: '镜中城不能创造记忆；任何关键真相都必须付出代价。',
    timeline: '七年前林澈失踪；现在林岚收到哥哥寄来的空白信。',
  }, command('story-bible'))

  const volume = await createVolume(projectId, {
    title: '第一卷：雨夜来信',
    summary: '林岚追随空白信进入镜中城，并发现现实开始遗忘她。',
    orderIndex: 0,
  }, command('volume-1'))

  await createAct(projectId, {
    volumeId: volume.id,
    title: '异常入口',
    description: '异常来信打破日常，主角进入镜中城。',
    theme: '相信证据还是相信记忆',
    keyEvents: '空白信、雨夜入口、失踪者名单',
    targetChapterCount: 3,
    orderIndex: 0,
  }, command('act-1'))

  const chapterInputs = [
    {
      title: '空白信',
      outline: '林岚收到没有文字的来信，却在雨水中看到哥哥的笔迹。',
      status: 'writing' as const,
    },
    {
      title: '雨夜入口',
      outline: '顾临川带林岚穿过旧照相馆的镜面入口。',
      status: 'not_started' as const,
    },
    {
      title: '失踪者名单',
      outline: '林岚在档案馆名单上看见自己的名字。',
      status: 'not_started' as const,
    },
  ]
  const chapterIds: string[] = []
  for (const [index, input] of chapterInputs.entries()) {
    const result = await createChapter(projectId, {
      ...input,
      chapterNumber: index + 1,
      volumeId: volume.id,
    }, command(`chapter-${index + 1}`))
    if (!result.row)
      throw new Error(result.error ?? `Failed to seed chapter ${index + 1}`)
    chapterIds.push(result.row.id)
  }

  const lin = await createCharacter(projectId, {
    name: '林岚',
    role: 'protagonist',
    goal: '找到哥哥并证明他真实存在。',
    fear: '所有人都忘记哥哥和她的寻找。',
    secret: '她曾主动要求删除一段关于哥哥的记忆。',
    personality: '冷静克制，遇到亲情议题时会失控。',
    arc: '从依赖外部证据，到承认自己也参与塑造真相。',
  }, command('character-lin'))
  const gu = await createCharacter(projectId, {
    name: '顾临川',
    role: 'ally',
    goal: '帮助林岚进入镜中城，同时阻止她触碰第零层。',
    secret: '他保留着林澈最后一段记忆。',
    personality: '温和谨慎，关键时刻倾向隐瞒。',
  }, command('character-gu'))
  const shen = await createCharacter(projectId, {
    name: '沈雾',
    role: 'antagonist',
    goal: '维持镜中城秩序。',
    fear: '城市失去记忆来源后崩塌。',
    personality: '优雅冷酷，把控制误认为拯救。',
  }, command('character-shen'))

  const relationship = await createRelationship(projectId, {
    characterAId: lin.id,
    characterBId: gu.id,
    type: '互相试探的同盟',
    strength: 6,
    status: '信任尚未建立',
    description: '顾临川既是引路人，也是林岚最怀疑的人。',
  }, command('relationship-lin-gu'))
  if (!relationship.row)
    throw new Error(relationship.error ?? 'Failed to seed relationship')

  await createConflict(projectId, {
    title: '身份证明危机',
    type: 'internal',
    intensity: 8,
    status: 'escalating',
    participants: '林岚、顾临川、沈雾',
    participantIds: [lin.id, gu.id, shen.id],
    description: '林岚越接近真相，现实世界越不承认她的记忆。',
  }, command('conflict-identity'))

  await createForeshadowing(projectId, {
    title: '空白信的真正寄件人',
    description: '信件笔迹属于林澈，但寄件人另有其人。',
    setupChapterId: chapterIds[0],
    expectedPayoffChapterId: chapterIds[2],
    status: 'progressing',
    importance: 'major',
    relatedCharacters: '林岚、顾临川',
    characterIds: [lin.id, gu.id],
  }, command('foreshadowing-letter'))

  const run = await createAutonomousRun(projectId, {
    strategy: 'balanced',
    scopeType: 'next_n_chapters',
    targetChapterCount: 2,
    targetWordsPerChapter: 3000,
  })
  await updateProject(projectId, { status: 'writing' }, command('project-writing'))
  await seedStaticCatalogs()

  return { projectId, runId: run.id }
}

async function readCompleteDevelopmentSeed(): Promise<{ projectId: string, runId: string } | null> {
  const [[project], [projectReadModel]] = await Promise.all([
    db.select().from(novelProjects).where(eq(novelProjects.id, SEED_PROJECT_ID)),
    db.select().from(projectReadModels).where(eq(projectReadModels.id, SEED_PROJECT_ID)),
  ])
  if (!project && !projectReadModel)
    return null
  if (!project || !projectReadModel)
    throw new Error(INCOMPLETE_SEED_MESSAGE)

  const [
    bibleRows,
    volumeRows,
    actRows,
    chapterRows,
    characterRows,
    relationshipRows,
    conflictRows,
    foreshadowingRows,
    runRows,
    runJobRows,
    writingJobRows,
  ] = await Promise.all([
    db.select().from(storyBibles).where(eq(storyBibles.projectId, SEED_PROJECT_ID)),
    db.select().from(volumes).where(eq(volumes.projectId, SEED_PROJECT_ID)),
    db.select().from(acts).where(eq(acts.projectId, SEED_PROJECT_ID)),
    db.select().from(chapters).where(eq(chapters.projectId, SEED_PROJECT_ID)),
    db.select().from(characters).where(eq(characters.projectId, SEED_PROJECT_ID)),
    db.select().from(characterRelationships).where(eq(characterRelationships.projectId, SEED_PROJECT_ID)),
    db.select().from(conflicts).where(eq(conflicts.projectId, SEED_PROJECT_ID)),
    db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, SEED_PROJECT_ID)),
    db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.projectId, SEED_PROJECT_ID)),
    db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.projectId, SEED_PROJECT_ID)),
    db.select().from(writingJobs).where(eq(writingJobs.projectId, SEED_PROJECT_ID)),
  ])

  const volume = singleRow(volumeRows)
  const act = singleRow(actRows)
  const bible = singleRow(bibleRows)
  const relationship = singleRow(relationshipRows)
  const conflict = singleRow(conflictRows)
  const foreshadowing = singleRow(foreshadowingRows)
  const run = singleRow(runRows)
  const lin = characterRows.find(row => row.name === '林岚')
  const gu = characterRows.find(row => row.name === '顾临川')
  const chapterOne = chapterRows.find(row => row.chapterNumber === 1)
  const chapterThree = chapterRows.find(row => row.chapterNumber === 3)
  const writingJobIds = new Set(writingJobRows.map(row => row.id))
  const targetChapterIds = new Set(chapterRows
    .filter(row => row.chapterNumber === 1 || row.chapterNumber === 2)
    .map(row => row.id))

  const complete = project.title === '测试小说《镜中城回声》'
    && project.description === '用于验证事件溯源创作全链路的悬疑奇幻样例。'
    && project.status === 'writing'
    && project.targetWords === 200000
    && projectReadModel.title === project.title
    && projectReadModel.description === project.description
    && projectReadModel.status === project.status
    && projectReadModel.targetWords === project.targetWords
    && bible?.worldview === '镜中城只在雨夜出现，并收藏现实中被遗忘的人与记忆。'
    && volume?.title === '第一卷：雨夜来信'
    && volume.orderIndex === 0
    && act?.title === '异常入口'
    && act.volumeId === volume.id
    && hasExactValues(chapterRows, row => `${row.chapterNumber}:${row.title}`, [
      '1:空白信',
      '2:雨夜入口',
      '3:失踪者名单',
    ])
    && chapterRows.every(row => row.volumeId === volume.id)
    && hasExactValues(characterRows, row => `${row.name}:${row.role}`, [
      '林岚:protagonist',
      '顾临川:ally',
      '沈雾:antagonist',
    ])
    && relationship !== undefined
    && lin !== undefined
    && gu !== undefined
    && samePair(
      [relationship.characterAId, relationship.characterBId],
      [lin.id, gu.id],
    )
    && relationship.type === '互相试探的同盟'
    && conflict?.title === '身份证明危机'
    && conflict.status === 'escalating'
    && foreshadowing?.title === '空白信的真正寄件人'
    && foreshadowing.setupChapterId === chapterOne?.id
    && foreshadowing.expectedPayoffChapterId === chapterThree?.id
    && run?.projectId === SEED_PROJECT_ID
    && run.status === 'idle'
    && run.strategy === 'balanced'
    && run.scopeType === 'next_n_chapters'
    && run.targetChapterCount === 2
    && run.targetWordsPerChapter === 3000
    && runJobRows.length === 2
    && runJobRows.every(row => (
      row.runId === run.id
      && row.projectId === SEED_PROJECT_ID
      && row.status === 'pending'
      && writingJobIds.has(row.writingJobId)
      && row.chapterId !== null
      && targetChapterIds.has(row.chapterId)
    ))
    && writingJobRows.length === 2
    && writingJobRows.every(row => (
      row.projectId === SEED_PROJECT_ID
      && row.autonomousRunId === run.id
      && row.status === 'idle'
      && row.mode === 'outline_then_draft'
      && row.currentChapterId !== null
      && targetChapterIds.has(row.currentChapterId)
    ))

  if (!complete)
    throw new Error(INCOMPLETE_SEED_MESSAGE)
  return { projectId: project.id, runId: run.id }
}

function singleRow<TRow>(rows: readonly TRow[]): TRow | undefined {
  return rows.length === 1 ? rows[0] : undefined
}

function hasExactValues<TRow>(
  rows: readonly TRow[],
  value: (row: TRow) => string,
  expected: readonly string[],
): boolean {
  if (rows.length !== expected.length)
    return false
  const actual = new Set(rows.map(value))
  return expected.every(item => actual.has(item))
}

function samePair(left: readonly [string, string], right: readonly [string, string]): boolean {
  return left.includes(right[0]) && left.includes(right[1])
}

async function seedStaticCatalogs() {
  const timestamp = now()
  await db.insert(promptTemplates).values([
    {
      id: 'builtin-draft-generate-v1',
      key: 'draft_generate',
      name: '正文生成',
      description: '根据场景大纲和上下文生成小说正文',
      version: '1.0.0',
      systemPrompt: '你是一位长篇小说写作助手，输出内容必须由作者审阅后应用。',
      userPromptTemplate: '生成章节《{{chapterTitle}}》的正文。\n情节：{{outline}}\n上下文：{{context}}',
      outputSchema: JSON.stringify({ type: 'string' }),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]).onConflictDoNothing()
  await db.insert(storyStructureTemplates).values([
    {
      id: 'builtin-suspense-five-act-v1',
      name: '悬疑钩子流',
      description: '高压、多反转、强钩子的悬疑叙事结构。',
      genre: '悬疑',
      structureType: 'five_act',
      actsJson: JSON.stringify(['悬念引入', '线索升级', '身份危机', '最终对决', '余韵反转']),
      beatsJson: JSON.stringify(['异常物件', '验证失败', '代价显现']),
      chapterCountEstimate: 30,
      isBuiltin: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]).onConflictDoNothing()
}

function command(suffix: string) {
  return {
    commandId: `${SEED_CORRELATION_ID}:${suffix}`,
    correlationId: SEED_CORRELATION_ID,
  }
}

async function runSeedCli() {
  const result = await seedDevelopmentData()
  console.log(`Seeded event-sourced project ${result.projectId}`)
  console.log(`Open http://localhost:5173/project/${result.projectId}`)
  await sql.end()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeedCli().catch(async (error) => {
    console.error('Seed failed:', error)
    await sql.end()
    process.exitCode = 1
  })
}
