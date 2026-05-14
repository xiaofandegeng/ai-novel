import { asc, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  chapters,
  chapterScenes,
  characterRelationships,
  characters,
  conflictParticipants,
  conflicts,
  foreshadowingItems,
  novelProjects,
  storyBibles,
  volumes,
} from '../db/schema'

export interface ManuscriptExportOptions {
  includeOutline?: boolean
  includeScenes?: boolean
  includeUnfinishedChapters?: boolean
  includeAuthorNotes?: boolean
}

export interface ExportResult {
  content: string
  filename: string
  contentType: string
}

// ---------------------------------------------------------------------------
// Manuscript Markdown
// ---------------------------------------------------------------------------

export async function exportManuscriptMarkdown(
  projectId: string,
  options: ManuscriptExportOptions = {},
): Promise<ExportResult> {
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('项目不存在')

  const [allChapters, allVolumes] = await Promise.all([
    db
      .select()
      .from(chapters)
      .where(eq(chapters.projectId, projectId))
      .orderBy(asc(chapters.chapterNumber)),
    db
      .select()
      .from(volumes)
      .where(eq(volumes.projectId, projectId))
      .orderBy(asc(volumes.orderIndex)),
  ])

  const volumeOrder = new Map(allVolumes.map((volume, index) => [volume.id, volume.orderIndex ?? index]))
  allChapters.sort((a, b) => {
    const volumeDiff = (volumeOrder.get(a.volumeId ?? '') ?? Number.MAX_SAFE_INTEGER)
      - (volumeOrder.get(b.volumeId ?? '') ?? Number.MAX_SAFE_INTEGER)
    return volumeDiff || a.chapterNumber - b.chapterNumber
  })

  const chapterList = options.includeUnfinishedChapters
    ? allChapters
    : allChapters.filter(ch => ch.status === 'completed' || ch.draft)

  const scenesByChapter = options.includeScenes
    ? await loadScenesByChapter(projectId)
    : new Map<string, typeof chapterScenes.$inferSelect[]>()

  const parts: string[] = []

  // Title
  parts.push(`# ${project.title}`)
  parts.push('')

  if (project.genre || project.theme || project.description) {
    parts.push(`> ${[project.genre, project.theme].filter(Boolean).join(' / ')} `)
    if (project.description)
      parts.push(`> ${project.description}`)
    parts.push('')
  }

  // Chapters
  for (const ch of chapterList) {
    parts.push(`## 第${ch.chapterNumber}章 ${ch.title}`)
    parts.push('')

    if (options.includeOutline && ch.outline) {
      parts.push(`**大纲**: ${ch.outline}`)
      parts.push('')
    }

    if (options.includeAuthorNotes && ch.endingHook) {
      parts.push(`<!-- endingHook: ${ch.endingHook} -->`)
    }

    // Scenes or draft
    const scenes = scenesByChapter.get(ch.id)
    if (scenes && scenes.length > 0) {
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i]
        if (sc.title)
          parts.push(`### ${sc.title}`)
        if (sc.content) {
          parts.push(sc.content)
        }
        else if (sc.summary) {
          parts.push(sc.summary)
        }
        if (i < scenes.length - 1)
          parts.push('\n***\n')
      }
    }
    else if (ch.draft) {
      parts.push(ch.draft)
    }

    parts.push('')
  }

  const content = parts.join('\n')
  const safeName = sanitizeFilename(project.title)
  return {
    content,
    filename: `${safeName}-手稿.md`,
    contentType: 'text/markdown; charset=utf-8',
  }
}

// ---------------------------------------------------------------------------
// Manuscript Plain Text
// ---------------------------------------------------------------------------

export async function exportManuscriptText(
  projectId: string,
  options: ManuscriptExportOptions = {},
): Promise<ExportResult> {
  const md = await exportManuscriptMarkdown(projectId, options)
  const text = stripMarkdown(md.content)
  const safeName = sanitizeFilename(md.filename.replace('.md', ''))
  return {
    content: text,
    filename: `${safeName}.txt`,
    contentType: 'text/plain; charset=utf-8',
  }
}

