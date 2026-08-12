import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { chapters, novelProjects } from '../../db/schema'
import { callAIJSON } from '../ai/ai.service'

export interface StructuredFact {
  subjectType: string
  subjectName: string
  predicate: string
  objectType: string
  objectName: string
  confidence?: number
  reason?: string
}

export interface StructuredForeshadowing {
  title: string
  description: string
  importance?: string
  confidence?: number
}

export interface StructuredCharacterChange {
  characterName: string
  change: string
  confidence?: number
}

export interface StructuredNewCharacter {
  name: string
  role?: string
  personality?: string
  goal?: string
  desire?: string
  fear?: string
  secret?: string
  weakness?: string
  arc?: string
  confidence?: number
  reason?: string
  relations?: Array<{
    targetName: string
    type?: string
    strength?: number
    status?: string
    description?: string
  }>
}

export interface StructuredStyleNote {
  title: string
  description: string
  confidence?: number
}

export interface StructuredRelationshipUpdate {
  characterAName: string
  characterBName: string
  type: string
  strength: number
  status: string
  description: string
  confidence?: number
}

export interface StructuredEvent {
  title: string
  description?: string
  importance?: string
}

export interface ExtractedChapterChanges {
  summary?: string
  keyEvents?: StructuredEvent[] | string
  facts?: StructuredFact[]
  newFacts?: string
  foreshadowingAdded?: StructuredForeshadowing[]
  foreshadowingPayoffs?: StructuredForeshadowing[]
  foreshadowingResolved?: string
  characterStateChanges?: StructuredCharacterChange[] | string
  relationshipChanges?: string
  relationshipUpdates?: StructuredRelationshipUpdate[]
  conflictProgress?: string
  conflictUpdates?: Array<{
    title: string
    newStatus?: string
    newIntensity?: number
    reason?: string
  }>
  themeProgress?: string
  styleNotes?: StructuredStyleNote[] | string
  newCharacters?: StructuredNewCharacter[]
  newConflicts?: Array<{
    title: string
    type?: string
    intensity?: number
    participants?: string
    description?: string
  }>
  presentCharacters?: string[]
}

function countMatches(content: string, words: string[]) {
  return words.reduce((sum, word) => sum + content.split(word).length - 1, 0)
}

