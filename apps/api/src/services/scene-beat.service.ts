import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, chapterScenes } from '../db/schema'
import { novelProjects } from '../db/schema/project'
import { callAIJSON } from './ai.service'

interface BeatSuggestion {
  sceneNumber: number
  beatType: string
  entryHook: string
  turningPoint: string
  exitHook: string
  emotionStart: string
  emotionEnd: string
  conflictLevel: number
  requiredElements: string
}

interface BeatAnalysisResult {
  scenes: BeatSuggestion[]
}

interface PacingWarning {
  sceneNumber: number
  issue: string
  suggestion: string
}

export async function generateSceneBeats(projectId: string, chapterId: string) {
  const [project] = await db.select({ title: novelProjects.title, genre: novelProjects.genre }).from(novelProjects).where(eq(novelProjects.id, projectId))
  if (!project)
    throw new Error('Project not found')

  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId))
  if (!chapter)
    throw new Error('Chapter not found')

  const scenes = await db.select().from(chapterScenes).where(
    and(eq(chapterScenes.projectId, projectId), eq(chapterScenes.chapterId, chapterId)),
  ).orderBy(asc(chapterScenes.orderIndex))

  const sceneSummaries = scenes.map(s =>
    `场景${s.sceneNumber}: ${s.title || ''} | 目的: ${s.purpose || '未设定'} | 摘要: ${s.summary || '未设定'}`,
  ).join('\n')

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `你是一位小说场景节拍规划专家。你需要为每个场景分配节拍类型，并设定情绪变化和钩子。
节拍类型: hook(开篇钩子), setup(铺垫), reveal(揭示), conflict(冲突), reversal(反转), payoff(兑现), transition(过渡), cliffhanger(悬念结尾)
返回 JSON 格式: { "scenes": [{ "sceneNumber": 1, "beatType": "...", "entryHook": "...", "turningPoint": "...", "exitHook": "...", "emotionStart": "...", "emotionEnd": "...", "conflictLevel": 1-10, "requiredElements": "角色/道具/地点" }] }`,
    },
    {
      role: 'user',
      content: `小说: ${project.title}${project.genre ? ` (${project.genre})` : ''}
章节${chapter.chapterNumber}: ${chapter.title}
${chapter.outline ? `大纲: ${chapter.outline}` : ''}

当前场景列表:
${sceneSummaries || '暂无场景'}

请为每个场景生成节拍建议，确保节奏有起伏，连续场景节拍不重复。`,
    },
  ]

  return callAIJSON<BeatAnalysisResult>(messages, {
    metadata: { projectId, chapterId, taskType: 'scene_beat_generation' },
  })
}

export async function checkMissingTurningPoints(projectId: string, chapterId: string) {
  const scenes = await db.select().from(chapterScenes).where(
    and(eq(chapterScenes.projectId, projectId), eq(chapterScenes.chapterId, chapterId)),
  ).orderBy(asc(chapterScenes.orderIndex))

  const warnings: PacingWarning[] = []

  for (const scene of scenes) {
    if (!scene.turningPoint && scene.beatType !== 'transition') {
      warnings.push({
        sceneNumber: scene.sceneNumber,
        issue: '缺少转折点',
        suggestion: '建议为该场景添加一个情绪或局势的转折',
      })
    }
  }

  const hasTurningBeat = scenes.some(s => s.beatType === 'reversal' || s.beatType === 'reveal' || s.beatType === 'conflict')
  if (!hasTurningBeat && scenes.length > 2) {
    warnings.push({
      sceneNumber: 0,
      issue: '章节缺少强转折',
      suggestion: '建议至少一个场景使用 reversal、reveal 或 conflict 节拍类型',
    })
  }

  return warnings
}

export async function checkPacingRepetition(projectId: string, chapterId: string) {
  const scenes = await db.select().from(chapterScenes).where(
    and(eq(chapterScenes.projectId, projectId), eq(chapterScenes.chapterId, chapterId)),
  ).orderBy(asc(chapterScenes.orderIndex))

  const warnings: PacingWarning[] = []

  for (let i = 2; i < scenes.length; i++) {
    const a = scenes[i - 2]
    const b = scenes[i - 1]
    const c = scenes[i]
    if (a.beatType && b.beatType && c.beatType && a.beatType === b.beatType && b.beatType === c.beatType) {
      warnings.push({
        sceneNumber: b.sceneNumber,
        issue: `连续三个场景使用相同节拍 "${a.beatType}"`,
        suggestion: '建议调整中间场景的节拍类型以增加节奏变化',
      })
    }
  }

  const hasHook = scenes.some(s => s.beatType === 'hook' || s.beatType === 'cliffhanger')
  if (!hasHook && scenes.length > 1) {
    warnings.push({
      sceneNumber: scenes[0]?.sceneNumber || 1,
      issue: '缺少钩子节拍',
      suggestion: '建议第一个场景使用 hook，最后一个场景使用 cliffhanger',
    })
  }

  return warnings
}