// ---------------------------------------------------------------------------
// Project Proposal
// ---------------------------------------------------------------------------

export async function exportProjectProposal(projectId: string): Promise<ExportResult> {
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('项目不存在')

  const bibles = await db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId))
  const bible = bibles[0]

  const chars = await db.select().from(characters).where(eq(characters.projectId, projectId))

  const parts: string[] = []
  parts.push(`# 《${project.title}》企划书`)
  parts.push('')

  // Basic info
  parts.push('## 基本信息')
  parts.push('')
  parts.push(`| 项目 | 内容 |`)
  parts.push(`| --- | --- |`)
  if (project.genre)
    parts.push(`| 题材 | ${project.genre} |`)
  if (project.theme)
    parts.push(`| 主题 | ${project.theme} |`)
  if (project.targetAudience)
    parts.push(`| 目标读者 | ${project.targetAudience} |`)
  if (project.targetWords)
    parts.push(`| 目标字数 | ${project.targetWords.toLocaleString()} 字 |`)
  parts.push('')

  // Synopsis
  if (project.description) {
    parts.push('## 作品简介')
    parts.push('')
    parts.push(project.description)
    parts.push('')
  }

  // Story bible
  if (bible) {
    parts.push('## 世界观设定')
    parts.push('')
    if (bible.worldview) {
      parts.push('### 世界观')
      parts.push(bible.worldview)
      parts.push('')
    }
    if (bible.mainConflict) {
      parts.push('### 主线冲突')
      parts.push(bible.mainConflict)
      parts.push('')
    }
    if (bible.theme) {
      parts.push('### 核心主题')
      parts.push(bible.theme)
      parts.push('')
    }
    if (bible.rules) {
      parts.push('### 世界法则')
      parts.push(bible.rules)
      parts.push('')
    }
    if (bible.timeline) {
      parts.push('### 时间线')
      parts.push(bible.timeline)
      parts.push('')
    }
  }

  // Character profiles summary
  if (chars.length > 0) {
    parts.push('## 角色概览')
    parts.push('')
    parts.push('| 姓名 | 角色定位 | 目标 | 恐惧 |')
    parts.push('| --- | --- | --- | --- |')
    for (const c of chars) {
      parts.push(`| ${c.name} | ${c.role || '-'} | ${c.goal || '-'} | ${c.fear || '-'} |`)
    }
    parts.push('')
  }

  const content = parts.join('\n')
  const safeName = sanitizeFilename(project.title)
  return {
    content,
    filename: `${safeName}-企划书.md`,
    contentType: 'text/markdown; charset=utf-8',
  }
}

// ---------------------------------------------------------------------------
// Character Profiles
// ---------------------------------------------------------------------------

