import { asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import {
  chapters,
  chapterScenes,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  novelProjects,
  storyBibles,
} from '../../db/schema'

export interface ManuscriptExportOptions {
  format: 'md' | 'txt'
  includeOutline: boolean
  includeScenes: boolean
  includeUnfinishedChapters: boolean
  includeAuthorNotes: boolean
}

const projectExportFields = [
  'id',
  'title',
  'description',
  'genre',
  'theme',
  'targetWords',
  'targetAudience',
  'styleProfile',
  'status',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof typeof novelProjects.$inferSelect)[]

const storyBibleExportFields = [
  'id',
  'projectId',
  'worldview',
  'mainConflict',
  'theme',
  'rules',
  'timeline',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof typeof storyBibles.$inferSelect)[]

const chapterExportFields = [
  'id',
  'projectId',
  'volumeId',
  'title',
  'chapterNumber',
  'outline',
  'summary',
  'characters',
  'goals',
  'conflicts',
  'events',
  'emotionalArc',
  'foreshadowing',
  'endingHook',
  'draft',
  'status',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof typeof chapters.$inferSelect)[]

const sceneExportFields = [
  'id',
  'projectId',
  'chapterId',
  'sceneNumber',
  'title',
  'location',
  'timeline',
  'purpose',
  'summary',
  'characters',
  'targetWords',
  'content',
  'orderIndex',
  'status',
  'conflict',
  'beatType',
  'entryHook',
  'turningPoint',
  'exitHook',
  'emotionStart',
  'emotionEnd',
  'conflictLevel',
  'requiredElements',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof typeof chapterScenes.$inferSelect)[]

const characterExportFields = [
  'id',
  'projectId',
  'name',
  'role',
  'goal',
  'fear',
  'secret',
  'desire',
  'weakness',
  'personality',
  'arc',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof typeof characters.$inferSelect)[]

const relationshipExportFields = [
  'id',
  'projectId',
  'characterAId',
  'characterBId',
  'type',
  'strength',
  'status',
  'description',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof typeof characterRelationships.$inferSelect)[]

const conflictExportFields = [
  'id',
  'projectId',
  'title',
  'type',
  'intensity',
  'status',
  'participants',
  'participantIds',
  'description',
  'resolution',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof typeof conflicts.$inferSelect)[]

const foreshadowingExportFields = [
  'id',
  'projectId',
  'title',
  'description',
  'setupChapterId',
  'expectedPayoffChapterId',
  'payoffChapterId',
  'status',
  'importance',
  'relatedCharacters',
  'characterIds',
  'relatedEvents',
  'notes',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof typeof foreshadowingItems.$inferSelect)[]

export async function getProjectExportData(projectId: string) {
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('Project not found')

  const [bibleRows, chapterRows, sceneRows, characterRows, relationshipRows, conflictRows, foreshadowingRows] = await Promise.all([
    db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId)),
    db.select().from(chapters).where(eq(chapters.projectId, projectId)).orderBy(asc(chapters.chapterNumber)),
    db.select().from(chapterScenes).where(eq(chapterScenes.projectId, projectId)).orderBy(asc(chapterScenes.orderIndex)),
    db.select().from(characters).where(eq(characters.projectId, projectId)),
    db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId)),
    db.select().from(conflicts).where(eq(conflicts.projectId, projectId)),
    db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId)),
  ])

  return {
    exportedAt: new Date().toISOString(),
    project: pickExportFields(project, projectExportFields),
    storyBible: bibleRows[0] ? pickExportFields(bibleRows[0], storyBibleExportFields) : null,
    chapters: chapterRows.map(row => pickExportFields(row, chapterExportFields)),
    scenes: sceneRows.map(row => pickExportFields(row, sceneExportFields)),
    characters: characterRows.map(row => pickExportFields(row, characterExportFields)),
    relationships: relationshipRows.map(row => pickExportFields(row, relationshipExportFields)),
    conflicts: conflictRows.map(row => pickExportFields(row, conflictExportFields)),
    foreshadowing: foreshadowingRows.map(row => pickExportFields(row, foreshadowingExportFields)),
  }
}