function normalizeChineseText(value: string) {
  return value
    .trim()
    .replace(/[《》“”"'：:，,。.!！?？\s]/g, '')
    .replace(/神秘/g, '')
    .replace(/来访者/g, '来客')
    .replace(/之谜$/, '')
    .replace(/的秘密$/, '')
}

export function isSimilarTitle(a?: string | null, b?: string | null) {
  if (!a || !b)
    return false
  const left = normalizeChineseText(a)
  const right = normalizeChineseText(b)
  if (!left || !right)
    return false
  return left === right || left.includes(right) || right.includes(left)
}

export function inferCharacterRole(input: {
  name: string
  role?: string
  reason?: string
  content: string
  chapter: typeof chapters.$inferSelect
}) {
  const role = input.role || 'extra'
  if (role !== 'extra')
    return role

  const anchorText = [
    input.reason || '',
    input.chapter.title,
    input.chapter.goals || '',
    input.chapter.conflicts || '',
    input.chapter.events || '',
    input.chapter.outline || '',
  ].join('\n')

  const nameCount = countMatches(input.content, [input.name])
  const isPlotAnchor = anchorText.includes(input.name)
    || /哥哥|姐姐|父亲|母亲|爱人|凶手|证人|反派|导师|主谋|失踪|关键|核心|真相/.test(input.reason || '')

  return isPlotAnchor || nameCount >= 3 ? 'supporting' : role
}

export function buildStyleFingerprint(content: string, styleNotes?: string | null) {
  const normalized = content.trim()
  const sentences = normalized
    .split(/[。！？!?；;\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
  const sentenceLengthAvg = sentences.length > 0
    ? Math.round(sentences.reduce((sum, sentence) => sum + sentence.length, 0) / sentences.length)
    : 0

  const dialogueMarks = countMatches(normalized, ['“', '”', '"'])
  const dialogueRatio = normalized.length > 0
    ? Math.min(100, Math.round((dialogueMarks / Math.max(1, normalized.length / 80)) * 10))
    : 0

  const emotionHits = countMatches(normalized, ['恐惧', '愤怒', '痛苦', '悲伤', '惊讶', '犹豫', '渴望', '绝望', '兴奋', '冷静'])
  const conflictHits = countMatches(normalized, ['冲突', '对峙', '争执', '威胁', '背叛', '追击', '阻止', '反击', '代价', '危险'])
  const hookHits = countMatches(normalized, ['秘密', '真相', '线索', '异常', '消失', '名单', '钥匙', '门', '影子', '却'])
  const densityBase = Math.max(1, normalized.length / 1000)

  return {
    sentenceLengthAvg,
    dialogueRatio,
    emotionDensity: Math.min(100, Math.round((emotionHits / densityBase) * 20)),
    conflictDensity: Math.min(100, Math.round((conflictHits / densityBase) * 20)),
    hookDensity: Math.min(100, Math.round((hookHits / densityBase) * 20)),
    styleSummary: `平均句长 ${sentenceLengthAvg}，对话比例 ${dialogueRatio}%，情绪密度 ${emotionHits}，冲突密度 ${conflictHits}，钩子密度 ${hookHits}${styleNotes ? `；风格备注：${styleNotes}` : ''}`,
  }
}

export async function extractChapterChanges(input: {
  projectId: string
  chapterId: string
  content: string
  trigger: 'manual_save' | 'mark_completed' | 'auto_drive'
}): Promise<ExtractedChapterChanges> {
  const { projectId, chapterId, content, trigger } = input

  const [chapter] = await db.select().from(chapters).where(and(
    eq(chapters.id, chapterId),
    eq(chapters.projectId, projectId),
  ))
  if (!chapter)
    throw new Error('章节不存在')

  const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
  const truncatedContent = content.length > 6000
    ? `${content.substring(0, 6000)}...(内容过长已截断)`
    : content

  const prompt = `你是一位专业的长篇小说编辑。请分析以下章节正文，提取结构化记忆和待处理建议。
返回严格 JSON，不要 markdown。

作品：${project?.title}
当前章节：${chapter.title}
触发方式：${trigger}

章节正文：
${truncatedContent}

请返回以下 JSON 格式：
{
  "summary": "章节摘要",
  "keyEvents": [{ "title": "事件名", "description": "事件说明", "importance": "major" }],
  "facts": [{ "subjectType": "角色/地点/等", "subjectName": "主体名", "predicate": "关系谓词", "objectType": "角色/地点/等", "objectName": "客体名", "confidence": 80, "reason": "正文依据" }],
  "foreshadowingAdded": [{ "title": "伏笔标题", "description": "说明", "importance": "major", "confidence": 75 }],
  "foreshadowingPayoffs": [{ "title": "已回收伏笔标题", "description": "回收说明", "confidence": 70 }],
  "characterStateChanges": [{ "characterName": "角色名", "change": "变化描述", "confidence": 80 }],
  "relationshipChanges": "人物关系变化描述 (自然语言)",
  "relationshipUpdates": [{ "characterAName": "角色A", "characterBName": "角色B", "type": "ally/enemy/lover/family/mentor/rival/acquaintance", "strength": 1, "status": "当前关系状态", "description": "关系变化依据", "confidence": 80 }],
  "conflictProgress": "冲突推进情况 (自然语言)",
  "conflictUpdates": [{ "title": "冲突标题", "newStatus": "active/escalated/stalemate/resolved/abandoned", "newIntensity": 1, "reason": "正文依据", "confidence": 80 }],
  "themeProgress": "主题推进情况",
  "styleNotes": [{ "title": "风格特征", "description": "描述", "confidence": 70 }],
  "newCharacters": [{ "name": "新角色名", "role": "supporting/extra", "personality": "性格", "confidence": 70, "reason": "依据" }],
  "newConflicts": [{ "title": "新冲突标题", "type": "internal/external", "intensity": 5, "description": "描述" }],
  "presentCharacters": ["实际出场角色姓名"]
}`

  return callAIJSON<ExtractedChapterChanges>([{ role: 'user', content: prompt }], {
    temperature: 30,
    metadata: { projectId, chapterId, taskType: 'extract_chapter_changes' },
  })
}