export async function exportCharacterProfiles(projectId: string): Promise<ExportResult> {
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('项目不存在')

  const chars = await db.select().from(characters).where(eq(characters.projectId, projectId))

  // Load relationships
  const allRels = await db
    .select()
    .from(characterRelationships)
    .where(eq(characterRelationships.projectId, projectId))

  const charMap = new Map(chars.map(c => [c.id, c]))
  const relsByChar = new Map<string, string[]>()
  for (const r of allRels) {
    const aName = charMap.get(r.characterAId)?.name || '未知'
    const bName = charMap.get(r.characterBId)?.name || '未知'
    const entry = `${aName} ↔ ${bName}: ${r.type}${r.description ? ` - ${r.description}` : ''}`
    if (!relsByChar.has(r.characterAId))
      relsByChar.set(r.characterAId, [])
    if (!relsByChar.has(r.characterBId))
      relsByChar.set(r.characterBId, [])
    relsByChar.get(r.characterAId)!.push(entry)
    relsByChar.get(r.characterBId)!.push(entry)
  }

  const parts: string[] = []
  parts.push(`# 《${project.title}》角色设定集`)
  parts.push('')

  for (const c of chars) {
    parts.push(`## ${c.name}`)
    parts.push('')

    const fields: Array<[string, string | null | undefined]> = [
      ['角色定位', c.role],
      ['目标', c.goal],
      ['恐惧', c.fear],
      ['秘密', c.secret],
      ['欲望', c.desire],
      ['弱点', c.weakness],
      ['性格', c.personality],
      ['成长弧线', c.arc],
    ]

    parts.push('| 属性 | 描述 |')
    parts.push('| --- | --- |')
    for (const [label, value] of fields) {
      if (value)
        parts.push(`| ${label} | ${value} |`)
    }
    parts.push('')

    const charRels = relsByChar.get(c.id)
    if (charRels && charRels.length > 0) {
      parts.push('### 人际关系')
      parts.push('')
      for (const rel of charRels) {
        parts.push(`- ${rel}`)
      }
      parts.push('')
    }

    parts.push('---')
    parts.push('')
  }

  const content = parts.join('\n')
  const safeName = sanitizeFilename(project.title)
  return {
    content,
    filename: `${safeName}-角色设定集.md`,
    contentType: 'text/markdown; charset=utf-8',
  }
}

// ---------------------------------------------------------------------------
// Foreshadowing Report
// ---------------------------------------------------------------------------

export async function exportForeshadowingReport(projectId: string): Promise<ExportResult> {
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('项目不存在')

  const items = await db
    .select()
    .from(foreshadowingItems)
    .where(eq(foreshadowingItems.projectId, projectId))

  const allChapters = await db
    .select()
    .from(chapters)
    .where(eq(chapters.projectId, projectId))

  const chapterMap = new Map(allChapters.map(ch => [ch.id, ch]))

  const parts: string[] = []
  parts.push(`# 《${project.title}》伏笔报告`)
  parts.push('')

  if (items.length === 0) {
    parts.push('> 本项目暂无伏笔记录。')
  }
  else {
    parts.push('| 标题 | 重要性 | 状态 | 铺垫章节 | 预期回收 | 实际回收 | 描述 |')
    parts.push('| --- | --- | --- | --- | --- | --- | --- |')

    for (const f of items) {
      const setup = f.setupChapterId ? (chapterMap.get(f.setupChapterId)?.title || '-') : '-'
      const expected = f.expectedPayoffChapterId ? (chapterMap.get(f.expectedPayoffChapterId)?.title || '-') : '-'
      const payoff = f.payoffChapterId ? (chapterMap.get(f.payoffChapterId)?.title || '-') : '-'
      const desc = f.description ? truncate(f.description, 60) : '-'
      parts.push(`| ${f.title} | ${f.importance} | ${f.status} | ${setup} | ${expected} | ${payoff} | ${desc} |`)
    }
    parts.push('')

    // Detail section
    parts.push('## 详细说明')
    parts.push('')
    for (const f of items) {
      parts.push(`### ${f.title}`)
      parts.push('')
      parts.push(`- **状态**: ${f.status}`)
      parts.push(`- **重要性**: ${f.importance}`)
      if (f.description) {
        parts.push(`- **描述**: ${f.description}`)
      }
      if (f.relatedCharacters) {
        parts.push(`- **相关角色**: ${f.relatedCharacters}`)
      }
      if (f.relatedEvents) {
        parts.push(`- **相关事件**: ${f.relatedEvents}`)
      }
      if (f.notes) {
        parts.push(`- **备注**: ${f.notes}`)
      }
      parts.push('')
    }
  }

  const content = parts.join('\n')
  const safeName = sanitizeFilename(project.title)
  return {
    content,
    filename: `${safeName}-伏笔报告.md`,
    contentType: 'text/markdown; charset=utf-8',
  }
}

// ---------------------------------------------------------------------------
// Conflict Report
// ---------------------------------------------------------------------------