function pickExportFields<TRow extends object, TKey extends keyof TRow>(
  row: TRow,
  fields: readonly TKey[],
): Pick<TRow, TKey> {
  return Object.fromEntries(fields.map(field => [field, row[field]])) as Pick<TRow, TKey>
}

export async function renderManuscript(projectId: string, options: ManuscriptExportOptions) {
  const data = await getProjectExportData(projectId)
  const chapterRows = options.includeUnfinishedChapters
    ? data.chapters
    : data.chapters.filter(chapter => chapter.status === 'completed')
  const lines: string[] = [options.format === 'md' ? `# ${data.project.title}` : data.project.title]

  for (const chapter of chapterRows) {
    lines.push('', options.format === 'md'
      ? `## 第 ${chapter.chapterNumber} 章 ${chapter.title}`
      : `第 ${chapter.chapterNumber} 章 ${chapter.title}`)
    if (options.includeOutline && chapter.outline)
      lines.push('', options.format === 'md' ? `> 大纲：${chapter.outline}` : `大纲：${chapter.outline}`)
    if (chapter.draft)
      lines.push('', chapter.draft)
    if (options.includeAuthorNotes && chapter.summary)
      lines.push('', options.format === 'md' ? `> 作者备注：${chapter.summary}` : `作者备注：${chapter.summary}`)
    if (options.includeScenes) {
      const scenes = data.scenes.filter(scene => scene.chapterId === chapter.id)
      for (const scene of scenes) {
        lines.push('', options.format === 'md'
          ? `### 场景 ${scene.sceneNumber} ${scene.title || ''}`.trim()
          : `场景 ${scene.sceneNumber} ${scene.title || ''}`.trim())
        if (scene.content)
          lines.push('', scene.content)
      }
    }
  }

  return lines.join('\n').trimEnd()
}

export async function renderProposal(projectId: string) {
  const data = await getProjectExportData(projectId)
  return [
    `# ${data.project.title}｜项目企划书`,
    '',
    `- 类型：${data.project.genre || '未设置'}`,
    `- 主题：${data.project.theme || '未设置'}`,
    `- 目标字数：${data.project.targetWords || '未设置'}`,
    '',
    '## 项目简介',
    '',
    data.project.description || '暂无简介。',
    '',
    '## 世界观与主冲突',
    '',
    data.storyBible?.worldview || '暂无世界观。',
    '',
    data.storyBible?.mainConflict || '暂无主冲突。',
  ].join('\n')
}

export async function renderCharacterProfiles(projectId: string) {
  const data = await getProjectExportData(projectId)
  const names = new Map(data.characters.map(character => [character.id, character.name]))
  const lines = [`# ${data.project.title}｜角色设定集`]
  for (const character of data.characters) {
    lines.push(
      '',
      `## ${character.name}`,
      '',
      `- 身份：${character.role || '未设置'}`,
      `- 目标：${character.goal || '未设置'}`,
      `- 性格：${character.personality || '未设置'}`,
    )
    const relationships = data.relationships.filter(item => item.characterAId === character.id || item.characterBId === character.id)
    for (const relationship of relationships) {
      const otherId = relationship.characterAId === character.id ? relationship.characterBId : relationship.characterAId
      lines.push(`- 与 ${names.get(otherId) || '未知角色'}：${relationship.type}`)
    }
  }
  return lines.join('\n')
}

export async function renderForeshadowingReport(projectId: string) {
  const data = await getProjectExportData(projectId)
  const lines = [`# ${data.project.title}｜伏笔报告`]
  for (const item of data.foreshadowing)
    lines.push('', `## ${item.title}`, '', `- 状态：${item.status}`, `- 重要度：${item.importance}`, item.description || '暂无说明。')
  return lines.join('\n')
}

export async function renderConflictReport(projectId: string) {
  const data = await getProjectExportData(projectId)
  const lines = [`# ${data.project.title}｜矛盾报告`]
  for (const conflict of data.conflicts)
    lines.push('', `## ${conflict.title}`, '', `- 类型：${conflict.type}`, `- 强度：${conflict.intensity}`, `- 状态：${conflict.status}`, conflict.description || '暂无说明。')
  return lines.join('\n')
}
