import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { db, sql } from '../db'
import {
  chapters,
  chapterVersions,
  characterRelationships,
  characters,
  conflicts,
  novelProjects,
  storyBibles,
  volumes,
} from '../db/schema'

async function seed() {
  const now = new Date().toISOString()

  // Clear existing data in reverse dependency order
  await db.delete(chapterVersions)
  await db.delete(characterRelationships)
  await db.delete(conflicts)
  await db.delete(chapters)
  await db.delete(characters)
  await db.delete(volumes)
  await db.delete(storyBibles)
  await db.delete(novelProjects)

  // Insert novel project
  const projectId = randomUUID()
  await db.insert(novelProjects).values({
    id: projectId,
    title: '镜中城',
    description: '一个关于记忆、现实与虚构边界的奇幻故事。',
    genre: '奇幻',
    theme: '记忆与遗忘的对抗',
    targetWords: 200000,
    targetAudience: '成年读者',
    styleProfile: '文学奇幻',
    status: 'writing',
    createdAt: now,
    updatedAt: now,
  })

  // Insert story bible
  const storyBibleId = randomUUID()
  await db.insert(storyBibles).values({
    id: storyBibleId,
    projectId,
    worldview: '一座只在雨夜出现的城市，保存着所有未完成小说的人物。',
    mainConflict: '主角必须在找回自己的真实记忆和留在舒适的虚构世界之间做出选择',
    theme: '真实与虚构的边界',
    rules: '1. 只有在现实中被遗忘的角色才能进入镜中城\n2. 记忆是城市的货币',
    timeline: '第一卷：发现镜中城 → 第二卷：城市危机',
    createdAt: now,
    updatedAt: now,
  })

  // Insert characters
  const characterIds = [randomUUID(), randomUUID(), randomUUID()]
  await db.insert(characters).values([
    {
      id: characterIds[0],
      projectId,
      name: '林澈',
      role: 'protagonist',
      goal: '找到失踪的作者',
      personality: '冷静、善于观察',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: characterIds[1],
      projectId,
      name: '沈微',
      role: 'ally',
      goal: '保护镜中城的居民',
      personality: '温柔但坚定',
      createdAt: now,
      updatedAt: now,
    },
  ])

  // Insert Relationships
  await db.insert(characterRelationships).values([
    {
      id: randomUUID(),
      projectId,
      characterAId: characterIds[0],
      characterBId: characterIds[1],
      type: 'ally',
      strength: 8,
      status: 'Trusting',
      description: '沈微是林澈的接引者。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  // Insert Conflict
  await db.insert(conflicts).values([
    {
      id: randomUUID(),
      projectId,
      title: '身份危机',
      type: 'internal',
      intensity: 7,
      status: 'escalating',
      participants: JSON.stringify([characterIds[0]]),
      description: '林澈怀疑自己也是虚构出来的。',
      createdAt: now,
      updatedAt: now,
    },
  ])

  // Insert volume
  const volumeId = randomUUID()
  await db.insert(volumes).values({
    id: volumeId,
    projectId,
    title: '第一卷：雨夜城门',
    summary: '林澈第一次进入镜中城',
    orderIndex: 1,
    createdAt: now,
    updatedAt: now,
  })

  // Insert chapters
  const chapterId = randomUUID()
  await db.insert(chapters).values([
    {
      id: chapterId,
      projectId,
      volumeId,
      chapterNumber: 1,
      title: '第一章 雨夜',
      outline: '初始章节',
      status: 'completed',
      draft: '雨落在旧码头上...',
      createdAt: now,
      updatedAt: now,
    },
  ])

  // Insert Version
  await db.insert(chapterVersions).values([
    {
      id: randomUUID(),
      projectId,
      chapterId,
      content: '雨落在旧码头...',
      wordCount: 10,
      note: 'Snapshot',
      createdAt: now,
    },
  ])

  console.log('Seed data inserted successfully')
}

seed().then(async () => {
  await sql.end()
}).catch(async (err) => {
  console.error('Seed failed:', err)
  await sql.end()
  process.exit(1)
})