export async function exportConflictReport(projectId: string): Promise<ExportResult> {
  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('项目不存在')

  const confList = await db
    .select()
    .from(conflicts)
    .where(eq(conflicts.projectId, projectId))

  const cParts = await db
    .select()
    .from(conflictParticipants)
    .where(eq(conflictParticipants.projectId, projectId))

  const chars = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId))

  const charMap = new Map(chars.map(c => [c.id, c]))

  // Group participants by conflict
  const participantsByConflict = new Map<string, Array<{ name: string, role: string | null }>>()
  for (const cp of cParts) {
    if (!participantsByConflict.has(cp.conflictId))
      participantsByConflict.set(cp.conflictId, [])
    const name = charMap.get(cp.characterId)?.name || '未知角色'
    participantsByConflict.get(cp.conflictId)!.push({ name, role: cp.roleInConflict })
  }

  const parts: string[] = []
  parts.push(`# 《${project.title}》矛盾报告`)
  parts.push('')

  if (confList.length === 0) {
    parts.push('> 本项目暂无矛盾记录。')
  }
  else {
    parts.push('| 矛盾名称 | 类型 | 强度 | 状态 | 参与者 | 描述 |')
    parts.push('| --- | --- | --- | --- | --- | --- |')

    for (const c of confList) {
      const pList = participantsByConflict.get(c.id) || []
      const pStr = pList.map(p => p.name).join(', ') || '-'
      const desc = c.description ? truncate(c.description, 60) : '-'
      parts.push(`| ${c.title} | ${c.type} | ${c.intensity} | ${c.status} | ${pStr} | ${desc} |`)
    }
    parts.push('')

    // Detail section
    parts.push('## 详细说明')
    parts.push('')
    for (const c of confList) {
      parts.push(`### ${c.title}`)
      parts.push('')
      parts.push(`- **类型**: ${c.type === 'internal' ? '内心冲突' : '外部冲突'}`)
      parts.push(`- **强度**: ${c.intensity}`)
      parts.push(`- **状态**: ${c.status}`)
      if (c.description) {
        parts.push(`- **描述**: ${c.description}`)
      }
      if (c.resolution) {
        parts.push(`- **解决方案**: ${c.resolution}`)
      }

      const pList = participantsByConflict.get(c.id) || []
      if (pList.length > 0) {
        parts.push('- **参与者**:')
        for (const p of pList) {
          parts.push(`  - ${p.name}${p.role ? ` (${p.role})` : ''}`)
        }
      }
      parts.push('')
    }
  }

  const content = parts.join('\n')
  const safeName = sanitizeFilename(project.title)
  return {
    content,
    filename: `${safeName}-矛盾报告.md`,
    contentType: 'text/markdown; charset=utf-8',
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadScenesByChapter(
  projectId: string,
): Promise<Map<string, typeof chapterScenes.$inferSelect[]>> {
  const allScenes = await db
    .select()
    .from(chapterScenes)
    .where(eq(chapterScenes.projectId, projectId))
    .orderBy(asc(chapterScenes.orderIndex))

  const map = new Map<string, typeof chapterScenes.$inferSelect[]>()
  for (const sc of allScenes) {
    if (!map.has(sc.chapterId))
      map.set(sc.chapterId, [])
    map.get(sc.chapterId)!.push(sc)
  }
  return map
}

function stripMarkdown(md: string): string {
  return md
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove bold/italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/___(.*?)___/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    // Remove headings (keep text)
    .replace(/^#{1,6} (.+)$/gm, '$1')
    // Remove horizontal rules
    .replace(/^-{3,}$/gm, '')
    .replace(/\*\*\*$/gm, '')
    // Remove blockquotes markers
    .replace(/^>\s?/gm, '')
    // Remove table formatting, keep content
    .replace(/\|/g, ' | ')
    .replace(/^[\s|:-]+$/gm, '')
    // Remove links, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/ +/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 100)
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen)
    return text
  return `${text.slice(0, maxLen)}...`
}
